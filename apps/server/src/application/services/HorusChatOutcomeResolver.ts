import type {
  ChatAgentContextBundle,
  FrontendProject,
  HorusChatIntent,
  HorusChatOutcome,
  HorusChatTurnInput,
  LlmSettings,
} from "@u-build/shared";
import { buildContextualClarificationMessage } from "./HorusOdinIntentRouter.js";
import { shouldLoadCodeContextForChatAnswer } from "./HorusChatCodeContextPolicy.js";
import {
  actionForAgentLoopOutcome,
  buildEvidenceSources,
  mapGroundingStatus,
  shouldExposeCodeContextEvidence,
} from "./HorusChatOutcomeBuilders.js";
import { buildHorusChatOutcomeBase as buildOutcomeBase } from "./HorusChatTurnMetadata.js";
import { throwIfHorusChatTurnAborted } from "./HorusChatTurnErrors.js";
import type {
  CodeContextReader,
  HorusChatResponder,
  PreviewRuntimeReader,
  SpecGenerationExecutor,
} from "./HorusChatTurnPorts.js";

export interface BuildHorusChatOutcomeInput {
  intent: HorusChatIntent;
  input: HorusChatTurnInput;
  context: ChatAgentContextBundle;
  project: FrontendProject | undefined;
  codeContextReader: CodeContextReader;
  previewRuntime: PreviewRuntimeReader;
  chatResponder: HorusChatResponder;
  specGenerationExecutor: SpecGenerationExecutor | undefined;
  sourceMessageId: string;
  llmSettings: LlmSettings | undefined;
  signal: AbortSignal | undefined;
}

