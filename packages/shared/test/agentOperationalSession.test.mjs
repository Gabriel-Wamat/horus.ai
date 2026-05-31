import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentOperationEventSchema,
  AgentOperationalSessionSchema,
  findAgentOperationalReadEvidence,
  projectAgentOperationalFileOperations,
  projectAgentOperationalSession,
} from "../dist/index.js";

const sessionId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const storyId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-05-28T22:00:00.000Z";

test("projects agent operational events into compact replayable state", () => {
  const session = AgentOperationalSessionSchema.parse({
    id: sessionId,
    workflowThreadId: threadId,
    projectId,
    userStoryId: storyId,
    agentName: "front",
    agentProfileId: "front_agent",
    status: "completed",
    startedAt: timestamp,
  });
  const events = [
    {
      id: "55555555-5555-4555-8555-555555555555",
      sessionId,
      sequence: 0,
      type: "tool_started",
      toolName: "read_file",
      toolStatus: "started",
      createdAt: timestamp,
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      sessionId,
      sequence: 1,
      type: "file_read",
      filePaths: ["src/App.tsx"],
      metadata: {
        evidence: {
          path: "src/App.tsx",
          versionHash: "0123456789abcdef",
          baseVersion: {
            hash: "0123456789abcdef",
            sizeBytes: 42,
            mtimeMs: 10,
          },
          readAt: timestamp,
        },
      },
      createdAt: timestamp,
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      sessionId,
      sequence: 2,
      type: "file_changed",
      toolName: "edit_file",
      toolStatus: "succeeded",
      filePaths: ["src/App.tsx"],
      metadata: {
        change: {
          path: "src/App.tsx",
          changeType: "update",
          newVersionHash: "fedcba9876543210",
          additions: 3,
          deletions: 1,
          replacementCount: 1,
          diffPreview: "@@ demo",
          patchStrategy: "structural_ast",
          structuralIntentKinds: ["replace"],
          structuralSymbolName: "App",
          structuralSymbolKind: "component",
          preconditionCount: 1,
          preconditionHash: "0123456789abcdef",
          changedAt: timestamp,
        },
      },
      createdAt: timestamp,
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      sessionId,
      sequence: 3,
      type: "command_ran",
      commandIds: ["build"],
      metadata: {
        command: {
          commandId: "build",
          status: "completed",
          exitCode: 0,
          durationMs: 123,
          ranAt: timestamp,
        },
      },
      createdAt: timestamp,
    },
    {
      id: "99999999-9999-4999-8999-999999999999",
      sessionId,
      sequence: 4,
      type: "session_finished",
      summary: "done",
      createdAt: timestamp,
    },
  ].map((event) => AgentOperationEventSchema.parse(event));

  const projection = projectAgentOperationalSession(session, events);

  assert.equal(projection.status, "completed");
  assert.equal(projection.eventCount, 5);
  assert.deepEqual(
    projection.filesRead.map((file) => file.path),
    ["src/App.tsx"]
  );
  assert.equal(
    findAgentOperationalReadEvidence(projection, "src\\App.tsx").versionHash,
    "0123456789abcdef"
  );
  assert.equal(projection.filesChanged[0].changeType, "update");
  assert.equal(projection.filesChanged[0].patchStrategy, "structural_ast");
  assert.deepEqual(projection.filesChanged[0].structuralIntentKinds, ["replace"]);
  assert.equal(projection.filesChanged[0].structuralSymbolName, "App");
  assert.equal(projection.filesChanged[0].preconditionHash, "0123456789abcdef");
  assert.equal(projection.commands[0].commandId, "build");
  assert.equal(projection.toolsUsed.find((tool) => tool.toolName === "edit_file").count, 1);
  assert.equal(projection.lastSummary, "done");

  const timeline = projectAgentOperationalFileOperations(session, events);
  assert.deepEqual(
    timeline.map((operation) => [
      operation.path,
      operation.operationType,
      operation.status,
    ]),
    [
      ["src/App.tsx", "read", "read"],
      ["src/App.tsx", "update", "changed"],
    ]
  );
  assert.equal(timeline[1].newVersionHash, "fedcba9876543210");
  assert.equal(timeline[1].diffPreview, "@@ demo");
  assert.equal(timeline[1].patchStrategy, "structural_ast");
  assert.deepEqual(timeline[1].structuralIntentKinds, ["replace"]);
  assert.equal(timeline[1].structuralSymbolName, "App");
  assert.equal(timeline[1].structuralSymbolKind, "component");
  assert.equal(timeline[1].preconditionCount, 1);
  assert.equal(timeline[1].preconditionHash, "0123456789abcdef");
});
