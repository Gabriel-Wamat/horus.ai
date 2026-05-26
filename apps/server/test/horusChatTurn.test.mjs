import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { SubmitHorusChatTurnUseCase, HorusChatContextMismatchError } from "../dist/application/usecases/SubmitHorusChatTurnUseCase.js";
import { FileChatMemoryStore } from "../dist/infrastructure/chat/FileChatMemoryStore.js";
import { FileWorkspaceStore } from "../dist/infrastructure/workspace/FileWorkspaceStore.js";
import { FileFrontendProjectRegistry } from "../dist/infrastructure/preview/FileFrontendProjectRegistry.js";
import { FilePreviewSessionStore } from "../dist/infrastructure/preview/FilePreviewSessionStore.js";
import { NoopBrowserPreviewAdapter } from "../dist/infrastructure/preview/NoopBrowserPreviewAdapter.js";
import { PreviewEventStreamAdapter } from "../dist/infrastructure/preview/PreviewEventStreamAdapter.js";
import { PreviewRuntimeManager } from "../dist/infrastructure/preview/PreviewRuntimeManager.js";

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
  technicalApproach: "Implementar formulário e validação de ticker.",
  components: [
    {
      name: "TickerForm",
      type: "ui",
      description: "Formulário de entrada de ticker.",
      dependencies: [],
    },
  ],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-05-26T10:01:00.000Z",
};

function workflowStorage() {
  return {
    save: async () => {},
    load: async () => null,
    list: async () => [],
    delete: async () => {},
  };
}

async function setup(options = {}) {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-chat-turn-"));
  const repoRoot = join(baseDir, "repo");
  await mkdir(join(repoRoot, "apps", "web"), { recursive: true });
  await mkdir(join(repoRoot, "apps", "web", "src"), { recursive: true });
  await writeFile(
    join(repoRoot, "apps", "web", "package.json"),
    JSON.stringify({ name: "@u-build/web", scripts: { dev: "vite" } }),
    "utf-8"
  );
  await writeFile(
    join(repoRoot, "apps", "web", "src", "App.tsx"),
    "export function App() { return <main>User stories</main>; }",
    "utf-8"
  );

  const workspace = new FileWorkspaceStore(join(baseDir, "workspace"));
  const folder = await workspace.createFolder("User Stories");
  await workspace.saveUserStories(folder.id, [userStory]);
  if (options.saveSpec) {
    await workspace.saveSpec(folder.id, userStory.id, spec);
  }

  const chat = new FileChatMemoryStore(
    workspace,
    workflowStorage(),
    join(baseDir, "chat")
  );
  const chatSession = await chat.createSession({
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  const registry = new FileFrontendProjectRegistry(join(baseDir, "projects"), repoRoot);
  const previewRuntime = new PreviewRuntimeManager(
    registry,
    new FilePreviewSessionStore(join(baseDir, "preview")),
    new NoopBrowserPreviewAdapter(),
    new PreviewEventStreamAdapter()
  );
  const [project] = await previewRuntime.listProjects();
  const preview = await previewRuntime.createSession({
    projectId: project.id,
    route: "/",
    device: "pc",
  });
  const chatResponder = options.chatResponder ?? {
    answer: async ({ message }) => `Resposta LLM de teste para: ${message}`,
  };

  const useCase = new SubmitHorusChatTurnUseCase(
    chat,
    previewRuntime,
    undefined,
    undefined,
    chatResponder,
    options.chatCodeChangeExecutor
  );

  return {
    chat,
    chatSession,
    folder,
    preview,
    project,
    registry,
    previewRuntime,
    useCase,
  };
}

test("SubmitHorusChatTurnUseCase persists user and assistant messages with isolated context", async () => {
  const {
    chat,
    chatSession,
    folder,
    preview,
    project,
    previewRuntime,
    useCase,
  } = await setup();

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Rode o projeto.",
    previewSessionId: preview.session.id,
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.userMessage.role, "user");
  assert.equal(result.assistantMessage?.role, "agent");
  assert.equal(result.intent.kind, "run_project");
  assert.equal(result.intent.mode, "executor");
  assert.equal(result.outcome.action, "project_execution_started");
  assert.equal(result.outcome.status, "completed");
  assert.equal(result.outcome.previewSessionId, preview.session.id);

  const startedSession = await previewRuntime.getSession(preview.session.id);
  assert.equal(startedSession.status, "running");

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].body, "Rode o projeto.");
  assert.equal(messages[0].contextSnapshot.workspaceFolderId, folder.id);
  assert.equal(messages[0].contextSnapshot.userStoryId, userStory.id);
  assert.equal(messages[0].contextSnapshot.projectId, project.id);
  assert.equal(messages[0].contextSnapshot.previewSessionId, preview.session.id);
  assert.equal(messages[1].contextSnapshot.projectId, project.id);
  assert.equal(messages[1].contextSnapshot.previewSessionId, preview.session.id);
});

test("SubmitHorusChatTurnUseCase creates and starts a preview session when chat has no session", async () => {
  const { chatSession, folder, project, useCase } = await setup();

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Rode o projeto.",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "run_project");
  assert.equal(result.outcome.action, "project_execution_started");
  assert.equal(result.outcome.status, "completed");
  assert.ok(result.outcome.previewSessionId);
});

