import type { UBuildState, UBuildUpdate } from "../state.js";
import { generateSpec } from "../../agents/SpecAgentImpl.js";

export async function specAgentNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error(
      `specAgentNode: no user story at index ${state.currentUSIndex}`
    );
  }

  console.log(`[specAgentNode] Gerando spec para: "${userStory.title}"`);

  const spec = await generateSpec(userStory);

  console.log(`[specAgentNode] Spec gerada: ${spec.id}`);

  return {
    specs: { [userStory.id]: spec },
    status: "awaiting_human",
  };
}
