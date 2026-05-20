import type { UBuildState, UBuildUpdate } from "../state.js";

export async function specAgentNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error(
      `specAgentNode: no user story at index ${state.currentUSIndex}`
    );
  }

  console.log(`[specAgentNode] Processing user story: ${userStory.id}`);

  // TODO: invoke IAgentProvider to call LLM and generate Spec
  return {};
}
