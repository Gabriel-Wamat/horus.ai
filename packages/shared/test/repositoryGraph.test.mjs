import assert from "node:assert/strict";
import test from "node:test";
import {
  RepositoryGraphConnectivitySchema,
  RepositoryGraphNeighborhoodSchema,
  RepositoryGraphSnapshotSchema,
} from "../dist/entities/RepositoryGraph.js";

const now = "2026-05-28T23:30:00.000Z";

test("RepositoryGraphSnapshotSchema accepts deterministic file, symbol and import evidence", () => {
  const parsed = RepositoryGraphSnapshotSchema.parse({
    projectRootPath: "/workspace/project",
    status: "complete",
    nodes: [
      {
        id: "file:src/App.tsx",
        kind: "file",
        label: "src/App.tsx",
        path: "src/App.tsx",
        language: "typescript",
        safety: "readable",
      },
      {
        id: "symbol:src/App.tsx:function:App:0",
        kind: "symbol",
        label: "App",
        path: "src/App.tsx",
        symbolId: "src/App.tsx:function:App:0",
        symbolName: "App",
        symbolKind: "component",
      },
      {
        id: "external:react",
        kind: "external_package",
        label: "react",
        packageName: "react",
      },
    ],
    edges: [
      {
        id: "declares:src/App.tsx:src/App.tsx:function:App:0",
        kind: "declares",
        sourceId: "file:src/App.tsx",
        targetId: "symbol:src/App.tsx:function:App:0",
        sourcePath: "src/App.tsx",
        targetPath: "src/App.tsx",
        targetSymbolId: "src/App.tsx:function:App:0",
        confidence: 1,
      },
      {
        id: "imports_external:src/App.tsx:react",
        kind: "imports_external",
        sourceId: "file:src/App.tsx",
        targetId: "external:react",
        sourcePath: "src/App.tsx",
        importSource: "react",
        confidence: 0.65,
      },
    ],
    imports: [
      {
        id: "import:src/App.tsx:react",
        sourcePath: "src/App.tsx",
        source: "react",
        packageName: "react",
        confidence: 0.65,
      },
    ],
    exports: [
      {
        id: "export:src/App.tsx:App",
        sourcePath: "src/App.tsx",
        symbolName: "App",
        exportKind: "named",
        confidence: 0.8,
      },
    ],
    packages: [],
    summary: {
      fileNodeCount: 1,
      symbolNodeCount: 1,
      packageScopeCount: 0,
      importEdgeCount: 0,
      externalImportEdgeCount: 1,
      relatedTestEdgeCount: 0,
      disconnectedImportCount: 0,
    },
    generatedAt: now,
  });

  assert.equal(parsed.nodes.length, 3);
  assert.equal(parsed.edges[1].kind, "imports_external");
  assert.equal(parsed.imports[0].isTypeOnly, false);
});

test("RepositoryGraphNeighborhoodSchema keeps bounded traversal metadata", () => {
  const parsed = RepositoryGraphNeighborhoodSchema.parse({
    seedPaths: ["src/App.tsx"],
    maxDepth: 2,
    nodeBudget: 10,
    nodes: [
      {
        node: {
          id: "file:src/App.tsx",
          kind: "file",
          label: "src/App.tsx",
          path: "src/App.tsx",
        },
        distance: 0,
        score: 100,
      },
    ],
    edges: [],
    paths: ["src/App.tsx"],
    summary: {
      seedCount: 1,
      nodeCount: 1,
      edgeCount: 0,
      pathCount: 1,
      truncated: false,
    },
    notes: [],
  });

  assert.equal(parsed.summary.truncated, false);
  assert.deepEqual(parsed.paths, ["src/App.tsx"]);
});

test("RepositoryGraphConnectivitySchema describes disconnected targets explicitly", () => {
  const parsed = RepositoryGraphConnectivitySchema.parse({
    targetPath: "src/NewWidget.tsx",
    status: "disconnected",
    reason: "Target path does not exist in graph and no importer references it.",
    relatedPaths: [],
    confidence: 0.2,
  });

  assert.equal(parsed.status, "disconnected");
});
