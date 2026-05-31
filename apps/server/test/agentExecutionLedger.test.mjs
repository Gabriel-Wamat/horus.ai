import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { FileAgentExecutionLedgerRepository } from "../dist/infrastructure/repositories/FileAgentExecutionLedgerRepository.js";
import { WorkflowOrchestrator } from "../dist/domain/services/WorkflowOrchestrator.js";

const workspaceFolderId = "55555555-5555-4555-8555-555555555555";
const chatSessionId = "66666666-6666-4666-8666-666666666666";
const sourceMessageId = "77777777-7777-4777-8777-777777777777";
const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ajustar interface",
  description: "Como usuario, quero uma interface ajustada.",
  acceptanceCriteria: ["Interface atualizada"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-27T10:00:00.000Z",
};

test("FileAgentExecutionLedgerRepository keeps turns and outbox idempotent", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-agent-ledger-"));
  const ledger = new FileAgentExecutionLedgerRepository(baseDir);
  const now = "2026-05-28T15:00:00.000Z";

  const firstTurn = await ledger.createTurn({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    chatSessionId,
    sourceMessageId,
    idempotencyKey: "chat:turn:1",
    intent: { kind: "code_change" },
  });
  const secondTurn = await ledger.createTurn({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    chatSessionId,
    sourceMessageId,
    idempotencyKey: "chat:turn:1",
    intent: { kind: "code_change" },
  });

  assert.equal(secondTurn.id, firstTurn.id);

  const run = await ledger.createRun({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    turnId: firstTurn.id,
    threadId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    workflowMode: "chat_code_change",
  });
  assert.equal((await ledger.getRunByTurnId(firstTurn.id))?.id, run.id);

  const outbox = await ledger.enqueueOutbox({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    eventType: "workflow.start",
    dedupeKey: `workflow.start:${run.id}`,
    payload: { runId: run.id },
    createdAt: now,
    availableAt: now,
  });
  const duplicateOutbox = await ledger.enqueueOutbox({
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    eventType: "workflow.start",
    dedupeKey: `workflow.start:${run.id}`,
    payload: { runId: run.id },
    createdAt: now,
    availableAt: now,
  });
  assert.equal(duplicateOutbox.id, outbox.id);

  const claimed = await ledger.claimNextOutbox({ ownerId: "test-worker", now });
  assert.equal(claimed?.id, outbox.id);
  assert.equal(claimed?.status, "processing");

  const immediateReclaim = await new FileAgentExecutionLedgerRepository(
    baseDir
  ).claimNextOutbox({
    ownerId: "immediate-recovery-worker",
    now: "2026-05-28T15:00:30.000Z",
  });
  assert.equal(immediateReclaim, null);

  const recovered = await new FileAgentExecutionLedgerRepository(
    baseDir
  ).claimNextOutbox({
    ownerId: "recovery-worker",
    now: "2026-05-28T15:03:01.000Z",
  });
  assert.equal(recovered?.id, outbox.id);
  assert.equal(recovered?.attemptCount, 2);
});

test("WorkflowOrchestrator returns the existing run for duplicate idempotency keys", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-agent-ledger-run-"));
  const ledger = new FileAgentExecutionLedgerRepository(baseDir);
  let streamCalls = 0;
  let latestInput;
  let savedState;
  const storage = {
    save: async (state) => {
      savedState = state;
    },
    load: async () => savedState ?? null,
    list: async () => [],
    delete: async () => {},
  };
  const events = {
    emit: () => {},
    subscribe: () => () => {},
    cleanup: () => {},
  };
  const graph = {
    stream: async (input) => {
      latestInput = input;
      streamCalls += 1;
      return (async function* () {
        yield { odinAgent: { status: "completed" } };
      })();
    },
    getState: async () => ({
      values: {
        ...latestInput,
        status: "completed",
        currentUSIndex: 0,
        humanFeedback: {},
        agentResults: {},
      },
      next: [],
    }),
  };
  const orchestrator = new WorkflowOrchestrator(
    storage,
    events,
    graph,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    ledger
  );

  const first = await orchestrator.start({
    workspaceFolderId,
    userStories: [userStory],
    workflowMode: "chat_code_change",
    sourceChatSessionId: chatSessionId,
    sourceChatMessageId: sourceMessageId,
    executionBrief: "Ajuste o card inicial.",
    idempotencyKey: "stable-turn-key",
  });
  await waitFor(() => savedState?.status === "completed");

  const second = await orchestrator.start({
    workspaceFolderId,
    userStories: [userStory],
    workflowMode: "chat_code_change",
    sourceChatSessionId: chatSessionId,
    sourceChatMessageId: sourceMessageId,
    executionBrief: "Ajuste o card inicial.",
    idempotencyKey: "stable-turn-key",
  });

  assert.equal(second.threadId, first.threadId);
  assert.equal(streamCalls, 1);
});

test("WorkflowOrchestrator does not invent completed when graph state is inconclusive", async () => {
  let latestInput;
  let savedState;
  const storage = {
    save: async (state) => {
      savedState = state;
    },
    load: async () => savedState ?? null,
    list: async () => [],
    delete: async () => {},
  };
  const events = {
    emit: () => {},
    subscribe: () => () => {},
    cleanup: () => {},
  };
  const graph = {
    stream: async (input) => {
      latestInput = input;
      return (async function* () {
        yield { odinAgent: {} };
      })();
    },
    getState: async () => ({
      values: {
        ...latestInput,
        currentUSIndex: 0,
        humanFeedback: {},
        agentResults: {},
      },
      next: [],
    }),
  };
  const orchestrator = new WorkflowOrchestrator(storage, events, graph);

  await orchestrator.start({
    workspaceFolderId,
    userStories: [userStory],
  });
  await waitFor(() => savedState?.status === "completed_unverified");

  assert.equal(savedState.status, "completed_unverified");
});

