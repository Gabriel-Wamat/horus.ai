import assert from "node:assert/strict";
import test from "node:test";
import {
  HorusChatTurnInputSchema,
  HorusChatTurnResponseSchema,
} from "../dist/entities/HorusChat.js";

const chatSessionId = "11111111-1111-4111-8111-111111111111";
const workspaceFolderId = "22222222-2222-4222-8222-222222222222";
const userStoryId = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";
const previewSessionId = "55555555-5555-4555-8555-555555555555";

test("HorusChatTurnInputSchema accepts isolated preview chat context", () => {
  const parsed = HorusChatTurnInputSchema.parse({
    chatSessionId,
    message: "  Rode o projeto  ",
    previewSessionId,
    projectId,
    workspaceFolderId,
    userStoryId,
  });

  assert.equal(parsed.message, "Rode o projeto");
  assert.equal(parsed.chatSessionId, chatSessionId);
  assert.equal(parsed.previewSessionId, previewSessionId);
});

test("HorusChatTurnInputSchema rejects missing chat session id", () => {
  assert.throws(
    () =>
      HorusChatTurnInputSchema.parse({
        message: "Ajuste o botão.",
      }),
    /Required/
  );
});

test("HorusChatTurnResponseSchema accepts structured intent and outcome", () => {
  const messageBase = {
    sessionId: chatSessionId,
      contextSnapshot: {
        workspaceFolderId,
        userStoryId,
        projectId,
        previewSessionId,
      },
    createdAt: "2026-05-26T10:00:00.000Z",
  };

  const parsed = HorusChatTurnResponseSchema.parse({
    userMessage: {
      ...messageBase,
      id: "66666666-6666-4666-8666-666666666666",
      role: "user",
      body: "Rode o projeto.",
    },
    assistantMessage: {
      ...messageBase,
      id: "77777777-7777-4777-8777-777777777777",
      role: "agent",
      body: "Horus reconheceu o pedido.",
    },
    intent: {
      kind: "run_project",
      mode: "executor",
      confidence: 0.8,
      rationale: "Project execution request.",
    },
    outcome: {
      action: "project_execution_started",
      status: "accepted",
      summary: "Execution accepted.",
      previewSessionId,
    },
  });

  assert.equal(parsed.intent.kind, "run_project");
  assert.equal(parsed.intent.mode, "executor");
  assert.equal(parsed.outcome.action, "project_execution_started");
});
