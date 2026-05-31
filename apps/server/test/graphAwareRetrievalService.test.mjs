import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GraphAwareRetrievalService } from "../dist/application/coding/GraphAwareRetrievalService.js";

const now = "2026-05-28T23:40:00.000Z";

test("GraphAwareRetrievalService returns bounded neighborhoods and related file candidates", async () => {
  const root = await mkdtemp(join(tmpdir(), "horus-graph-retrieval-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), "export function App() { return null; }\n");
  await writeFile(
    join(root, "src", "App.test.tsx"),
    'import { App } from "./App";\ntest("App", () => App());\n'
  );

  const service = new GraphAwareRetrievalService();
  const result = await service.buildContext({
    graph: graphSnapshot(root),
    scan: scanSnapshot(root),
    retrieval: retrievalResult(),
    query: "ajuste App e testes",
    maxDepth: 1,
    nodeBudget: 8,
    maxRelatedFiles: 4,
  });

  assert.ok(result.neighborhood.paths.includes("src/App.tsx"));
  assert.ok(result.neighborhood.paths.includes("src/App.test.tsx"));
  assert.equal(result.neighborhood.summary.truncated, false);
  assert.deepEqual(
    result.relatedCandidates.map((candidate) => candidate.path),
    ["src/App.test.tsx"]
  );
});

test("GraphAwareRetrievalService flags disconnected explicit new-file edits", () => {
  const service = new GraphAwareRetrievalService();
  const [connectivity] = service.assessIntentConnectivity({
    graph: graphSnapshot("/workspace/project"),
    intents: [
      {
        id: "intent-1",
        kind: "insert",
        targetPath: "src/UnlinkedWidget.tsx",
        position: "file_end",
        content: "export const UnlinkedWidget = null;\n",
        namedImports: [],
      },
    ],
  });

  assert.equal(connectivity.status, "disconnected");
  assert.equal(connectivity.relatedPaths.length, 0);
});

function graphSnapshot(projectRootPath) {
  return {
    projectRootPath,
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
        id: "file:src/App.test.tsx",
        kind: "file",
        label: "src/App.test.tsx",
        path: "src/App.test.tsx",
        language: "typescript",
        safety: "readable",
      },
    ],
    edges: [
      {
        id: "related_test:file:src/App.tsx:file:src/App.test.tsx",
        kind: "related_test",
        sourceId: "file:src/App.tsx",
        targetId: "file:src/App.test.tsx",
        sourcePath: "src/App.tsx",
        targetPath: "src/App.test.tsx",
        confidence: 0.75,
      },
      {
        id: "tests:file:src/App.test.tsx:file:src/App.tsx",
        kind: "tests",
        sourceId: "file:src/App.test.tsx",
        targetId: "file:src/App.tsx",
        sourcePath: "src/App.test.tsx",
        targetPath: "src/App.tsx",
        confidence: 0.75,
      },
    ],
    imports: [],
    exports: [],
    packages: [],
    summary: {
      fileNodeCount: 2,
      symbolNodeCount: 0,
      packageScopeCount: 0,
      importEdgeCount: 0,
      externalImportEdgeCount: 0,
      relatedTestEdgeCount: 2,
      disconnectedImportCount: 0,
    },
    notes: [],
    generatedAt: now,
  };
}

function scanSnapshot(projectRootPath) {
  return {
    projectRootPath,
    selectedPaths: [],
    files: [
      {
        path: "src/App.tsx",
        language: "typescript",
        sizeBytes: 38,
        modifiedAt: now,
        safety: "readable",
      },
      {
        path: "src/App.test.tsx",
        language: "typescript",
        sizeBytes: 52,
        modifiedAt: now,
        safety: "readable",
      },
    ],
    stats: {
      totalEntries: 2,
      totalFiles: 2,
      indexedFiles: 2,
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

function retrievalResult() {
  return {
    query: "ajuste src/App.tsx",
    status: "matched",
    candidates: [
      {
        path: "src/App.tsx",
        language: "typescript",
        bytes: 38,
        content: "export function App() { return null; }\n",
        startLine: 1,
        endLine: 1,
        score: 100,
        matchedTerms: ["app"],
        excerpts: [],
      },
    ],
    excerpts: [],
    omittedFilesCount: 0,
    totalBytes: 38,
    stats: {
      totalFiles: 2,
      indexedFiles: 2,
      contentScannedFiles: 1,
      explicitPathCount: 1,
      blockedPathCount: 0,
    },
    notes: [],
    routingHints: [],
  };
}
