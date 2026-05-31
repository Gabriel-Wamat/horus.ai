import assert from "node:assert/strict";
import test from "node:test";
import { RepositoryGraphBuilder } from "../dist/application/coding/RepositoryGraphBuilder.js";
import { TreeSitterAstAnalyzer } from "../dist/infrastructure/ast/TreeSitterAstAnalyzer.js";

const now = "2026-05-28T23:35:00.000Z";

test("RepositoryGraphBuilder links relative imports, symbols, exports and tests", async () => {
  const candidates = [
    candidate(
      "src/App.tsx",
      [
        'import { formatTitle } from "./helpers";',
        "export function App() {",
        '  return formatTitle("home");',
        "}",
        "",
      ].join("\n")
    ),
    candidate(
      "src/helpers.ts",
      "export function formatTitle(value: string) { return value.toUpperCase(); }\n"
    ),
    candidate(
      "src/App.test.tsx",
      'import { App } from "./App";\ntest("App", () => App());\n'
    ),
  ];
  const ast = await new TreeSitterAstAnalyzer().analyze({ candidates });
  const graph = await new RepositoryGraphBuilder(
    () => new Date(now)
  ).build({
    scan: scanSnapshot(candidates),
    ast,
  });

  assert.equal(graph.status, "complete");
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.kind === "imports" &&
        edge.sourcePath === "src/App.tsx" &&
        edge.targetPath === "src/helpers.ts"
    )
  );
  assert.ok(
    graph.edges.some(
      (edge) =>
        edge.kind === "related_test" &&
        edge.sourcePath === "src/App.tsx" &&
        edge.targetPath === "src/App.test.tsx"
    )
  );
  assert.ok(
    graph.exports.some(
      (item) => item.sourcePath === "src/App.tsx" && item.symbolName === "App"
    )
  );
  assert.equal(graph.summary.fileNodeCount, 4);
  assert.equal(graph.generatedAt, now);
});

test("RepositoryGraphBuilder separates external package imports from unresolved relative imports", async () => {
  const candidates = [
    candidate(
      "src/App.tsx",
      [
        'import React from "react";',
        'import { missing } from "./missing";',
        "export const App = () => missing;",
        "",
      ].join("\n")
    ),
  ];
  const ast = await new TreeSitterAstAnalyzer().analyze({ candidates });
  const graph = await new RepositoryGraphBuilder(
    () => new Date(now)
  ).build({
    scan: scanSnapshot(candidates),
    ast,
  });

  assert.equal(graph.status, "partial");
  assert.ok(graph.nodes.some((node) => node.id === "external:react"));
  assert.ok(
    graph.edges.some(
      (edge) => edge.kind === "imports_external" && edge.importSource === "react"
    )
  );
  assert.equal(graph.summary.disconnectedImportCount, 1);
});

function scanSnapshot(candidates) {
  const files = [
    {
      path: "package.json",
      language: "json",
      sizeBytes: 20,
      modifiedAt: now,
      safety: "readable",
    },
    ...candidates.map((item) => ({
      path: item.path,
      language: item.language,
      sizeBytes: item.bytes,
      modifiedAt: now,
      safety: "readable",
    })),
  ];
  return {
    projectRootPath: "/workspace/project",
    selectedPaths: [],
    files,
    stats: {
      totalEntries: files.length,
      totalFiles: files.length,
      indexedFiles: files.length,
      ignoredEntries: 0,
      blockedFiles: 0,
      binaryFiles: 0,
      oversizedFiles: 0,
      partial: false,
    },
    notes: [],
    generatedAt: now,
  };
}

function candidate(path, content) {
  return {
    path,
    language: "typescript",
    bytes: Buffer.byteLength(content, "utf-8"),
    content,
    startLine: 1,
    endLine: Math.max(1, content.split("\n").length),
    score: 100,
    matchedTerms: [],
    excerpts: [],
  };
}
