import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  CodeChangeSetPreconditionError,
  applyPlannedCodeChangeOperationsWithRollback,
  planCodeChangeSetOperations,
} from "../dist/infrastructure/code/CodeChangeSetFileOperations.js";

test("planCodeChangeSetOperations rejects stale content hash preconditions", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-patch-conflict-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "src", "App.tsx"), "current", "utf8");

  await assert.rejects(
    () =>
      planCodeChangeSetOperations({
        projectRootPath: projectRoot,
        changeSet: changeSet({
          operations: [
            {
              targetPath: "src/App.tsx",
              changeType: "update",
              beforeContent: "original",
              afterContent: "next",
              diff: "diff --git a/src/App.tsx b/src/App.tsx\n-original\n+next",
              preconditions: [
                {
                  path: "src/App.tsx",
                  kind: "content_hash",
                  expected: sha256("original"),
                },
              ],
            },
          ],
        }),
      }),
    (err) =>
      err instanceof CodeChangeSetPreconditionError &&
      /version_conflict/.test(err.message)
  );
});

test("applyPlannedCodeChangeOperationsWithRollback restores files after partial write failure", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "horus-patch-rollback-"));
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "src", "App.tsx"), "before", "utf8");
  await writeFile(join(projectRoot, "blocked"), "not a directory", "utf8");

  const planned = await planCodeChangeSetOperations({
    projectRootPath: projectRoot,
    changeSet: changeSet({
      operations: [
        {
          targetPath: "src/App.tsx",
          changeType: "update",
          beforeContent: "before",
          afterContent: "after",
          diff: "diff --git a/src/App.tsx b/src/App.tsx\n-before\n+after",
          preconditions: [
            {
              path: "src/App.tsx",
              kind: "content_hash",
              expected: sha256("before"),
            },
          ],
        },
      ],
    }),
  });
  const plannedWithFailingSecondWrite = [
    ...planned.operations,
    {
      targetPath: join(projectRoot, "blocked", "new.ts"),
      relativePath: "blocked/new.ts",
      beforeContent: null,
      operation: {
        targetPath: "blocked/new.ts",
        changeType: "create",
        beforeContent: null,
        afterContent: "created",
        diff: "diff --git a/blocked/new.ts b/blocked/new.ts\n+created",
        preconditions: [
          {
            path: "blocked/new.ts",
            kind: "missing",
          },
        ],
      },
    },
  ];

  await assert.rejects(
    () => applyPlannedCodeChangeOperationsWithRollback(plannedWithFailingSecondWrite),
    /ENOTDIR|EEXIST/
  );
  assert.equal(await readFile(join(projectRoot, "src", "App.tsx"), "utf8"), "before");
});

function changeSet({ operations }) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    workflowThreadId: "22222222-2222-4222-8222-222222222222",
    workspaceFolderId: "33333333-3333-4333-8333-333333333333",
    userStoryId: "44444444-4444-4444-8444-444444444444",
    sourceAgent: "front",
    status: "proposed",
    operations,
    validation: [],
    createdAt: "2026-05-28T21:00:00.000Z",
  };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
