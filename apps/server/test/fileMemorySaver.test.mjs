import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { emptyCheckpoint } from "@langchain/langgraph";
import { FileMemorySaver } from "../dist/infrastructure/langgraph/FileMemorySaver.js";

test("FileMemorySaver persists and reloads LangGraph checkpoints", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-file-checkpointer-"));
  const path = join(baseDir, "checkpoints", "memory-saver.json");
  const config = { configurable: { thread_id: "thread-1" } };
  const checkpoint = {
    ...emptyCheckpoint(),
    id: "00000000-0000-4000-8000-000000000001",
  };

  const saver = await FileMemorySaver.create(path);
  const nextConfig = await saver.put(config, checkpoint, { source: "test" });
  await saver.putWrites(nextConfig, [["channel", { ok: true }]], "task-1");

  const raw = JSON.parse(await readFile(path, "utf-8"));
  const reloaded = await FileMemorySaver.create(path);
  const tuple = await reloaded.getTuple(nextConfig);

  assert.ok(raw.storage["thread-1"]);
  assert.equal(tuple?.checkpoint.id, checkpoint.id);
  assert.deepEqual(tuple?.pendingWrites, [["task-1", "channel", { ok: true }]]);
});
