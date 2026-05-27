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
import { HorusOdinIntentRouter } from "../dist/application/services/HorusOdinIntentRouter.js";
import { ReadOnlyCodeContextService } from "../dist/application/services/ReadOnlyCodeContextService.js";

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

function testIntentClassifier(overrides = {}) {
  const byMessage = new Map([
    [
      "Rode o projeto.",
      {
        kind: "run_project",
        mode: "executor",
        confidence: 0.9,
        rationale: "Test classifier selected controlled preview start.",
        previewAction: "start",
      },
    ],
    [
      "Pare o projeto.",
      {
        kind: "run_project",
        mode: "executor",
        confidence: 0.9,
        rationale: "Test classifier selected controlled preview stop.",
        previewAction: "stop",
      },
    ],
    [
      "Recarregue o projeto.",
      {
        kind: "run_project",
        mode: "executor",
        confidence: 0.9,
        rationale: "Test classifier selected controlled preview reload.",
        previewAction: "reload",
      },
    ],
    [
      "Execute pnpm install pelo terminal.",
      {
        kind: "unsupported",
        mode: "executor",
        confidence: 0.95,
        rationale: "Test classifier blocked arbitrary terminal execution.",
      },
    ],
    [
      "olá",
      {
        kind: "answer_question",
        mode: "chat",
        confidence: 0.95,
        rationale: "Test classifier selected chat for greeting.",
      },
    ],
    [
      "Explique rapidamente o contexto desta user story.",
      {
        kind: "answer_question",
        mode: "chat",
        confidence: 0.91,
        rationale: "Test classifier selected chat for explanation.",
      },
    ],
    [
      "Crie uma spec para esta user story.",
      {
        kind: "generate_spec",
        mode: "executor",
        confidence: 0.9,
        rationale: "Test classifier selected spec generation.",
      },
    ],
    [
      "Ajuste esse botão para ficar mais claro.",
      {
        kind: "code_change",
        mode: "executor",
        confidence: 0.9,
        rationale: "Test classifier selected code change.",
      },
    ],
  ]);

  for (const [message, intent] of Object.entries(overrides)) {
    byMessage.set(message, intent);
  }

  return {
    classify: async ({ message }) => {
      const intent = byMessage.get(message);
      if (!intent) {
        throw new Error(`No test intent configured for message: ${message}`);
      }
      return intent;
    },
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
    new HorusOdinIntentRouter(options.intentClassifier ?? testIntentClassifier()),
    new ReadOnlyCodeContextService(),
    chatResponder,
    options.chatCodeChangeExecutor,
    options.specGenerationExecutor
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

test("SubmitHorusChatTurnUseCase grounds code questions with file excerpts and evidence sources", async () => {
  let received;
  const { chatSession, folder, project, useCase } = await setup({
    intentClassifier: testIntentClassifier({
      "Mostre o trecho de src/App.tsx que renderiza User stories.": {
        kind: "answer_question",
        mode: "chat",
        confidence: 0.96,
        rationale: "Test classifier selected grounded code question.",
      },
    }),
    chatResponder: {
      answer: async (input) => {
        received = input;
        const excerpt = input.codeContext?.excerpts[0];
        return `O trecho está em ${excerpt?.filePath}:${excerpt?.startLine}-${excerpt?.endLine}.`;
      },
    },
  });

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Mostre o trecho de src/App.tsx que renderiza User stories.",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "answer_question");
  assert.equal(result.outcome.action, "answer");
  assert.equal(result.outcome.groundingStatus, "grounded");
  assert.equal(result.outcome.evidenceSources?.[0]?.type, "code_file");
  assert.equal(result.outcome.evidenceSources?.[0]?.path, "src/App.tsx");
  assert.match(result.outcome.evidenceSources?.[0]?.excerpt ?? "", /User stories/);
  assert.equal(received?.codeContext?.retrievalStatus, "matched");
  assert.equal(received?.codeContext?.excerpts[0]?.filePath, "src/App.tsx");
});

test("SubmitHorusChatTurnUseCase streams user persistence, text deltas, evidence and final response", async () => {
  const { chat, chatSession, folder, project, useCase } = await setup({
    intentClassifier: testIntentClassifier({
      "Mostre o trecho de src/App.tsx que renderiza User stories.": {
        kind: "answer_question",
        mode: "chat",
        confidence: 0.96,
        rationale: "Test classifier selected grounded code question.",
      },
    }),
    chatResponder: {
      answer: async () => "fallback answer",
      streamAnswer: async function* () {
        yield "O trecho";
        yield " está em src/App.tsx.";
      },
    },
  });

  const events = [];
  for await (const event of useCase.stream({
    chatSessionId: chatSession.id,
    message: "Mostre o trecho de src/App.tsx que renderiza User stories.",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  })) {
    events.push(event);
  }

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "turn_started",
      "user_message_persisted",
      "intent_classified",
      "assistant_message_started",
      "evidence_sources",
      "assistant_text_delta",
      "assistant_text_delta",
      "assistant_message_completed",
      "turn_completed",
    ]
  );
  assert.equal(
    events
      .filter((event) => event.type === "assistant_text_delta")
      .map((event) => event.delta)
      .join(""),
    "O trecho está em src/App.tsx."
  );
  assert.equal(events.find((event) => event.type === "evidence_sources")?.groundingStatus, "grounded");
  assert.equal(events.at(-1)?.response.outcome.summary, "O trecho está em src/App.tsx.");

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].body, "O trecho está em src/App.tsx.");
});

