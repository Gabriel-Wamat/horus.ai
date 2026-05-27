import type {
  ChatAgentContextBundle,
  CodeContextBundle,
  FrontendProject,
  HorusChatEvidenceSource,
  HorusChatIntent,
  HorusChatOutcome,
  HorusChatStreamEvent,
  HorusChatTurnInput,
  HorusChatTurnResponse,
  LlmSettings,
  LlmSettingsReference,
  PreviewSession,
  Spec,
  UserStory,
  WorkspaceArtifactContext,
} from "@u-build/shared";
import {
  HorusChatStreamEventSchema,
  HorusChatTurnInputSchema,
  HorusChatTurnResponseSchema,
} from "@u-build/shared";
import { v4 as uuidv4 } from "uuid";
import type { ChatMemoryRepository } from "../../infrastructure/repositories/contracts.js";
import { HorusOdinIntentRouter } from "../services/HorusOdinIntentRouter.js";

export interface PreviewRuntimeReader {
  listProjects(): Promise<FrontendProject[]>;
  getSession(sessionId: string): Promise<PreviewSession>;
  createSession(input: {
    projectId: string;
    route?: string;
    device?: "pc" | "phone" | "tablet";
  }): Promise<{ session: PreviewSession }>;
  startSession(sessionId: string): Promise<{ session: PreviewSession }>;
  stopSession(sessionId: string): Promise<{ session: PreviewSession }>;
  reloadSession(sessionId: string): Promise<{ session: PreviewSession }>;
}

export interface CodeContextReader {
  buildContext(input: {
    project: FrontendProject;
    chatContext: ChatAgentContextBundle;
    query: string;
  }): Promise<CodeContextBundle>;
}

export interface HorusChatResponder {
  answer(input: {
    message: string;
    context: ChatAgentContextBundle;
    project?: FrontendProject;
    codeContext?: CodeContextBundle;
    llmSettings?: LlmSettings;
  }): Promise<string>;
  streamAnswer?(input: {
    message: string;
    context: ChatAgentContextBundle;
    project?: FrontendProject;
    codeContext?: CodeContextBundle;
    llmSettings?: LlmSettings;
  }): AsyncIterable<string>;
}

export interface ChatCodeChangeExecutor {
  startChatCodeChange(input: {
    workspaceFolderId: string;
    userStory: UserStory;
    spec: Spec;
    artifactContext: WorkspaceArtifactContext;
    project: FrontendProject;
    chatSessionId: string;
    sourceMessageId: string;
    executionBrief: string;
    previewSessionId?: string;
    llmSettings?: LlmSettings;
  }): Promise<{ threadId: string }>;
}

export interface SpecGenerationExecutor {
  startSpecGeneration(input: {
    workspaceFolderId: string;
    userStory: UserStory;
    chatSessionId: string;
    sourceMessageId: string;
    executionBrief: string;
    llmSettings?: LlmSettings;
  }): Promise<{ threadId: string }>;
}

export interface HorusChatLlmSettingsResolver {
  resolveReference(
    reference?: LlmSettingsReference
  ): Promise<LlmSettings | undefined>;
}

export class HorusChatContextMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HorusChatContextMismatchError";
  }
}

export class SubmitHorusChatTurnUseCase {
  constructor(
    private readonly chatMemoryStore: ChatMemoryRepository,
    private readonly previewRuntime: PreviewRuntimeReader,
    private readonly intentRouter: HorusOdinIntentRouter,
    private readonly codeContextReader: CodeContextReader,
    private readonly chatResponder: HorusChatResponder,
    private readonly chatCodeChangeExecutor?: ChatCodeChangeExecutor,
    private readonly specGenerationExecutor?: SpecGenerationExecutor,
    private readonly llmSettingsResolver?: HorusChatLlmSettingsResolver
  ) {}

