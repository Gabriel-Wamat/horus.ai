import type {
  ChatAgentContextBundle,
  ChatMessage,
  FrontendProject,
  HorusChatIntent,
  HorusChatOutcome,
  HorusChatStreamEvent,
  HorusChatToolStep,
  HorusChatTurnInput,
  HorusChatTurnResponse,
  WorkflowEvent,
} from "@u-build/shared";
import {
  HorusChatStreamEventSchema,
  HorusChatTurnInputSchema,
  HorusChatTurnResponseSchema,
} from "@u-build/shared";
import { v4 as uuidv4 } from "uuid";
import type { ChatMemoryRepository } from "../ports/RepositoryPorts.js";
import {
  ChatContextAssembler,
  type ChatContextMemoryReader,
} from "../services/ChatContextAssembler.js";
import {
  HorusOdinIntentRouter,
  resolveContextualFollowUpMessage,
} from "../services/HorusOdinIntentRouter.js";
import {
  buildHorusChatAssistantTurnMetadata as buildAssistantTurnMetadata,
  buildHorusChatOutcomeBase as buildOutcomeBase,
  buildHorusChatUserTurnMetadata as buildUserTurnMetadata,
} from "../services/HorusChatTurnMetadata.js";
import {
  actionForAgentLoopOutcome,
  actionForIntent,
  buildEvidenceSources,
  buildResponderFailureFallback,
  labelForIntent,
  mapGroundingStatus,
  shouldExposeCodeContextEvidence,
  type HorusChatFailureStage,
} from "../services/HorusChatOutcomeBuilders.js";
import { shouldLoadCodeContextForChatAnswer } from "../services/HorusChatCodeContextPolicy.js";
import { HorusChatTurnLockRegistry } from "../services/HorusChatTurnConcurrency.js";
import { findPersistedHorusChatTurnResponse } from "../services/HorusChatTurnReplay.js";
import {
  persistHorusChatConversationSummary,
  type ConversationMemoryProvider,
} from "../services/HorusChatConversationSummary.js";
import {
  chunkText,
  mergeToolStep,
  streamEventToToolStep,
} from "../services/HorusChatAgentStreamEvents.js";
import { chatToolStepToWorkflowEvents } from "../services/HorusChatWorkflowEvents.js";
import { buildHorusChatOutcome } from "../services/HorusChatOutcomeResolver.js";
import {
  CHAT_TURN_CANCELLED_MESSAGE,
  HorusChatContextMismatchError,
  HorusChatTurnCancelledError,
  throwIfHorusChatTurnAborted as throwIfAborted,
} from "../services/HorusChatTurnErrors.js";
import { persistHorusChatTerminalFailure } from "../services/HorusChatTurnFailurePersistence.js";
import type {
  CodeContextReader,
  HorusChatLlmSettingsResolver,
  HorusChatResponder,
  PreviewRuntimeReader,
  SpecGenerationExecutor,
} from "../services/HorusChatTurnPorts.js";

export {
  CHAT_TURN_CANCELLED_MESSAGE,
  HorusChatContextMismatchError,
  HorusChatTurnCancelledError,
} from "../services/HorusChatTurnErrors.js";
export type {
  CodeContextReader,
  HorusChatLlmSettingsResolver,
  HorusChatResponder,
  HorusChatResponderInput,
  PreviewRuntimeReader,
  SpecGenerationExecutor,
} from "../services/HorusChatTurnPorts.js";

export interface HorusChatTurnExecutionOptions {
  readonly signal?: AbortSignal;
}

export interface HorusChatWorkflowEventSink {
  emit(event: WorkflowEvent): void;
}

export class SubmitHorusChatTurnUseCase {
  private readonly turnLockRegistry = new HorusChatTurnLockRegistry();

  constructor(
    private readonly chatMemoryStore: ChatMemoryRepository,
    private readonly previewRuntime: PreviewRuntimeReader,
    private readonly intentRouter: HorusOdinIntentRouter,
    private readonly codeContextReader: CodeContextReader,
    private readonly chatResponder: HorusChatResponder,
    private readonly specGenerationExecutor?: SpecGenerationExecutor,
    private readonly llmSettingsResolver?: HorusChatLlmSettingsResolver,
    private readonly conversationMemory?: ConversationMemoryProvider,
    private readonly workflowEventSink?: HorusChatWorkflowEventSink,
    private readonly chatContextAssembler = new ChatContextAssembler(
      conversationMemory?.retrieveForPrompt
        ? (conversationMemory as ChatContextMemoryReader)
        : undefined
    )
  ) {}

