import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentToolAccessDeniedError,
  defaultAgentProfileRegistry,
} from "../dist/application/services/AgentProfileRegistry.js";

test("rewrite_file is available only to mutation-capable agent profiles", () => {
  assert.equal(
    defaultAgentProfileRegistry.canUseTool("horus_chat_executor", "rewrite_file"),
    true
  );
  assert.equal(defaultAgentProfileRegistry.canUseTool("front_agent", "rewrite_file"), true);

  for (const profileId of ["chat_agent", "qa_agent", "curator_agent"]) {
    assert.equal(defaultAgentProfileRegistry.canUseTool(profileId, "rewrite_file"), false);
  }
});

test("rewrite_file is governed as a mutating project tool", () => {
  assert.equal(defaultAgentProfileRegistry.isToolMutating("rewrite_file"), true);

  const summary = defaultAgentProfileRegistry.getProfileSummary("horus_chat_executor");
  assert.equal(summary.mutatingTools.includes("rewrite_file"), true);
  assert.equal(summary.allowedTools.includes("rewrite_file"), true);

  assert.throws(
    () => defaultAgentProfileRegistry.assertCanUseTool("qa_agent", "rewrite_file"),
    AgentToolAccessDeniedError
  );
});
