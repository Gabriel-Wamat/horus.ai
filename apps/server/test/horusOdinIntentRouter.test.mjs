import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContextualClarificationMessage,
  HorusOdinIntentRouter,
  resolveContextualFollowUpMessage,
} from "../dist/application/services/HorusOdinIntentRouter.js";

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

test("HorusOdinIntentRouter resolves short open follow-ups from recent assistant offers", async () => {
  const router = new HorusOdinIntentRouter({
    classify: async () => {
      throw new Error("Classifier should not be needed for contextual open follow-up.");
    },
  });
  const contextWithOffer = {
    ...context,
    messages: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        sessionId: context.session.id,
        sequence: 1,
        role: "agent",
        eventType: "message",
        visibility: "user",
        deliveryStatus: "persisted",
        body: "Se quiser, eu posso abrir o arquivo App.tsx e mostrar o trecho final atual. Arquivos alterados: src/App.tsx.",
        contextSnapshot: {
          workspaceFolderId: context.session.workspaceFolderId,
          userStoryId: context.session.userStoryId,
        },
        metadata: {},
        createdAt: "2026-05-26T10:01:00.000Z",
      },
    ],
  };

  const result = await router.classify({
    message: "abra",
    context: contextWithOffer,
  });
  const resolved = resolveContextualFollowUpMessage({
    message: "abra",
    context: contextWithOffer,
  });

  assert.equal(result.kind, "answer_question");
  assert.equal(result.mode, "chat");
  assert.ok(result.rationale.includes("src/App.tsx"));
  assert.equal(
    resolved,
    "Abra o arquivo src/App.tsx e mostre o trecho relevante atual para revisão."
  );
});

test("HorusOdinIntentRouter prefers structured suggested actions over text scraping", async () => {
  const router = new HorusOdinIntentRouter({
    classify: async () => {
      throw new Error("Classifier should not be needed for structured suggested actions.");
    },
  });
  const contextWithStructuredAction = {
    ...context,
    messages: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        sessionId: context.session.id,
        sequence: 1,
        role: "agent",
        eventType: "message",
        visibility: "user",
        deliveryStatus: "persisted",
        body: "Concluído. Posso mostrar o resultado.",
        contextSnapshot: {
          workspaceFolderId: context.session.workspaceFolderId,
          userStoryId: context.session.userStoryId,
        },
        metadata: {
          horusChat: {
            suggestedActions: [
              {
                type: "open_file",
                label: "abrir src/App.tsx",
                filePath: "src/App.tsx",
              },
            ],
          },
        },
        createdAt: "2026-05-26T10:01:30.000Z",
      },
    ],
  };

  const result = await router.classify({
    message: "abra",
    context: contextWithStructuredAction,
  });
  const resolved = resolveContextualFollowUpMessage({
    message: "abra",
    context: contextWithStructuredAction,
  });

  assert.equal(result.kind, "answer_question");
  assert.ok(result.rationale.includes("src/App.tsx"));
  assert.equal(
    resolved,
    "Abra o arquivo src/App.tsx e mostre o trecho relevante atual para revisão."
  );
});

test("HorusOdinIntentRouter asks a contextual question when short follow-up has multiple options", async () => {
  const router = new HorusOdinIntentRouter({
    classify: async () => {
      throw new Error("Classifier should not be needed for contextual ambiguous follow-up.");
    },
  });
  const contextWithOffer = {
    ...context,
    messages: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        sessionId: context.session.id,
        sequence: 1,
        role: "agent",
        eventType: "message",
        visibility: "user",
        deliveryStatus: "persisted",
        body: "Se quiser, eu posso abrir o arquivo src/App.tsx para revisão ou rodar o servidor de desenvolvimento para testar manualmente.",
        contextSnapshot: {
          workspaceFolderId: context.session.workspaceFolderId,
          userStoryId: context.session.userStoryId,
        },
        metadata: {},
        createdAt: "2026-05-26T10:02:00.000Z",
      },
    ],
  };

  const result = await router.classify({
    message: "sim",
    context: contextWithOffer,
  });
  const clarification = buildContextualClarificationMessage({
    message: "sim",
    context: contextWithOffer,
  });

  assert.equal(result.kind, "clarify");
  assert.equal(result.mode, "chat");
  assert.ok((clarification ?? "").includes("abrir src/App.tsx"));
  assert.ok((clarification ?? "").includes("iniciar o preview registrado"));
});

test("HorusOdinIntentRouter recognizes 10 everyday code-edit requests without waiting for LLM classification", async () => {
  const router = new HorusOdinIntentRouter({
    classify: async () => {
      throw new Error("Classifier should not be needed for explicit code edits.");
    },
  });

  const cases = [
    "Troque o texto do botão Home para Início.",
    "Mude a cor do header para verde.",
    "Aumente o espaçamento entre os cards.",
    "Remova o card de estatísticas da tela inicial.",
    "Adicione um campo de busca na lista.",
    "Renomeie o label Nome para Cliente.",
    "Corrija o import quebrado do componente UserMenu.",
    "Inclua estado de loading no botão salvar.",
    "Deixe o layout responsivo no mobile.",
    "Conecte o botão de enviar à função handleSubmit.",
  ];

  for (const message of cases) {
    const result = await router.classify({
      message,
      context,
    });

    assert.equal(result.kind, "code_change", message);
    assert.equal(result.mode, "executor", message);
    assert.equal(result.previewAction, undefined, message);
  }
});

test("HorusOdinIntentRouter rejects malformed classifier output through the shared schema", async () => {
  const router = routerReturning({
    kind: "run_project",
    mode: "executor",
    confidence: 2,
    rationale: "Invalid confidence should fail contract validation.",
    previewAction: "start",
  });

  try {
    await router.classify({
      message: "Status do projeto.",
      context,
    });
    assert.fail("Expected classifier output validation to fail.");
  } catch (error) {
    assert.ok(String(error).includes("Number must be less than or equal to 1"));
  }
});
