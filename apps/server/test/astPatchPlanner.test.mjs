import assert from "node:assert/strict";
import test from "node:test";
import {
  AstPatchPlanner,
  compileStructuralPatchPlanToCodeChangeOperations,
} from "../dist/application/coding/AstPatchPlanner.js";
import { TreeSitterAstAnalyzer } from "../dist/infrastructure/ast/TreeSitterAstAnalyzer.js";

const now = new Date("2026-05-28T21:00:00.000Z");

test("AstPatchPlanner builds symbol-scoped diffs with content hash preconditions", async () => {
  const candidate = sourceCandidate({
    path: "src/App.tsx",
    content: [
      'import React from "react";',
      "",
      "export function App() {",
      "  return <main>Old</main>;",
      "}",
      "",
      "export function helper() {",
      "  return 1;",
      "}",
      "",
    ].join("\n"),
  });
  const ast = await analyze(candidate);
  const planner = new AstPatchPlanner(
    undefined,
    () => now,
    () => "11111111-1111-4111-8111-111111111111"
  );

  const plan = await planner.plan({
    ast,
    candidates: [candidate],
    intents: [
      {
        id: "add-use-memo",
        kind: "add_import",
        targetPath: candidate.path,
        importSource: "react",
        namedImports: ["useMemo"],
      },
      {
        id: "replace-app",
        kind: "replace",
        targetPath: candidate.path,
        targetSymbolName: "App",
        targetSymbolKind: "component",
        content: [
          "export function App() {",
          "  return <main>New</main>;",
          "}",
        ].join("\n"),
      },
      {
        id: "append-added",
        kind: "insert",
        targetPath: candidate.path,
        position: "file_end",
        content: "export function Added() { return 2; }",
      },
    ],
  });

  assert.equal(plan.status, "planned");
  assert.equal(plan.summary.fileCount, 1);
  assert.equal(plan.summary.operationCount, 3);
  const [change] = plan.fileChanges;
  assert.ok(change.afterContent.includes('import { useMemo } from "react";'));
  assert.ok(change.afterContent.includes("<main>New</main>"));
  assert.ok(change.afterContent.includes("export function Added()"));
  assert.match(change.diff, /^diff --git a\/src\/App.tsx b\/src\/App.tsx/m);
  assert.equal(change.preconditions[0].kind, "content_hash");
  assert.equal(change.preconditions[0].expected, ast.documents[0].contentHash);

  const operations = compileStructuralPatchPlanToCodeChangeOperations(plan);
  assert.equal(operations.length, 1);
  assert.equal(operations[0].targetPath, "src/App.tsx");
  assert.equal(operations[0].preconditions[0].expected, ast.documents[0].contentHash);
});

test("AstPatchPlanner removes imports and symbol declarations without file rewrites", async () => {
  const candidate = sourceCandidate({
    path: "src/App.tsx",
    content: [
      'import React from "react";',
      "",
      "export function App() { return <main />; }",
      "export function helper() { return 1; }",
      "",
    ].join("\n"),
  });
  const ast = await analyze(candidate);
  const planner = new AstPatchPlanner(
    undefined,
    () => now,
    () => "22222222-2222-4222-8222-222222222222"
  );

  const plan = await planner.plan({
    ast,
    candidates: [candidate],
    intents: [
      {
        id: "remove-react",
        kind: "remove_import",
        targetPath: candidate.path,
        importSource: "react",
      },
      {
        id: "delete-helper",
        kind: "delete",
        targetPath: candidate.path,
        targetSymbolName: "helper",
        targetSymbolKind: "function",
      },
    ],
  });

  assert.equal(plan.status, "planned");
  const [change] = plan.fileChanges;
  assert.ok(!change.afterContent.includes('import React from "react";'));
  assert.ok(!change.afterContent.includes("function helper"));
  assert.equal(change.operations.length, 2);
});

test("AstPatchPlanner blocks ambiguous or missing structural targets", async () => {
  const candidate = sourceCandidate({
    path: "src/App.tsx",
    content: "export function App() { return <main />; }\n",
  });
  const ast = await analyze(candidate);
  const planner = new AstPatchPlanner(
    undefined,
    () => now,
    () => "33333333-3333-4333-8333-333333333333"
  );

  const plan = await planner.plan({
    ast,
    candidates: [candidate],
    intents: [
      {
        id: "replace-missing",
        kind: "replace",
        targetPath: candidate.path,
        targetSymbolName: "Missing",
        targetSymbolKind: "component",
        content: "export function Missing() { return null; }",
      },
    ],
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.summary.fileCount, 0);
  assert.ok(
    plan.diagnostics.some(
      (diagnostic) => diagnostic.code === "unsupported_edit_target"
    )
  );
});

async function analyze(candidate) {
  const analyzer = new TreeSitterAstAnalyzer(undefined, () => now);
  return analyzer.analyze({ candidates: [candidate] });
}

function sourceCandidate({ path, content }) {
  return {
    path,
    language: path.endsWith(".tsx") ? "tsx" : "typescript",
    bytes: Buffer.byteLength(content, "utf-8"),
    content,
    startLine: 1,
    endLine: Math.max(1, content.split("\n").length),
    score: 100,
    matchedTerms: [],
    excerpts: [],
  };
}
