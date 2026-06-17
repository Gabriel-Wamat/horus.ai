import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "apps/server/src/infrastructure/database/migrations/018_preview_project_dependency_bootstrap.sql";

test("preview dependency bootstrap migration is idempotent and catalog based", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.equal(sql.includes("install-root-dependencies"), true);
  assert.equal(sql.includes("NOT EXISTS"), true);
  assert.equal(sql.includes("jsonb_array_elements(command_catalog)"), true);
  assert.equal(sql.includes("root_path LIKE 'project-workspaces/%'"), true);
  assert.equal(sql.includes("'timeoutMs', 120000"), true);
});
