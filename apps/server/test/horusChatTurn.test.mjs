import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { SubmitHorusChatTurnUseCase, HorusChatContextMismatchError } from "../dist/application/usecases/SubmitHorusChatTurnUseCase.js";
import { WorkflowEventSchema } from "../../../packages/shared/dist/index.js";
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
    ...(options.workflowThreadId
      ? { workflowThreadId: options.workflowThreadId }
      : {}),
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
    options.specGenerationExecutor,
    undefined,
    options.conversationMemory,
    options.workflowEventSink
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

test("HorusOdinIntentRouter routes imperative UI edits directly to code_change", async () => {
  let classifierCalled = false;
  const router = new HorusOdinIntentRouter({
    classify: async () => {
      classifierCalled = true;
      return {
        kind: "answer_question",
        mode: "chat",
        confidence: 0.9,
        rationale: "This should not be used for explicit UI edits.",
      };
    },
  });

  const intent = await router.classify({
    message: "Troque o texto do botão Home para Início.",
    context: {},
  });

  assert.equal(classifierCalled, false);
  assert.equal(intent.kind, "code_change");
  assert.equal(intent.mode, "executor");
});

test("HorusOdinIntentRouter keeps capability questions conversational", async () => {
  let classifierCalled = false;
  const router = new HorusOdinIntentRouter({
    classify: async () => {
      classifierCalled = true;
      return {
        kind: "answer_question",
        mode: "chat",
        confidence: 0.95,
        rationale: "Capability question should stay conversational.",
      };
    },
  });

  const intent = await router.classify({
    message: "Você consegue editar arquivos?",
    context: {},
  });

  assert.equal(classifierCalled, true);
  assert.equal(intent.kind, "answer_question");
  assert.equal(intent.mode, "chat");
});

test("SubmitHorusChatTurnUseCase sends bounded chat context with compact summary to responder", async () => {
  let receivedContext;
  const conversationMemory = {
    retrieveForPrompt: async () => ({
      summaries: [
        {
          id: "88888888-8888-4888-8888-888888888888",
          scope: {
            workspaceFolderId: null,
            userStoryId: null,
            projectId: null,
            chatSessionId: null,
            workflowThreadId: null,
            agentProfileId: "horus_chat",
          },
          summary: "Resumo: o usuário estava ajustando textos do projeto.",
          sourceRefs: [{ type: "chat_message", id: "message-1", label: "chat:1" }],
          sourceMessageSequenceMin: 1,
          sourceMessageSequenceMax: 10,
          createdAt: "2026-05-28T10:00:00.000Z",
          updatedAt: "2026-05-28T10:00:00.000Z",
        },
      ],
      memories: [],
    }),
    upsertConversationSummary: async () => null,
  };
  const { chat, chatSession, folder, project, useCase } = await setup({
    conversationMemory,
    chatResponder: {
      answer: async ({ context }) => {
        receivedContext = context;
        return "Resposta com contexto budgetado.";
      },
    },
  });
  for (let index = 0; index < 14; index += 1) {
    await chat.appendMessage(chatSession.id, {
      role: index % 2 === 0 ? "user" : "agent",
      body: `Mensagem muito antiga ${index + 1} ${"x".repeat(900)}`,
    });
  }

  await useCase.execute({
    chatSessionId: chatSession.id,
    message: "olá",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.ok(receivedContext);
  assert.equal(receivedContext.messages[0].role, "system");
  assert.ok(receivedContext.messages[0].body.includes("Resumo:"));
  assert.equal(
    receivedContext.messages.some((message) =>
      message.body.includes("Mensagem muito antiga 1 ")
    ),
    false
  );
  assert.ok(receivedContext.messages.length <= 9);
  assert.ok(
    receivedContext.messages.every((message) => Buffer.byteLength(message.body) < 900)
  );
});

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
  assert.equal(messages[0].sequence, 1);
  assert.equal(messages[1].sequence, 2);
  assert.equal(messages[0].eventType, "message");
  assert.equal(messages[1].visibility, "user");
  assert.equal(messages[1].deliveryStatus, "persisted");
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
  assert.ok(result.outcome.summary.includes("Sou o Horus"));
  assert.equal(
    result.outcome.summary.toLowerCase().includes("precisa de mais contexto"),
    false
  );
  assert.equal(received?.message, "olá");
  assert.equal(received?.project?.id, project.id);
});

