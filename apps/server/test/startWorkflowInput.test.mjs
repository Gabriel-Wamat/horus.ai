import assert from "node:assert/strict";
import test from "node:test";
import {
  StartWorkflowInputSchema,
  StartWorkflowUseCase,
} from "../dist/application/usecases/StartWorkflowUseCase.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Criar landing page",
  description: "Como visitante, quero conhecer o produto.",
  acceptanceCriteria: ["Exibe headline", "Exibe CTA"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-26T10:00:00.000Z",
};

test("StartWorkflowInputSchema accepts optional LLM settings", () => {
  const parsed = StartWorkflowInputSchema.parse({
    userStories: [userStory],
    llmSettings: {
      provider: "openai",
      model: "gpt-5-mini",
      apiKey: "sk-test",
    },
  });

  assert.equal(parsed.llmSettings?.provider, "openai");
  assert.equal(parsed.llmSettings?.model, "gpt-5-mini");
  assert.equal(parsed.llmSettings?.apiKey, "sk-test");
});

test("StartWorkflowInputSchema keeps env fallback payload valid", () => {
  const parsed = StartWorkflowInputSchema.parse({
    userStories: [userStory],
  });

  assert.equal(parsed.llmSettings, undefined);
});

test("StartWorkflowInputSchema rejects invalid LLM settings", () => {
  assert.throws(
    () =>
      StartWorkflowInputSchema.parse({
        userStories: [userStory],
        llmSettings: {
          provider: "openai",
          model: "",
          apiKey: "sk-test",
        },
      }),
    /String must contain at least 1 character/
  );
});

test("StartWorkflowUseCase forwards LLM settings to orchestrator", async () => {
  let received;
  const useCase = new StartWorkflowUseCase({
    start: async (options) => {
      received = options;
      return { threadId: "thread-1" };
    },
  });

  await useCase.execute({
    userStories: [userStory],
    llmSettings: {
      provider: "groq",
      model: "llama-test",
      apiKey: "secret",
    },
  });

  assert.deepEqual(received?.llmSettings, {
    provider: "groq",
    model: "llama-test",
    apiKey: "secret",
  });
});
