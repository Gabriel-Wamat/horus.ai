import assert from "node:assert/strict";
import test from "node:test";
import { CodingPatchApplier } from "../dist/application/coding/CodingPatchApplier.js";

const now = "2026-05-28T22:00:00.000Z";

test("CodingPatchApplier applies only after passed runtime validation", async () => {
  const appliedInputs = [];
  const applier = new CodingPatchApplier(
    {
      async apply(input) {
        appliedInputs.push(input);
        return {
          ...input.changeSet,
          status: "applied",
          appliedAt: now,
        };
      },
    },
    () => new Date(now),
    idGenerator()
  );

  const result = await applier.execute(context({ validationStatus: "passed" }));

  assert.equal(result.artifact.status, "ready");
  assert.equal(appliedInputs.length, 1);
  assert.equal(appliedInputs[0].changeSet.validation[0].status, "passed");
});

test("CodingPatchApplier blocks failed runtime validation before writing", async () => {
  const applier = new CodingPatchApplier(
    {
      async apply() {
        throw new Error("must not apply");
      },
    },
    () => new Date(now),
    idGenerator()
  );

  await assert.rejects(
    () => applier.execute(context({ validationStatus: "failed" })),
    /blocked by runtime validation/
  );
});

function context({ validationStatus }) {
  return {
    signal: new AbortController().signal,
    task: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      prompt: "Patch",
      projectId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      projectRootPath: "/tmp/project",
      selectedPaths: [],
      surface: "frontend",
      routeReason: "test",
      state: "applying_patch",
      artifacts: [],
      error: null,
      metadata: {},
      version: 1,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      completedAt: null,
      cancelledAt: null,
    },
    artifacts: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        kind: "patch_plan",
        label: "Patch plan",
        status: "ready",
        createdAt: now,
        payload: patchPlan(),
      },
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        kind: "runtime_validation",
        label: "Runtime validation",
        status: validationStatus === "passed" ? "ready" : "failed",
        createdAt: now,
        payload: validation(validationStatus),
      },
    ],
  };
}

function patchPlan() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    status: "planned",
    fileChanges: [
      {
        targetPath: "src/App.tsx",
        changeType: "update",
        beforeContent: "before",
        afterContent: "after",
        diff: "diff --git a/src/App.tsx b/src/App.tsx\n-before\n+after",
        diffStats: {
          addedLines: 1,
          removedLines: 1,
          changedFiles: 1,
        },
        preconditions: [],
        operations: [],
      },
    ],
    diagnostics: [],
    summary: {
      fileCount: 1,
      operationCount: 0,
      diagnosticCount: 0,
      diffStats: {
        addedLines: 1,
        removedLines: 1,
        changedFiles: 1,
      },
    },
    createdAt: now,
  };
}

function validation(status) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    planId: "33333333-3333-4333-8333-333333333333",
    patchPlanId: "11111111-1111-4111-8111-111111111111",
    status,
    passed: status === "passed",
    commands: [],
    codeChangeValidation: [
      {
        command: "node test.js",
        cwd: "/tmp/project",
        exitCode: status === "passed" ? 0 : 1,
        status: status === "passed" ? "passed" : "failed",
      },
    ],
    issues: status === "passed" ? [] : ["failed"],
    skippedReason: null,
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
  };
}

function idGenerator() {
  const ids = [
    "eeeeeeee-eeee-4eee-8eee-000000000001",
    "eeeeeeee-eeee-4eee-8eee-000000000002",
    "eeeeeeee-eeee-4eee-8eee-000000000003",
  ];
  return () => ids.shift() ?? "eeeeeeee-eeee-4eee-8eee-000000000099";
}
