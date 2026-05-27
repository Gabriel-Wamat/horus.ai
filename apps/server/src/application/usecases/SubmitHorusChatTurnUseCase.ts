import type {
  ChatAgentContextBundle,
  CodeContextBundle,
  FrontendProject,
  HorusChatEvidenceSource,
  HorusChatIntent,
  HorusChatOutcome,
  HorusChatTurnInput,
  HorusChatTurnResponse,
  PreviewSession,
  Spec,
  UserStory,
  WorkspaceArtifactContext,
} from "@u-build/shared";
import {
  HorusChatTurnInputSchema,
  HorusChatTurnResponseSchema,
} from "@u-build/shared";
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
  }): Promise<string>;
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
  }): Promise<{ threadId: string }>;
}

export interface SpecGenerationExecutor {
  startSpecGeneration(input: {
    workspaceFolderId: string;
    userStory: UserStory;
    chatSessionId: string;
    sourceMessageId: string;
    executionBrief: string;
  }): Promise<{ threadId: string }>;
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
    private readonly specGenerationExecutor?: SpecGenerationExecutor
  ) {}

  async execute(input: HorusChatTurnInput): Promise<HorusChatTurnResponse> {
    const parsed = HorusChatTurnInputSchema.parse(input);
    const context = await this.chatMemoryStore.buildAgentContext(
      parsed.chatSessionId
    );

    const project = await this.assertContextMatches(parsed, context);

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
      userMessage.id
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
  sourceMessageId: string
): Promise<HorusChatOutcome> {
  const base = {
    chatSessionId: input.chatSessionId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.workflowThreadId ? { workflowThreadId: input.workflowThreadId } : {}),
    ...(input.previewSessionId ? { previewSessionId: input.previewSessionId } : {}),
  };

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
            "Horus entendeu o pedido de alteração, mas esta user story ainda não tem uma spec ativa para orientar Front, QA e Curator.",
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

      const result = await chatCodeChangeExecutor.startChatCodeChange({
        workspaceFolderId: context.session.workspaceFolderId,
        userStory: context.activeUserStory,
        spec: context.activeSpec,
        artifactContext: context.artifactContext,
        project,
        chatSessionId: input.chatSessionId,
        sourceMessageId,
        executionBrief: input.message,
        ...(input.previewSessionId
          ? { previewSessionId: input.previewSessionId }
          : {}),
      });

      return {
        ...base,
        workflowThreadId: result.threadId,
        action: "code_change_started",
        status: "accepted",
        summary:
          `Horus iniciou o modo executor para esta alteração. Thread ${result.threadId.slice(0, 8)} acionada com Front, QA e Curator usando o contexto isolado deste chat.`,
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
      });

      return {
        ...base,
        workflowThreadId: result.threadId,
        action: "spec_requested",
        status: "accepted",
        summary:
          `Horus iniciou a geração de spec para esta user story. Thread ${result.threadId.slice(0, 8)} acionada com o contexto isolado deste chat.`,
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
