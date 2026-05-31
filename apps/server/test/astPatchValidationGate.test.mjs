import assert from "node:assert/strict";
import test from "node:test";
import { AstPatchValidationGate } from "../dist/application/coding/AstPatchValidationGate.js";
import { TreeSitterAstAnalyzer } from "../dist/infrastructure/ast/TreeSitterAstAnalyzer.js";

const now = new Date("2026-05-28T21:00:00.000Z");

test("AstPatchValidationGate validates patched TSX content", async () => {
  const gate = new AstPatchValidationGate(
    new TreeSitterAstAnalyzer(undefined, () => now),
    () => now,
    () => "11111111-1111-4111-8111-111111111111"
  );
  const validation = await gate.validate(
    patchPlan({
      afterContent: "export function App() { return <main>OK</main>; }\n",
    })
  );

  assert.equal(validation.status, "complete");
  assert.equal(validation.summary.parsedDocumentCount, 1);
  assert.equal(validation.summary.hasBlockingDiagnostics, false);
});

test("AstPatchValidationGate reports blocking syntax diagnostics", async () => {
  const gate = new AstPatchValidationGate(
    new TreeSitterAstAnalyzer(undefined, () => now),
    () => now,
    () => "22222222-2222-4222-8222-222222222222"
  );
  const validation = await gate.validate(
    patchPlan({
      afterContent: "export function Broken( { return <main>",
    })
  );

  assert.equal(validation.status, "failed");
  assert.equal(validation.summary.hasBlockingDiagnostics, true);
  assert.ok(validation.diagnostics.some((diagnostic) => diagnostic.code === "parse_error"));
});

function patchPlan({ afterContent }) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    status: "planned",
    fileChanges: [
      {
        targetPath: "src/App.tsx",
        changeType: "update",
        beforeContent: "export function App() { return null; }\n",
        afterContent,
        diff: "diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx",
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
    createdAt: now.toISOString(),
  };
}
