import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationPath =
  "apps/server/src/infrastructure/database/migrations/003_workflow_events.sql";

test("workflow events migration defines persistent run event log tables", async () => {
  const sql = await readFile(migrationPath, "utf-8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS workflow_event_counters/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS workflow_events/);
  assert.match(sql, /UNIQUE \(thread_id, sequence\)/);
  assert.match(sql, /snapshot jsonb NOT NULL/);
  assert.match(sql, /idx_workflow_events_thread_sequence/);
});
