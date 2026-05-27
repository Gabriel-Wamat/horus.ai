import type { UBuildState, UBuildUpdate } from "../state.js";
import type { LangGraphDependencies } from "../dependencies.js";
import { defaultLangGraphDependencies } from "../dependencies.js";
import { agentArtifactFields, getArtifactContext } from "../artifactContext.js";
import type { QaPreviewSmokeResult } from "../../preview/QaPreviewSmokeValidationService.js";
import { buildRuntimeValidationEvidenceFromPreviewSmoke } from "../../agents/QaAgentImpl.js";

export function createQaAgentNode(deps: LangGraphDependencies) {
  return async function qaAgentNode(state: UBuildState): Promise<UBuildUpdate> {
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
    const artifactContext = getArtifactContext(state, userStory.id);

    console.log(
      `[qaAgentNode] Generating QA tests for: ${userStory.id} (retry=${state.retryCount})`
    );

    // Self-correction: curator feedback refines test coverage on retry
    const qaOutput = await deps.generateQaTests(
      userStory,
      spec,
      curatorFeedback,
      deps.getRuntimeLlmSettings(state.threadId),
      state.executionBrief
    );
    const previewSmoke = await validatePreviewForQa(state, deps);
    const runtimeValidation = buildRuntimeValidationEvidenceFromPreviewSmoke({
      workflowThreadId: state.threadId,
      userStoryId: userStory.id,
      ...(state.frontendProjectId ? { projectId: state.frontendProjectId } : {}),
      ...(previewSmoke ? { previewSmoke } : {}),
    });

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
            output: {
              ...qaOutput,
              ...(previewSmoke ? { previewSmoke } : {}),
              ...(runtimeValidation ? { runtimeValidation } : {}),
              attempt: state.retryCount,
            },
            executionTimeMs: Date.now() - start,
            completedAt: new Date().toISOString(),
            ...agentArtifactFields(artifactContext, state),
          },
        ],
      },
    };
  };
}

export const qaAgentNode = createQaAgentNode(defaultLangGraphDependencies);

async function validatePreviewForQa(
  state: UBuildState,
  deps: LangGraphDependencies
): Promise<QaPreviewSmokeResult | undefined> {
  if (state.previewSessionId && deps.validatePreviewSmoke) {
    return deps.validatePreviewSmoke(state.previewSessionId);
  }

  if (state.workflowMode === "chat_code_change" && state.frontendProjectId) {
    return {
      status: "blocked",
      reason: state.previewSessionId
        ? "preview_smoke_validator_unavailable"
        : "missing_preview_session_id",
      elapsedMs: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  return undefined;
}
