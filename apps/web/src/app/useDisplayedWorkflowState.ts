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
    : Object.keys(persistedSpecsByStoryId).length > 0
      ? {
          threadId: "00000000-0000-4000-8000-000000000000",
          ...(selectedWorkspaceFolderId ? { workspaceFolderId: selectedWorkspaceFolderId } : {}),
          userStories: submittedStories,
          currentUSIndex: 0,
          workflowMode: "standard" as const,
          specs: persistedSpecsByStoryId,
          workspaceArtifactContext: {},
          humanFeedback: {},
          agentResults: {},
          pendingCheckpoints: [],
          validationGates: [],
          status: "idle" as const,
          startedAt: new Date(0).toISOString(),
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
