import type { UBuildState, UBuildUpdate } from "../state.js";
import type { LangGraphDependencies } from "../dependencies.js";
import { defaultLangGraphDependencies } from "../dependencies.js";
import { agentArtifactFields, getArtifactContext } from "../artifactContext.js";
import { buildGeneratedHtmlChangeSet } from "../../code/buildGeneratedHtmlChangeSet.js";
import { buildFrontendCodeChangeSet } from "../../code/buildFrontendCodeChangeSet.js";

export function createFrontAgentNode(deps: LangGraphDependencies) {
  return async function frontAgentNode(
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

    const [codeContext, designContext] =
      state.frontendProjectId && state.frontendProjectRootPath
        ? await Promise.all([
            deps.buildFrontendCodeContext({
              projectId: state.frontendProjectId,
              projectRootPath: state.frontendProjectRootPath,
              query: buildFrontendContextQuery(userStory.title, state.executionBrief),
            }),
            deps.buildDesignContext
              ? deps.buildDesignContext({
                  projectId: state.frontendProjectId,
                  projectRootPath: state.frontendProjectRootPath,
                })
              : Promise.resolve(undefined),
          ])
        : [undefined, undefined];

    const llmSettings = await deps.getRuntimeLlmSettings(state.threadId);
    // Self-correction: pass curator feedback so the agent improves on retry.
    const frontendOutput = await deps.generateFrontend(
      userStory,
      spec,
      curatorFeedback,
      llmSettings,
      state.executionBrief,
      codeContext,
      designContext
    );
    const { html } = frontendOutput;

    console.log(
      `[frontAgentNode] HTML generated (${html.length} chars) for: ${userStory.id}`
    );

    const codeChangeSet =
      frontendOutput.operations && frontendOutput.operations.length > 0
        ? buildFrontendCodeChangeSet({
            workflowThreadId: state.threadId,
            userStory,
            operations: frontendOutput.operations,
            ...(codeContext ? { codeContext } : {}),
            ...(artifactContext ? { artifactContext } : {}),
          })
        : buildGeneratedHtmlChangeSet({
            workflowThreadId: state.threadId,
            userStory,
            html,
            ...(artifactContext ? { artifactContext } : {}),
          });

    return {
      agentResults: {
        [userStory.id]: [
          {
            status: "success",
            agentName: "front",
            userStoryId: userStory.id,
            output: {
              html,
              codeChangeSet,
              attempt: state.retryCount,
              ...(frontendOutput.inspectedFiles
                ? { inspectedFiles: frontendOutput.inspectedFiles }
                : {}),
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

export const frontAgentNode = createFrontAgentNode(defaultLangGraphDependencies);

function buildFrontendContextQuery(
  userStoryTitle: string,
  executionBrief: string | undefined
): string {
  return [userStoryTitle, executionBrief].filter(Boolean).join("\n");
}
