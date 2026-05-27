import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { FileAgentSkillRepository } from "../dist/infrastructure/repositories/FileAgentSkillRepository.js";
import { AgentSkillValidationService } from "../dist/infrastructure/agentSkills/AgentSkillValidationService.js";
import { AgentSkillRegistryService } from "../dist/infrastructure/agentSkills/AgentSkillRegistryService.js";

test("AgentSkillRegistryService seeds filesystem skills and resolves runtime bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-skill-registry-"));
  const skillsRoot = join(root, "skills", "agents");
  const frontSkillDir = join(skillsRoot, "front-design-frontend");
  await mkdir(join(frontSkillDir, "references"), { recursive: true });
  await writeFile(
    join(frontSkillDir, "SKILL.md"),
    "---\nname: front-design-frontend\ndescription: Front generation rules.\n---\n# Front Skill\nBuild polished UI."
  );
  await writeFile(join(frontSkillDir, "references", "patterns.md"), "# Patterns");

  const registry = new AgentSkillRegistryService(
    new FileAgentSkillRepository(join(root, "data")),
    new AgentSkillValidationService(),
    { repositoryRoot: root, skillsRoot }
  );

  const summaries = await registry.listSummaries();
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].sourceType, "filesystem_seed");
  assert.equal(summaries[0].activeRevision?.status, "published");

  const runtimeSkills = await registry.resolveRuntimeSkillsForAgent("front");
  assert.equal(runtimeSkills.length, 1);
  assert.equal(runtimeSkills[0].agentProfileId, "front_agent");
  assert.equal(runtimeSkills[0].files[0].relativePath, "references/patterns.md");

  await registry.seedFilesystemSkills();
  assert.equal((await registry.listSummaries()).length, 1);
});
