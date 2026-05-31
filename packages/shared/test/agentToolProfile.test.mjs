import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentToolCapabilityDefinitionSchema,
  AgentToolProfileSchema,
  AgentToolProfileSummarySchema,
} from "../dist/index.js";

test("AgentToolProfileSchema carries explicit capability scopes", () => {
  const profile = AgentToolProfileSchema.parse({
    id: "front_agent",
    agentName: "front",
    label: "Front Agent",
    purpose: "Produce auditable frontend changes.",
    allowedTools: ["inspect_project", "read_file", "edit_file", "run_command"],
    forbiddenTools: ["git_push"],
    capabilityScopes: [
      "project_inspection",
      "project_read",
      "project_mutation",
      "command_run",
    ],
    inputContract: "Spec",
    outputContract: "CodeChangeSet",
  });

  assert.equal(profile.capabilityScopes.includes("project_mutation"), true);
  assert.equal(profile.isolationPolicy.timeoutMs, 120_000);
});

test("AgentToolProfileSchema rejects allowed and forbidden overlap", () => {
  assert.throws(
    () =>
      AgentToolProfileSchema.parse({
        id: "qa_agent",
        agentName: "qa",
        label: "QA Agent",
        purpose: "Validate generated projects.",
        allowedTools: ["edit_file"],
        forbiddenTools: ["edit_file"],
        inputContract: "Spec",
        outputContract: "QaResult",
      }),
    /cannot be both allowed and forbidden/
  );
});

test("AgentToolCapabilityDefinitionSchema describes tool mutability", () => {
  const definition = AgentToolCapabilityDefinitionSchema.parse({
    toolName: "delete_file",
    capabilities: ["project_delete", "project_mutation"],
    mutatesState: true,
    requiresProjectContext: true,
    description: "Delete a bounded project file.",
  });

  assert.equal(definition.mutatesState, true);
  assert.equal(definition.capabilities.includes("project_delete"), true);
});

test("AgentToolProfileSummarySchema exposes runtime diagnostics shape", () => {
  const summary = AgentToolProfileSummarySchema.parse({
    id: "curator_agent",
    agentName: "curator",
    label: "Curator Agent",
    purpose: "Review delivery evidence.",
    capabilityScopes: ["project_read", "diff_read", "validation_run"],
    allowedTools: ["read_file", "get_git_diff", "run_validation_command"],
    forbiddenTools: ["edit_file", "delete_file"],
    readOnlyTools: ["read_file", "get_git_diff"],
    mutatingTools: [],
    commandTools: [],
  });

  assert.deepEqual(summary.mutatingTools, []);
});
