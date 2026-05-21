import { interrupt } from "@langchain/langgraph";
import type { UBuildState, UBuildUpdate } from "../state.js";

interface RetryDecision {
  continueRetry: boolean;
}

/**
 * HITL escalation node (Human-in-the-Loop pattern).
 * Fires when the self-correction loop exceeds MAX_RETRIES.
 * Suspends the graph until the user decides whether to continue.
 */
export async function retryCheckpointNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error("retryCheckpointNode: missing user story");
  }

  const feedback = state.curatorFeedback[userStory.id];

  // Suspend and surface context to the human operator
  const decision = interrupt({
    type: "awaiting_retry_approval",
    userStoryId: userStory.id,
    retryCount: state.retryCount,
    score: feedback?.score ?? 0,
    notes: feedback?.notes ?? "Sem feedback disponível",
    missingItems: feedback?.missingItems ?? [],
  }) as RetryDecision;

  if (!decision.continueRetry) {
    // User chose to stop: mark workflow as completed with current output
    return {
      pendingRetryApproval: null,
      status: "completed",
    };
  }

  // User chose to continue: reset retry counter for another 3 attempts
  return {
    pendingRetryApproval: null,
    retryCount: 0,
    status: "running",
  };
}