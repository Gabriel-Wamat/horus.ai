import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileMutationPreflightApplier,
  FileMutationPreflightError,
} from "../dist/infrastructure/code/FileMutationPreflightApplier.js";

test("FileMutationPreflightApplier produces planned and actual evidence for updates", async () => {
  const root = await setupMutationProject();
  const applier = new FileMutationPreflightApplier();

  const plan = await applier.plan({
    projectRootPath: root,
    operations: [
      {
        targetPath: "src/App.tsx",
        changeType: "update",
        afterContent: "export const App = () => 'after';\n",
      },
    ],
    allowedWriteRoots: ["src"],
  });
  assert.match(plan.finalDiff, /after/);
  assert.equal(plan.finalDiffStats.changedFiles, 1);

  const result = await applier.applyPlanWithRollback(plan);
  assert.equal(result.finalDiff, result.actualDiff);
  assert.equal(result.actualDiffStats.changedFiles, 1);
  assert.ok((result.appliedOperations[0].afterVersion?.sizeBytes ?? 0) > 0);
  assert.match(await readFile(join(root, "src", "App.tsx"), "utf8"), /after/);
});

test("FileMutationPreflightApplier rejects stale file versions", async () => {
  const root = await setupMutationProject();
  const applier = new FileMutationPreflightApplier();

  await assert.rejects(
    () =>
      applier.apply({
        projectRootPath: root,
        operations: [
          {
            targetPath: "src/App.tsx",
            changeType: "update",
            afterContent: "export const App = () => 'stale';\n",
            expectedContentHash: "0".repeat(64),
          },
        ],
        allowedWriteRoots: ["src"],
      }),
    (err) => {
      assert.ok(err instanceof FileMutationPreflightError);
      assert.equal(err.reason, "version_conflict");
      assert.equal(err.targetPath, "src/App.tsx");
      return true;
    }
  );

  const fileStat = await stat(join(root, "src", "App.tsx"));
  await assert.rejects(
    () =>
      applier.apply({
        projectRootPath: root,
        operations: [
          {
            targetPath: "src/App.tsx",
            changeType: "update",
            afterContent: "export const App = () => 'stale';\n",
            expectedMtimeMs: fileStat.mtimeMs + 1,
          },
        ],
        allowedWriteRoots: ["src"],
      }),
    /version_conflict/
  );
});

test("FileMutationPreflightApplier blocks protected deletes and write root escapes", async () => {
  const root = await setupMutationProject();
  await writeFile(join(root, "package.json"), '{"private":true}\n', "utf8");
  const applier = new FileMutationPreflightApplier();

  await assert.rejects(
    () =>
      applier.apply({
        projectRootPath: root,
        operations: [
          {
            targetPath: "package.json",
            changeType: "delete",
            afterContent: null,
          },
        ],
      }),
    (err) => {
      assert.ok(err instanceof FileMutationPreflightError);
      assert.equal(err.reason, "delete_denied");
      return true;
    }
  );

  await assert.rejects(
    () =>
      applier.apply({
        projectRootPath: root,
        operations: [
          {
            targetPath: "README.md",
            changeType: "create",
            afterContent: "# Demo\n",
          },
        ],
        allowedWriteRoots: ["src"],
      }),
    (err) => {
      assert.ok(err instanceof FileMutationPreflightError);
      assert.equal(err.reason, "path_forbidden");
      return true;
    }
  );
});

test("FileMutationPreflightApplier rolls back when a later apply step fails", async () => {
  const root = await setupMutationProject();
  const applier = new FileMutationPreflightApplier();

  const plan = await applier.plan({
    projectRootPath: root,
    operations: [
      {
        targetPath: "src/App.tsx",
        changeType: "update",
        afterContent: "export const App = () => 'partial';\n",
      },
      {
        targetPath: "blocked/new.ts",
        changeType: "create",
        afterContent: "export const value = true;\n",
      },
    ],
    allowedWriteRoots: ["src", "blocked"],
  });
  await writeFile(join(root, "blocked"), "not a directory", "utf8");

  await assert.rejects(
    () => applier.applyPlanWithRollback(plan),
    (err) => {
      assert.ok(err instanceof FileMutationPreflightError);
      assert.equal(err.reason, "apply_failed");
      assert.equal(err.targetPath, "blocked/new.ts");
      return true;
    }
  );
  assert.equal(
    await readFile(join(root, "src", "App.tsx"), "utf8"),
    "export const App = () => 'before';\n"
  );
});

async function setupMutationProject() {
  const root = await mkdtemp(join(tmpdir(), "horus-file-mutation-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "App.tsx"),
    "export const App = () => 'before';\n",
    "utf8"
  );
  return root;
}
