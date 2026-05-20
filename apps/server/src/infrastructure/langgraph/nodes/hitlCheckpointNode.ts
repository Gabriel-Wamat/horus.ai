import { interrupt } from "@langchain/langgraph";
import type { UBuildState, UBuildUpdate } from "../state.js";
import type { HumanFeedback } from "@u-build/shared";

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

  // Suspends the graph here. MemorySaver persists the full state.
  // Resumes when graph.stream(new Command({ resume: feedback }), config) is called.
  // The interrupt argument is the payload surfaced to the caller (any shape);
  // the return value is the HumanFeedback sent back via Command({ resume }).
  const feedback = interrupt({
    type: "awaiting_approval",
    userStoryId: userStory.id,
    spec,
  }) as HumanFeedback;

  const resolvedSpec =
    feedback.approved && feedback.editedSpec ? feedback.editedSpec : spec;

  return {
    humanFeedback: { [userStory.id]: feedback },
    specs: { [userStory.id]: resolvedSpec },
    status: "running",
  };
}
