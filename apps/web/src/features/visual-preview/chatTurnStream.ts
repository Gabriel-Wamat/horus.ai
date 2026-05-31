import type { HorusChatStreamEvent } from "@u-build/shared";
import type {
  PreviewChatMessage,
  PreviewWorkflowActivity,
} from "../../components/PreviewConversationPanel.js";
import {
  appendAssistantDelta,
  appendToolStep,
  mapChatMessage,
  replaceChatMessage,
  upsertChatMessage,
} from "./previewChatMessages.js";

type ChatMessagesUpdater = (
  updater: (current: PreviewChatMessage[]) => PreviewChatMessage[]
) => void;

export interface ChatTurnStreamController {
  readonly handleEvent: (event: HorusChatStreamEvent) => void;
  readonly fail: (message: string) => void;
  readonly cancelLocally: (message: string) => void;
}

export function createChatTurnStreamController({
  pendingUserMessage,
  pendingAgentMessage,
  setChatMessages,
  streamWorkflowProgress,
  setWorkflowActivity,
  scheduleWorkflowActivityClear,
  hydratePreviewSession,
}: {
  readonly pendingUserMessage: PreviewChatMessage;
  readonly pendingAgentMessage: PreviewChatMessage;
  readonly setChatMessages: ChatMessagesUpdater;
  readonly streamWorkflowProgress: (
    threadId: string,
    options?: { replayCompleted?: boolean }
  ) => void;
  readonly setWorkflowActivity: (activity: PreviewWorkflowActivity) => void;
  readonly scheduleWorkflowActivityClear: (delayMs: number) => void;
  readonly hydratePreviewSession: (previewSessionId: string) => void;
}): ChatTurnStreamController {
  let activeAssistantMessageId = pendingAgentMessage.id;

  const replaceActiveAssistant = (message: PreviewChatMessage): void => {
    setChatMessages((current) =>
      replaceChatMessage(current, activeAssistantMessageId, message)
    );
  };

  const completeActiveAssistant = (message: PreviewChatMessage): void => {
    setChatMessages((current) => {
      const activeMessage = current.find(
        (item) => item.id === activeAssistantMessageId
      );
      const durableMessage =
        activeMessage?.toolSteps?.length && !message.toolSteps?.length
          ? { ...message, toolSteps: activeMessage.toolSteps }
          : message;
      return replaceChatMessage(current, activeAssistantMessageId, durableMessage);
    });
  };

  const setTerminalMessage = (
    body: string,
    options: Pick<PreviewChatMessage, "turnStatus" | "retryable" | "errorCode">
  ): void => {
    replaceActiveAssistant({
      id: activeAssistantMessageId,
      role: "agent",
      body,
      createdAt: new Date().toISOString(),
      ...options,
      isPending: false,
      isStreaming: false,
    });
  };

  return {
    handleEvent: (event) => {
      switch (event.type) {
        case "turn_started":
        case "intent_classified":
          return;
        case "user_message_persisted":
          setChatMessages((current) =>
            replaceChatMessage(
              current,
              pendingUserMessage.id,
              mapChatMessage(event.message)
            )
          );
          return;
        case "assistant_message_started":
          activeAssistantMessageId = event.messageId;
          setChatMessages((current) =>
            replaceChatMessage(current, pendingAgentMessage.id, {
              id: event.messageId,
              role: "agent",
              body: "",
              createdAt: event.createdAt,
              turnStatus: "streaming",
              isPending: true,
              isStreaming: true,
            })
          );
          return;
        case "assistant_text_delta":
          setChatMessages((current) =>
            appendAssistantDelta(current, event.messageId, event.delta)
          );
          return;
        case "assistant_tool_step":
          setChatMessages((current) =>
            appendToolStep(current, event.messageId, {
              sequence: event.sequence,
              tool: event.tool,
              title: event.title,
              phase: event.phase,
              ...(event.detail ? { detail: event.detail } : {}),
              filePaths: event.filePaths,
              commandIds: event.commandIds,
              taskId: event.taskId,
              fileOperations: event.fileOperations,
            })
          );
          return;
        case "evidence_sources":
          setChatMessages((current) =>
            current.map((item) =>
              item.id === event.messageId
                ? {
                    ...item,
                    evidenceSources: event.evidenceSources,
                    groundingStatus: event.groundingStatus,
                    ...(event.retrievalStatus
                      ? { retrievalStatus: event.retrievalStatus }
                      : {}),
                    ...(event.retrievalNotes
                      ? { retrievalNotes: event.retrievalNotes }
                      : {}),
                  }
                : item
            )
          );
          return;
        case "action_started":
          if (event.workflowThreadId) {
            streamWorkflowProgress(event.workflowThreadId, { replayCompleted: true });
            setWorkflowActivity({
              phase: "validating",
              label: "Começando",
              detail: "Abrindo a execução real para este projeto.",
              active: true,
              updatedAt: new Date().toISOString(),
            });
            scheduleWorkflowActivityClear(8000);
          }
          setChatMessages((current) =>
            upsertChatMessage(current, {
              id: activeAssistantMessageId,
              role: "agent",
              body: event.label,
              createdAt: new Date().toISOString(),
              ...(event.workflowThreadId
                ? { workflowThreadId: event.workflowThreadId }
                : {}),
              ...(event.previewSessionId
                ? { previewSessionId: event.previewSessionId }
                : {}),
              action: event.action,
              turnStatus: "accepted",
              isPending: false,
              isStreaming: true,
            })
          );
          return;
        case "action_updated":
          if (event.workflowThreadId) {
            streamWorkflowProgress(event.workflowThreadId, { replayCompleted: true });
          }
          setChatMessages((current) =>
            upsertChatMessage(current, {
              id: activeAssistantMessageId,
              role: "agent",
              body: event.summary ?? "Atualizei a execução.",
              createdAt: new Date().toISOString(),
              ...(event.workflowThreadId
                ? { workflowThreadId: event.workflowThreadId }
                : {}),
              ...(event.previewSessionId
                ? { previewSessionId: event.previewSessionId }
                : {}),
              action: event.action,
              turnStatus: event.status === "failed" ? "failed" : "accepted",
              isPending: false,
              isStreaming: event.status !== "failed",
            })
          );
          if (event.previewSessionId) hydratePreviewSession(event.previewSessionId);
          return;
        case "assistant_message_completed":
          if (event.outcome.workflowThreadId) {
            streamWorkflowProgress(event.outcome.workflowThreadId, {
              replayCompleted: true,
            });
          }
          completeActiveAssistant(mapChatMessage(event.message, event.outcome));
          return;
        case "turn_completed":
          if (event.response.outcome.workflowThreadId) {
            streamWorkflowProgress(event.response.outcome.workflowThreadId, {
              replayCompleted: true,
            });
          }
          if (event.response.outcome.previewSessionId) {
            hydratePreviewSession(event.response.outcome.previewSessionId);
          }
          return;
        case "turn_failed":
          setTerminalMessage(event.message, {
            turnStatus: "failed",
            retryable: event.retryable,
            errorCode: event.errorCode,
          });
          return;
        case "turn_cancelled":
          setTerminalMessage(event.message, {
            turnStatus: "cancelled",
            retryable: event.retryable,
            errorCode: "turn_cancelled",
          });
          return;
      }
    },
    fail: (message) =>
      setTerminalMessage(message, {
        turnStatus: "failed",
        retryable: true,
        errorCode: "client_stream_error",
      }),
    cancelLocally: (message) =>
      setTerminalMessage(message, {
        turnStatus: "cancelled",
        retryable: true,
        errorCode: "client_cancelled",
      }),
  };
}
