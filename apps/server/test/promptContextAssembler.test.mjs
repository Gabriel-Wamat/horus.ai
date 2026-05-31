import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentMemoryService } from "../dist/application/services/AgentMemoryService.js";
import { AgentSkillRegistryService } from "../dist/infrastructure/agentSkills/AgentSkillRegistryService.js";
import { AgentSkillValidationService } from "../dist/infrastructure/agentSkills/AgentSkillValidationService.js";
import { FileAgentMemoryRepository } from "../dist/infrastructure/repositories/FileAgentMemoryRepository.js";
import { FileAgentSkillRepository } from "../dist/infrastructure/repositories/FileAgentSkillRepository.js";
import {
  PromptContextAssembler,
  formatPromptContextForPrompt,
} from "../dist/infrastructure/prompt/PromptContextAssembler.js";

test("PromptContextAssembler injects scoped memory and uses runtime skills without auditing usage", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-prompt-context-"));
  const skillsRoot = join(root, "skills", "agents");
  const frontSkillDir = join(skillsRoot, "front-design-frontend");
  await mkdir(frontSkillDir, { recursive: true });
  await writeFile(
    join(frontSkillDir, "SKILL.md"),
    "---\nname: front-design-frontend\ndescription: Front rules.\n---\n# Runtime UI Rule\nUse project tokens first."
  );

  const skillRepository = new FileAgentSkillRepository(join(root, "skills-data"));
  const registry = new AgentSkillRegistryService(
    skillRepository,
    new AgentSkillValidationService(),
    { repositoryRoot: root, skillsRoot }
  );
  const memory = new AgentMemoryService(
    new FileAgentMemoryRepository(join(root, "memory-data"))
  );
  const scope = {
    workspaceFolderId: "11111111-1111-4111-8111-111111111111",
    userStoryId: "22222222-2222-4222-8222-222222222222",
    projectId: null,
    chatSessionId: null,
    workflowThreadId: "33333333-3333-4333-8333-333333333333",
    agentProfileId: "front_agent",
  };
  await memory.recordMemory({
    kind: "preference",
    scope,
    content: "Prefer restrained gray surfaces.",
    sourceRefs: [{ type: "manual", id: "design-note" }],
  });

  const assembler = new PromptContextAssembler({
    memoryService: memory,
    skillRegistry: registry,
  });
  const bundle = await assembler.assemble({
    agentProfileId: "front_agent",
    workflowThreadId: scope.workflowThreadId,
    workspaceFolderId: scope.workspaceFolderId,
    userStoryId: scope.userStoryId,
  });

  assert.equal(bundle.memories.length, 1);
  assert.equal(bundle.runtimeSkills.length, 1);
  const usageEvents = await skillRepository.listUsageEvents({
    workflowThreadId: scope.workflowThreadId,
  });
  assert.equal(usageEvents.length, 0);
  assert.match(formatPromptContextForPrompt(bundle), /Prefer restrained gray/);
});
