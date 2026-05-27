import { interrupt } from "@langchain/langgraph";
import type { UBuildState, UBuildUpdate } from "../state.js";
import type { HumanFeedback, Spec, WorkspaceArtifactContext } from "@u-build/shared";
import { createSpecRevisionId } from "../artifactContext.js";

export function resolveSpecApproval(
  userStoryId: string,
  spec: Spec,
  feedback: HumanFeedback,
  currentArtifactContext?: WorkspaceArtifactContext
): UBuildUpdate {
  if (!feedback.approved) {
    return {
      humanFeedback: { [userStoryId]: feedback },
      status: "cancelled",
    };
  }

  const resolvedSpec = feedback.editedSpec ? feedback.editedSpec : spec;
  const artifactContext = currentArtifactContext
    ? {
        ...currentArtifactContext,
        specRevisionId: createSpecRevisionId(resolvedSpec),
      }
    : undefined;

  return {
    humanFeedback: { [userStoryId]: feedback },
    specs: { [userStoryId]: resolvedSpec },
    ...(artifactContext
      ? { workspaceArtifactContext: { [userStoryId]: artifactContext } }
      : {}),
    status: "running",
  };
}

export async function hitlCheckpointNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error(
      `hitlCheckpointNode: no user story at index ${state.currentUSIndex}`
    );
  }

  const spec = state.specs[userStory.id];

  if (!spec) {
    throw new Error(
      `hitlCheckpointNode: no spec found for user story ${userStory.id}`
    );
  }

  // Suspends the graph here. The configured checkpointer persists the full state.
  // Resumes when graph.stream(new Command({ resume: feedback }), config) is called.
  // The interrupt argument is the payload surfaced to the caller (any shape);
  // the return value is the HumanFeedback sent back via Command({ resume }).
  const feedback = interrupt({
    type: "awaiting_approval",
    userStoryId: userStory.id,
    spec,
  }) as HumanFeedback;

  return resolveSpecApproval(
    userStory.id,
    spec,
    feedback,
    state.workspaceArtifactContext[userStory.id]
  );
}
