import type { UBuildState, UBuildUpdate } from "../state.js";
import { generateQaTests } from "../../agents/QaAgentImpl.js";

export async function qaAgentNode(state: UBuildState): Promise<UBuildUpdate> {
  const userStory = state.userStories[state.currentUSIndex];

  if (!userStory) {
    throw new Error("qaAgentNode: missing user story");
  }

  const spec = state.specs[userStory.id];
  if (!spec) {
    throw new Error(`qaAgentNode: missing spec for story ${userStory.id}`);
  }

  const start = Date.now();
  const curatorFeedback = state.curatorFeedback[userStory.id];

  console.log(
    `[qaAgentNode] Generating QA tests for: ${userStory.id} (retry=${state.retryCount})`
  );

  // Self-correction: curator feedback refines test coverage on retry
  const qaOutput = await generateQaTests(userStory, spec, curatorFeedback);

  console.log(
    `[qaAgentNode] Generated ${qaOutput.testCases.length} test cases for: ${userStory.id}`
  );

  return {
    agentResults: {
      [userStory.id]: [
        {
          status: "success",
          agentName: "qa",
          userStoryId: userStory.id,
          output: { ...qaOutput, attempt: state.retryCount },
          executionTimeMs: Date.now() - start,
          completedAt: new Date().toISOString(),
        },
      ],
    },
  };
}