export async function buildHorusChatOutcome({
  intent,
  input,
  context,
  project,
  codeContextReader,
  previewRuntime,
  chatResponder,
  specGenerationExecutor,
  sourceMessageId,
  llmSettings,
  signal,
}: BuildHorusChatOutcomeInput): Promise<HorusChatOutcome> {
  const base = buildOutcomeBase(input);
  throwIfHorusChatTurnAborted(signal);

  switch (intent.kind) {
    case "answer_question": {
      const codeContext = project && shouldLoadCodeContextForChatAnswer(input.message)
        ? await codeContextReader.buildContext({
            project,
            chatContext: context,
            query: input.message,
          })
        : undefined;

      throwIfHorusChatTurnAborted(signal);
      const summary = await chatResponder.answer({
        message: input.message,
        context,
        intentKind: intent.kind,
        ...(project ? { project } : {}),
        ...(codeContext ? { codeContext } : {}),
        ...(llmSettings ? { llmSettings } : {}),
        ...(signal ? { signal } : {}),
      });
      return {
        ...base,
        action: "answer",
        status: "completed",
        ...(codeContext ? { contextSources: codeContext.inspectedFiles } : {}),
        ...(codeContext ? { evidenceSources: buildEvidenceSources(codeContext) } : {}),
        ...(codeContext ? { groundingStatus: mapGroundingStatus(codeContext) } : {}),
        ...(codeContext ? { retrievalStatus: codeContext.retrievalStatus } : {}),
        ...(codeContext ? { retrievalNotes: codeContext.retrievalNotes } : {}),
        summary,
      };
    }
    case "code_change": {
      if (!project) {
        return {
          ...base,
          action: "error",
          status: "blocked",
          summary:
            "Escolha um projeto primeiro. Preciso saber em qual código mexer.",
        };
      }

      const codeContext = shouldLoadCodeContextForChatAnswer(input.message)
        ? await codeContextReader.buildContext({
            project,
            chatContext: context,
            query: input.message,
          })
        : undefined;
      const exposedCodeContext = shouldExposeCodeContextEvidence(intent, codeContext)
        ? codeContext
        : undefined;
      throwIfHorusChatTurnAborted(signal);
      const summary = await chatResponder.answer({
        message: input.message,
        context,
        intentKind: intent.kind,
        project,
        ...(codeContext ? { codeContext } : {}),
        ...(llmSettings ? { llmSettings } : {}),
        ...(signal ? { signal } : {}),
      });
      return {
        ...base,
        projectId: project.id,
        action: actionForAgentLoopOutcome(intent),
        status: "completed",
        ...(exposedCodeContext
          ? { contextSources: exposedCodeContext.inspectedFiles }
          : {}),
        ...(exposedCodeContext
          ? { evidenceSources: buildEvidenceSources(exposedCodeContext) }
          : {}),
        ...(exposedCodeContext
          ? { groundingStatus: mapGroundingStatus(exposedCodeContext) }
          : {}),
        ...(exposedCodeContext
          ? { retrievalStatus: exposedCodeContext.retrievalStatus }
          : {}),
        ...(exposedCodeContext
          ? { retrievalNotes: exposedCodeContext.retrievalNotes }
          : {}),
        summary,
      };
    }
    case "run_project": {
      if (!project) {
        return {
          ...base,
          action: "error",
          status: "blocked",
          summary:
            "Escolha um projeto primeiro para eu controlar o preview certo.",
        };
      }

      const lifecycleAction = intent.previewAction;
      if (!lifecycleAction) {
        return {
          ...base,
          action: "clarification_required",
          status: "blocked",
          summary:
            "Me diga o que fazer com o preview: iniciar, parar ou recarregar.",
        };
      }
      const activeSession = input.previewSessionId
        ? await previewRuntime.getSession(input.previewSessionId)
        : (
            await previewRuntime.createSession({
              projectId: project.id,
              route: project.defaultRoute,
              device: "pc",
            })
          ).session;

      throwIfHorusChatTurnAborted(signal);
      const result =
        lifecycleAction === "stop"
          ? await previewRuntime.stopSession(activeSession.id)
          : lifecycleAction === "reload"
          ? await previewRuntime.reloadSession(activeSession.id)
          : await previewRuntime.startSession(activeSession.id);

      const verb =
        lifecycleAction === "stop"
          ? "parou"
          : lifecycleAction === "reload"
          ? "recarregou"
          : "iniciou";
      const action =
        lifecycleAction === "stop"
          ? "project_execution_stopped"
          : lifecycleAction === "reload"
          ? "project_execution_reloaded"
          : "project_execution_started";

      return {
        ...base,
        previewSessionId: result.session.id,
        action,
        status: "completed",
        summary:
          `Preview ${verb}. Projeto: ${project.name}. Status: ${result.session.status}.`,
      };
    }
    case "generate_spec": {
      if (!specGenerationExecutor) {
        return {
          ...base,
          action: "error",
          status: "blocked",
          summary:
            "A geração de spec não está disponível neste ambiente agora.",
        };
      }

      const result = await specGenerationExecutor.startSpecGeneration({
        workspaceFolderId: context.session.workspaceFolderId,
        userStory: context.activeUserStory,
        chatSessionId: input.chatSessionId,
        sourceMessageId,
        executionBrief: input.message,
        ...(llmSettings ? { llmSettings } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        ...(signal ? { signal } : {}),
      });

      return {
        ...base,
        workflowThreadId: result.threadId,
        action: "spec_requested",
        status: "accepted",
        summary:
          "Spec em andamento. Vou estruturar requisitos, componentes, estados e critérios de validação para revisão.",
      };
    }
    case "unsupported":
      return {
        ...base,
        action: "error",
        status: "blocked",
        summary:
          "Isso não é uma ação permitida neste chat. Aqui eu consigo iniciar preview registrado, gerar spec ou executar alterações controladas no projeto selecionado.",
      };
    case "clarify":
      return {
        ...base,
        action: "clarification_required",
        status: "blocked",
        summary:
          buildContextualClarificationMessage({
            message: input.message,
            context,
            ...(llmSettings ? { llmSettings } : {}),
          }) ??
          "Preciso confirmar o alvo: você quer uma resposta, uma mudança no código, uma spec ou uma ação no preview?",
      };
  }
}
