import type {
  ChatMessage,
  HorusChatIntent,
  HorusChatMessageMetadata,
  HorusChatOutcome,
  HorusChatTurnInput,
} from "@u-build/shared";
import { HorusChatMessageMetadataSchema } from "@u-build/shared";
import { deriveHorusChatSuggestedActions } from "./HorusChatSuggestedActions.js";

export function readHorusChatMetadata(
  message: ChatMessage
): HorusChatMessageMetadata | undefined {
  const parsed = HorusChatMessageMetadataSchema.safeParse(
    message.metadata["horusChat"]
  );
  return parsed.success ? parsed.data : undefined;
}

export function buildHorusChatUserTurnMetadata(
  input: HorusChatTurnInput,
  submittedAt = new Date().toISOString()
): Record<string, unknown> {
  return {
    horusChat: {
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      turnStatus: "pending",
      submittedAt,
    } satisfies HorusChatMessageMetadata,
  };
}

export function buildHorusChatAssistantTurnMetadata(
  input: HorusChatTurnInput,
  intent: HorusChatIntent,
  outcome: HorusChatOutcome,
  completedAt = new Date().toISOString()
): Record<string, unknown> {
  const suggestedActions = deriveHorusChatSuggestedActions(outcome);
  const metadataOutcome: HorusChatOutcome = {
    ...outcome,
    ...(suggestedActions.length ? { suggestedActions } : {}),
  };
  return {
    horusChat: {
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      turnStatus: turnStatusForOutcome(outcome),
      intent,
      outcome: metadataOutcome,
      ...(outcome.evidenceSources
        ? { evidenceSources: outcome.evidenceSources }
        : {}),
      ...(outcome.groundingStatus
        ? { groundingStatus: outcome.groundingStatus }
        : {}),
      ...(outcome.codingEvidence
        ? { codingEvidence: outcome.codingEvidence }
        : {}),
      ...(suggestedActions.length ? { suggestedActions } : {}),
      completedAt,
    } satisfies HorusChatMessageMetadata,
  };
}

export function buildHorusChatFailedTurnMetadata(
  input: HorusChatTurnInput,
  summary: string,
  errorCode: string,
  retryable: boolean,
  completedAt = new Date().toISOString()
): Record<string, unknown> {
  return {
    horusChat: {
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      turnStatus: "failed",
      intent: buildTerminalTurnIntent(
        "Horus chat turn failed before a durable classified outcome was available."
      ),
      outcome: buildTerminalTurnOutcome(input, summary),
      errorCode,
      retryable,
      completedAt,
    } satisfies HorusChatMessageMetadata,
  };
}

export function buildHorusChatCancelledTurnMetadata(
  input: HorusChatTurnInput,
  summary: string,
  cancelledAt = new Date().toISOString()
): Record<string, unknown> {
  return {
    horusChat: {
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      turnStatus: "cancelled",
      intent: buildTerminalTurnIntent("Horus chat turn was cancelled by the client."),
      outcome: buildTerminalTurnOutcome(input, summary),
      errorCode: "turn_cancelled",
      retryable: true,
      cancelledAt,
      completedAt: cancelledAt,
    } satisfies HorusChatMessageMetadata,
  };
}

export function buildHorusChatOutcomeBase(input: HorusChatTurnInput) {
  return {
    chatSessionId: input.chatSessionId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.workflowThreadId ? { workflowThreadId: input.workflowThreadId } : {}),
    ...(input.previewSessionId ? { previewSessionId: input.previewSessionId } : {}),
  };
}

function buildTerminalTurnIntent(rationale: string): HorusChatIntent {
  return {
    kind: "clarify",
    mode: "chat",
    confidence: 1,
    rationale,
  };
}

function buildTerminalTurnOutcome(
  input: HorusChatTurnInput,
  summary: string
): HorusChatOutcome {
  return {
    ...buildHorusChatOutcomeBase(input),
    action: "error",
    status: "failed",
    summary,
  };
}

function turnStatusForOutcome(
  outcome: HorusChatOutcome
): HorusChatMessageMetadata["turnStatus"] {
  if (outcome.status === "completed") return "completed";
  if (outcome.status === "accepted" || outcome.status === "running") {
    return "accepted";
  }
  if (outcome.status === "blocked") return "blocked";
  return "failed";
}
