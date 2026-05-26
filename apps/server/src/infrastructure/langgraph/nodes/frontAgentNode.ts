import type { UBuildState, UBuildUpdate } from "../state.js";
import { generateFrontend } from "../../agents/FrontAgentImpl.js";
import { getRuntimeLlmSettings } from "../../llm/runtimeLlmSettings.js";
import { agentArtifactFields, getArtifactContext } from "../artifactContext.js";

export async function frontAgentNode(
  state: UBuildState
): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error("frontAgentNode: missing user story");
  }

  const spec = state.specs[userStory.id];
  if (!spec) {
    throw new Error(`frontAgentNode: missing spec for story ${userStory.id}`);
  }

  const start = Date.now();
  const curatorFeedback = state.curatorFeedback[userStory.id];
  const artifactContext = getArtifactContext(state, userStory.id);

  console.log(
    `[frontAgentNode] Generating frontend for: ${userStory.id} (retry=${state.retryCount})`
  );

  // Self-correction: pass curator feedback so the agent improves on retry
  const { html } = await generateFrontend(
    userStory,
    spec,
    curatorFeedback,
    getRuntimeLlmSettings(state.threadId),
    state.executionBrief
  );

  console.log(
    `[frontAgentNode] HTML generated (${html.length} chars) for: ${userStory.id}`
  );

  return {
    agentResults: {
      [userStory.id]: [
        {
          status: "success",
          agentName: "front",
          userStoryId: userStory.id,
          output: { html, attempt: state.retryCount },
          executionTimeMs: Date.now() - start,
          completedAt: new Date().toISOString(),
          ...agentArtifactFields(artifactContext, state),
        },
      ],
    },
  };
}
