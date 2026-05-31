import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowEventSchema } from "../../../packages/shared/dist/index.js";
import { mapWorkflowEvent } from "../dist/application/services/horusRunFlowMapping.js";

test("tool workflow events roundtrip through shared schema and run-flow mapping", () => {
  const event = WorkflowEventSchema.parse({
    type: "tool_call_finished",
    threadId: "11111111-1111-4111-8111-111111111111",
    agentName: "front",
    agentProfileId: "front_agent",
    toolName: "edit_file",
    traceId: "11111111-1111-4111-8111-111111111111",
    spanId: "tool-span-1",
    toolCallId: "tool-span-1",
    runId: "44444444-4444-4444-8444-444444444444",
    projectId: "55555555-5555-4555-8555-555555555555",
    agentId: "front_agent",
    filePath: "src/App.tsx",
    diffId: "66666666-6666-4666-8666-666666666666",
    status: "succeeded",
    userStoryId: "22222222-2222-4222-8222-222222222222",
    operationalSessionId: "33333333-3333-4333-8333-333333333333",
    durationMs: 12,
    summary: "edit_file alterou src/App.tsx.",
    filePaths: ["src/App.tsx"],
    timestamp: "2026-05-28T00:00:00.000Z",
  });

  const snapshot = mapWorkflowEvent(event, 7);

  assert.equal(snapshot.type, "tool_call_finished");
  assert.equal(snapshot.eventType, "tool_call_finished");
  assert.equal(snapshot.actorKind, "tool");
  assert.equal(snapshot.nodeId, "frontAgent");
  assert.deepEqual(snapshot.filePaths, ["src/App.tsx"]);
  assert.equal(snapshot.agentProfileId, "front_agent");
  assert.equal(snapshot.traceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(snapshot.spanId, "tool-span-1");
  assert.equal(snapshot.toolCallId, "tool-span-1");
  assert.equal(snapshot.runId, "44444444-4444-4444-8444-444444444444");
  assert.equal(snapshot.projectId, "55555555-5555-4555-8555-555555555555");
  assert.equal(snapshot.agentId, "front_agent");
  assert.equal(snapshot.filePath, "src/App.tsx");
  assert.equal(snapshot.diffId, "66666666-6666-4666-8666-666666666666");
  assert.equal(
    snapshot.metadata.operationalSessionId,
    "33333333-3333-4333-8333-333333333333"
  );
  assert.equal(snapshot.metadata.toolCallId, "tool-span-1");
});

test("tool started events can expose file targets before the edit finishes", () => {
  const event = WorkflowEventSchema.parse({
    type: "tool_call_started",
    threadId: "11111111-1111-4111-8111-111111111111",
    agentName: "front",
    agentProfileId: "front_agent",
    toolName: "edit_file",
    userStoryId: "22222222-2222-4222-8222-222222222222",
    operationalSessionId: "33333333-3333-4333-8333-333333333333",
    summary: "Editar src/App.tsx.",
    filePaths: ["src/App.tsx"],
    timestamp: "2026-05-28T00:00:00.000Z",
  });

  const snapshot = mapWorkflowEvent(event, 8);

  assert.equal(snapshot.type, "tool_call_started");
  assert.equal(snapshot.eventType, "tool_call_started");
  assert.equal(snapshot.nodeId, "frontAgent");
  assert.deepEqual(snapshot.filePaths, ["src/App.tsx"]);
  assert.equal(snapshot.metadata.toolName, "edit_file");
});

test("tool workflow events project to exact file-operation rows", () => {
  const event = WorkflowEventSchema.parse({
    type: "tool_call_finished",
    threadId: "11111111-1111-4111-8111-111111111111",
    agentName: "front",
    agentProfileId: "front_agent",
    toolName: "read_file",
    status: "succeeded",
    userStoryId: "22222222-2222-4222-8222-222222222222",
    operationalSessionId: "33333333-3333-4333-8333-333333333333",
    summary: "read_file leu src/App.tsx.",
    filePaths: ["src/App.tsx"],
    timestamp: "2026-05-28T00:00:00.000Z",
  });

  const snapshot = mapWorkflowEvent(event, 9);

  assert.equal(snapshot.type, "tool_call_finished");
  assert.equal(snapshot.eventType, "tool_call_finished");
  assert.equal(snapshot.metadata.toolName, "read_file");
  assert.deepEqual(snapshot.filePaths, ["src/App.tsx"]);
});

test("command output events expose trace fields at snapshot top level", () => {
  const event = WorkflowEventSchema.parse({
    type: "command_output",
    threadId: "11111111-1111-4111-8111-111111111111",
    agentName: "qa",
    agentProfileId: "qa_agent",
    toolName: "run_validation_command",
    commandId: "build",
    taskId: "build-task-1",
    traceId: "11111111-1111-4111-8111-111111111111",
    spanId: "tool-span-2",
    toolCallId: "tool-span-2",
    runId: "44444444-4444-4444-8444-444444444444",
    projectId: "55555555-5555-4555-8555-555555555555",
    agentId: "qa_agent",
    filePath: "src/App.tsx",
    diffId: "66666666-6666-4666-8666-666666666666",
    stream: "stderr",
    chunk: "error",
    chunkSequence: 3,
    timestamp: "2026-05-28T00:00:00.000Z",
  });

  const snapshot = mapWorkflowEvent(event, 10);

  assert.equal(snapshot.type, "command_output");
  assert.equal(snapshot.commandId, "build");
  assert.equal(snapshot.taskId, "build-task-1");
  assert.equal(snapshot.traceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(snapshot.toolCallId, "tool-span-2");
  assert.equal(snapshot.stream, "stderr");
  assert.equal(snapshot.chunk, "error");
  assert.equal(snapshot.chunkSequence, 3);
  assert.deepEqual(snapshot.commandIds, ["build"]);
});

test("finished command tool events expose task id at snapshot top level", () => {
  const event = WorkflowEventSchema.parse({
    type: "tool_call_finished",
    threadId: "11111111-1111-4111-8111-111111111111",
    agentName: "front",
    agentProfileId: "front_agent",
    toolName: "run_command",
    status: "succeeded",
    traceId: "11111111-1111-4111-8111-111111111111",
    spanId: "tool-span-3",
    toolCallId: "tool-span-3",
    runId: "44444444-4444-4444-8444-444444444444",
    projectId: "55555555-5555-4555-8555-555555555555",
    agentId: "front_agent",
    commandIds: ["build-root-build"],
    taskId: "build-root-build-task",
    durationMs: 19,
    summary: "run_command concluído.",
    timestamp: "2026-05-28T00:00:00.000Z",
  });

  const snapshot = mapWorkflowEvent(event, 11);

  assert.equal(snapshot.type, "tool_call_finished");
  assert.equal(snapshot.taskId, "build-root-build-task");
  assert.equal(snapshot.metadata.taskId, "build-root-build-task");
  assert.deepEqual(snapshot.commandIds, ["build-root-build"]);
});
