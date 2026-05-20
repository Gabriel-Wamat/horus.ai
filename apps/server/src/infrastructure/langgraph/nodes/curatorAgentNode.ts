import type { UBuildState, UBuildUpdate } from "../state.js";

export async function curatorAgentNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error("curatorAgentNode: missing user story");
  }

  const nextIndex = state.currentUSIndex + 1;
  const isLast = nextIndex >= state.userStories.length;

  console.log(`[curatorAgentNode] Validating story: ${userStory.id}`);

  // TODO: invoke IAgentProvider to validate against approved Spec
  return {
    currentUSIndex: nextIndex,
    status: isLast ? "completed" : "running",
  };
}
