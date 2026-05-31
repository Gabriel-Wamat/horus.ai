import assert from "node:assert/strict";
import test from "node:test";
import { ContextBudgeter } from "../dist/application/coding/ContextBudgeter.js";

const now = "2026-05-28T23:59:00.000Z";

test("ContextBudgeter packs highest priority context without exceeding token budget", () => {
  const budgeter = new ContextBudgeter(() => new Date(now));
  const packed = budgeter.pack({
    request: "Atualize o componente App com o novo trecho.",
    budget: {
      maxTokens: 64,
      reserveTokens: 8,
      maxItemTokens: 24,
    },
    retrieval: retrieval([
      candidate("src/App.tsx", "export function App() { return <main />; }", 100),
      candidate("src/Low.tsx", "x".repeat(500), 1),
      candidate("src/Lower.tsx", "y".repeat(500), 1),
      candidate("src/Lowest.tsx", "z".repeat(500), 1),
    ]),
    semanticRetrieval: semanticResult([
      semanticChunk("semantic:app", "src/App.tsx", "export function App() {}"),
    ]),
  });

  assert.ok(packed.usedTokens <= packed.budget.maxTokens);
  assert.ok(packed.items.some((item) => item.type === "user_request"));
  assert.ok(packed.items.some((item) => item.path === "src/App.tsx"));
  assert.ok(packed.omittedItems.length > 0);
});

test("ContextBudgeter includes task-scoped memory above generic context", () => {
  const budgeter = new ContextBudgeter(() => new Date(now));
  const packed = budgeter.pack({
    request: "Continue a tarefa.",
    budget: {
      maxTokens: 80,
      reserveTokens: 0,
    },
    memories: [
      memory("11111111-1111-4111-8111-111111111111", {
        codingTaskId: "22222222-2222-4222-8222-222222222222",
        content: "Patch anterior alterou src/App.tsx.",
      }),
      memory("33333333-3333-4333-8333-333333333333", {
        codingTaskId: null,
        content: "Preferencia geral de UI.",
      }),
    ],
  });

  const taskMemory = packed.items.find(
    (item) => item.sourceId === "11111111-1111-4111-8111-111111111111"
  );
  assert.ok(taskMemory);
  assert.equal(taskMemory.type, "task_memory");
});

function retrieval(candidates) {
  return {
    query: "Atualize App",
    status: "matched",
    candidates,
    excerpts: candidates.flatMap((candidate) => candidate.excerpts),
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

function candidate(path, content, score) {
  return {
    path,
    language: "typescript",
    bytes: Buffer.byteLength(content, "utf-8"),
    content,
    startLine: 1,
    endLine: Math.max(1, content.split("\n").length),
    score,
    matchedTerms: [],
    excerpts: [
      {
        filePath: path,
        startLine: 1,
        endLine: 1,
        content,
        reason: "test",
        score,
      },
    ],
  };
}

function semanticResult(chunks) {
  return {
    query: "Atualize App",
    namespace: "project:test",
    status: "matched",
    indexVersion: "semantic-retrieval.v1",
    matches: chunks.map((chunk) => ({
      chunk,
      scoreBreakdown: {
        lexicalScore: 0,
        vectorScore: 90,
        symbolScore: 0,
        graphScore: 0,
        explicitPathScore: 0,
        finalScore: 60,
        reasons: ["vector_similarity"],
      },
    })),
    summary: {
      chunkCount: chunks.length,
      embeddedChunkCount: chunks.length,
      matchedChunkCount: chunks.length,
      omittedChunkCount: 0,
      dimensions: 64,
    },
    notes: [],
    generatedAt: now,
  };
}

function semanticChunk(id, path, content) {
  return {
    id,
    path,
    language: "typescript",
    kind: "symbol",
    content,
    contentHash: `${id}:hash`,
    indexVersion: "semantic-retrieval.v1",
    startLine: 1,
    endLine: 1,
    tokenEstimate: Math.ceil(content.length / 4),
    symbolIds: [],
    symbolNames: [],
  };
}

function memory(id, input) {
  return {
    id,
    kind: "working",
    scope: {
      workspaceFolderId: null,
      userStoryId: null,
      projectId: null,
      chatSessionId: null,
      workflowThreadId: null,
      codingTaskId: input.codingTaskId,
      agentProfileId: null,
    },
    content: input.content,
    confidence: 1,
    sourceRefs: [{ type: "manual", id: "note" }],
    tags: ["ephemeral"],
    staleAt: null,
    supersededByMemoryId: null,
    createdAt: now,
    updatedAt: now,
  };
}
