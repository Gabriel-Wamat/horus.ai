import assert from "node:assert/strict";
import test from "node:test";
import { HorusOdinIntentRouter } from "../dist/application/services/HorusOdinIntentRouter.js";

const context = {
  session: {
    id: "chat-1",
    workspaceFolderId: "workspace-1",
    userStoryId: "story-1",
  },
  activeUserStory: {
    id: "story-1",
    title: "Ajustar preview visual",
  },
  activeSpec: null,
  messages: [],
};

class FailingClassifier {
  async classify() {
    throw new Error("deterministic router should handle this message");
  }
}

test("intent router treats passive visual identity color request as code change", async () => {
  const router = new HorusOdinIntentRouter(new FailingClassifier());

  const intent = await router.classify({
    message: "quero que toda a ID viSUAL VERDE seja trocada por amarelo",
    context,
  });

  assert.equal(intent.kind, "code_change");
  assert.equal(intent.mode, "executor");
  assert.equal(intent.confidence >= 0.9, true);
});

test("intent router reloads preview when user says preview did not update", async () => {
  const router = new HorusOdinIntentRouter(new FailingClassifier());

  const intent = await router.classify({
    message: "a preview nao atualizou",
    context,
  });

  assert.equal(intent.kind, "run_project");
  assert.equal(intent.mode, "executor");
  assert.equal(intent.previewAction, "reload");
});