test("SubmitHorusChatTurnUseCase answers edit capability questions through the chat responder", async () => {
  let responderCalled = false;
  const { chat, chatSession, folder, project, useCase } = await setup({
    intentClassifier: testIntentClassifier({
      "Você consegue editar arquivos?": {
        kind: "answer_question",
        mode: "chat",
        confidence: 0.95,
        rationale: "Capability question.",
      },
    }),
    chatResponder: {
      answer: async () => {
        responderCalled = true;
        return "Posso editar seus arquivos sim.";
      },
      streamAnswer: async function* () {
        responderCalled = true;
        yield "Posso editar ";
        yield "seus arquivos sim.";
      },
    },
  });

  const events = [];
  for await (const event of useCase.stream({
    chatSessionId: chatSession.id,
    message: "Você consegue editar arquivos?",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  })) {
    events.push(event);
  }

  assert.equal(responderCalled, true);
  assert.ok(events.some((event) => event.type === "assistant_text_delta"));
  assert.equal(events.at(-1).type, "turn_completed");

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages[1].role, "agent");
  assert.ok(messages[1].body.includes("editar seus arquivos"));
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
  assert.ok((result.outcome.evidenceSources?.[0]?.excerpt ?? "").includes("User stories"));
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
  assert.equal(messages[1].metadata.horusChat.turnStatus, "completed");
  assert.equal(messages[1].metadata.horusChat.groundingStatus, "grounded");
  assert.equal(messages[1].metadata.horusChat.evidenceSources[0].path, "src/App.tsx");
  assert.deepEqual(messages[1].metadata.horusChat.suggestedActions, [
    {
      type: "open_file",
      label: "abrir src/App.tsx",
      filePath: "src/App.tsx",
    },
  ]);
  assert.deepEqual(
    (await chat.listMessages(chatSession.id, { afterSequence: 1 })).map(
      (message) => message.sequence
    ),
    [2]
  );
});

test("SubmitHorusChatTurnUseCase treats 'abra' as the previous offered file action", async () => {
  let received;
  const { chat, chatSession, folder, preview, project, useCase } = await setup({
    saveSpec: true,
    chatResponder: {
      answer: async (input) => {
        received = input;
        return "Abri src/App.tsx e este é o trecho final atual.";
      },
    },
  });
  await chat.appendMessage(chatSession.id, {
    role: "agent",
    body: [
      "Se quiser, eu posso:",
      "- abrir o arquivo App.tsx e mostrar o trecho final atual para revisão;",
      "Arquivos alterados",
      "- src/App.tsx — removi JSX duplicado.",
    ].join("\n"),
    projectId: project.id,
    previewSessionId: preview.session.id,
  });

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "abra",
    projectId: project.id,
    previewSessionId: preview.session.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "answer_question");
  assert.equal(result.outcome.action, "answer");
  assert.ok(received?.message.includes("src/App.tsx"));
  assert.ok(received?.codeContext, "expected code context for the resolved file request");

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages.at(-2)?.body, "abra");
  assert.equal(
    messages.at(-1)?.body,
    "Abri src/App.tsx e este é o trecho final atual."
  );
  assert.equal(
    messages.at(-1)?.metadata.horusChat.suggestedActions[0].filePath,
    "src/App.tsx"
  );
});