test("WorkflowOrchestrator marks stale running chat workflows as explicit errors", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-agent-ledger-stale-"));
  const ledger = new FileAgentExecutionLedgerRepository(baseDir);
  const oldTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const threadId = "99999999-9999-4999-8999-999999999999";
  const turn = await ledger.createTurn({
    id: "12121212-1212-4212-8212-121212121212",
    chatSessionId,
    sourceMessageId,
    idempotencyKey: "stale-chat-turn",
    intent: { workflowMode: "chat_code_change" },
    status: "running",
    createdAt: oldTimestamp,
  });
  const run = await ledger.createRun({
    id: "34343434-3434-4434-8434-343434343434",
    turnId: turn.id,
    threadId,
    workflowMode: "chat_code_change",
    status: "running",
    startedAt: oldTimestamp,
    createdAt: oldTimestamp,
  });
  await ledger.createAttempt({
    id: "56565656-5656-4565-8565-565656565656",
    runId: run.id,
    attemptNumber: 1,
    startedAt: oldTimestamp,
    status: "running",
  });

  let savedState = {
    threadId,
    workspaceFolderId,
    workflowMode: "chat_code_change",
    sourceChatSessionId: chatSessionId,
    sourceChatMessageId: sourceMessageId,
    userStories: [userStory],
    currentUSIndex: 0,
    specs: {},
    workspaceArtifactContext: {},
    humanFeedback: {},
    agentResults: {},
    pendingCheckpoints: [],
    validationGates: [],
    status: "running",
    startedAt: oldTimestamp,
  };
  const emitted = [];
  const storage = {
    save: async (state) => {
      savedState = state;
    },
    load: async () => savedState ?? null,
    list: async () => [threadId],
    delete: async () => {},
  };
  const events = {
    emit: (event) => emitted.push(event),
    subscribe: () => () => {},
    cleanup: () => {},
  };
  const graph = {
    stream: async () => (async function* () {})(),
    getState: async () => ({ values: {}, next: [] }),
  };
  const eventHistory = {
    list: async () => [
      {
        id: `${threadId}:12:node_completed`,
        threadId,
        sequence: 12,
        type: "node_completed",
        phase: "patching",
        eventType: "patch_proposed",
        actorKind: "agent",
        actorName: "Front Agent",
        nodeId: "frontAgent",
        agentName: "front",
        title: "Front Agent concluiu",
        timestamp: oldTimestamp,
      },
    ],
  };
  const orchestrator = new WorkflowOrchestrator(
    storage,
    events,
    graph,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    ledger,
    undefined,
    undefined,
    eventHistory
  );

  await orchestrator.recoverPendingExecutions();

  const updatedRun = await ledger.getRunByThreadId(threadId);
  assert.equal(savedState.status, "error");
  assert.equal(updatedRun?.status, "error");
  assert.match(updatedRun?.lastError ?? "", /running without recoverable progress/);
  assert.equal(
    emitted.some((event) => event.type === "status_changed" && event.status === "error"),
    true
  );
  assert.equal(emitted.some((event) => event.type === "error"), true);
});

test("WorkflowOrchestrator marks legacy running workflow states without ledger rows as explicit errors", async () => {
  const oldTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const threadId = "18181818-1818-4818-8818-181818181818";
  let savedState = {
    threadId,
    workspaceFolderId,
    workflowMode: "chat_code_change",
    sourceChatSessionId: chatSessionId,
    sourceChatMessageId: sourceMessageId,
    userStories: [userStory],
    currentUSIndex: 0,
    specs: {},
    workspaceArtifactContext: {},
    humanFeedback: {},
    agentResults: {},
    pendingCheckpoints: [],
    validationGates: [],
    status: "running",
    startedAt: oldTimestamp,
  };
  const emitted = [];
  const storage = {
    save: async (state) => {
      savedState = state;
    },
    load: async () => savedState ?? null,
    list: async () => [threadId],
    delete: async () => {},
  };
  const events = {
    emit: (event) => emitted.push(event),
    subscribe: () => () => {},
    cleanup: () => {},
  };
  const graph = {
    stream: async () => (async function* () {})(),
    getState: async () => ({ values: {}, next: [] }),
  };
  const eventHistory = {
    list: async () => [
      {
        id: `${threadId}:7:patch_proposed`,
        threadId,
        sequence: 7,
        type: "patch_proposed",
        phase: "patching",
        eventType: "patch_proposed",
        actorKind: "agent",
        actorName: "Front Agent",
        nodeId: "frontAgent",
        agentName: "front",
        title: "Patch proposto",
        timestamp: oldTimestamp,
      },
    ],
  };
  const orchestrator = new WorkflowOrchestrator(
    storage,
    events,
    graph,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    eventHistory
  );

  await orchestrator.recoverPendingExecutions();

  assert.equal(savedState.status, "error");
  assert.match(savedState.errorMessage, /running without recoverable progress/);
  assert.equal(
    emitted.some((event) => event.type === "status_changed" && event.status === "error"),
    true
  );
  assert.equal(emitted.some((event) => event.type === "error"), true);
});

async function waitFor(predicate) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1000) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
