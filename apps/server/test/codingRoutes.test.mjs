import assert from "node:assert/strict";
import express from "express";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { CodingRuntimeOrchestrator } from "../dist/application/coding/CodingRuntimeOrchestrator.js";
import { createCodingRouter } from "../dist/infrastructure/http/routes/codingRoutes.js";
import { FileCodingTaskRepository } from "../dist/infrastructure/repositories/FileCodingTaskRepository.js";

const projectId = "33333333-3333-4333-8333-333333333333";

test("coding routes create, read, replay, run failure, and cancel tasks", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-coding-routes-"));
  const orchestrator = new CodingRuntimeOrchestrator({
    taskRepository: new FileCodingTaskRepository(root),
    idGenerator: makeIdGenerator(buildUuidSequence(16)),
    now: () => new Date("2026-05-28T18:30:00.000Z"),
  });
  const app = express();
  app.use(express.json());
  app.use("/api/coding", createCodingRouter({ orchestrator }));
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/coding`;

  try {
    const createdResponse = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "Ajuste o componente React.",
        projectId,
        selectedPaths: ["src/App.tsx"],
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.task.state, "accepted");
    assert.equal(created.task.surface, "frontend");

    const fetchedResponse = await fetch(`${baseUrl}/tasks/${created.task.id}`);
    assert.equal(fetchedResponse.status, 200);
    const fetched = await fetchedResponse.json();
    assert.equal(fetched.task.id, created.task.id);

    const failedRunResponse = await fetch(`${baseUrl}/tasks/${created.task.id}/run`, {
      method: "POST",
    });
    assert.equal(failedRunResponse.status, 200);
    const failedRun = await failedRunResponse.json();
    assert.equal(failedRun.task.state, "failed");
    assert.equal(failedRun.task.error.code, "missing_capability");

    const eventsResponse = await fetch(
      `${baseUrl}/tasks/${created.task.id}/events?afterSequence=1`
    );
    assert.equal(eventsResponse.status, 200);
    const events = await eventsResponse.json();
    assert.deepEqual(
      events.events.map((event) => event.type),
      ["scan_requested", "task_failed"]
    );

    const secondResponse = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "Ajuste CSS.",
        projectId,
      }),
    });
    const second = await secondResponse.json();
    const cancelResponse = await fetch(`${baseUrl}/tasks/${second.task.id}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Usuário cancelou." }),
    });
    assert.equal(cancelResponse.status, 200);
    const cancelled = await cancelResponse.json();
    assert.equal(cancelled.task.state, "cancelled");
  } finally {
    await close(server);
  }
});

function listen(app) {
  const server = app.listen(0);
  return new Promise((resolve) => server.once("listening", () => resolve(server)));
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

function makeIdGenerator(ids) {
  const queue = [...ids];
  return () => {
    const next = queue.shift();
    assert.ok(next, "test id queue exhausted");
    return next;
  };
}

function buildUuidSequence(count) {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index + 1).padStart(12, "0");
    return `bbbbbbbb-bbbb-4bbb-8bbb-${suffix}`;
  });
}
