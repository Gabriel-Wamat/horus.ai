import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadRuntimeConfig } from "../dist/infrastructure/config/runtimeConfig.js";

test("loadRuntimeConfig resolves file-mode data paths from HORUS_DATA_DIR", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "horus-runtime-config-repo-"));
  const config = loadRuntimeConfig(
    {
      PERSISTENCE_DRIVER: "file",
      HORUS_DATA_DIR: ".portable/data",
    },
    { repositoryRoot: repoRoot }
  );

  assert.equal(config.persistenceDriver, "file");
  assert.equal(config.paths.dataDir, resolve(repoRoot, ".portable/data"));
  assert.equal(config.paths.workflowsDir, resolve(repoRoot, ".portable/data/workflows"));
  assert.equal(
    config.paths.codingTasksDir,
    resolve(repoRoot, ".portable/data/coding-tasks")
  );
  assert.equal(
    config.paths.projectWorkspacesDir,
    resolve(repoRoot, ".portable/data/project-workspaces")
  );
  assert.equal(
    config.paths.projectRunWorktreesDir,
    resolve(repoRoot, ".portable/data/project-run-worktrees")
  );
});

test("loadRuntimeConfig rejects unsupported persistence drivers", () => {
  assert.throws(
    () => loadRuntimeConfig({ PERSISTENCE_DRIVER: "sqlite" }),
    /Unsupported PERSISTENCE_DRIVER/
  );
});

test("loadRuntimeConfig fails closed for file driver in production", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        NODE_ENV: "production",
        PERSISTENCE_DRIVER: "file",
      }),
    /PERSISTENCE_DRIVER=file is not production-safe/
  );

  assert.equal(
    loadRuntimeConfig({
      NODE_ENV: "production",
      PERSISTENCE_DRIVER: "file",
      HORUS_ALLOW_FILE_DRIVER_IN_PRODUCTION: "true",
    }).persistenceDriver,
    "file"
  );
});

test("loadRuntimeConfig requires postgres for explicit multi-user mode", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        HORUS_MULTI_USER: "true",
        PERSISTENCE_DRIVER: "file",
      }),
    /HORUS_MULTI_USER=true/
  );

  assert.equal(
    loadRuntimeConfig({
      HORUS_MULTI_USER: "true",
      PERSISTENCE_DRIVER: "postgres",
    }).persistenceDriver,
    "postgres"
  );
});

test("loadRuntimeConfig preserves legacy ./data when no explicit data dir exists", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "horus-runtime-config-repo-"));
  await mkdir(join(repoRoot, "data"));

  const config = loadRuntimeConfig({}, { repositoryRoot: repoRoot });

  assert.equal(config.paths.dataDir, resolve(repoRoot, "data"));
  assert.equal(config.paths.workflowsDir, resolve(repoRoot, "data/workflows"));
});
