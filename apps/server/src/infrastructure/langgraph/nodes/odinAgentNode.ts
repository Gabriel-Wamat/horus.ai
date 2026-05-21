import type { UBuildState, UBuildUpdate } from "../state.js";
import { decideRouting } from "../../agents/OdinAgentImpl.js";

export async function odinAgentNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error("odinAgentNode: missing user story");
  }

  const spec = state.specs[userStory.id];
  if (!spec) {
    throw new Error(`odinAgentNode: missing spec for story ${userStory.id}`);
  }

  const start = Date.now();

  // Reflection pattern: pass curator feedback so Odin can narrow routing on retry
  const curatorFeedback = state.curatorFeedback[userStory.id];
  const agents = decideRouting(spec, curatorFeedback);

  console.log(
    `[odinAgentNode] Routing for ${userStory.id} (retry=${state.retryCount}): [${agents.join(", ")}]`
  );

  return {
    routingDecision: agents,
    agentResults: {
      [userStory.id]: [
        {
          status: "success",
          agentName: "odin",
          userStoryId: userStory.id,
          output: { routing: agents, retryCount: state.retryCount },
          executionTimeMs: Date.now() - start,
          completedAt: new Date().toISOString(),
        },
      ],
    },
  };
}