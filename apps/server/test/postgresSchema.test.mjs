import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationPath =
  "apps/server/src/infrastructure/database/migrations/001_initial_schema.sql";
const previewHygieneMigrationPath =
  "apps/server/src/infrastructure/database/migrations/007_preview_project_registry_hygiene.sql";

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

test("preview project hygiene migration adds lifecycle and health metadata", async () => {
  const sql = await readFile(previewHygieneMigrationPath, "utf-8");

  for (const column of [
    "project_kind",
    "lifecycle_status",
    "visibility",
    "health_status",
    "health_reasons",
    "canonical_project_id",
    "project_workspace_id",
    "app_fingerprint",
    "last_health_checked_at",
    "archived_at",
    "archived_reason",
  ]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  }

  assert.match(sql, /idx_frontend_projects_visibility_health/);
  assert.match(sql, /idx_frontend_projects_canonical/);
});
