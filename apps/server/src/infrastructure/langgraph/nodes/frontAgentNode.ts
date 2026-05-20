import type { UBuildState, UBuildUpdate } from "../state.js";

export async function frontAgentNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error("frontAgentNode: missing user story");
  }

  console.log(`[frontAgentNode] Generating code for story: ${userStory.id}`);

  // TODO: invoke IAgentProvider to generate frontend code artefacts
  return {};
}
