import type {
  CodeContextBundle,
  HorusChatEvidenceSource,
  HorusChatIntent,
  HorusChatOutcome,
} from "@u-build/shared";

export type HorusChatFailureStage =
  | "validating_input"
  | "loading_context"
  | "checking_scope"
  | "resolving_llm"
  | "saving_user_message"
  | "classifying_intent"
  | "building_outcome"
  | "loading_code_context"
  | "streaming_answer"
  | "starting_action"
  | "saving_assistant_message";

export function actionForIntent(
  intent: HorusChatIntent
): HorusChatOutcome["action"] {
  if (intent.kind === "run_project") {
    if (intent.previewAction === "stop") return "project_execution_stopped";
    if (intent.previewAction === "reload") return "project_execution_reloaded";
    return "project_execution_started";
  }
  if (intent.kind === "code_change") return "code_change_started";
  if (intent.kind === "generate_spec") return "spec_requested";
  if (intent.kind === "clarify") return "clarification_required";
  return "error";
}

export function actionForAgentLoopOutcome(
  intent: Pick<HorusChatIntent, "kind">
): HorusChatOutcome["action"] {
  return intent.kind === "code_change" ? "code_change_completed" : "answer";
}

export function shouldExposeCodeContextEvidence(
  intent: Pick<HorusChatIntent, "kind">,
  codeContext: CodeContextBundle | undefined
): codeContext is CodeContextBundle {
  if (!codeContext) return false;
  if (intent.kind === "code_change") return false;
  return true;
}

export function labelForIntent(intent: HorusChatIntent): string {
  if (intent.kind === "run_project") {
    if (intent.previewAction === "stop") return "Parando preview";
    if (intent.previewAction === "reload") return "Recarregando preview";
    return "Iniciando preview";
  }
  if (intent.kind === "code_change") return "Vou mexer nisso";
  if (intent.kind === "generate_spec") return "Vou preparar a spec";
  if (intent.kind === "clarify") return "Preciso de um detalhe";
  return "Não posso executar isso";
}

export function buildEvidenceSources(
  codeContext: CodeContextBundle
): HorusChatEvidenceSource[] {
  return codeContext.excerpts.map((excerpt) => ({
    type: "code_file",
    label: `${excerpt.filePath}:${excerpt.startLine}-${excerpt.endLine}`,
    path: excerpt.filePath,
    startLine: excerpt.startLine,
    endLine: excerpt.endLine,
    excerpt: excerpt.content,
    confidence:
      codeContext.retrievalStatus === "matched"
        ? "high"
        : codeContext.retrievalStatus === "partial"
          ? "medium"
          : "low",
  }));
}

export function mapGroundingStatus(
  codeContext: CodeContextBundle
): "grounded" | "partial" | "ungrounded" {
  if (codeContext.retrievalStatus === "matched") return "grounded";
  if (codeContext.retrievalStatus === "partial") return "partial";
  return "ungrounded";
}

export function buildResponderFailureFallback(): string {
  return "Não consegui gerar a resposta pelo modelo agora. Sua mensagem ficou salva e o chat continua disponível.";
}

export function buildStreamFailureMessage(input: {
  stage: HorusChatFailureStage;
  contextMismatch?: boolean;
}): string {
  if (input.contextMismatch) {
    return "O contexto mudou no meio da resposta. Confira o projeto selecionado e tente de novo.";
  }

  if (input.stage === "classifying_intent") {
    return "Não ficou claro se isso era pergunta ou mudança no código. Sua mensagem ficou salva; tente mandar de novo de forma mais direta.";
  }

  if (input.stage === "starting_action") {
    return "Não consegui iniciar a execução. Sua mensagem ficou salva; tente de novo.";
  }

  if (input.stage === "streaming_answer") {
    return "Comecei a responder, mas a geração falhou. Sua mensagem ficou salva; tente de novo.";
  }

  if (input.stage === "saving_assistant_message") {
    return "Concluí a resposta, mas não consegui salvar no histórico. Recarregue a conversa.";
  }

  return "Não consegui concluir esse pedido. Sua mensagem ficou salva; tente de novo.";
}
