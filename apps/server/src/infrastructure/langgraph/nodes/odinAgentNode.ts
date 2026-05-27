import type { UBuildState, UBuildUpdate } from "../state.js";
import type { LangGraphDependencies } from "../dependencies.js";
import { defaultLangGraphDependencies } from "../dependencies.js";

export function createOdinAgentNode(deps: LangGraphDependencies) {
  return async function odinAgentNode(
    state: UBuildState
  ): Promise<UBuildUpdate> {
    const userStory = state.userStories[state.currentUSIndex];

    if (state.status === "completed") {
      console.log("[odinAgentNode] Workflow completed; routing to terminal state.");
      return { routingDecision: [] };
    }

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
    const agents = deps.decideRouting(spec, curatorFeedback);

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
            output: {
              routing: agents,
              retryCount: state.retryCount,
              workflowMode: state.workflowMode,
              executionBrief: state.executionBrief ?? null,
            },
            executionTimeMs: Date.now() - start,
            completedAt: new Date().toISOString(),
            ...(state.sourceChatSessionId
              ? { chatSessionId: state.sourceChatSessionId }
              : {}),
            ...(state.sourceChatMessageId
              ? { sourceMessageId: state.sourceChatMessageId }
              : {}),
          },
        ],
      },
    };
  };
}

export const odinAgentNode = createOdinAgentNode(defaultLangGraphDependencies);
