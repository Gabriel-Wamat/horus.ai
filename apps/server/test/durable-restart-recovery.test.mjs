import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { emptyCheckpoint } from "@langchain/langgraph";
import { createWorkflowCheckpointer } from "../dist/infrastructure/langgraph/checkpointer.js";
import { FileAgentExecutionLedgerRepository } from "../dist/infrastructure/repositories/FileAgentExecutionLedgerRepository.js";
import { WorkflowOrchestrator } from "../dist/domain/services/WorkflowOrchestrator.js";

const workspaceFolderId = "55555555-5555-4555-8555-555555555555";
const chatSessionId = "66666666-6666-4666-8666-666666666666";
const sourceMessageId = "77777777-7777-4777-8777-777777777777";
const threadId = "99999999-9999-4999-8999-999999999999";
const runId = "34343434-3434-4434-8434-343434343434";
const attemptId = "56565656-5656-4565-8565-565656565656";
const turnId = "12121212-1212-4212-8212-121212121212";
const outboxId = "78787878-7878-4878-8878-787878787878";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Restart seguro",
  description: "Como usuario, quero que o workflow sobreviva a restart.",
  acceptanceCriteria: ["Nao duplicar eventos apos restart"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-28T10:00:00.000Z",
};

test("file workflow checkpointer reloads checkpoint and pending writes after restart", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-restart-checkpointer-"));
  const checkpointsDir = join(baseDir, "langgraph-checkpoints");
  const config = { configurable: { thread_id: "thread-restart-1" } };
  const checkpoint = {
    ...emptyCheckpoint(),
    id: "00000000-0000-4000-8000-000000000076",
  };

  const saver = await createWorkflowCheckpointer({
    driver: "file",
    checkpointsDir,
  });
  const nextConfig = await saver.put(config, checkpoint, { source: "restart-test" });
  await saver.putWrites(nextConfig, [["resume", { checkpoint: true }]], "task-76");

  const reloaded = await createWorkflowCheckpointer({
    driver: "file",
    checkpointsDir,
  });
  const tuple = await reloaded.getTuple(nextConfig);
  const raw = JSON.parse(
    await readFile(join(checkpointsDir, "memory-saver.json"), "utf-8")
  );

  assert.ok(raw.storage["thread-restart-1"]);
  assert.equal(tuple?.checkpoint.id, checkpoint.id);
  assert.deepEqual(tuple?.pendingWrites, [
    ["task-76", "resume", { checkpoint: true }],
  ]);
});

test("recoverPendingExecutions completes crashed terminal outbox without rerunning graph", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-restart-outbox-"));
  const ledger = new FileAgentExecutionLedgerRepository(baseDir);
  const now = "2026-05-28T10:00:00.000Z";

  await ledger.createTurn({
    id: turnId,
    chatSessionId,
    sourceMessageId,
    idempotencyKey: "restart-terminal-turn",
    intent: { workflowMode: "chat_code_change" },
    status: "completed",
    createdAt: now,
  });
  await ledger.createRun({
    id: runId,
    turnId,
    threadId,
    workflowMode: "chat_code_change",
    status: "completed",
    startedAt: now,
    createdAt: now,
  });
  await ledger.updateRunStatus({
    runId,
    status: "completed",
    completedAt: "2026-05-28T10:01:00.000Z",
    leaseOwner: null,
  });
  await ledger.createAttempt({
    id: attemptId,
    runId,
    attemptNumber: 1,
    startedAt: now,
    status: "completed",
  });
  await ledger.enqueueOutbox({
    id: outboxId,
    eventType: "workflow.start",
    dedupeKey: `workflow.start:${runId}`,
    payload: {
      threadId,
      runId,
      attemptId,
      turnId,
      input: {
        threadId,
        workspaceFolderId,
        userStories: [userStory],
        workflowMode: "chat_code_change",
        status: "running",
      },
      config: {
        configurable: { thread_id: threadId },
        streamMode: "updates",
      },
    },
    createdAt: now,
    availableAt: now,
  });
  await ledger.claimNextOutbox({ ownerId: "crashed-worker", now });

  let graphCalls = 0;
  const orchestrator = new WorkflowOrchestrator(
    {
      save: async () => {},
      load: async () => null,
      list: async () => [],
      delete: async () => {},
    },
    {
      emit: () => {},
      subscribe: () => () => {},
      cleanup: () => {},
    },
    {
      stream: async () => {
        graphCalls += 1;
        throw new Error("Graph must not rerun for a terminal recovered outbox.");
      },
      getState: async () => ({ values: {}, next: [] }),
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    ledger
  );

  await orchestrator.recoverPendingExecutions();

  assert.equal(graphCalls, 0);
  assert.equal(await ledger.claimNextOutbox({ ownerId: "after-recovery" }), null);
  const raw = JSON.parse(
    await readFile(join(baseDir, "agent-execution-ledger.json"), "utf-8")
  );
  assert.equal(raw.outbox[0].status, "processed");
  assert.equal(raw.outbox[0].attemptCount, 2);
});

test("failed outbox events are retried and then dead-lettered with evidence", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-restart-outbox-failed-"));
  const ledger = new FileAgentExecutionLedgerRepository(baseDir);
  const now = "2026-05-28T10:00:00.000Z";
  await ledger.enqueueOutbox({
    id: outboxId,
    eventType: "workflow.start",
    dedupeKey: "workflow.start:retry-failure",
    payload: { invalid: true },
    createdAt: now,
    availableAt: now,
  });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const claimed = await ledger.claimNextOutbox({
      ownerId: `worker-${attempt}`,
      now,
    });
    assert.equal(claimed?.attemptCount, attempt);
    await ledger.failOutbox({
      outboxId,
      status: attempt >= 3 ? "dead_letter" : "failed",
      error: `failure-${attempt}`,
    });
  }

  assert.equal(await ledger.claimNextOutbox({ ownerId: "worker-4", now }), null);
  const raw = JSON.parse(
    await readFile(join(baseDir, "agent-execution-ledger.json"), "utf-8")
  );
  assert.equal(raw.outbox[0].status, "dead_letter");
  assert.equal(raw.outbox[0].attemptCount, 3);
  assert.equal(raw.outbox[0].lastError, "failure-3");
});