test("SubmitHorusChatTurnUseCase asks contextual clarification for ambiguous short follow-up", async () => {
  const { chat, chatSession, folder, preview, project, useCase } = await setup({
    saveSpec: true,
  });
  await chat.appendMessage(chatSession.id, {
    role: "agent",
    body: "Se quiser, eu posso abrir o arquivo src/App.tsx para revisão ou rodar o servidor de desenvolvimento para testar manualmente.",
    projectId: project.id,
    previewSessionId: preview.session.id,
  });

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "sim",
    projectId: project.id,
    previewSessionId: preview.session.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "clarify");
  assert.equal(result.outcome.action, "clarification_required");
  assert.ok(result.outcome.summary.includes("abrir src/App.tsx"));
  assert.ok(result.outcome.summary.includes("iniciar o preview registrado"));
  assert.equal(
    result.outcome.summary.includes("resposta, uma mudança no código"),
    false
  );
});

test("SubmitHorusChatTurnUseCase falls back to non-stream answer when provider stream is empty", async () => {
  const { chat, chatSession, folder, project, useCase } = await setup({
    chatResponder: {
      answer: async () => "Resposta recuperada pelo fallback sem stream.",
      streamAnswer: async function* () {},
    },
  });

  const events = [];
  for await (const event of useCase.stream({
    chatSessionId: chatSession.id,
    message: "olá",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  })) {
    events.push(event);
  }

  const deltas = events
    .filter((event) => event.type === "assistant_text_delta")
    .map((event) => event.delta)
    .join("");

  assert.equal(deltas, "Resposta recuperada pelo fallback sem stream.");
  assert.equal(events.at(-1)?.response.outcome.summary, deltas);

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages.at(-1)?.body, deltas);
  assert.equal(messages.at(-1)?.metadata.horusChat.turnStatus, "completed");
});

test("SubmitHorusChatTurnUseCase does not attach code retrieval to direct conversational replies", async () => {
  const { chatSession, folder, project, useCase } = await setup({
    intentClassifier: testIntentClassifier({
      "diga exatamente: ok horus vivo": {
        kind: "answer_question",
        mode: "chat",
        confidence: 0.96,
        rationale: "Test classifier selected direct chat answer.",
      },
    }),
    chatResponder: {
      answer: async () => "ok horus vivo",
      streamAnswer: async function* () {
        yield "ok horus vivo";
      },
    },
  });

  const events = [];
  for await (const event of useCase.stream({
    chatSessionId: chatSession.id,
    message: "diga exatamente: ok horus vivo",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  })) {
    events.push(event);
  }

  assert.equal(
    events.some((event) => event.type === "evidence_sources"),
    false
  );
  const completed = events.at(-1)?.response;
  assert.equal(completed.outcome.summary, "ok horus vivo");
  assert.equal(completed.outcome.contextSources, undefined);
  assert.equal(completed.outcome.evidenceSources, undefined);
  assert.equal(completed.outcome.retrievalStatus, undefined);
});

test("SubmitHorusChatTurnUseCase replays duplicate idempotent chat actions without re-running the agent loop", async () => {
  let answerCount = 0;
  const { chat, chatSession, folder, preview, project, useCase } = await setup({
    saveSpec: true,
    chatResponder: {
      answer: async () => {
        answerCount += 1;
        return "Apliquei a alteração no projeto e validei.";
      },
    },
  });
  const input = {
    chatSessionId: chatSession.id,
    message: "Ajuste esse botão para ficar mais claro.",
    projectId: project.id,
    previewSessionId: preview.session.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
    idempotencyKey: "chat:turn:test-duplicate",
  };

  const first = await useCase.execute(input);
  const second = await useCase.execute(input);

  assert.equal(answerCount, 1);
  assert.equal(first.intent.kind, "code_change");
  assert.equal(first.outcome.action, "code_change_completed");
  assert.equal(second.userMessage.id, first.userMessage.id);
  assert.equal(second.assistantMessage?.id, first.assistantMessage?.id);
  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages.length, 2);
  assert.deepEqual(
    messages.map((message) => message.metadata.horusChat.idempotencyKey),
    ["chat:turn:test-duplicate", "chat:turn:test-duplicate"]
  );
});

