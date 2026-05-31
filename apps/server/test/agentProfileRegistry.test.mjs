import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentProfileAccessError,
  AgentProfileRegistry,
} from "../dist/application/services/AgentProfileRegistry.js";

const registeredProjectRuntimeTools = [
  "delete_file",
  "edit_file",
  "get_git_diff",
  "inspect_preview",
  "inspect_project",
  "list_files",
  "propose_code_change_set",
  "read_file",
  "replace_file_range",
  "run_command",
  "run_validation_command",
  "save_file",
  "search_code",
  "search_code_readonly",
  "write_file",
];

test("AgentProfileRegistry exposes least-privilege tool profiles", () => {
  const profiles = new AgentProfileRegistry();

  assert.equal(profiles.canUseTool("horus_chat_executor", "inspect_project"), true);
  assert.equal(profiles.canUseTool("front_agent", "edit_file"), true);
  assert.equal(profiles.canUseTool("front_agent", "replace_file_range"), true);
  assert.equal(profiles.canUseTool("front_agent", "delete_file"), true);
  assert.equal(profiles.canUseTool("front_agent", "run_command"), true);
  assert.equal(profiles.canUseTool("qa_agent", "edit_file"), false);
  assert.equal(profiles.canUseTool("qa_agent", "run_command"), true);
  assert.equal(profiles.canUseTool("qa_agent", "inspect_preview"), true);
  assert.equal(profiles.canUseTool("curator_agent", "apply_code_change_set"), false);
  assert.equal(profiles.canUseTool("curator_agent", "write_file"), false);
  assert.equal(profiles.canUseTool("odin_agent", "write_file"), false);
});

test("AgentProfileRegistry derives capability summaries for diagnostics", () => {
  const profiles = new AgentProfileRegistry();
  const front = profiles.getProfileSummary("front_agent");
  const qa = profiles.getProfileSummary("qa_agent");
  const curator = profiles.getProfileSummary("curator_agent");

  assert.equal(front.capabilityScopes.includes("project_mutation"), true);
  assert.equal(front.mutatingTools.includes("edit_file"), true);
  assert.equal(front.mutatingTools.includes("replace_file_range"), true);
  assert.equal(front.commandTools.includes("run_command"), true);
  assert.deepEqual(qa.mutatingTools, []);
  assert.equal(qa.commandTools.includes("run_command"), true);
  assert.equal(qa.capabilityScopes.includes("preview_inspection"), true);
  assert.deepEqual(curator.mutatingTools, []);
  assert.equal(curator.capabilityScopes.includes("diff_read"), true);
});

test("AgentProfileRegistry enforces explicit permission contracts by agent profile", () => {
  const profiles = new AgentProfileRegistry();
  const contracts = profiles.listPermissionContracts();

  assert.doesNotThrow(() => profiles.validatePermissionContracts());

  const qa = contracts.find((contract) => contract.profileId === "qa_agent");
  const front = contracts.find((contract) => contract.profileId === "front_agent");
  const curator = contracts.find(
    (contract) => contract.profileId === "curator_agent"
  );
  const chat = contracts.find(
    (contract) => contract.profileId === "horus_chat_executor"
  );

  assert.ok(qa);
  assert.equal(qa.requiredAllowedTools.includes("run_command"), true);
  assert.equal(qa.requiredAllowedTools.includes("run_validation_command"), true);
  assert.equal(qa.requiredAllowedTools.includes("inspect_preview"), true);
  assert.equal(qa.deniedCapabilities.includes("project_mutation"), true);

  assert.ok(front);
  assert.equal(front.requiredAllowedTools.includes("edit_file"), true);
  assert.equal(front.requiredAllowedTools.includes("replace_file_range"), true);
  assert.equal(front.requiredCapabilities.includes("project_mutation"), true);

  assert.ok(curator);
  assert.equal(curator.requiredAllowedTools.includes("run_validation_command"), true);
  assert.equal(curator.deniedTools.includes("run_command"), true);
  assert.equal(curator.deniedCapabilities.includes("project_mutation"), true);
  assert.equal(curator.deniedCapabilities.includes("command_run"), true);

  assert.ok(chat);
  assert.equal(chat.requiredAllowedTools.includes("edit_file"), true);
  assert.equal(chat.deniedTools.includes("run_arbitrary_command"), true);
});

test("AgentProfileRegistry validates registered runtime tool availability", () => {
  const profiles = new AgentProfileRegistry();

  assert.doesNotThrow(() =>
    profiles.validateRegisteredToolReferences({
      registeredTools: registeredProjectRuntimeTools,
      profileIds: ["front_agent", "qa_agent", "curator_agent"],
    })
  );

  assert.throws(
    () =>
      profiles.validateRegisteredToolReferences({
        registeredTools: registeredProjectRuntimeTools.filter(
          (toolName) => toolName !== "edit_file"
        ),
        profileIds: ["front_agent"],
      }),
    /front_agent:edit_file/
  );
});

test("AgentProfileRegistry rejects mutability drift between tool registration and capability registry", () => {
  const profiles = new AgentProfileRegistry();

  assert.throws(
    () => profiles.assertToolRegistration("edit_file", false),
    (err) =>
      err instanceof AgentProfileAccessError &&
      /does not match capability registry/.test(err.message)
  );
});
