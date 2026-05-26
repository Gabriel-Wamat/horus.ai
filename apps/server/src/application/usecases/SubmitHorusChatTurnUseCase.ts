import type {
  ChatAgentContextBundle,
  CodeContextBundle,
  FrontendProject,
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
import type { FileChatMemoryStore } from "../../infrastructure/chat/FileChatMemoryStore.js";
import { HorusOdinIntentRouter } from "../services/HorusOdinIntentRouter.js";
import { ReadOnlyCodeContextService } from "../services/ReadOnlyCodeContextService.js";

interface PreviewRuntimeReader {
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

interface CodeContextReader {
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
    private readonly chatMemoryStore: FileChatMemoryStore,
    private readonly previewRuntime: PreviewRuntimeReader,
    private readonly intentRouter = new HorusOdinIntentRouter(),
    private readonly codeContextReader: CodeContextReader =
      new ReadOnlyCodeContextService(),
    private readonly chatResponder?: HorusChatResponder,
    private readonly chatCodeChangeExecutor?: ChatCodeChangeExecutor
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

    const intent = this.intentRouter.classify({
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
  intent: ReturnType<HorusOdinIntentRouter["classify"]>,
  input: HorusChatTurnInput,
  context: ChatAgentContextBundle,
  project: FrontendProject | undefined,
  codeContextReader: CodeContextReader,
  previewRuntime: PreviewRuntimeReader,
  chatResponder: HorusChatResponder | undefined,
  chatCodeChangeExecutor: ChatCodeChangeExecutor | undefined,
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
      if (!chatResponder) {
        return {
          ...base,
          action: "error",
          status: "failed",
          summary:
            "Horus não conseguiu responder porque o agente LLM de chat não está configurado neste ambiente.",
        };
      }

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
        chatSessionId: input.chatSessionId,
        sourceMessageId,
        executionBrief: input.message,
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

      if (hasArbitraryCommandRisk(input.message)) {
        return {
          ...base,
          action: "error",
          status: "blocked",
          summary:
            "Horus não executa comandos arbitrários pelo chat. Use pedidos de ciclo do preview, como iniciar, parar ou recarregar o projeto selecionado.",
        };
      }

      const lifecycleAction = inferPreviewLifecycleAction(input.message);
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
    case "generate_spec":
      return {
        ...base,
        action: "spec_requested",
        status: "accepted",
        summary:
          "Horus reconheceu um pedido explícito de spec. A geração deve seguir o fluxo de specs sem tratar toda mensagem comum como user story.",
      };
    case "unsupported":
      return {
        ...base,
        action: "error",
        status: "blocked",
        summary:
          hasArbitraryCommandRisk(input.message)
            ? "Horus não executa comandos arbitrários pelo chat. Use pedidos de ciclo do preview, como iniciar, parar ou recarregar o projeto selecionado."
            : "Horus não suporta esse tipo de solicitação neste contexto.",
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

type PreviewLifecycleAction = "start" | "stop" | "reload";

function inferPreviewLifecycleAction(message: string): PreviewLifecycleAction {
  const normalized = message.trim().toLowerCase();
  if (/\b(pare|parar|stop|desligue|encerrar|encerre)\b/.test(normalized)) {
    return "stop";
  }
  if (
    /\b(reload|recarregue|reinicie|reiniciar|atualize|refresh)\b/.test(
      normalized
    )
  ) {
    return "reload";
  }
  return "start";
}

function hasArbitraryCommandRisk(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return /\b(shell|terminal|comando|bash|zsh|sh|sudo|rm\s+-rf|curl|wget|git|docker|npm|pnpm|node|python|uvicorn)\b/.test(
    normalized
  );
}