test("SubmitHorusChatTurnUseCase persists cancelled stream turns as visible terminal messages", async () => {
  const { chat, chatSession, folder, project, useCase } = await setup({
    intentClassifier: testIntentClassifier({
      "Explique devagar.": {
        kind: "answer_question",
        mode: "chat",
        confidence: 0.96,
        rationale: "Test classifier selected chat answer.",
      },
    }),
  });
  const controller = new AbortController();
  const input = {
    chatSessionId: chatSession.id,
    message: "Explique devagar.",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
    idempotencyKey: "chat:turn:test-cancel",
  };

  const events = [];
  for await (const event of useCase.stream(
    input,
    { signal: controller.signal }
  )) {
    events.push(event);
    if (event.type === "user_message_persisted") {
      controller.abort();
    }
  }

  assert.deepEqual(
    events.map((event) => event.type),
    ["turn_started", "user_message_persisted", "turn_cancelled"]
  );
  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].role, "agent");
  assert.equal(messages[1].metadata.horusChat.turnStatus, "cancelled");
  assert.equal(messages[1].metadata.horusChat.retryable, true);

  const replayEvents = [];
  for await (const event of useCase.stream(input)) {
    replayEvents.push(event);
  }
  const messagesAfterReplay = await chat.listMessages(chatSession.id);
  assert.equal(messagesAfterReplay.length, 2);
  assert.deepEqual(
    replayEvents.map((event) => event.type),
    [
      "turn_started",
      "user_message_persisted",
      "intent_classified",
      "assistant_message_completed",
      "turn_completed",
    ]
  );
  assert.equal(replayEvents[replayEvents.length - 1].response.outcome.status, "failed");
});

test("SubmitHorusChatTurnUseCase persists visible assistant failure when stream breaks after user save", async () => {
  const { chat, chatSession, folder, project, useCase } = await setup({
    intentClassifier: {
      classify: async () => {
        throw new Error("Intent classifier unavailable");
      },
    },
  });

  const events = [];
  for await (const event of useCase.stream({
    chatSessionId: chatSession.id,
    message: "Me dê um resumo do projeto.",
    projectId: project.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  })) {
    events.push(event);
  }

  assert.deepEqual(
    events.map((event) => event.type),
    ["turn_started", "user_message_persisted", "turn_failed"]
  );
  const failed = events.at(-1);
  assert.equal(failed.type, "turn_failed");
  assert.ok(failed.message.includes("Não ficou claro"));

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].body, "Me dê um resumo do projeto.");
  assert.equal(messages[1].role, "agent");
  assert.ok(messages[1].body.includes("Não ficou claro"));
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
  assert.equal(result.outcome.summary.includes("Thread"), false);
  assert.equal(result.outcome.summary.includes("modo executor"), false);
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

