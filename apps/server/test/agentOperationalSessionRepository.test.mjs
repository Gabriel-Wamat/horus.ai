import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileAgentOperationalSessionRepository } from "../dist/infrastructure/repositories/FileAgentOperationalSessionRepository.js";

const sessionId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const storyId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-05-28T22:00:00.000Z";

test("FileAgentOperationalSessionRepository persists append-only events and rebuilds projection", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-agent-operational-"));
  const repo = new FileAgentOperationalSessionRepository(baseDir);

  await repo.createSession({
    id: sessionId,
    workflowThreadId: threadId,
    projectId,
    userStoryId: storyId,
    agentName: "front",
    agentProfileId: "front_agent",
    startedAt: timestamp,
  });
  await repo.createSession({
    id: "77777777-7777-4777-8777-777777777777",
    workflowThreadId: "88888888-8888-4888-8888-888888888888",
    projectId,
    userStoryId: storyId,
    agentName: "qa",
    agentProfileId: "qa_agent",
    startedAt: timestamp,
  });
  await repo.appendEvent({
    id: "55555555-5555-4555-8555-555555555555",
    sessionId,
    type: "session_started",
    summary: "started",
    createdAt: timestamp,
  });
  await repo.appendEvent({
    id: "66666666-6666-4666-8666-666666666666",
    sessionId,
    type: "file_read",
    filePaths: ["src/App.tsx"],
    metadata: {
      evidence: {
        path: "src/App.tsx",
        versionHash: "0123456789abcdef",
        readAt: timestamp,
      },
    },
    createdAt: timestamp,
  });
  await repo.updateSessionStatus({
    sessionId,
    status: "completed",
    finishedAt: "2026-05-28T22:01:00.000Z",
    lastError: null,
  });

  const restartedRepo = new FileAgentOperationalSessionRepository(baseDir);
  const events = await restartedRepo.listEvents(sessionId);
  const sessions = await restartedRepo.listSessionsByWorkflowThread(threadId);
  const projection = await restartedRepo.getProjection(sessionId);

  assert.deepEqual(
    sessions.map((session) => session.id),
    [sessionId]
  );
  assert.deepEqual(
    events.map((event) => event.sequence),
    [0, 1]
  );
  assert.equal(projection.status, "completed");
  assert.equal(projection.filesRead[0].path, "src/App.tsx");
  assert.equal(projection.filesRead[0].versionHash, "0123456789abcdef");
});

test("FileAgentOperationalSessionRepository serializes concurrent event appends", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-agent-operational-lock-"));
  const repo = new FileAgentOperationalSessionRepository(baseDir);

  await repo.createSession({
    id: sessionId,
    workflowThreadId: threadId,
    projectId,
    userStoryId: storyId,
    agentName: "front",
    agentProfileId: "front_agent",
    startedAt: timestamp,
  });

  await Promise.all(
    Array.from({ length: 24 }, async (_, index) =>
      repo.appendEvent({
        id: randomUUID(),
        sessionId,
        type: "tool_started",
        summary: `event ${index}`,
        createdAt: timestamp,
      })
    )
  );

  const events = await repo.listEvents(sessionId);
  assert.equal(events.length, 24);
  assert.deepEqual(
    events.map((event) => event.sequence),
    Array.from({ length: 24 }, (_, index) => index)
  );
  assert.equal(new Set(events.map((event) => event.id)).size, 24);
});
