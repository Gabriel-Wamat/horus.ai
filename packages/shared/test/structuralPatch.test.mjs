import assert from "node:assert/strict";
import test from "node:test";
import {
  CodeChangeOperationSchema,
  StructuralPatchIntentSchema,
  StructuralPatchPlanSchema,
} from "../dist/index.js";

const now = "2026-05-28T21:00:00.000Z";

test("StructuralPatchPlanSchema accepts safe structural patch evidence", () => {
  const intent = StructuralPatchIntentSchema.parse({
    id: "replace-app",
    kind: "replace",
    targetPath: "src/App.tsx",
    targetSymbolName: "App",
    targetSymbolKind: "component",
    content: "export function App() { return <main />; }",
  });

  const plan = StructuralPatchPlanSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    status: "planned",
    fileChanges: [
      {
        targetPath: intent.targetPath,
        changeType: "update",
        beforeContent: "export function App() { return null; }",
        afterContent: intent.content,
        diff: "diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx",
        diffStats: {
          addedLines: 1,
          removedLines: 1,
          changedFiles: 1,
        },
        preconditions: [
          {
            path: "src/App.tsx",
            kind: "content_hash",
            expected: "abc123",
          },
        ],
        operations: [
          {
            id: intent.id,
            kind: intent.kind,
            targetPath: intent.targetPath,
            targetSymbolName: intent.targetSymbolName,
            targetSymbolKind: intent.targetSymbolKind,
            afterSnippet: intent.content,
          },
        ],
      },
    ],
    diagnostics: [],
    summary: {
      fileCount: 1,
      operationCount: 1,
      diagnosticCount: 0,
      diffStats: {
        addedLines: 1,
        removedLines: 1,
        changedFiles: 1,
      },
    },
    createdAt: now,
  });

  assert.equal(plan.status, "planned");
  assert.equal(plan.fileChanges[0].preconditions[0].kind, "content_hash");
});

test("CodeChangeOperationSchema preserves structural preconditions", () => {
  const operation = CodeChangeOperationSchema.parse({
    targetPath: "src/App.tsx",
    changeType: "update",
    beforeContent: "before",
    afterContent: "after",
    diff: "diff --git a/src/App.tsx b/src/App.tsx\n-before\n+after",
    preconditions: [
      {
        path: "src/App.tsx",
        kind: "content_hash",
        expected: "expected-hash",
      },
    ],
  });

  assert.equal(operation.preconditions.length, 1);
  assert.equal(operation.preconditions[0].expected, "expected-hash");
});
