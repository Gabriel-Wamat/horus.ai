import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { HybridRetrievalRanker } from "../dist/application/coding/HybridRetrievalRanker.js";
import { RepositoryChunker } from "../dist/application/coding/RepositoryChunker.js";
import { SemanticRepositoryIndexer } from "../dist/application/coding/SemanticRepositoryIndexer.js";
import { LocalHashEmbeddingProvider } from "../dist/infrastructure/embeddings/LocalHashEmbeddingProvider.js";
import { InMemoryVectorStore } from "../dist/infrastructure/vector/InMemoryVectorStore.js";
import { TreeSitterAstAnalyzer } from "../dist/infrastructure/ast/TreeSitterAstAnalyzer.js";

test("SemanticRepositoryIndexer retrieves behaviorally related code through injected embeddings", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "horus-semantic-index-"));
  await mkdir(join(rootPath, "src"), { recursive: true });
  const content = [
    "export function ChatPane() {",
    "  return <section>message stream</section>;",
    "}",
    "",
  ].join("\n");
  await writeFile(join(rootPath, "src", "ChatPane.tsx"), content, "utf-8");

  const candidates = [candidate("src/ChatPane.tsx", content)];
  const ast = await new TreeSitterAstAnalyzer().analyze({ candidates });
  const indexer = new SemanticRepositoryIndexer(
    new LocalHashEmbeddingProvider({
      dimensions: 64,
      tokenAliases: new Map([
        ["conversation", ["chat"]],
        ["reply", ["message"]],
      ]),
    }),
    new InMemoryVectorStore(),
    new RepositoryChunker(),
    new HybridRetrievalRanker(),
    () => new Date("2026-05-28T23:58:00.000Z")
  );

  const result = await indexer.retrieve({
    query: "conversation reply",
    scan: scanSnapshot(rootPath, candidates),
    lexicalRetrieval: emptyRetrieval(),
    ast,
    budget: {
      maxSourceFiles: 4,
      maxBytesPerFile: 4_000,
      maxChunks: 8,
      topK: 4,
    },
  });

  assert.ok(["matched", "partial"].includes(result.status));
  assert.equal(result.matches[0].chunk.path, "src/ChatPane.tsx");
  assert.equal(result.matches[0].candidate?.path, "src/ChatPane.tsx");
  assert.ok(result.matches[0].scoreBreakdown.reasons.includes("vector_similarity"));
  assert.equal(result.summary.dimensions, 64);
  assert.equal(result.summary.embeddingModel, undefined);
});

function scanSnapshot(projectRootPath, candidates) {
  return {
    projectRootPath,
    selectedPaths: [],
    files: candidates.map((item) => ({
      path: item.path,
      language: item.language,
      sizeBytes: item.bytes,
      modifiedAt: "2026-05-28T23:58:00.000Z",
      safety: "readable",
    })),
    stats: {
      totalEntries: candidates.length,
      totalFiles: candidates.length,
      indexedFiles: candidates.length,
      ignoredEntries: 0,
      blockedFiles: 0,
      binaryFiles: 0,
      oversizedFiles: 0,
      partial: false,
    },
    notes: [],
    generatedAt: "2026-05-28T23:58:00.000Z",
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
    score: 0,
    matchedTerms: [],
    excerpts: [],
  };
}

function emptyRetrieval() {
  return {
    query: "conversation reply",
    status: "no_match",
    candidates: [],
    excerpts: [],
    omittedFilesCount: 0,
    totalBytes: 0,
    stats: {
      totalFiles: 1,
      indexedFiles: 1,
      contentScannedFiles: 0,
      explicitPathCount: 0,
      blockedPathCount: 0,
    },
    notes: [],
    routingHints: [],
  };
}
