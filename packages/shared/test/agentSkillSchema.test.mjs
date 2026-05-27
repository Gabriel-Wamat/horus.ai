import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentSkillSchema,
  CreateAgentSkillInputSchema,
  RuntimeAgentSkillSchema,
} from "../dist/index.js";

test("agent skill schemas parse catalog, creation, and runtime contracts", () => {
  const now = new Date().toISOString();
  const skill = AgentSkillSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    slug: "front-polish",
    displayName: "Front Polish",
    description: "Tightens generated frontend UI quality.",
    scope: "project",
    sourceType: "database",
    status: "active",
    activeRevisionId: "22222222-2222-4222-8222-222222222222",
    sourcePath: null,
    createdBy: "test",
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(skill.slug, "front-polish");

  const input = CreateAgentSkillInputSchema.parse({
    displayName: "QA Evidence",
    description: "Adds stricter QA evidence rules.",
    skillMd: "---\nname: qa-evidence\ndescription: QA rules\n---\n# QA Evidence",
    bindings: [{ agentProfileId: "qa_agent" }],
  });

  assert.equal(input.bindings[0].triggerMode, "manual");

  const runtimeSkill = RuntimeAgentSkillSchema.parse({
    skillId: skill.id,
    slug: skill.slug,
    displayName: skill.displayName,
    revisionId: skill.activeRevisionId,
    revisionNumber: 1,
    contentHash: "a".repeat(64),
    triggerMode: "automatic",
    agentProfileId: "front_agent",
    skillMd: "# Runtime",
    files: [],
  });

  assert.equal(runtimeSkill.revisionNumber, 1);
});
