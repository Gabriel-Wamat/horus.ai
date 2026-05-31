import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentFileOperationTelemetrySchema,
  HorusRunEventSnapshotSchema,
  WorkflowEventSchema,
  mapWorkflowEventToFileOperations,
} from "../dist/index.js";

test("HorusRunEventSnapshot accepts normalized agentic loop fields", () => {
  const parsed = HorusRunEventSnapshotSchema.parse({
    id: "run-1:1:patch_proposed",
    threadId: "11111111-1111-4111-8111-111111111111",
    sequence: 1,
    type: "patch_proposed",
    phase: "patching",
    eventType: "patch_proposed",
    actorKind: "agent",
    actorName: "Front Agent",
    nodeId: "frontAgent",
    agentName: "front",
    agentProfileId: "front_agent",
    agentProfile: {
      id: "front_agent",
      agentName: "front",
      label: "Front Agent",
      purpose: "Produce auditable frontend CodeChangeSet proposals.",
      allowedTools: ["search_code_readonly"],
      forbiddenTools: ["arbitrary_shell"],
      inputContract: "UserStory + Spec + CodeContext",
      outputContract: "CodeChangeSet",
    },
    userStoryId: "22222222-2222-4222-8222-222222222222",
    title: "Patch proposto",
    metadata: { changeSetId: "33333333-3333-4333-8333-333333333333" },
    filePaths: ["src/App.tsx"],
    timestamp: "2026-05-26T10:00:00.000Z",
  });

  assert.equal(parsed.phase, "patching");
  assert.equal(parsed.eventType, "patch_proposed");
  assert.equal(parsed.agentProfileId, "front_agent");
  assert.equal(parsed.agentProfile?.outputContract, "CodeChangeSet");
  assert.deepEqual(parsed.filePaths, ["src/App.tsx"]);
});

test("WorkflowEventSchema accepts patch lifecycle events", () => {
  const event = WorkflowEventSchema.parse({
    type: "patch_applied",
    threadId: "11111111-1111-4111-8111-111111111111",
    userStoryId: "22222222-2222-4222-8222-222222222222",
    changeSetId: "33333333-3333-4333-8333-333333333333",
    filePaths: ["src/App.tsx"],
    timestamp: "2026-05-26T10:00:00.000Z",
  });

  assert.equal(event.type, "patch_applied");
  assert.equal(event.filePaths[0], "src/App.tsx");
});

test("AgentFileOperationTelemetry captures exact file operation evidence", () => {
  const operation = AgentFileOperationTelemetrySchema.parse({
    id: "op-1",
    threadId: "11111111-1111-4111-8111-111111111111",
    sequence: 4,
    workflowSequence: 4,
    sourceEventId: "event-1",
    path: "src/App.tsx",
    operationType: "update",
    status: "changed",
    agentName: "front",
    agentProfileId: "front_agent",
    toolName: "edit_file",
    changeType: "update",
    additions: 3,
    deletions: 1,
    patchStrategy: "structural_ast",
    structuralIntentKinds: ["replace"],
    structuralSymbolName: "App",
    structuralSymbolKind: "component",
    preconditionCount: 1,
    preconditionHash: "0123456789abcdef",
    timestamp: "2026-05-29T20:13:26.000Z",
  });

  assert.equal(operation.operationType, "update");
  assert.equal(operation.status, "changed");
  assert.equal(operation.path, "src/App.tsx");
  assert.equal(operation.patchStrategy, "structural_ast");
  assert.deepEqual(operation.structuralIntentKinds, ["replace"]);
  assert.equal(operation.structuralSymbolName, "App");
  assert.equal(operation.preconditionHash, "0123456789abcdef");
});

test("workflow events project into file-operation telemetry without UI inference", () => {
  const event = WorkflowEventSchema.parse({
    type: "tool_call_started",
    threadId: "11111111-1111-4111-8111-111111111111",
    agentName: "front",
    agentProfileId: "front_agent",
    toolName: "edit_file",
    userStoryId: "22222222-2222-4222-8222-222222222222",
    operationalSessionId: "33333333-3333-4333-8333-333333333333",
    summary: "Editando src/App.tsx.",
    filePaths: ["src/App.tsx"],
    timestamp: "2026-05-29T20:13:26.000Z",
  });

  const operations = mapWorkflowEventToFileOperations(event, 12);

  assert.equal(operations.length, 1);
  assert.equal(operations[0].operationType, "update");
  assert.equal(operations[0].status, "running");
  assert.equal(operations[0].toolName, "edit_file");
  assert.equal(operations[0].operationalSessionId, "33333333-3333-4333-8333-333333333333");
});

test("workflow file-operation projection labels proposal targets as proposed apply rows", () => {
  const event = WorkflowEventSchema.parse({
    type: "tool_call_finished",
    threadId: "11111111-1111-4111-8111-111111111111",
    agentName: "front",
    agentProfileId: "front_agent",
    toolName: "propose_code_change_set",
    status: "succeeded",
    userStoryId: "22222222-2222-4222-8222-222222222222",
    operationalSessionId: "33333333-3333-4333-8333-333333333333",
    summary: "Proposta registrada.",
    filePaths: ["src/App.tsx"],
    timestamp: "2026-05-29T20:13:26.000Z",
  });

  const operations = mapWorkflowEventToFileOperations(event, 13);

  assert.equal(operations.length, 1);
  assert.equal(operations[0].operationType, "apply");
  assert.equal(operations[0].status, "proposed");
  assert.equal(operations[0].toolName, "propose_code_change_set");
});
