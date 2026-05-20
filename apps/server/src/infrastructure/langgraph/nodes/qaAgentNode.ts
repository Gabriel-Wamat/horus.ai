import type { UBuildState, UBuildUpdate } from "../state.js";

export async function qaAgentNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error("qaAgentNode: missing user story");
  }

  console.log(`[qaAgentNode] Generating tests for story: ${userStory.id}`);

  // TODO: invoke IAgentProvider to generate test suites
  return {};
}
