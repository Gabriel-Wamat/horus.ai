import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { z } from "zod";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../dist/infrastructure/storage/JsonFileStore.js";

const PayloadSchema = z.object({
  id: z.string(),
  count: z.number(),
});

test("JsonFileStore writes atomically and reads through schema validation", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-json-store-"));
  const path = join(baseDir, "nested", "payload.json");

  await writeJsonFileAtomic(path, { id: "first", count: 1 });
  await writeJsonFileAtomic(path, { id: "second", count: 2 });

  const parsed = await readJsonFile(path, PayloadSchema);
  const raw = JSON.parse(await readFile(path, "utf-8"));
  const files = await readdir(join(baseDir, "nested"));

  assert.deepEqual(parsed, { id: "second", count: 2 });
  assert.equal(raw.id, "second");
  assert.deepEqual(files, ["payload.json"]);
});

test("JsonFileStore returns explicit default values for missing files", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-json-store-"));

  const parsed = await readJsonFile(join(baseDir, "missing.json"), PayloadSchema, {
    defaultValue: null,
  });

  assert.equal(parsed, null);
});

test("JsonFileStore rejects invalid persisted JSON", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-json-store-"));
  const path = join(baseDir, "payload.json");
  await writeFile(path, JSON.stringify({ id: "broken", count: "2" }), "utf-8");

  await assert.rejects(() => readJsonFile(path, PayloadSchema), /Expected number/);
});