  async execute(input: HorusChatTurnInput): Promise<HorusChatTurnResponse> {
    const parsed = HorusChatTurnInputSchema.parse(input);
    const context = await this.chatMemoryStore.buildAgentContext(
      parsed.chatSessionId
    );

    const project = await this.assertContextMatches(parsed, context);
    const llmSettings = await this.llmSettingsResolver?.resolveReference(
      parsed.llmSettingsRef
    );

    const userMessage = await this.chatMemoryStore.appendMessage(
      parsed.chatSessionId,
      {
        role: "user",
        body: parsed.message,
        ...(parsed.workflowThreadId
          ? { workflowThreadId: parsed.workflowThreadId }
          : {}),
        ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
        ...(parsed.previewSessionId
          ? { previewSessionId: parsed.previewSessionId }
          : {}),
      }
    );

    const intent = await this.intentRouter.classify({
      message: parsed.message,
      context,
      ...(llmSettings ? { llmSettings } : {}),
    });
    const outcome = await buildOutcome(
      intent,
      parsed,
      context,
      project,
      this.codeContextReader,
      this.previewRuntime,
      this.chatResponder,
      this.chatCodeChangeExecutor,
      this.specGenerationExecutor,
      userMessage.id,
      llmSettings
    );
    const assistantMessage = await this.chatMemoryStore.appendMessage(
      parsed.chatSessionId,
      {
        role: "agent",
        body: outcome.summary,
        ...(outcome.workflowThreadId
          ? { workflowThreadId: outcome.workflowThreadId }
          : {}),
        ...(outcome.projectId ? { projectId: outcome.projectId } : {}),
        ...(outcome.previewSessionId
          ? { previewSessionId: outcome.previewSessionId }
          : {}),
      }
    );

    return HorusChatTurnResponseSchema.parse({
      userMessage,
      assistantMessage,
      intent,
      outcome,
    });
  }

