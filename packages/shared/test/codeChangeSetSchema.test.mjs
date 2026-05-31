import assert from "node:assert/strict";
import test from "node:test";
import {
  CodeChangeSetSchema,
  isCodeChangeDeleteOperation,
  isCodeChangeWriteOperation,
} from "../dist/entities/CodeChangeSet.js";

const baseChangeSet = {
  id: "11111111-1111-4111-8111-111111111111",
  workflowThreadId: "22222222-2222-4222-8222-222222222222",
  userStoryId: "33333333-3333-4333-8333-333333333333",
  sourceAgent: "front",
  status: "proposed",
  validation: [],
  createdAt: "2026-05-27T00:00:00.000Z",
};

test("CodeChangeSetSchema accepts legacy create and update write operations", () => {
  const parsed = CodeChangeSetSchema.parse({
    ...baseChangeSet,
    operations: [
      {
        targetPath: "src/App.tsx",
        changeType: "update",
        beforeContent: "before",
        afterContent: "after",
        diff: "diff --git a/src/App.tsx b/src/App.tsx",
      },
    ],
  });

  assert.equal(parsed.operations[0].changeType, "update");
  assert.equal(isCodeChangeWriteOperation(parsed.operations[0]), true);
});

test("CodeChangeSetSchema accepts explicit delete operations", () => {
  const parsed = CodeChangeSetSchema.parse({
    ...baseChangeSet,
    operations: [
      {
        targetPath: "src/obsolete.ts",
        changeType: "delete",
        beforeContent: "export const obsolete = true;\n",
        afterContent: null,
        diff: "diff --git a/src/obsolete.ts b/src/obsolete.ts\n--- a/src/obsolete.ts\n+++ /dev/null",
      },
    ],
  });

  assert.equal(parsed.operations[0].changeType, "delete");
  assert.equal(parsed.operations[0].afterContent, null);
  assert.equal(isCodeChangeDeleteOperation(parsed.operations[0]), true);
});

test("CodeChangeSetSchema rejects delete operations with replacement content", () => {
  assert.throws(
    () =>
      CodeChangeSetSchema.parse({
        ...baseChangeSet,
        operations: [
          {
            targetPath: "src/obsolete.ts",
            changeType: "delete",
            beforeContent: "before",
            afterContent: "",
            diff: "diff --git a/src/obsolete.ts b/src/obsolete.ts",
          },
        ],
      }),
    /Expected null/
  );
});
