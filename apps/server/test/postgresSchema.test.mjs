import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationPath =
  "apps/server/src/infrastructure/database/migrations/001_initial_schema.sql";

test("initial Postgres migration defines versioned workspace and runtime tables", async () => {
  const sql = await readFile(migrationPath, "utf-8");

  for (const table of [
    "workspace_folders",
    "user_stories",
    "user_story_revisions",
    "specs",
    "spec_revisions",
    "workflow_states",
    "chat_sessions",
    "chat_messages",
    "frontend_projects",
    "preview_sessions",
    "preview_events",
    "visual_instruction_drafts",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(sql, /REFERENCES workspace_folders\(id\) ON DELETE CASCADE/);
  assert.match(sql, /UNIQUE \(story_id, revision\)/);
  assert.match(sql, /UNIQUE \(spec_id, revision\)/);
  assert.match(sql, /CHECK \(priority IN \('low', 'medium', 'high', 'critical'\)\)/);
});
