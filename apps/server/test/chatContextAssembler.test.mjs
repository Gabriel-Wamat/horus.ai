import assert from "node:assert/strict";
import test from "node:test";
import { ChatContextAssembler } from "../dist/application/services/ChatContextAssembler.js";

const session = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceFolderId: "22222222-2222-4222-8222-222222222222",
  userStoryId: "33333333-3333-4333-8333-333333333333",
  createdAt: "2026-05-28T10:00:00.000Z",
  updatedAt: "2026-05-28T10:00:00.000Z",
};

const contextBase = {
  session,
  activeUserStory: {
    id: session.userStoryId,
    title: "Chat profissional",
    description: "Como operador, quero respostas com contexto controlado.",
    acceptanceCriteria: [],
    priority: "medium",
    labels: [],
    createdAt: "2026-05-28T10:00:00.000Z",
  },
  artifactContext: {
    workspaceFolderId: session.workspaceFolderId,
    userStoryId: session.userStoryId,
  },
  previousAgentResults: [],
};

function message(sequence, body) {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(sequence).padStart(12, "0")}`,
    sessionId: session.id,
    sequence,
    role: sequence % 2 === 0 ? "agent" : "user",
    eventType: "message",
    visibility: "user",
    deliveryStatus: "persisted",
    body,
    contextSnapshot: {
      workspaceFolderId: session.workspaceFolderId,
      userStoryId: session.userStoryId,
    },
    metadata: {},
    createdAt: `2026-05-28T10:${String(sequence).padStart(2, "0")}:00.000Z`,
  };
}

test("ChatContextAssembler prunes old raw chat and reuses compact summaries", async () => {
  const memoryReader = {
    retrieveForPrompt: async () => ({
      summaries: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          scope: {
            workspaceFolderId: session.workspaceFolderId,
            userStoryId: session.userStoryId,
            projectId: null,
            chatSessionId: session.id,
            workflowThreadId: null,
            agentProfileId: "horus_chat",
          },
          summary:
            "O usuário pediu para manter o chat como superfície operacional e evitar respostas sem grounding.",
          sourceRefs: [{ type: "chat_message", id: "m-1", label: "chat:1" }],
          sourceMessageSequenceMin: 1,
          sourceMessageSequenceMax: 12,
          createdAt: "2026-05-28T10:20:00.000Z",
          updatedAt: "2026-05-28T10:20:00.000Z",
        },
      ],
      memories: [],
    }),
  };
  const assembler = new ChatContextAssembler(memoryReader, {
    maxRecentMessages: 4,
    maxMessageBytes: 80,
    maxHistoryBytes: 360,
  });
  const messages = Array.from({ length: 14 }, (_, index) =>
    message(index + 1, `Mensagem antiga ${index + 1} ${"x".repeat(160)}`)
  );

  const assembly = await assembler.assemble({
    context: { ...contextBase, messages },
    query: "explique o contexto",
  });

  assert.equal(assembly.summaries.length, 1);
  assert.equal(assembly.context.messages[0].role, "system");
  assert.match(assembly.context.messages[0].body, /Resumo compactado/);
  assert.equal(
    assembly.context.messages.some((item) => item.body.includes("Mensagem antiga 1 ")),
    false
  );
  assert.ok(assembly.context.messages.length <= 5);
  assert.ok(assembly.report.usedBytes <= assembly.report.maxBytes);
  assert.ok(assembly.report.clippedBytes > 0);
});
