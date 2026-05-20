import type { UBuildState, UBuildUpdate } from "../state.js";

export async function odinAgentNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error("odinAgentNode: missing user story");
  }

  console.log(`[odinAgentNode] Orchestrating for story: ${userStory.id}`);

  // TODO: invoke IAgentProvider to coordinate downstream agents
  return {};
}
