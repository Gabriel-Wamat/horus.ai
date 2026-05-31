import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileWorkflowEventLogRepository } from "../dist/infrastructure/repositories/FileWorkflowEventLogRepository.js";

const threadId = "11111111-1111-4111-8111-111111111111";

test("FileWorkflowEventLogRepository serializes concurrent appends per thread", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-workflow-events-"));
  const repository = new FileWorkflowEventLogRepository(root);
  const timestamp = "2026-05-30T00:00:00.000Z";

  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      repository.append({
        type: "status_changed",
        threadId,
        status: index % 2 === 0 ? "running" : "completed",
        timestamp,
      })
    )
  );

  const events = await repository.list(threadId);

  assert.equal(events.length, 20);
  assert.deepEqual(
    events.map((event) => event.sequence),
    Array.from({ length: 20 }, (_, index) => index + 1)
  );
  assert.equal(new Set(events.map((event) => event.id)).size, 20);

  const appendOnlyLog = await readFile(join(root, `${threadId}.jsonl`), "utf-8");
  const lines = appendOnlyLog.trimEnd().split("\n");
  assert.equal(lines.length, 20);
  assert.equal(JSON.parse(lines[0]).sequence, 1);
  assert.equal(JSON.parse(lines.at(-1)).sequence, 20);
});

test("FileWorkflowEventLogRepository lists legacy JSON and new append-only events", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-workflow-events-"));
  const repository = new FileWorkflowEventLogRepository(root);
  const timestamp = "2026-05-30T00:00:00.000Z";

  const legacy = await repository.append({
    type: "status_changed",
    threadId,
    status: "running",
    timestamp,
  });
  const legacyPayload = JSON.stringify([legacy], null, 2);
  await writeFile(join(root, `${threadId}.json`), legacyPayload, "utf-8");
  await writeFile(join(root, `${threadId}.jsonl`), "", "utf-8");

  const next = await repository.append({
    type: "status_changed",
    threadId,
    status: "completed",
    timestamp,
  });

  assert.equal(next.sequence, 2);
  const allEvents = await repository.list(threadId);
  assert.deepEqual(
    allEvents.map((event) => event.sequence),
    [1, 2]
  );

  const afterFirst = await repository.listAfter(threadId, 1);
  assert.deepEqual(
    afterFirst.map((event) => event.sequence),
    [2]
  );
});
