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
  if (intent.kind === "code_change") return "Editando projeto";
  if (intent.kind === "generate_spec") return "Preparando spec";
  if (intent.kind === "clarify") return "Preciso confirmar algo";
  return "Não executável neste chat";
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
  return "Tive uma falha ao gerar a resposta agora. Sua mensagem ficou salva e o chat continua íntegro para retomar por ela.";
}

export function buildStreamFailureMessage(input: {
  stage: HorusChatFailureStage;
  contextMismatch?: boolean;
}): string {
  if (input.contextMismatch) {
    return "O projeto ou contexto mudou no meio da resposta. Confira a seleção atual e envie o pedido novamente.";
  }

  if (input.stage === "classifying_intent") {
    return "Fiquei em dúvida se você queria uma resposta ou uma alteração no código. Sua mensagem ficou salva; mande a ação com o arquivo ou objetivo principal.";
  }

  if (input.stage === "starting_action") {
    return "Não consegui iniciar a execução. Nada novo foi aplicado; sua mensagem ficou salva para uma nova tentativa.";
  }

  if (input.stage === "streaming_answer") {
    return "A resposta caiu no meio. Sua mensagem ficou salva e o histórico continua íntegro; posso retomar pelo mesmo pedido.";
  }

  if (input.stage === "saving_assistant_message") {
    return "Concluí a resposta, mas não consegui salvar no histórico. Recarregue a conversa.";
  }

  return "Não consegui concluir esse pedido agora. Sua mensagem ficou salva e o chat continua disponível.";
}
