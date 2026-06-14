import { interrupt } from "@langchain/langgraph";
import type { UBuildState, UBuildUpdate } from "../state.js";

export interface CuratorReviewDecision {
  accepted: boolean;
}

export async function curatorReviewCheckpointNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error("curatorReviewCheckpointNode: missing user story");
  }

  const review = state.pendingCuratorReview;

  const decision = interrupt({
    type: "awaiting_curator_review",
    userStoryId: userStory.id,
    score: review?.score ?? 0,
    notes: review?.notes ?? "",
    previewSessionId: state.previewSessionId ?? null,
  }) as CuratorReviewDecision;

  if (!decision.accepted) {
    return {
      pendingCuratorReview: null,
      retryCount: 0,
      status: "running",
    };
  }

  const nextIndex = state.currentUSIndex + 1;
  return {
    pendingCuratorReview: null,
    currentUSIndex: nextIndex,
    retryCount: 0,
    status: nextIndex >= state.userStories.length ? "completed" : "running",
  };
}
