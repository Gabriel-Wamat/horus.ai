import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import { createOpsControlPlaneRouter } from "../dist/infrastructure/http/routes/opsControlPlaneRoutes.js";
import { FileAgentExecutionLedgerRepository } from "../dist/infrastructure/repositories/FileAgentExecutionLedgerRepository.js";
import { FileProjectConstructionRepository } from "../dist/infrastructure/repositories/FileProjectConstructionRepository.js";

test("ops control plane exposes run history, dead letters, diagnostics and recovery", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-ops-control-plane-"));
  const ledger = new FileAgentExecutionLedgerRepository(join(baseDir, "ledger"));
  const projectConstruction = new FileProjectConstructionRepository(
    join(baseDir, "construction")
  );
  let recoverCalls = 0;

  try {
    await ledger.createRun({
      id: "11111111-1111-4111-8111-111111111111",
      threadId: "22222222-2222-4222-8222-222222222222",
      workflowMode: "project_construction",
      status: "running",
      startedAt: "2026-06-08T10:00:00.000Z",
      createdAt: "2026-06-08T10:00:00.000Z",
    });
    const outbox = await ledger.enqueueOutbox({
      id: "33333333-3333-4333-8333-333333333333",
      eventType: "workflow.start",
      dedupeKey: "workflow:start:test",
      payload: { threadId: "22222222-2222-4222-8222-222222222222" },
      createdAt: "2026-06-08T10:00:01.000Z",
    });
    await ledger.failOutbox({
      outboxId: outbox.id,
      status: "dead_letter",
      error: "boom",
    });
    await projectConstruction.saveConstructionRun({
      id: "44444444-4444-4444-8444-444444444444",
      projectWorkspaceId: "55555555-5555-4555-8555-555555555555",
      workflowRunId: "22222222-2222-4222-8222-222222222222",
      status: "running",
      workspacePath: "/tmp/horus-project",
      branchName: null,
      baseRef: "main",
      selectedUserStoryIds: [],
      selectedSpecIds: [],
      startedAt: "2026-06-08T10:00:02.000Z",
      finishedAt: null,
      error: null,
    });

    const app = express();
    app.use(express.json());
    app.use(
      "/api/ops",
      createOpsControlPlaneRouter({
        ledger,
        projectConstruction,
        persistenceDriver: "file",
        recoverPendingExecutions: async () => {
          recoverCalls += 1;
        },
      })
    );
    const server = await listen(app);
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const snapshot = await fetchJson(`${baseUrl}/api/ops/control-plane`);

      assert.equal(snapshot.persistenceDriver, "file");
      assert.equal(snapshot.metrics.workflowRuns.running, 1);
      assert.equal(snapshot.metrics.outbox.deadLetter, 1);
      assert.equal(snapshot.metrics.recoverableRuns, 1);
      assert.equal(snapshot.runHistory.length, 1);
      assert.equal(snapshot.deadLetters.length, 1);
      assert.equal(
        snapshot.actions.recoverPendingExecutions,
        "POST /api/ops/control-plane/recover"
      );
      assert.equal(
        snapshot.diagnostics.some((item) => item.code === "dead_letter_outbox"),
        true
      );

      const recovered = await fetchJson(
        `${baseUrl}/api/ops/control-plane/recover`,
        { method: "POST" }
      );
      assert.equal(recoverCalls, 1);
      assert.equal(typeof recovered.recoveredAt, "string");
      assert.equal(recovered.snapshot.metrics.outbox.deadLetter, 1);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    assert.fail(await response.text());
  }
  return response.json();
}