  async execute(
    input: HorusChatTurnInput,
    options: HorusChatTurnExecutionOptions = {}
  ): Promise<HorusChatTurnResponse> {
    const parsed = HorusChatTurnInputSchema.parse(input);
    const releaseTurnLock = await this.turnLockRegistry.acquire(
      parsed.chatSessionId,
      parsed.idempotencyKey
    );
    let persistedUserMessage: ChatMessage | undefined;
    let failureStage: HorusChatFailureStage = "loading_context";

    try {
      throwIfAborted(options.signal);
      failureStage = "loading_context";
      const rawContext = await this.chatMemoryStore.buildAgentContext(
        parsed.chatSessionId
      );
      const { context } = await this.chatContextAssembler.assemble({
        context: rawContext,
        query: parsed.message,
        ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
      });

      failureStage = "checking_scope";
      const project = await this.assertContextMatches(parsed, context);
      const replayed = await findPersistedHorusChatTurnResponse(
        this.chatMemoryStore,
        parsed
      );
      if (replayed) return replayed;
      throwIfAborted(options.signal);
      failureStage = "resolving_llm";
      const llmSettings = await this.llmSettingsResolver?.resolveReference(
        parsed.llmSettingsRef
      );

      failureStage = "saving_user_message";
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
          metadata: buildUserTurnMetadata(parsed),
        }
      );
      persistedUserMessage = userMessage;
      throwIfAborted(options.signal);

