import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentMemoryItemSchema,
  AgentMemorySummarySchema,
  PromptContextBundleSchema,
} from "../dist/index.js";

test("agent memory schemas require provenance and scoped prompt bundles", () => {
  const now = new Date().toISOString();
  const scope = {
    workspaceFolderId: "11111111-1111-4111-8111-111111111111",
    userStoryId: "22222222-2222-4222-8222-222222222222",
    projectId: null,
    chatSessionId: null,
    workflowThreadId: "33333333-3333-4333-8333-333333333333",
    agentProfileId: "front_agent",
  };

  const memory = AgentMemoryItemSchema.parse({
    id: "44444444-4444-4444-8444-444444444444",
    kind: "preference",
    scope,
    content: "Avoid highlighter colors; preserve the local gray/green identity.",
    confidence: 0.9,
    sourceRefs: [{ type: "chat_message", id: "chat-12", label: "user" }],
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(memory.sourceRefs.length, 1);
  assert.throws(() =>
    AgentMemoryItemSchema.parse({
      ...memory,
      id: "55555555-5555-4555-8555-555555555555",
      sourceRefs: [],
    })
  );

  const summary = AgentMemorySummarySchema.parse({
    id: "66666666-6666-4666-8666-666666666666",
    scope,
    summary: "The user asked Horus to keep the project visual identity consistent.",
    sourceRefs: [{ type: "chat_message", id: "chat-12" }],
    sourceMessageSequenceMin: 1,
    sourceMessageSequenceMax: 12,
    createdAt: now,
    updatedAt: now,
  });

  const bundle = PromptContextBundleSchema.parse({
    agentProfileId: "front_agent",
    scope,
    summaries: [summary],
    memories: [memory],
    runtimeSkills: [],
    budget: {
      maxBytes: 28000,
      usedBytes: 500,
      clippedBytes: 0,
      sections: [],
      diagnostics: [],
    },
  });

  assert.equal(bundle.memories[0].kind, "preference");
});