test("SubmitHorusChatTurnUseCase runs chat code-change through the agent loop responder", async () => {
  let received;
  const { chat, chatSession, folder, preview, project, useCase } = await setup({
    saveSpec: true,
    chatResponder: {
      answer: async (input) => {
        received = input;
        return "Editei o botão e validei a alteração no projeto.";
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
  assert.equal(result.outcome.action, "code_change_completed");
  assert.equal(result.outcome.status, "completed");
  assert.equal(result.outcome.projectId, project.id);
  assert.equal(result.outcome.summary, "Editei o botão e validei a alteração no projeto.");
  assert.equal(result.outcome.contextSources, undefined);
  assert.equal(result.outcome.evidenceSources, undefined);
  assert.equal(result.outcome.retrievalStatus, undefined);
  // The agent loop receives the selected project so it can drive the audited tools.
  assert.equal(received?.project?.id, project.id);
  assert.equal(received?.message, "Ajuste esse botão para ficar mais claro.");

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].body, "Editei o botão e validei a alteração no projeto.");
});

test("SubmitHorusChatTurnUseCase streams code-change completion without retrieval noise", async () => {
  const { chat, chatSession, folder, preview, project, useCase } = await setup({
    saveSpec: true,
    chatResponder: {
      streamAgent: async function* () {
        yield { type: "tool_started", tool: "read_file", title: "Lendo arquivo: src/App.tsx" };
        yield { type: "tool_succeeded", tool: "read_file", title: "Lendo arquivo: src/App.tsx" };
        yield { type: "text", text: "Editei e validei." };
      },
      answer: async () => "fallback",
    },
  });

  const events = [];
  for await (const event of useCase.stream({
    chatSessionId: chatSession.id,
    message: "Ajuste esse botão para ficar mais claro.",
    projectId: project.id,
    previewSessionId: preview.session.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  })) {
    events.push(event);
  }

  assert.equal(
    events.some((event) => event.type === "evidence_sources"),
    false
  );
  const completed = events.find((event) => event.type === "turn_completed");
  assert.equal(completed?.response.outcome.action, "code_change_completed");
  assert.equal(completed?.response.outcome.evidenceSources, undefined);
  assert.equal(completed?.response.outcome.retrievalStatus, undefined);
  assert.deepEqual(
    completed?.response.outcome.toolSteps?.map((step) => [
      step.tool,
      step.phase,
    ]),
    [["read_file", "succeeded"]]
  );

  const messages = await chat.listMessages(chatSession.id);
  const assistantMetadata = messages[1].metadata.horusChat;
  assert.deepEqual(
    assistantMetadata.outcome.toolSteps.map((step) => [step.tool, step.phase]),
    [["read_file", "succeeded"]]
  );
});

test("SubmitHorusChatTurnUseCase persists chat tool steps as workflow telemetry", async () => {
  const workflowEvents = [];
  const { chat, chatSession, folder, preview, project, useCase } = await setup({
    saveSpec: true,
    workflowEventSink: {
      emit: (event) => workflowEvents.push(event),
    },
    chatResponder: {
      streamAgent: async function* () {
        yield {
          type: "tool_started",
          tool: "run_command",
          title: "Executando comando: build",
          commandIds: ["build-root-build"],
          taskId: "build-task-1",
        };
        yield {
          type: "tool_started",
          tool: "run_command",
          title: "Executando comando: build",
          detail: "vite build completed\n",
          commandIds: ["build-root-build"],
          taskId: "build-task-1",
        };
        yield {
          type: "tool_succeeded",
          tool: "run_command",
          title: "Executando comando: build",
          commandIds: ["build-root-build"],
          taskId: "build-task-1",
        };
        yield { type: "text", text: "Build validado." };
      },
      answer: async () => "fallback",
    },
  });

  const events = [];
  for await (const event of useCase.stream({
    chatSessionId: chatSession.id,
    message: "Ajuste esse botão para ficar mais claro.",
    projectId: project.id,
    previewSessionId: preview.session.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  })) {
    events.push(event);
  }

  assert.equal(
    events.filter((event) => event.type === "assistant_tool_step").length,
    3
  );
  const completed = events.find((event) => event.type === "turn_completed");
  const workflowThreadId = completed?.response.outcome.workflowThreadId;
  assert.equal(typeof workflowThreadId, "string");
  assert.equal(completed?.response.outcome.codingTaskId, undefined);
  assert.deepEqual(
    workflowEvents.map((event) => event.type),
    ["tool_call_started", "command_output", "tool_call_finished"]
  );
  assert.equal(workflowEvents[0].threadId, workflowThreadId);
  assert.equal(workflowEvents[0].agentProfileId, "horus_chat_executor");
  assert.equal(workflowEvents[0].toolName, "run_command");
  assert.equal(WorkflowEventSchema.parse(workflowEvents[0]).taskId, "build-task-1");
  assert.equal(workflowEvents[1].chunk, "vite build completed\n");
  assert.equal(workflowEvents[1].commandId, "build-root-build");
  assert.equal(workflowEvents[2].status, "succeeded");
  assert.equal(workflowEvents[2].commandIds[0], "build-root-build");

  const messages = await chat.listMessages(chatSession.id);
  assert.equal(messages[1].contextSnapshot.workflowThreadId, workflowThreadId);
});

test("SubmitHorusChatTurnUseCase does not answer code-change with a canned reply; it runs the loop with the project", async () => {
  let received;
  const { chatSession, folder, preview, project, useCase } = await setup({
    saveSpec: true,
    intentClassifier: {
      classify: async () => ({
        kind: "code_change",
        mode: "executor",
        confidence: 0.9,
        rationale: "Explicit text replacement should be classified as code_change.",
      }),
    },
    chatResponder: {
      answer: async (input) => {
        received = input;
        return "Troquei o texto do botão para Início.";
      },
    },
  });

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Troque o texto do botão Home para Início.",
    projectId: project.id,
    previewSessionId: preview.session.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "code_change");
  assert.equal(result.intent.mode, "executor");
  assert.equal(result.outcome.action, "code_change_completed");
  assert.equal(received?.project?.id, project.id);
  assert.equal(received?.message, "Troque o texto do botão Home para Início.");
});

test("SubmitHorusChatTurnUseCase resolves chat edits as agent-loop answers, not coding-task runtime outcomes", async () => {
  const { chatSession, folder, preview, project, useCase } = await setup({
    chatResponder: {
      answer: async () => "Apliquei a edição via loop agêntico.",
    },
  });

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Ajuste esse botão para ficar mais claro.",
    projectId: project.id,
    previewSessionId: preview.session.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
    idempotencyKey: "chat:turn:coding-runtime",
  });

  assert.equal(result.intent.kind, "code_change");
  assert.equal(result.outcome.action, "code_change_completed");
  assert.equal(result.outcome.codingTaskId, undefined);
  assert.equal(result.outcome.workflowThreadId, undefined);
});