      failureStage = "classifying_intent";
      const effectiveMessage = resolveContextualFollowUpMessage({
        message: parsed.message,
        context,
        ...(llmSettings ? { llmSettings } : {}),
      });
      const intent = await this.intentRouter.classify({
        message: parsed.message,
        context,
        ...(llmSettings ? { llmSettings } : {}),
      });
      throwIfAborted(options.signal);
      failureStage = "building_outcome";
      const outcome = await buildHorusChatOutcome({
        intent,
        input: { ...parsed, message: effectiveMessage },
        context,
        project,
        codeContextReader: this.codeContextReader,
        previewRuntime: this.previewRuntime,
        chatResponder: this.chatResponder,
        specGenerationExecutor: this.specGenerationExecutor,
        sourceMessageId: userMessage.id,
        llmSettings,
        signal: options.signal,
      });
      failureStage = "saving_assistant_message";
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
          metadata: buildAssistantTurnMetadata(parsed, intent, outcome),
        }
      );
      await persistHorusChatConversationSummary({
        conversationMemory: this.conversationMemory,
        chatMemoryStore: this.chatMemoryStore,
        session: context.session,
        turnInput: parsed,
        workflowThreadId: outcome.workflowThreadId,
        projectId: outcome.projectId,
      });

      return HorusChatTurnResponseSchema.parse({
        userMessage,
        assistantMessage,
        intent,
        outcome,
      });
    } catch (err) {
      if (persistedUserMessage) {
        await persistHorusChatTerminalFailure({
          chatMemoryStore: this.chatMemoryStore,
          turnInput: parsed,
          error: err,
          failureStage,
          failureErrorCode: "horus_chat_turn_failed",
          logLabel: "Failed to persist Horus chat terminal failure",
        });
      }
      throw err;
    } finally {
      releaseTurnLock();
    }
  }

  async *stream(
    input: HorusChatTurnInput,
    options: HorusChatTurnExecutionOptions = {}
  ): AsyncGenerator<HorusChatStreamEvent> {
    let sequence = 0;
    const emit = (event: Record<string, unknown>): HorusChatStreamEvent => HorusChatStreamEventSchema.parse({
      sequence: ++sequence,
      ...event,
    });
    let parsedInput: HorusChatTurnInput | undefined;
    let persistedUserMessage: ChatMessage | undefined;
    let releaseTurnLock: (() => void) | undefined;
    let failureStage: HorusChatFailureStage = "validating_input";

    try {
      const parsed = HorusChatTurnInputSchema.parse(input);
      parsedInput = parsed;
      releaseTurnLock = await this.turnLockRegistry.acquire(
        parsed.chatSessionId,
        parsed.idempotencyKey
      );
      throwIfAborted(options.signal);
      yield emit({
        type: "turn_started",
        chatSessionId: parsed.chatSessionId,
      });

      failureStage = "loading_context";
      const rawContext = await this.chatMemoryStore.buildAgentContext(
        parsed.chatSessionId
      );
      const { context } = await this.chatContextAssembler.assemble({
        context: rawContext,
        query: parsed.message,
        ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
      });
      let operationalWorkflowThreadId =
        parsed.workflowThreadId ?? context.session.workflowThreadId;
      failureStage = "checking_scope";
      const project = await this.assertContextMatches(parsed, context);
      const replayed = await findPersistedHorusChatTurnResponse(
        this.chatMemoryStore,
        parsed
      );
      if (replayed) {
        yield emit({ type: "user_message_persisted", message: replayed.userMessage });
        yield emit({ type: "intent_classified", intent: replayed.intent });
        if (replayed.assistantMessage) {
          yield emit({
            type: "assistant_message_completed",
            message: replayed.assistantMessage,
            outcome: replayed.outcome,
          });
        }
        yield emit({ type: "turn_completed", response: replayed });
        return;
      }
      throwIfAborted(options.signal);
      failureStage = "resolving_llm";
      const llmSettings = await this.llmSettingsResolver?.resolveReference(
        parsed.llmSettingsRef
      );
      failureStage = "saving_user_message";
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
          metadata: buildUserTurnMetadata(parsed),
        }
      );
      persistedUserMessage = userMessage;
      yield emit({ type: "user_message_persisted", message: userMessage });
      throwIfAborted(options.signal);

      failureStage = "classifying_intent";
      const effectiveMessage = resolveContextualFollowUpMessage({
        message: parsed.message,
        context,
        ...(llmSettings ? { llmSettings } : {}),
      });
      const intent = await this.intentRouter.classify({
        message: parsed.message,
        context,
        ...(llmSettings ? { llmSettings } : {}),
      });
      yield emit({ type: "intent_classified", intent });
      throwIfAborted(options.signal);

      const streamedMessageId = `stream-${uuidv4()}`;
      yield emit({
        type: "assistant_message_started",
        messageId: streamedMessageId,
        createdAt: new Date().toISOString(),
      });

      // answer_question and code_change both run through the Horus chat agent
      // loop. The loop reads/searches/validates and, for code_change, mutates
      // the project through the audited tool engine — then streams a real
      // answer instead of a canned action summary.
      const useAgentLoop =
        intent.kind === "answer_question" || intent.kind === "code_change";
      let outcome: HorusChatOutcome;
      if (useAgentLoop) {
        failureStage = "loading_code_context";
        const codeContext = project && shouldLoadCodeContextForChatAnswer(effectiveMessage)
          ? await this.codeContextReader.buildContext({
              project,
              chatContext: context,
              query: effectiveMessage,
            })
          : undefined;

        const exposedCodeContext = shouldExposeCodeContextEvidence(intent, codeContext)
          ? codeContext
          : undefined;

        if (exposedCodeContext) {
          yield emit({
            type: "evidence_sources",
            messageId: streamedMessageId,
            evidenceSources: buildEvidenceSources(exposedCodeContext),
            groundingStatus: mapGroundingStatus(exposedCodeContext),
            retrievalStatus: exposedCodeContext.retrievalStatus,
            retrievalNotes: exposedCodeContext.retrievalNotes,
          });
        }

        let summary = "";
        let toolSteps: HorusChatToolStep[] = [];
        failureStage = "streaming_answer";
        const answerInput = {
          message: effectiveMessage,
          context,
          intentKind: intent.kind,
          ...(project ? { project } : {}),
          ...(codeContext ? { codeContext } : {}),
          ...(llmSettings ? { llmSettings } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        };
        try {
          if (this.chatResponder.streamAgent) {
            for await (const event of this.chatResponder.streamAgent(
              answerInput
            )) {
              throwIfAborted(options.signal);
              if (typeof event === "string") {
                summary += event;
                yield emit({
                  type: "assistant_text_delta",
                  messageId: streamedMessageId,
                  delta: event,
                });
              } else if (event.type === "text") {
                summary += event.text;
                yield emit({
                  type: "assistant_text_delta",
                  messageId: streamedMessageId,
                  delta: event.text,
                });
              } else {
                const toolStep = {
                  ...streamEventToToolStep(event),
                  sequence: sequence + 1,
                };
                toolSteps = mergeToolStep(toolSteps, toolStep);
                const streamEvent = emit({
                  type: "assistant_tool_step",
                  messageId: streamedMessageId,
                  tool: toolStep.tool,
                  phase: toolStep.phase,
                  title: toolStep.title,
                  ...(toolStep.detail ? { detail: toolStep.detail } : {}),
                  filePaths: toolStep.filePaths,
                  commandIds: toolStep.commandIds,
                  taskId: toolStep.taskId,
                  fileOperations: toolStep.fileOperations,
                });
                if (operationalWorkflowThreadId) {
                  for (const workflowEvent of chatToolStepToWorkflowEvents(
                    toolStep,
                    {
                      threadId: operationalWorkflowThreadId,
                      ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
                      ...(parsed.userStoryId
                        ? { userStoryId: parsed.userStoryId }
                        : {}),
                      sequence: streamEvent.sequence,
                      timestamp: new Date().toISOString(),
                    }
                  )) {
                    this.workflowEventSink?.emit(workflowEvent);
                  }
                }
                yield streamEvent;
              }
            }
          } else {
            for await (const delta of streamAnswerText(
              this.chatResponder,
              answerInput
            )) {
              throwIfAborted(options.signal);
              summary += delta;
              yield emit({
                type: "assistant_text_delta",
                messageId: streamedMessageId,
                delta,
              });
            }
          }
        } catch (err) {
          throwIfAborted(options.signal);
          const fallback = buildResponderFailureFallback();
          summary = fallback;
          for (const delta of chunkText(fallback)) {
            throwIfAborted(options.signal);
            yield emit({
              type: "assistant_text_delta",
              messageId: streamedMessageId,
              delta,
            });
          }
        }

        outcome = {
          ...buildOutcomeBase(parsed),
          ...(operationalWorkflowThreadId
            ? { workflowThreadId: operationalWorkflowThreadId }
            : {}),
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
          ...(toolSteps.length ? { toolSteps } : {}),
          summary: summary.trim() || buildResponderFailureFallback(),
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
        failureStage = "starting_action";
        outcome = await buildHorusChatOutcome({
          intent,
          input: parsed,
          context,
          project,
          codeContextReader: this.codeContextReader,
          previewRuntime: this.previewRuntime,
          chatResponder: this.chatResponder,
          specGenerationExecutor: this.specGenerationExecutor,
          sourceMessageId: userMessage.id,
          llmSettings,
          signal: options.signal,
        });
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

      failureStage = "saving_assistant_message";
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
          metadata: buildAssistantTurnMetadata(parsed, intent, outcome),
        }
      );
      await persistHorusChatConversationSummary({
        conversationMemory: this.conversationMemory,
        chatMemoryStore: this.chatMemoryStore,
        session: context.session,
        turnInput: parsed,
        workflowThreadId: outcome.workflowThreadId,
        projectId: outcome.projectId,
      });

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
      if (err instanceof HorusChatTurnCancelledError) {
        let message = CHAT_TURN_CANCELLED_MESSAGE;
        if (parsedInput && persistedUserMessage) {
          const persistedFailure = await persistHorusChatTerminalFailure({
            chatMemoryStore: this.chatMemoryStore,
            turnInput: parsedInput,
            error: err,
            failureStage,
            failureErrorCode: "horus_chat_stream_failed",
            logLabel: "Failed to persist Horus chat cancellation",
          });
          message = persistedFailure.message;
        }
        yield emit({
          type: "turn_cancelled",
          message,
          retryable: true,
        });
        return;
      }
      let message =
        "Não consegui concluir esse pedido. Sua mensagem ficou salva; tente de novo.";
      let errorCode =
        err instanceof HorusChatContextMismatchError
          ? "context_mismatch"
          : "horus_chat_stream_failed";
      let retryable = !(err instanceof HorusChatContextMismatchError);
      if (parsedInput && persistedUserMessage) {
        const persistedFailure = await persistHorusChatTerminalFailure({
          chatMemoryStore: this.chatMemoryStore,
          turnInput: parsedInput,
          error: err,
          failureStage,
          failureErrorCode: "horus_chat_stream_failed",
          logLabel: "Failed to persist Horus chat stream failure",
        });
        message = persistedFailure.message;
        errorCode = persistedFailure.errorCode;
        retryable = persistedFailure.retryable;
      }
      yield emit({
        type: "turn_failed",
        errorCode,
        message,
        retryable,
      });
    } finally {
      releaseTurnLock?.();
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

async function* streamAnswerText(
  responder: HorusChatResponder,
  input: Parameters<HorusChatResponder["answer"]>[0]
): AsyncIterable<string> {
  throwIfAborted(input.signal);
  if (responder.streamAnswer) {
    let streamed = false;
    for await (const delta of responder.streamAnswer(input)) {
      throwIfAborted(input.signal);
      if (delta) {
        streamed = true;
        yield delta;
      }
    }
    if (streamed) {
      return;
    }
  }

  const text = await responder.answer(input);
  for (const delta of chunkText(text)) {
    throwIfAborted(input.signal);
    yield delta;
  }
}
