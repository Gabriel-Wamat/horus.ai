import assert from "node:assert/strict";
import test from "node:test";
import {
  HorusChatMessageMetadataSchema,
  HorusChatStreamEventSchema,
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
      retrievalStatus: "partial",
      retrievalNotes: ["A busca encontrou apenas evidências fracas."],
    },
  });

  assert.equal(parsed.intent.kind, "run_project");
  assert.equal(parsed.intent.mode, "executor");
  assert.equal(parsed.outcome.action, "project_execution_started");
  assert.equal(parsed.outcome.retrievalStatus, "partial");
});

test("HorusChatTurnResponseSchema accepts completed code-change outcomes", () => {
  const parsed = HorusChatTurnResponseSchema.parse({
    userMessage: {
      id: "66666666-6666-4666-8666-666666666666",
      sessionId: chatSessionId,
      role: "user",
      body: "Corrija o App.tsx.",
      contextSnapshot: {
        workspaceFolderId,
        userStoryId,
        projectId,
      },
      createdAt: "2026-05-26T10:00:00.000Z",
    },
    intent: {
      kind: "code_change",
      mode: "executor",
      confidence: 0.95,
      rationale: "Explicit code edit.",
    },
    outcome: {
      action: "code_change_completed",
      status: "completed",
      summary: "App.tsx corrigido e build validado.",
      projectId,
      toolSteps: [
        {
          tool: "run_validation_command",
          title: "Validando projeto",
          phase: "succeeded",
        },
      ],
      suggestedActions: [
        {
          type: "open_file",
          label: "abrir src/App.tsx",
          filePath: "src/App.tsx",
        },
      ],
    },
  });

  assert.equal(parsed.outcome.action, "code_change_completed");
  assert.equal(parsed.outcome.toolSteps?.[0]?.tool, "run_validation_command");
  assert.equal(parsed.outcome.suggestedActions?.[0]?.type, "open_file");
});

test("HorusChatMessageMetadataSchema accepts durable turn evidence", () => {
  const parsed = HorusChatMessageMetadataSchema.parse({
    idempotencyKey: "chat:turn:abc",
    turnStatus: "completed",
    evidenceSources: [
      {
        type: "code_file",
        label: "src/App.tsx:1-3",
        path: "src/App.tsx",
        startLine: 1,
        endLine: 3,
        excerpt: "export function App() {}",
        confidence: "high",
      },
    ],
    groundingStatus: "grounded",
    toolSteps: [
      {
        tool: "read_file",
        title: "Lendo arquivo: src/App.tsx",
        phase: "succeeded",
      },
    ],
    suggestedActions: [
      {
        type: "start_preview",
        label: "iniciar o preview registrado",
      },
    ],
    completedAt: "2026-05-28T16:00:00.000Z",
  });

  assert.equal(parsed.turnStatus, "completed");
  assert.equal(parsed.evidenceSources?.[0]?.path, "src/App.tsx");
  assert.equal(parsed.toolSteps?.[0]?.phase, "succeeded");
  assert.equal(parsed.suggestedActions?.[0]?.type, "start_preview");
});

test("HorusChatStreamEventSchema accepts cancelled terminal event", () => {
  const parsed = HorusChatStreamEventSchema.parse({
    sequence: 4,
    type: "turn_cancelled",
    message: "Pedido cancelado.",
    retryable: true,
  });

  assert.equal(parsed.type, "turn_cancelled");
});

test("HorusChatStreamEventSchema accepts retrieval status on evidence events", () => {
  const parsed = HorusChatStreamEventSchema.parse({
    sequence: 3,
    type: "evidence_sources",
    messageId: "stream-1",
    evidenceSources: [],
    groundingStatus: "partial",
    retrievalStatus: "partial",
    retrievalNotes: ["Busca limitada por orçamento de contexto."],
  });

  assert.equal(parsed.type, "evidence_sources");
  assert.equal(parsed.retrievalStatus, "partial");
});
