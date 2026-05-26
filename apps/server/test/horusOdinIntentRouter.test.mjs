import assert from "node:assert/strict";
import test from "node:test";
import { HorusOdinIntentRouter } from "../dist/application/services/HorusOdinIntentRouter.js";

const router = new HorusOdinIntentRouter();

const context = {
  session: {
    id: "11111111-1111-4111-8111-111111111111",
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
    userStoryId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-05-26T10:00:00.000Z",
    updatedAt: "2026-05-26T10:00:00.000Z",
  },
  messages: [],
  activeStory: null,
  activeSpec: null,
  artifactContext: {
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
    userStoryId: "33333333-3333-4333-8333-333333333333",
  },
  previousOutputs: [],
};

test("HorusOdinIntentRouter routes questions to chat mode", () => {
  const result = router.classify({
    message: "Explique o objetivo desta tela.",
    context,
  });

  assert.equal(result.kind, "answer_question");
  assert.equal(result.mode, "chat");
});

test("HorusOdinIntentRouter treats greetings as chat mode", () => {
  const result = router.classify({
    message: "olá",
    context,
  });

  assert.equal(result.kind, "answer_question");
  assert.equal(result.mode, "chat");
});

test("HorusOdinIntentRouter keeps verification asks in chat mode", () => {
  const result = router.classify({
    message: "Verifique se esse botão está conectado corretamente.",
    context,
  });

  assert.equal(result.kind, "answer_question");
  assert.equal(result.mode, "chat");
});

test("HorusOdinIntentRouter routes code changes to executor mode", () => {
  const result = router.classify({
    message: "Ajuste esse botão e conecte no agente de front.",
    context,
  });

  assert.equal(result.kind, "code_change");
  assert.equal(result.mode, "executor");
});

test("HorusOdinIntentRouter keeps code-change questions in chat mode", () => {
  const result = router.classify({
    message: "Como ajustar esse botão sem quebrar o layout?",
    context,
  });

  assert.equal(result.kind, "answer_question");
  assert.equal(result.mode, "chat");
});

test("HorusOdinIntentRouter routes project execution requests to executor mode", () => {
  const result = router.classify({
    message: "Rode o projeto e abra o preview.",
    context,
  });

  assert.equal(result.kind, "run_project");
  assert.equal(result.mode, "executor");
});

test("HorusOdinIntentRouter rejects arbitrary terminal commands", () => {
  const result = router.classify({
    message: "Execute pnpm install pelo terminal.",
    context,
  });

  assert.equal(result.kind, "unsupported");
  assert.equal(result.mode, "executor");
});

test("HorusOdinIntentRouter only routes explicit spec requests to executor mode", () => {
  const result = router.classify({
    message: "Crie uma spec para essa feature.",
    context,
  });

  assert.equal(result.kind, "generate_spec");
  assert.equal(result.mode, "executor");
});

test("HorusOdinIntentRouter does not treat user story mentions as spec generation", () => {
  const result = router.classify({
    message: "Explique o contexto desta user story.",
    context,
  });

  assert.equal(result.kind, "answer_question");
  assert.equal(result.mode, "chat");
});
