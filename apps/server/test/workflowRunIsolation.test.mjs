import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import { WorkflowRunIsolation } from "../dist/application/services/WorkflowRunIsolation.js";
import { RunWorktreeManager } from "../dist/application/services/RunWorktreeManager.js";

const execFileAsync = promisify(execFile);

// End-to-end coverage of the item 9 integration. Verifies:
//   1. Flag OFF → pure pass-through, no worktree created.
//   2. Flag ON + success → worktree created, work executed against the
//      isolated path, branch squash-merged back into source, worktree removed.
//   3. Flag ON + failure → execution error propagates, worktree discarded,
//      branch deleted, no merge.

test("WorkflowRunIsolation passes through when feature flag is off", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-isolation-passthrough-"));
  const isolation = new WorkflowRunIsolation({ enabled: false });

  let observedPath;
  let observedIsolated;
  const result = await isolation.runIsolated({
    projectRootPath: projectRoot,
    execute: async ({ rootPath, isolated }) => {
      observedPath = rootPath;
      observedIsolated = isolated;
      return { passed: true };
    },
  });

  assert.equal(result.isolated, false);
  assert.equal(observedPath, projectRoot);
  assert.equal(observedIsolated, false);
});

test("WorkflowRunIsolation acquires + promotes a worktree on success", async () => {
  const projectRoot = await setupGitRepo();
  const isolation = new WorkflowRunIsolation({
    enabled: true,
    manager: new RunWorktreeManager(),
  });

  const runId = "test-promote-run";
  let observedPath;

  const result = await isolation.runIsolated({
    projectRootPath: projectRoot,
    runId,
    execute: async ({ rootPath, isolated }) => {
      observedPath = rootPath;
      assert.ok(isolated, "execute should receive isolated=true");
      // Real work inside the worktree: create a file. Promote should
      // squash-merge it into source.
      await writeFile(join(rootPath, "isolated.txt"), "from worktree\n");
      await execFileAsync("git", ["add", "isolated.txt"], { cwd: rootPath });
      await execFileAsync(
        "git",
        [
          "-c",
          "user.email=test@horus.local",
          "-c",
          "user.name=Horus Test",
          "commit",
          "-m",
          "add isolated.txt",
        ],
        { cwd: rootPath }
      );
      return { passed: true };
    },
    mergeMessage: "promote test-promote-run",
  });

  assert.equal(result.isolated, true);
  assert.ok(observedPath?.includes(runId), `worktree path should include runId, got ${observedPath}`);

  // Worktree path should be cleaned up post-release.
  await assert.rejects(stat(observedPath), /ENOENT|no such file/i);

  // File should be promoted back into the main working tree.
  const promotedContent = await readFile(join(projectRoot, "isolated.txt"), "utf-8");
  assert.equal(promotedContent.trim(), "from worktree");

  // Branch should have been removed by `worktree remove --force`.
  const { stdout: branches } = await execFileAsync("git", ["branch", "--list"], {
    cwd: projectRoot,
  });
  assert.ok(
    !branches.includes("horus-run/test-promote-run"),
    "run branch should not remain after promote+remove"
  );
});

test("WorkflowRunIsolation discards worktree when execute returns passed=false", async () => {
  const projectRoot = await setupGitRepo();
  const isolation = new WorkflowRunIsolation({
    enabled: true,
    manager: new RunWorktreeManager(),
  });

  await isolation.runIsolated({
    projectRootPath: projectRoot,
    runId: "test-discard-run",
    execute: async ({ rootPath }) => {
      await writeFile(join(rootPath, "discarded.txt"), "should not be promoted\n");
      return { passed: false };
    },
  });

  // Discarded → file should NOT appear in source tree.
  await assert.rejects(stat(join(projectRoot, "discarded.txt")), /ENOENT|no such file/i);

  // Branch should have been deleted.
  const { stdout: branches } = await execFileAsync("git", ["branch", "--list"], {
    cwd: projectRoot,
  });
  assert.ok(
    !branches.includes("horus-run/test-discard-run"),
    "discard mode must delete the branch"
  );
});

test("WorkflowRunIsolation rethrows execute errors but still cleans up worktree", async () => {
  const projectRoot = await setupGitRepo();
  const isolation = new WorkflowRunIsolation({
    enabled: true,
    manager: new RunWorktreeManager(),
  });

  let worktreePath;
  await assert.rejects(
    isolation.runIsolated({
      projectRootPath: projectRoot,
      runId: "test-throw-run",
      execute: async ({ rootPath }) => {
        worktreePath = rootPath;
        throw new Error("boom inside execute");
      },
    }),
    /boom inside execute/
  );

  // Cleanup must run even on error.
  await assert.rejects(stat(worktreePath), /ENOENT|no such file/i);
});

async function setupGitRepo() {
  const root = await mkdtemp(join(tmpdir(), "horus-isolation-repo-"));
  await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: root });
  await writeFile(join(root, "README.md"), "horus isolation test repo\n");
  await execFileAsync("git", ["add", "README.md"], { cwd: root });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=test@horus.local",
      "-c",
      "user.name=Horus Test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "initial",
    ],
    { cwd: root }
  );
  // Pre-configure identity so the in-process merge commits succeed without
  // touching the operator's global config.
  await execFileAsync("git", ["config", "user.email", "test@horus.local"], {
    cwd: root,
  });
  await execFileAsync("git", ["config", "user.name", "Horus Test"], { cwd: root });
  await execFileAsync("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  return root;
}
