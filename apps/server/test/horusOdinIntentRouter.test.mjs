import assert from "node:assert/strict";
import test from "node:test";
import { HorusOdinIntentRouter } from "../dist/application/services/HorusOdinIntentRouter.js";

const context = {
  session: {
    id: "11111111-1111-4111-8111-111111111111",
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
    userStoryId: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-05-26T10:00:00.000Z",
    updatedAt: "2026-05-26T10:00:00.000Z",
  },
  messages: [],
  activeUserStory: {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Story",
    description: "Description",
    acceptanceCriteria: ["Criterion"],
    priority: "medium",
    labels: [],
    createdAt: "2026-05-26T10:00:00.000Z",
  },
  artifactContext: {
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
  },
  previousAgentResults: [],
};

function routerReturning(intent) {
  return new HorusOdinIntentRouter({
    classify: async () => intent,
  });
}

test("HorusOdinIntentRouter delegates classification to the configured classifier", async () => {
  const router = routerReturning({
    kind: "answer_question",
    mode: "chat",
    confidence: 0.91,
    rationale: "The user is asking for an explanation.",
  });

  const result = await router.classify({
    message: "Explique o objetivo desta tela.",
    context,
  });

  assert.equal(result.kind, "answer_question");
  assert.equal(result.mode, "chat");
  assert.equal(result.confidence, 0.91);
});

test("HorusOdinIntentRouter preserves structured preview action decisions", async () => {
  const router = routerReturning({
    kind: "run_project",
    mode: "executor",
    confidence: 0.88,
    rationale: "The user requested a controlled preview reload.",
    previewAction: "reload",
  });

  const result = await router.classify({
    message: "Recarregue o projeto.",
    context,
  });

  assert.equal(result.kind, "run_project");
  assert.equal(result.mode, "executor");
  assert.equal(result.previewAction, "reload");
});

test("HorusOdinIntentRouter rejects malformed classifier output through the shared schema", async () => {
  const router = routerReturning({
    kind: "run_project",
    mode: "executor",
    confidence: 2,
    rationale: "Invalid confidence should fail contract validation.",
    previewAction: "start",
  });

  await assert.rejects(
    () =>
      router.classify({
        message: "Rode o projeto.",
        context,
      }),
    /Number must be less than or equal to 1/
  );
});
