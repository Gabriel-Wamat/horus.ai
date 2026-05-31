import type { Spec, UserStory, WorkflowState } from "@u-build/shared";

export function useDisplayedWorkflowState({
  workflowState,
  threadId,
  selectedWorkspaceFolderId,
  selectedStoryId,
  submittedStories,
  persistedSpecsByStoryId,
  pendingSpec,
}: {
  workflowState: WorkflowState | null;
  threadId: string | null;
  selectedWorkspaceFolderId: string;
  selectedStoryId: string | null;
  submittedStories: UserStory[];
  persistedSpecsByStoryId: Record<string, Spec>;
  pendingSpec: { userStoryId: string; spec: Spec } | null;
}): {
  displayedWorkflowState: WorkflowState | null;
  agentFlowState: WorkflowState | null;
} {
  const displayedWorkflowState = workflowState
    ? {
        ...workflowState,
        specs: { ...persistedSpecsByStoryId, ...workflowState.specs },
      }
      : null;

  const agentFlowState: WorkflowState | null =
    displayedWorkflowState ??
    (threadId && submittedStories.length > 0
      ? {
          threadId,
          ...(selectedWorkspaceFolderId ? { workspaceFolderId: selectedWorkspaceFolderId } : {}),
          userStories: submittedStories,
          currentUSIndex: Math.max(
            0,
            submittedStories.findIndex((story) => story.id === selectedStoryId)
          ),
          workflowMode: "standard" as const,
          specs: pendingSpec ? { [pendingSpec.userStoryId]: pendingSpec.spec } : persistedSpecsByStoryId,
          workspaceArtifactContext: {},
          humanFeedback: {},
          agentResults: {},
          pendingCheckpoints: [],
          validationGates: [],
          status: pendingSpec ? "awaiting_human" : "running",
          startedAt: new Date().toISOString(),
        }
      : null);

  return { displayedWorkflowState, agentFlowState };
}
