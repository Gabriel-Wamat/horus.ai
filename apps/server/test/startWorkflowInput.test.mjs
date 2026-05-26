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
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
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
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
    userStories: [userStory],
  });

  assert.equal(parsed.llmSettings, undefined);
  assert.equal(parsed.workspaceFolderId, "22222222-2222-4222-8222-222222222222");
});

test("StartWorkflowInputSchema requires workspaceFolderId", () => {
  assert.throws(
    () =>
      StartWorkflowInputSchema.parse({
        userStories: [userStory],
      }),
    /Required/
  );
});

test("StartWorkflowInputSchema rejects invalid LLM settings", () => {
  assert.throws(
    () =>
      StartWorkflowInputSchema.parse({
        workspaceFolderId: "22222222-2222-4222-8222-222222222222",
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
  }, {
    saveUserStories: async () => {},
    resolveUserStoriesForWorkflow: async (folderId, stories) => ({
      userStories: stories,
      artifactContext: {
        [stories[0].id]: {
          workspaceFolderId: folderId,
          userStoryRevisionId: "user-story:1",
        },
      },
    }),
  });

  await useCase.execute({
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
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
  assert.equal(received?.workspaceFolderId, "22222222-2222-4222-8222-222222222222");
  assert.equal(
    received?.workspaceArtifactContext?.[userStory.id]?.userStoryRevisionId,
    "user-story:1"
  );
});

test("StartWorkflowUseCase resolves workspace stories before starting orchestrator", async () => {
  const calls = [];
  const useCase = new StartWorkflowUseCase({
    start: async (options) => {
      calls.push("start");
      assert.equal(options.userStories[0].title, "Criar landing page ativa");
      return { threadId: "thread-1" };
    },
  }, {
    saveUserStories: async (folderId, stories) => {
      calls.push("save");
      assert.equal(folderId, "22222222-2222-4222-8222-222222222222");
      assert.equal(stories.length, 1);
    },
    resolveUserStoriesForWorkflow: async (folderId, stories) => {
      calls.push("resolve");
      assert.equal(folderId, "22222222-2222-4222-8222-222222222222");
      assert.equal(stories.length, 1);
      return {
        userStories: [{ ...stories[0], title: "Criar landing page ativa" }],
        artifactContext: {
          [stories[0].id]: {
            workspaceFolderId: folderId,
            userStoryRevisionId: "user-story:2",
          },
        },
      };
    },
  });

  await useCase.execute({
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
    userStories: [userStory],
  });

  assert.deepEqual(calls, ["resolve", "start"]);
});