  async *stream(input: HorusChatTurnInput): AsyncGenerator<HorusChatStreamEvent> {
    let sequence = 0;
    const emit = (event: Record<string, unknown>): HorusChatStreamEvent => HorusChatStreamEventSchema.parse({
      sequence: ++sequence,
      ...event,
    });

    try {
      const parsed = HorusChatTurnInputSchema.parse(input);
      yield emit({
        type: "turn_started",
        chatSessionId: parsed.chatSessionId,
      });

      const context = await this.chatMemoryStore.buildAgentContext(
        parsed.chatSessionId
      );
      const project = await this.assertContextMatches(parsed, context);
      const llmSettings = await this.llmSettingsResolver?.resolveReference(
        parsed.llmSettingsRef
      );
      const userMessage = await this.chatMemoryStore.appendMessage(
        parsed.chatSessionId,
        {
          role: "user",
          body: parsed.message,
          ...(parsed.workflowThreadId
            ? { workflowThreadId: parsed.workflowThreadId }
            : {}),
          ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
          ...(parsed.previewSessionId
            ? { previewSessionId: parsed.previewSessionId }
            : {}),
        }
      );
      yield emit({ type: "user_message_persisted", message: userMessage });

      const intent = await this.intentRouter.classify({
        message: parsed.message,
        context,
        ...(llmSettings ? { llmSettings } : {}),
      });
      yield emit({ type: "intent_classified", intent });

      const streamedMessageId = `stream-${uuidv4()}`;
      yield emit({
        type: "assistant_message_started",
        messageId: streamedMessageId,
        createdAt: new Date().toISOString(),
      });

      let outcome: HorusChatOutcome;
      if (intent.kind === "answer_question") {
        const codeContext = project
          ? await this.codeContextReader.buildContext({
              project,
              chatContext: context,
              query: parsed.message,
            })
          : undefined;

        if (codeContext) {
          yield emit({
            type: "evidence_sources",
            messageId: streamedMessageId,
            evidenceSources: buildEvidenceSources(codeContext),
            groundingStatus: mapGroundingStatus(codeContext),
          });
        }

        let summary = "";
        for await (const delta of streamAnswerText(this.chatResponder, {
          message: parsed.message,
          context,
          ...(project ? { project } : {}),
          ...(codeContext ? { codeContext } : {}),
          ...(llmSettings ? { llmSettings } : {}),
        })) {
          summary += delta;
          yield emit({
            type: "assistant_text_delta",
            messageId: streamedMessageId,
            delta,
          });
        }

        outcome = {
          ...buildOutcomeBase(parsed),
          action: "answer",
          status: "completed",
          ...(codeContext ? { contextSources: codeContext.inspectedFiles } : {}),
          ...(codeContext ? { evidenceSources: buildEvidenceSources(codeContext) } : {}),
          ...(codeContext ? { groundingStatus: mapGroundingStatus(codeContext) } : {}),
          summary: summary.trim() || "Horus não conseguiu gerar uma resposta para esta mensagem.",
        };
      } else {
        const action = actionForIntent(intent);
        yield emit({
          type: "action_started",
          action,
          label: labelForIntent(intent),
          ...(parsed.workflowThreadId ? { workflowThreadId: parsed.workflowThreadId } : {}),
          ...(parsed.previewSessionId ? { previewSessionId: parsed.previewSessionId } : {}),
        });
        outcome = await buildOutcome(
          intent,
          parsed,
          context,
          project,
          this.codeContextReader,
          this.previewRuntime,
          this.chatResponder,
          this.chatCodeChangeExecutor,
          this.specGenerationExecutor,
          userMessage.id,
          llmSettings
        );
        yield emit({
          type: "action_updated",
          action: outcome.action,
          status: outcome.status,
          summary: outcome.summary,
          ...(outcome.workflowThreadId
            ? { workflowThreadId: outcome.workflowThreadId }
            : {}),
          ...(outcome.previewSessionId
            ? { previewSessionId: outcome.previewSessionId }
            : {}),
        });
      }

      const assistantMessage = await this.chatMemoryStore.appendMessage(
        parsed.chatSessionId,
        {
          role: "agent",
          body: outcome.summary,
          ...(outcome.workflowThreadId
            ? { workflowThreadId: outcome.workflowThreadId }
            : {}),
          ...(outcome.projectId ? { projectId: outcome.projectId } : {}),
          ...(outcome.previewSessionId
            ? { previewSessionId: outcome.previewSessionId }
            : {}),
        }
      );

      const response = HorusChatTurnResponseSchema.parse({
        userMessage,
        assistantMessage,
        intent,
        outcome,
      });

      yield emit({
        type: "assistant_message_completed",
        message: assistantMessage,
        outcome,
      });
      yield emit({ type: "turn_completed", response });
    } catch (err) {
      yield emit({
        type: "turn_failed",
        errorCode: err instanceof HorusChatContextMismatchError
          ? "context_mismatch"
          : "horus_chat_stream_failed",
        message: err instanceof Error ? err.message : "Falha ao processar mensagem.",
        retryable: !(err instanceof HorusChatContextMismatchError),
      });
    }
  }

  private async assertContextMatches(
    input: HorusChatTurnInput,
    context: ChatAgentContextBundle
  ): Promise<FrontendProject | undefined> {
    const { session } = context;
    let project: FrontendProject | undefined;

    if (
      input.workspaceFolderId &&
      input.workspaceFolderId !== session.workspaceFolderId
    ) {
      throw new HorusChatContextMismatchError(
        "workspaceFolderId does not match the chat session scope."
      );
    }

    if (input.userStoryId && input.userStoryId !== session.userStoryId) {
      throw new HorusChatContextMismatchError(
        "userStoryId does not match the chat session scope."
      );
    }

    if (input.previewSessionId && !input.projectId) {
      throw new HorusChatContextMismatchError(
        "projectId is required when previewSessionId is provided."
      );
    }

    if (input.projectId) {
      const projects = await this.previewRuntime.listProjects();
      project = projects.find((item) => item.id === input.projectId);
      if (!project) {
        throw new HorusChatContextMismatchError(
          "projectId does not match a registered frontend project."
        );
      }
    }

    if (input.previewSessionId) {
      const previewSession = await this.previewRuntime.getSession(
        input.previewSessionId
      );
      if (previewSession.projectId !== input.projectId) {
        throw new HorusChatContextMismatchError(
          "previewSessionId does not belong to the provided projectId."
        );
      }
    }

    return project;
  }
}