test("SubmitHorusChatTurnUseCase streams controlled preview action lifecycle", async () => {
  const { chatSession, folder, preview, project, previewRuntime, useCase } = await setup();

  const events = [];
  for await (const event of useCase.stream({
    chatSessionId: chatSession.id,
    message: "Rode o projeto.",
    previewSessionId: preview.session.id,
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  })) {
    events.push(event);
  }

  assert.ok(events.some((event) => event.type === "action_started"));
  assert.ok(events.some((event) => event.type === "action_updated"));
  const completed = events.find((event) => event.type === "turn_completed");
  assert.equal(completed?.response.outcome.action, "project_execution_started");
  assert.equal(completed?.response.outcome.previewSessionId, preview.session.id);
  assert.equal((await previewRuntime.getSession(preview.session.id)).status, "running");
});

test("SubmitHorusChatTurnUseCase only requests spec generation when the user explicitly asks for it", async () => {
  let received;
  const { chat, chatSession, folder, project, useCase } = await setup({
    specGenerationExecutor: {
      startSpecGeneration: async (input) => {
        received = input;
        return { threadId: "88888888-8888-4888-8888-888888888888" };
      },
    },
  });

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
  assert.equal(result.outcome.status, "accepted");
  assert.equal(result.outcome.workflowThreadId, "88888888-8888-4888-8888-888888888888");
  assert.doesNotMatch(result.outcome.summary, /Thread|modo executor/);
  assert.equal(received?.workspaceFolderId, folder.id);
  assert.equal(received?.userStory.id, userStory.id);
  assert.equal(received?.chatSessionId, chatSession.id);
  assert.equal(received?.sourceMessageId, result.userMessage.id);
  assert.equal(received?.executionBrief, "Crie uma spec para esta user story.");

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(
    messages[1].contextSnapshot.workflowThreadId,
    "88888888-8888-4888-8888-888888888888"
  );
});

test("SubmitHorusChatTurnUseCase starts chat code-change orchestration without SpecAgent", async () => {
  let received;
  const { chat, chatSession, folder, preview, project, useCase } = await setup({
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
    previewSessionId: preview.session.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "code_change");
  assert.equal(result.intent.mode, "executor");
  assert.equal(result.outcome.action, "code_change_started");
  assert.equal(result.outcome.workflowThreadId, "99999999-9999-4999-8999-999999999999");
  assert.doesNotMatch(result.outcome.summary, /Thread|modo executor|Front, QA/);
  assert.equal(received?.chatSessionId, chatSession.id);
  assert.equal(received?.userStory.id, userStory.id);
  assert.equal(received?.spec.id, spec.id);
  assert.equal(received?.project.id, project.id);
  assert.equal(received?.project.rootPath, project.rootPath);
  assert.equal(received?.previewSessionId, preview.session.id);
  assert.equal(received?.executionBrief, "Ajuste esse botão para ficar mais claro.");

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages.length, 2);
  assert.equal(
    messages[1].contextSnapshot.workflowThreadId,
    "99999999-9999-4999-8999-999999999999"
  );
  assert.equal(messages[1].contextSnapshot.previewSessionId, preview.session.id);
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
