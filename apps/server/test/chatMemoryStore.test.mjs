import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  FileChatMemoryStore,
} from "../dist/infrastructure/chat/FileChatMemoryStore.js";
import {
  FileWorkspaceStore,
  WorkspaceUserStoryNotFoundError,
} from "../dist/infrastructure/workspace/FileWorkspaceStore.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Processar empresa pelo ticker",
  description: "Como analista, quero informar um ticker.",
  acceptanceCriteria: ["Informa o ticker"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-26T10:00:00.000Z",
};

const spec = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userStoryId: userStory.id,
  version: 1,
  summary: "Criar processamento por ticker",
  technicalApproach: "Implementar fluxo de captura e indexação.",
  components: [
    {
      name: "TickerForm",
      type: "ui",
      description: "Formulário para informar ticker.",
      dependencies: [],
    },
  ],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-05-26T10:01:00.000Z",
};

function workflowStorage(state = null) {
  return {
    save: async () => {},
    load: async () => state,
    list: async () => [],
    delete: async () => {},
  };
}

test("FileChatMemoryStore rejects sessions for missing stories", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-chat-"));
  const workspace = new FileWorkspaceStore(join(baseDir, "workspace"));
  const chat = new FileChatMemoryStore(
    workspace,
    workflowStorage(),
    join(baseDir, "chat")
  );
  const folder = await workspace.createFolder("User Stories");

  await assert.rejects(
    () =>
      chat.createSession({
        workspaceFolderId: folder.id,
        userStoryId: userStory.id,
      }),
    WorkspaceUserStoryNotFoundError
  );
});

test("FileChatMemoryStore appends messages with active revision context", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-chat-"));
  const workspace = new FileWorkspaceStore(join(baseDir, "workspace"));
  const chat = new FileChatMemoryStore(
    workspace,
    workflowStorage(),
    join(baseDir, "chat")
  );
  const folder = await workspace.createFolder("User Stories");
  await workspace.saveUserStories(folder.id, [userStory]);
  await workspace.updateUserStory(folder.id, userStory.id, {
    ...userStory,
    title: "Processar empresa ativa",
  });

  const session = await chat.createSession({
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });
  const message = await chat.appendMessage(session.id, {
    role: "user",
    body: "Ajuste o fluxo para validar ticker vazio.",
  });

  assert.equal(message.contextSnapshot.workspaceFolderId, folder.id);
  assert.equal(message.contextSnapshot.userStoryId, userStory.id);
  assert.equal(message.contextSnapshot.userStoryRevisionId, "user-story:2");
});

test("FileChatMemoryStore serializes concurrent appends per chat session", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-chat-"));
  const workspace = new FileWorkspaceStore(join(baseDir, "workspace"));
  const chat = new FileChatMemoryStore(
    workspace,
    workflowStorage(),
    join(baseDir, "chat")
  );
  const folder = await workspace.createFolder("User Stories");
  await workspace.saveUserStories(folder.id, [userStory]);
  const session = await chat.createSession({
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      chat.appendMessage(session.id, {
        role: index % 2 === 0 ? "user" : "agent",
        body: `Mensagem ${index + 1}`,
      })
    )
  );

  const messages = await chat.listMessages(session.id);
  assert.equal(messages.length, 12);
  assert.deepEqual(
    messages.map((message) => message.sequence),
    Array.from({ length: 12 }, (_, index) => index + 1)
  );
  assert.equal(new Set(messages.map((message) => message.sequence)).size, 12);
});

test("FileChatMemoryStore builds agent context with chat, artifacts, spec and previous outputs", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-chat-"));
  const workspace = new FileWorkspaceStore(join(baseDir, "workspace"));
  const folder = await workspace.createFolder("User Stories");
  await workspace.saveUserStories(folder.id, [userStory]);
  await workspace.saveSpec(folder.id, userStory.id, spec);

  const threadId = "22222222-2222-4222-8222-222222222222";
  const chat = new FileChatMemoryStore(
    workspace,
    workflowStorage({
      threadId,
      workspaceFolderId: folder.id,
      userStories: [userStory],
      currentUSIndex: 0,
      specs: { [userStory.id]: spec },
      workspaceArtifactContext: {},
      humanFeedback: {},
      agentResults: {
        [userStory.id]: [
          {
            status: "success",
            agentName: "front",
            userStoryId: userStory.id,
            output: { html: "<main>ok</main>" },
            executionTimeMs: 1,
            completedAt: "2026-05-26T10:02:00.000Z",
          },
        ],
      },
      status: "completed",
      startedAt: "2026-05-26T10:00:00.000Z",
      completedAt: "2026-05-26T10:03:00.000Z",
    }),
    join(baseDir, "chat")
  );

  const session = await chat.createSession({
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
    workflowThreadId: threadId,
  });
  await chat.appendMessage(session.id, {
    role: "user",
    body: "Use o HTML anterior e reduza o texto.",
  });

  const context = await chat.buildAgentContext(session.id);

  assert.equal(context.messages.length, 1);
  assert.equal(context.activeUserStory.id, userStory.id);
  assert.equal(context.activeSpec?.id, spec.id);
  assert.equal(context.artifactContext.workspaceFolderId, folder.id);
  assert.equal(context.artifactContext.userStoryRevisionId, "user-story:1");
  assert.equal(context.artifactContext.specRevisionId, `spec:${spec.id}:1`);
  assert.equal(context.previousAgentResults[0].agentName, "front");
});
