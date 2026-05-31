import type { HorusChatTurnInput } from "@u-build/shared";
import type { ChatMemoryRepository } from "../ports/RepositoryPorts.js";
import {
  buildHorusChatCancelledTurnMetadata,
  buildHorusChatFailedTurnMetadata,
} from "./HorusChatTurnMetadata.js";
import { buildStreamFailureMessage, type HorusChatFailureStage } from "./HorusChatOutcomeBuilders.js";
import {
  CHAT_TURN_CANCELLED_MESSAGE,
  HorusChatContextMismatchError,
  HorusChatTurnCancelledError,
} from "./HorusChatTurnErrors.js";

export interface PersistHorusChatTerminalFailureInput {
  chatMemoryStore: ChatMemoryRepository;
  turnInput: HorusChatTurnInput;
  error: unknown;
  failureStage: HorusChatFailureStage;
  failureErrorCode: string;
  logLabel: string;
}

export interface PersistedHorusChatTerminalFailure {
  message: string;
  errorCode: string;
  retryable: boolean;
  cancelled: boolean;
}

export async function persistHorusChatTerminalFailure(
  input: PersistHorusChatTerminalFailureInput
): Promise<PersistedHorusChatTerminalFailure> {
  const failure = resolveTerminalFailure(input);
  try {
    await input.chatMemoryStore.appendMessage(input.turnInput.chatSessionId, {
      role: "agent",
      body: failure.message,
      ...(input.turnInput.workflowThreadId
        ? { workflowThreadId: input.turnInput.workflowThreadId }
        : {}),
      ...(input.turnInput.projectId ? { projectId: input.turnInput.projectId } : {}),
      ...(input.turnInput.previewSessionId
        ? { previewSessionId: input.turnInput.previewSessionId }
        : {}),
      metadata: failure.cancelled
        ? buildHorusChatCancelledTurnMetadata(input.turnInput, failure.message)
        : buildHorusChatFailedTurnMetadata(
            input.turnInput,
            failure.message,
            failure.errorCode,
            failure.retryable
          ),
    });
  } catch (persistErr) {
    console.error(input.logLabel, persistErr);
  }
  return failure;
}

function resolveTerminalFailure(
  input: PersistHorusChatTerminalFailureInput
): PersistedHorusChatTerminalFailure {
  if (input.error instanceof HorusChatTurnCancelledError) {
    return {
      message: CHAT_TURN_CANCELLED_MESSAGE,
      errorCode: "turn_cancelled",
      retryable: true,
      cancelled: true,
    };
  }

  const contextMismatch = input.error instanceof HorusChatContextMismatchError;
  return {
    message: buildStreamFailureMessage({
      stage: input.failureStage,
      contextMismatch,
    }),
    errorCode: contextMismatch ? "context_mismatch" : input.failureErrorCode,
    retryable: !contextMismatch,
    cancelled: false,
  };
}
