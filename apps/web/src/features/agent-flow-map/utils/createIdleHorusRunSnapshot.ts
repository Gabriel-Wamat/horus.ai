import type { HorusRunSnapshot } from "../types/api.types.js";

export function createIdleHorusRunSnapshot(): HorusRunSnapshot {
  const now = new Date().toISOString();

  return {
    threadId: "00000000-0000-4000-8000-000000000000",
    workflowMode: "standard",
    status: "idle",
    currentPhase: "received",
    currentNode: null,
    currentUserStoryId: null,
    currentUserStoryTitle: null,
    startedAt: now,
    userStories: [],
    steps: [],
    agentExecutions: [],
    events: [],
    evidenceSummaries: [],
    validationSummary: {
      finalStatus: "completed_unverified",
      gates: [],
      passedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      blockedCount: 0,
      message: "No validation gates were recorded.",
    },
    sourceState: { validationGates: [] } as unknown as HorusRunSnapshot["sourceState"],
  };
}
