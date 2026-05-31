import assert from "node:assert/strict";
import test from "node:test";
import {
  actionForAgentLoopOutcome,
  actionForIntent,
  buildEvidenceSources,
  buildResponderFailureFallback,
  buildStreamFailureMessage,
  labelForIntent,
  mapGroundingStatus,
  shouldExposeCodeContextEvidence,
} from "../dist/application/services/HorusChatOutcomeBuilders.js";

function codeContext(overrides = {}) {
  return {
    inspectedFiles: ["src/App.tsx"],
    excerpts: [
      {
        filePath: "src/App.tsx",
        startLine: 10,
        endLine: 14,
        content: "function App() { return null; }",
      },
    ],
    retrievalStatus: "matched",
    retrievalNotes: ["found direct component match"],
    ...overrides,
  };
}

test("HorusChatOutcomeBuilders maps intents to stable actions and labels", () => {
  assert.equal(
    actionForIntent({
      kind: "run_project",
      mode: "preview",
      confidence: 1,
      previewAction: "reload",
      rationale: "Reload requested.",
    }),
    "project_execution_reloaded"
  );
  assert.equal(
    labelForIntent({
      kind: "run_project",
      mode: "preview",
      confidence: 1,
      previewAction: "reload",
      rationale: "Reload requested.",
    }),
    "Recarregando preview"
  );
  assert.equal(
    actionForIntent({
      kind: "generate_spec",
      mode: "chat",
      confidence: 1,
      rationale: "Spec requested.",
    }),
    "spec_requested"
  );
  assert.equal(
    labelForIntent({
      kind: "unsupported",
      mode: "chat",
      confidence: 1,
      rationale: "Unsupported command.",
    }),
    "Não posso executar isso"
  );
});

test("HorusChatOutcomeBuilders hides duplicate code evidence for code changes", () => {
  const context = codeContext();

  assert.equal(
    shouldExposeCodeContextEvidence(
      {
        kind: "code_change",
        mode: "chat",
        confidence: 1,
        rationale: "Edit request.",
      },
      context
    ),
    false
  );
  assert.equal(
    shouldExposeCodeContextEvidence(
      {
        kind: "answer_question",
        mode: "chat",
        confidence: 1,
        rationale: "Question.",
      },
      context
    ),
    true
  );
  assert.equal(
    actionForAgentLoopOutcome({
      kind: "code_change",
    }),
    "code_change_completed"
  );
});

test("HorusChatOutcomeBuilders builds grounding evidence from code context", () => {
  const matched = codeContext();
  const partial = codeContext({ retrievalStatus: "partial" });
  const unmatched = codeContext({ retrievalStatus: "unmatched" });

  assert.deepEqual(buildEvidenceSources(matched), [
    {
      type: "code_file",
      label: "src/App.tsx:10-14",
      path: "src/App.tsx",
      startLine: 10,
      endLine: 14,
      excerpt: "function App() { return null; }",
      confidence: "high",
    },
  ]);
  assert.equal(mapGroundingStatus(matched), "grounded");
  assert.equal(buildEvidenceSources(partial)[0]?.confidence, "medium");
  assert.equal(mapGroundingStatus(partial), "partial");
  assert.equal(buildEvidenceSources(unmatched)[0]?.confidence, "low");
  assert.equal(mapGroundingStatus(unmatched), "ungrounded");
});

test("HorusChatOutcomeBuilders centralizes terminal failure copy", () => {
  assert.equal(
    buildResponderFailureFallback(),
    "Não consegui gerar a resposta pelo modelo agora. Sua mensagem ficou salva e o chat continua disponível."
  );
  assert.equal(
    buildStreamFailureMessage({
      stage: "classifying_intent",
    }),
    "Não ficou claro se isso era pergunta ou mudança no código. Sua mensagem ficou salva; tente mandar de novo de forma mais direta."
  );
  assert.equal(
    buildStreamFailureMessage({
      stage: "streaming_answer",
    }),
    "Comecei a responder, mas a geração falhou. Sua mensagem ficou salva; tente de novo."
  );
  assert.equal(
    buildStreamFailureMessage({
      stage: "loading_context",
      contextMismatch: true,
    }),
    "O contexto mudou no meio da resposta. Confira o projeto selecionado e tente de novo."
  );
});
