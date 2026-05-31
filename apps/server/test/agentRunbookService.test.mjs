import assert from "node:assert/strict";
import test from "node:test";
import { projectAgentOperationalSession } from "@u-build/shared";
import { AgentRunbookService } from "../dist/application/services/AgentRunbookService.js";

const service = new AgentRunbookService();
const sessionId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const storyId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-05-28T22:00:00.000Z";

test("AgentRunbookService projects operational reads, edits and commands", () => {
  const session = {
    id: sessionId,
    workflowThreadId: threadId,
    projectId,
    userStoryId: storyId,
    runId: null,
    codeChangeSetId: null,
    agentName: "front",
    agentProfileId: "front_agent",
    status: "completed",
    startedAt: timestamp,
    finishedAt: "2026-05-28T22:03:00.000Z",
    lastError: null,
    metadata: {},
  };
  const events = [
    event("55555555-5555-4555-8555-555555555555", 0, "session_started"),
    event("66666666-6666-4666-8666-666666666666", 1, "tool_started", {
      toolName: "read_file",
      toolStatus: "started",
      filePaths: ["src/App.tsx"],
    }),
    event("77777777-7777-4777-8777-777777777777", 2, "tool_succeeded", {
      toolName: "read_file",
      toolStatus: "succeeded",
      filePaths: ["src/App.tsx"],
    }),
    event("88888888-8888-4888-8888-888888888888", 3, "file_read", {
      filePaths: ["src/App.tsx"],
      metadata: {
        evidence: {
          path: "src/App.tsx",
          versionHash: "0123456789abcdef",
          readAt: timestamp,
        },
      },
    }),
    event("99999999-9999-4999-8999-999999999999", 4, "file_changed", {
      toolName: "edit_file",
      filePaths: ["src/App.tsx"],
      metadata: {
        change: {
          path: "src/App.tsx",
          changeType: "update",
          changedAt: timestamp,
        },
      },
    }),
    event("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 5, "command_ran", {
      toolName: "run_validation_command",
      commandIds: ["build"],
      metadata: {
        command: {
          commandId: "build",
          status: "completed",
          exitCode: 0,
          ranAt: timestamp,
        },
      },
    }),
  ];
  const projection = projectAgentOperationalSession(session, events);
  const runbook = service.buildFromOperationalProjection(projection, events);

  assert.equal(
    runbook.some((entry) => entry.status === "running" && entry.toolName === "read_file"),
    false
  );
  assert.deepEqual(
    runbook.map((entry) => entry.title),
    [
      "Front Agent iniciou execução",
      "Leu src/App.tsx",
      "Editou src/App.tsx",
      "Executou build",
    ]
  );
});

test("AgentRunbookService projects waiting decisions and terminal failures", () => {
  const entries = service.buildFromWorkflowEvents([
    {
      id: `${threadId}:1:awaiting_retry_approval`,
      threadId,
      sequence: 1,
      type: "awaiting_retry_approval",
      phase: "retrying",
      eventType: "awaiting_approval",
      actorKind: "human",
      actorName: "Retry approval",
      nodeId: "retryCheckpoint",
      userStoryId: storyId,
      title: "Aguardando aprovação de retry",
      summary: "Limite de autocorreção atingido.",
      timestamp,
    },
    {
      id: `${threadId}:2:error`,
      threadId,
      sequence: 2,
      type: "error",
      phase: "failed",
      eventType: "failed",
      actorKind: "system",
      actorName: "Horus",
      nodeId: "fail",
      title: "Erro na execução",
      errorMessage: "Falha terminal",
      timestamp: "2026-05-28T22:01:00.000Z",
    },
  ]);

  assert.equal(entries[0].status, "waiting_for_decision");
  assert.equal(entries[1].status, "failed");
  assert.equal(entries[1].errorMessage, "Falha terminal");
});

function event(id, sequence, type, overrides = {}) {
  return {
    id,
    sessionId,
    sequence,
    type,
    toolName: null,
    toolStatus: null,
    summary: null,
    filePaths: [],
    commandIds: [],
    errorMessage: null,
    metadata: {},
    createdAt: timestamp,
    ...overrides,
  };
}
