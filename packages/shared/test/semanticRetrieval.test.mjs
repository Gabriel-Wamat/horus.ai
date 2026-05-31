import assert from "node:assert/strict";
import test from "node:test";
import {
  RepositoryChunkSchema,
  SemanticRetrievalResultSchema,
} from "../dist/entities/SemanticRetrieval.js";

const now = "2026-05-28T23:55:00.000Z";

test("RepositoryChunkSchema accepts code-aware chunk metadata", () => {
  const parsed = RepositoryChunkSchema.parse({
    id: "chunk:v1:src/App.tsx:0:42:symbol:abc123",
    path: "src/App.tsx",
    language: "typescript",
    kind: "symbol",
    content: "export function App() { return null; }",
    contentHash: "abc123",
    indexVersion: "semantic-retrieval.v1",
    startLine: 1,
    endLine: 1,
    tokenEstimate: 9,
    symbolIds: ["src/App.tsx:function:App:0"],
    symbolNames: ["App"],
  });

  assert.equal(parsed.kind, "symbol");
  assert.equal(parsed.symbolNames[0], "App");
});

test("SemanticRetrievalResultSchema carries explainable hybrid score evidence", () => {
  const parsed = SemanticRetrievalResultSchema.parse({
    query: "render dashboard cards",
    namespace: "project:11111111-1111-4111-8111-111111111111",
    status: "matched",
    indexVersion: "semantic-retrieval.v1",
    matches: [
      {
        chunk: {
          id: "chunk:v1:src/Dashboard.tsx:0:50:symbol:hash",
          path: "src/Dashboard.tsx",
          language: "typescript",
          kind: "symbol",
          content: "export function Dashboard() { return null; }",
          contentHash: "hash",
          indexVersion: "semantic-retrieval.v1",
          startLine: 1,
          endLine: 1,
          tokenEstimate: 10,
          symbolIds: ["src/Dashboard.tsx:function:Dashboard:0"],
          symbolNames: ["Dashboard"],
        },
        scoreBreakdown: {
          lexicalScore: 32,
          vectorScore: 76,
          symbolScore: 20,
          graphScore: 8,
          explicitPathScore: 0,
          finalScore: 136,
          reasons: ["vector_similarity", "symbol_match"],
        },
      },
    ],
    summary: {
      chunkCount: 1,
      embeddedChunkCount: 1,
      matchedChunkCount: 1,
      omittedChunkCount: 0,
      dimensions: 384,
    },
    notes: [],
    generatedAt: now,
  });

  assert.equal(parsed.status, "matched");
  assert.equal(parsed.matches[0].scoreBreakdown.vectorScore, 76);
});
