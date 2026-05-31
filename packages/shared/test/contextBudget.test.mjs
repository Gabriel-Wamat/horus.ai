import assert from "node:assert/strict";
import test from "node:test";
import {
  ContextBudgetItemSchema,
  PackedCodingContextSchema,
} from "../dist/index.js";

const now = "2026-05-28T23:59:00.000Z";

test("ContextBudgetItemSchema represents scored context sources", () => {
  const item = ContextBudgetItemSchema.parse({
    id: "semantic:chunk-1",
    type: "semantic_chunk",
    label: "src/App.tsx:1-5",
    content: "export function App() { return null; }",
    tokenEstimate: 9,
    priority: 720,
    score: 88,
    path: "src/App.tsx",
  });

  assert.equal(item.type, "semantic_chunk");
  assert.equal(item.path, "src/App.tsx");
});

test("PackedCodingContextSchema carries included and omitted context budget evidence", () => {
  const packed = PackedCodingContextSchema.parse({
    budget: {
      maxTokens: 64,
      reserveTokens: 8,
      maxItemTokens: 32,
    },
    usedTokens: 40,
    remainingTokens: 24,
    items: [
      {
        id: "request:user",
        type: "user_request",
        label: "User request",
        content: "Atualize o App.",
        tokenEstimate: 4,
        priority: 1000,
        score: 100,
      },
    ],
    omittedItems: [
      {
        id: "semantic:low",
        type: "semantic_chunk",
        label: "src/Old.tsx",
        tokenEstimate: 80,
        priority: 720,
        score: 10,
        reason: "budget_exhausted",
      },
    ],
    sourceCounts: {
      user_request: 1,
      task_memory: 0,
      chat_history: 0,
      lexical_candidate: 0,
      semantic_chunk: 0,
      symbol: 0,
      graph: 0,
      validation_error: 0,
    },
    diagnostics: ["context_budget:40/64"],
    generatedAt: now,
  });

  assert.equal(packed.items.length, 1);
  assert.equal(packed.omittedItems[0].reason, "budget_exhausted");
});
