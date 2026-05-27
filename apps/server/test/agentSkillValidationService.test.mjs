import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentSkillValidationService,
  parseSkillFrontmatter,
} from "../dist/infrastructure/agentSkills/AgentSkillValidationService.js";

test("AgentSkillValidationService passes a well-formed SKILL.md bundle", () => {
  const service = new AgentSkillValidationService();
  const result = service.validateDraft({
    skillMd:
      "---\nname: front-polish\ndescription: Keep generated UI clean.\n---\n# Front Polish\nUse restrained spacing.",
    files: [
      {
        relativePath: "references/patterns.md",
        mediaType: "text/markdown",
        contentText: "# Patterns",
      },
    ],
    bindingAgentProfileIds: ["front_agent"],
  });

  assert.equal(result.report.status, "passed");
  assert.equal(result.frontmatter.name, "front-polish");
  assert.equal(result.contentHash.length, 64);
});

test("AgentSkillValidationService rejects unsafe paths and unknown agent bindings", () => {
  const service = new AgentSkillValidationService();
  const result = service.validateDraft({
    skillMd: "# Missing frontmatter but not fatal",
    files: [
      {
        relativePath: "../secret.env",
        mediaType: "text/plain",
        contentText: "TOKEN=x",
      },
    ],
    bindingAgentProfileIds: ["ghost_agent"],
  });

  assert.equal(result.report.status, "failed");
  assert.ok(
    result.report.issues.some(
      (issue) => issue.code === "unsafe_support_file_path"
    )
  );
  assert.ok(
    result.report.issues.some((issue) => issue.code === "unknown_agent_profile")
  );
});

test("parseSkillFrontmatter reads the metadata used by existing project skills", () => {
  assert.deepEqual(
    parseSkillFrontmatter(
      "---\nname: qa-frontend-testing\ndescription: Test generation\n---\n# Body"
    ),
    {
      name: "qa-frontend-testing",
      description: "Test generation",
    }
  );
});
