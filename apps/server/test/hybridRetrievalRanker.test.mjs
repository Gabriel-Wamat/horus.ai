import assert from "node:assert/strict";
import test from "node:test";
import { HybridRetrievalRanker } from "../dist/application/coding/HybridRetrievalRanker.js";

test("HybridRetrievalRanker keeps exact path evidence above weak vector-only matches", () => {
  const ranker = new HybridRetrievalRanker();
  const chunks = [
    chunk("src/App.tsx", "export function App() { return null; }"),
    chunk("src/Unrelated.tsx", "export function Unrelated() { return null; }"),
  ];

  const matches = ranker.rank({
    query: "change src/App.tsx",
    chunks,
    vectorMatches: [{ id: chunks[1].id, score: 1 }],
    requestedPaths: ["src/App.tsx"],
    lexicalRetrieval: retrieval([
      {
        path: "src/App.tsx",
        score: 100,
      },
    ]),
  });

  assert.equal(matches[0].chunk.path, "src/App.tsx");
  assert.ok(matches[0].scoreBreakdown.reasons.includes("explicit_path"));
});

test("HybridRetrievalRanker includes graph proximity evidence for related files", () => {
  const ranker = new HybridRetrievalRanker();
  const chunks = [
    chunk("src/App.tsx", "import { formatTitle } from './helpers';"),
    chunk("src/helpers.ts", "export function formatTitle(value: string) { return value; }"),
  ];

  const matches = ranker.rank({
    query: "change app title",
    chunks,
    vectorMatches: [],
    lexicalRetrieval: retrieval([{ path: "src/App.tsx", score: 90 }]),
    graph: {
      status: "complete",
      nodes: [],
      edges: [
        {
          id: "edge:app:helpers",
          kind: "imports",
          sourcePath: "src/App.tsx",
          targetPath: "src/helpers.ts",
          confidence: 0.9,
        },
      ],
      exports: [],
      summary: {
        fileNodeCount: 2,
        symbolNodeCount: 0,
        edgeCount: 1,
        disconnectedImportCount: 0,
        relatedTestEdgeCount: 0,
      },
      notes: [],
      generatedAt: "2026-05-28T23:55:00.000Z",
    },
  });

  const helperMatch = matches.find((match) => match.chunk.path === "src/helpers.ts");
  assert.ok(helperMatch);
  assert.ok(helperMatch.scoreBreakdown.graphScore > 0);
  assert.ok(helperMatch.scoreBreakdown.reasons.includes("graph_proximity"));
});

function chunk(path, content) {
  return {
    id: `chunk:test:${path}`,
    path,
    language: "typescript",
    kind: "symbol",
    content,
    contentHash: `hash:${path}`,
    indexVersion: "test-index",
    startLine: 1,
    endLine: Math.max(1, content.split("\n").length),
    tokenEstimate: Math.ceil(content.length / 4),
    symbolIds: [],
    symbolNames: [],
  };
}

function retrieval(entries) {
  const candidates = entries.map((entry) => ({
    path: entry.path,
    language: "typescript",
    bytes: 100,
    content: "",
    startLine: 1,
    endLine: 1,
    score: entry.score,
    matchedTerms: [],
    excerpts: [],
  }));
  return {
    query: "test query",
    status: candidates.length > 0 ? "matched" : "no_match",
    candidates,
    excerpts: [],
    omittedFilesCount: 0,
    totalBytes: candidates.reduce((sum, candidate) => sum + candidate.bytes, 0),
    stats: {
      totalFiles: candidates.length,
      indexedFiles: candidates.length,
      contentScannedFiles: candidates.length,
      explicitPathCount: 0,
      blockedPathCount: 0,
    },
    notes: [],
    routingHints: [],
  };
}