test("SubmitHorusChatTurnUseCase resolves natural code-change requests as agent-loop answers, not workflow threads", async () => {
  const { chatSession, folder, preview, project, useCase } = await setup({
    saveSpec: true,
    chatResponder: {
      answer: async () => "Editei o projeto direto pelo loop agêntico.",
    },
    intentClassifier: testIntentClassifier({
      "Deixe o painel mais humano e ajuste o React real.": {
        kind: "code_change",
        mode: "executor",
        confidence: 0.95,
        rationale: "Natural code-change request.",
      },
    }),
  });

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Deixe o painel mais humano e ajuste o React real.",
    projectId: project.id,
    previewSessionId: preview.session.id,
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
  });

  assert.equal(result.intent.kind, "code_change");
  assert.equal(result.outcome.action, "code_change_completed");
  assert.equal(result.outcome.workflowThreadId, undefined);
  assert.equal(result.outcome.codingTaskId, undefined);
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

test("SubmitHorusChatTurnUseCase allows preview project workspace ids that differ from story folders", async () => {
  const { chatSession, folder, registry, useCase } = await setup();
  const otherProject = await registry.registerProject({
    name: "Generated Preview Web",
    rootPath: "apps/web",
    defaultRoute: "/",
    devCommand: "pnpm --filter @u-build/web dev",
    previewUrl: "http://localhost:5176",
    projectWorkspaceId: "33333333-3333-4333-8333-333333333333",
  });

  const result = await useCase.execute({
    chatSessionId: chatSession.id,
    message: "Explique rapidamente o contexto desta user story.",
    workspaceFolderId: folder.id,
    userStoryId: userStory.id,
    projectId: otherProject.id,
  });

  assert.equal(result.intent.kind, "answer_question");
  assert.equal(result.outcome.action, "answer");
});