test("SubmitHorusChatTurnUseCase stops and reloads existing preview sessions from chat", async () => {
  const { chatSession, folder, preview, project, useCase } = await setup();

  const stopResult = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Pare o projeto.",
    previewSessionId: preview.session.id,
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(stopResult.intent.kind, "run_project");
  assert.equal(stopResult.outcome.action, "project_execution_stopped");
  assert.equal(stopResult.outcome.previewSessionId, preview.session.id);

  const reloadResult = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Recarregue o projeto.",
    previewSessionId: preview.session.id,
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(reloadResult.intent.kind, "run_project");
  assert.equal(reloadResult.outcome.action, "project_execution_reloaded");
  assert.equal(reloadResult.outcome.previewSessionId, preview.session.id);
});

test("SubmitHorusChatTurnUseCase rejects arbitrary shell commands from chat execution", async () => {
  const { chatSession, folder, project, useCase } = await setup();

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Execute pnpm install pelo terminal.",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "unsupported");
  assert.equal(result.intent.mode, "executor");
  assert.equal(result.outcome.action, "error");
  assert.equal(result.outcome.status, "blocked");
});

test("SubmitHorusChatTurnUseCase answers greetings without asking for routing context", async () => {
  let received;
  const { chatSession, folder, project, useCase } = await setup({
    chatResponder: {
      answer: async (input) => {
        received = input;
        return "Olá. Sou o Horus e posso conversar sobre este projeto ou encaminhar ações explícitas para o executor.";
      },
    },
  });

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "olá",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "answer_question");
  assert.equal(result.intent.mode, "chat");
  assert.equal(result.outcome.action, "answer");
  assert.match(result.outcome.summary, /Sou o Horus/);
  assert.doesNotMatch(result.outcome.summary, /precisa de mais contexto/i);
  assert.equal(received?.message, "olá");
  assert.equal(received?.project?.id, project.id);
});

test("SubmitHorusChatTurnUseCase treats user story explanation as a question, not spec generation", async () => {
  const { chatSession, folder, project, useCase } = await setup();

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Explique rapidamente o contexto desta user story.",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "answer_question");
  assert.equal(result.intent.mode, "chat");
  assert.equal(result.outcome.action, "answer");
  assert.equal(result.outcome.chatSessionId, chatSession.id);
  assert.equal(result.outcome.projectId, project.id);
  assert.ok(result.outcome.contextSources?.includes("package.json"));
});

test("SubmitHorusChatTurnUseCase only requests spec generation when the user explicitly asks for it", async () => {
  const { chatSession, folder, project, useCase } = await setup();

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Crie uma spec para esta user story.",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "generate_spec");
  assert.equal(result.intent.mode, "executor");
  assert.equal(result.outcome.action, "spec_requested");
});

test("SubmitHorusChatTurnUseCase starts chat code-change orchestration without SpecAgent", async () => {
  let received;
  const { chat, chatSession, folder, project, useCase } = await setup({
    saveSpec: true,
    chatCodeChangeExecutor: {
      startChatCodeChange: async (input) => {
        received = input;
        return { threadId: "99999999-9999-4999-8999-999999999999" };
      },
    },
  });

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Ajuste esse botão para ficar mais claro.",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "code_change");
  assert.equal(result.intent.mode, "executor");
  assert.equal(result.outcome.action, "code_change_started");
  assert.equal(result.outcome.workflowThreadId, "99999999-9999-4999-8999-999999999999");
  assert.equal(received?.chatSessionId, chatSession.id);
  assert.equal(received?.userStory.id, userStory.id);
  assert.equal(received?.spec.id, spec.id);
  assert.equal(received?.executionBrief, "Ajuste esse botão para ficar mais claro.");

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages.length, 2);
  assert.equal(
    messages[1].contextSnapshot.workflowThreadId,
    "99999999-9999-4999-8999-999999999999"
  );
});

test("SubmitHorusChatTurnUseCase rejects workspace context from another chat scope", async () => {
  const { chatSession, useCase } = await setup();

  await assert.rejects(
    () =>
      useCase.execute({
        chatSessionId: chatSession.id,
        message: "Explique este projeto.",
        workspaceFolderId: "22222222-2222-4222-8222-222222222222",
        userStoryId: userStory.id,
      }),
    HorusChatContextMismatchError
  );
});

test("SubmitHorusChatTurnUseCase rejects preview session without explicit project", async () => {
  const { chatSession, preview, useCase } = await setup();

  await assert.rejects(
    () =>
      useCase.execute({
        chatSessionId: chatSession.id,
        message: "Rode o projeto.",
        previewSessionId: preview.session.id,
      }),
    HorusChatContextMismatchError
  );
});

test("SubmitHorusChatTurnUseCase rejects preview sessions from another project", async () => {
  const { chatSession, preview, registry, useCase } = await setup();
  const otherProject = await registry.registerProject({
    name: "Other Web",
    rootPath: "apps/web",
    defaultRoute: "/",
    devCommand: "pnpm --filter @u-build/web dev",
    previewUrl: "http://localhost:5175",
  });

  await assert.rejects(
    () =>
      useCase.execute({
        chatSessionId: chatSession.id,
        message: "Rode o projeto.",
        previewSessionId: preview.session.id,
        projectId: otherProject.id,
      }),
    HorusChatContextMismatchError
  );
});