async function buildOutcome(
  intent: HorusChatIntent,
  input: HorusChatTurnInput,
  context: ChatAgentContextBundle,
  project: FrontendProject | undefined,
  codeContextReader: CodeContextReader,
  previewRuntime: PreviewRuntimeReader,
  chatResponder: HorusChatResponder,
  chatCodeChangeExecutor: ChatCodeChangeExecutor | undefined,
  specGenerationExecutor: SpecGenerationExecutor | undefined,
  sourceMessageId: string,
  llmSettings: LlmSettings | undefined
): Promise<HorusChatOutcome> {
  const base = buildOutcomeBase(input);

  switch (intent.kind) {
    case "answer_question": {
      const codeContext = project
        ? await codeContextReader.buildContext({
            project,
            chatContext: context,
            query: input.message,
          })
        : undefined;

      const summary = await chatResponder.answer({
        message: input.message,
        context,
        ...(project ? { project } : {}),
        ...(codeContext ? { codeContext } : {}),
        ...(llmSettings ? { llmSettings } : {}),
      });
      return {
        ...base,
        action: "answer",
        status: "completed",
        ...(codeContext ? { contextSources: codeContext.inspectedFiles } : {}),
        ...(codeContext ? { evidenceSources: buildEvidenceSources(codeContext) } : {}),
        ...(codeContext ? { groundingStatus: mapGroundingStatus(codeContext) } : {}),
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
            "Horus entendeu o pedido de alteração, mas precisa de um projeto selecionado para executar os agentes com isolamento.",
        };
      }

      if (!context.activeSpec) {
        return {
          ...base,
          action: "error",
          status: "blocked",
          summary:
            "Horus entendeu o pedido de alteração, mas esta user story ainda não tem uma spec ativa para orientar a mudança com segurança.",
        };
      }

      if (!chatCodeChangeExecutor) {
        return {
          ...base,
          action: "error",
          status: "blocked",
          summary:
            "Horus entendeu o pedido de alteração, mas o executor de agentes não está configurado neste ambiente.",
        };
      }

      let activePreviewSessionId: string | undefined;
      try {
        activePreviewSessionId = await ensurePreviewSessionForCodeChange(
          previewRuntime,
          project,
          input.previewSessionId
        );
      } catch (err) {
        return {
          ...base,
          action: "error",
          status: "blocked",
          summary:
            `Horus entendeu o pedido de alteração, mas não conseguiu preparar um preview executável para QA/Curator: ${
              err instanceof Error ? err.message : "erro desconhecido"
            }`,
        };
      }

      const result = await chatCodeChangeExecutor.startChatCodeChange({
        workspaceFolderId: context.session.workspaceFolderId,
        userStory: context.activeUserStory,
        spec: context.activeSpec,
        artifactContext: context.artifactContext,
        project,
        chatSessionId: input.chatSessionId,
        sourceMessageId,
        executionBrief: input.message,
        ...(activePreviewSessionId
          ? { previewSessionId: activePreviewSessionId }
          : {}),
        ...(llmSettings ? { llmSettings } : {}),
      });

      return {
        ...base,
        ...(activePreviewSessionId ? { previewSessionId: activePreviewSessionId } : {}),
        workflowThreadId: result.threadId,
        action: "code_change_started",
        status: "accepted",
        summary:
          "Recebi o pedido. Vou trabalhar nessa alteração e mostrar os marcos importantes aqui no chat.",
      };
    }
    case "run_project": {
      if (!project) {
        return {
          ...base,
          action: "error",
          status: "blocked",
          summary:
            "Horus entendeu o pedido de execução, mas precisa de um projeto selecionado para operar o preview com isolamento.",
        };
      }

      const lifecycleAction = intent.previewAction;
      if (!lifecycleAction) {
        return {
          ...base,
          action: "clarification_required",
          status: "blocked",
          summary:
            "Horus entendeu que o pedido envolve o preview, mas precisa saber se deve iniciar, parar ou recarregar o projeto selecionado.",
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
          `Horus ${verb} o preview do projeto ${project.name}. Status atual: ${result.session.status}.`,
      };
    }
    case "generate_spec": {
      if (!specGenerationExecutor) {
        return {
          ...base,
          action: "error",
          status: "blocked",
          summary:
            "Horus entendeu o pedido de geração de spec, mas o executor de specs não está configurado neste ambiente.",
        };
      }

      const result = await specGenerationExecutor.startSpecGeneration({
        workspaceFolderId: context.session.workspaceFolderId,
        userStory: context.activeUserStory,
        chatSessionId: input.chatSessionId,
        sourceMessageId,
        executionBrief: input.message,
        ...(llmSettings ? { llmSettings } : {}),
      });

      return {
        ...base,
        workflowThreadId: result.threadId,
        action: "spec_requested",
        status: "accepted",
        summary:
          "Recebi o pedido. Vou preparar a spec e avisar aqui quando precisar de revisão.",
      };
    }
    case "unsupported":
      return {
          ...base,
          action: "error",
          status: "blocked",
          summary:
            "Horus não executa comandos arbitrários pelo chat. Use capacidades controladas do sistema, como iniciar preview registrado, gerar specs ou acionar agentes com contexto isolado.",
      };
    case "clarify":
      return {
        ...base,
        action: "clarification_required",
        status: "blocked",
        summary:
          "Horus precisa de mais contexto para decidir se deve responder, executar o projeto, gerar spec ou acionar agentes.",
      };
  }
}

function buildOutcomeBase(input: HorusChatTurnInput) {
  return {
    chatSessionId: input.chatSessionId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.workflowThreadId ? { workflowThreadId: input.workflowThreadId } : {}),
    ...(input.previewSessionId ? { previewSessionId: input.previewSessionId } : {}),
  };
}

async function ensurePreviewSessionForCodeChange(
  previewRuntime: PreviewRuntimeReader,
  project: FrontendProject,
  previewSessionId?: string
): Promise<string> {
  if (previewSessionId) {
    const existing = await previewRuntime.getSession(previewSessionId);
    if (existing.status === "running" || existing.status === "starting") {
      return existing.id;
    }
    const started = await previewRuntime.startSession(existing.id);
    return started.session.id;
  }

  const created = await previewRuntime.createSession({
    projectId: project.id,
    route: project.defaultRoute,
    device: "pc",
  });
  const started = await previewRuntime.startSession(created.session.id);
  return started.session.id;
}

async function* streamAnswerText(
  responder: HorusChatResponder,
  input: Parameters<HorusChatResponder["answer"]>[0]
): AsyncIterable<string> {
  if (responder.streamAnswer) {
    for await (const delta of responder.streamAnswer(input)) {
      if (delta) yield delta;
    }
    return;
  }

  const text = await responder.answer(input);
  for (let index = 0; index < text.length; index += 24) {
    yield text.slice(index, index + 24);
  }
}

function actionForIntent(intent: HorusChatIntent): HorusChatOutcome["action"] {
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

function labelForIntent(intent: HorusChatIntent): string {
  if (intent.kind === "run_project") {
    if (intent.previewAction === "stop") return "Parando preview";
    if (intent.previewAction === "reload") return "Recarregando preview";
    return "Iniciando preview";
  }
  if (intent.kind === "code_change") return "Preparando alteração";
  if (intent.kind === "generate_spec") return "Preparando spec";
  if (intent.kind === "clarify") return "Aguardando esclarecimento";
  return "Bloqueando solicitação";
}

function buildEvidenceSources(codeContext: CodeContextBundle): HorusChatEvidenceSource[] {
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

function mapGroundingStatus(
  codeContext: CodeContextBundle
): "grounded" | "partial" | "ungrounded" {
  if (codeContext.retrievalStatus === "matched") return "grounded";
  if (codeContext.retrievalStatus === "partial") return "partial";
  return "ungrounded";
}
