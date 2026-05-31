import type { UBuildState, UBuildUpdate } from "../state.js";
import type { LangGraphDependencies } from "../dependencies.js";
import { defaultLangGraphDependencies } from "../dependencies.js";
import {
  agentArtifactFields,
  mergeSpecRevisionContext,
} from "../artifactContext.js";
import { summarizePromptContextForResult } from "../../prompt/PromptContextAssembler.js";

const SPEC_AGENT_SKILL_ID = "spec-frontend-sdd";

export function createSpecAgentNode(deps: LangGraphDependencies) {
  return async function specAgentNode(
    state: UBuildState
  ): Promise<UBuildUpdate> {
    const userStory = state.userStories[state.currentUSIndex];

    if (!userStory) {
      throw new Error(
        `specAgentNode: no user story at index ${state.currentUSIndex}`
      );
    }

    console.log(
      `[specAgentNode] workflowMode=${state.workflowMode} index=${state.currentUSIndex}/${state.userStories.length} userStory=${userStory.id} title="${userStory.title}"`
    );

    const existingSpec = state.specs[userStory.id];
    if (existingSpec) {
      console.log(
        `[specAgentNode] Spec existente encontrada para userStory=${userStory.id}; pulando geração.`
      );
      const nextIndex = state.currentUSIndex + 1;
      return {
        currentUSIndex:
          state.workflowMode === "spec_generation"
            ? nextIndex
            : state.currentUSIndex,
        status:
          state.workflowMode === "spec_generation"
            ? nextIndex >= state.userStories.length
              ? "completed"
              : "running"
            : "awaiting_human",
      };
    }

    const start = Date.now();
    const specSkill = deps.loadAgentSkill(SPEC_AGENT_SKILL_ID);
    const llmSettings = await deps.getRuntimeLlmSettings(state.threadId);
    const promptContext = deps.buildPromptContext
      ? await deps.buildPromptContext({
          agentProfileId: "spec_agent",
          workflowThreadId: state.threadId,
          ...(state.workspaceFolderId
            ? { workspaceFolderId: state.workspaceFolderId }
            : {}),
          userStoryId: userStory.id,
          ...(state.frontendProjectId ? { projectId: state.frontendProjectId } : {}),
          ...(state.sourceChatSessionId
            ? { chatSessionId: state.sourceChatSessionId }
            : {}),
          triggerReason: "spec_agent_prompt",
        })
      : undefined;
    const designContext = state.frontendProjectRootPath && deps.buildDesignContext
      ? await deps.buildDesignContext({
          ...(state.frontendProjectId
            ? { projectId: state.frontendProjectId }
            : {}),
          projectRootPath: state.frontendProjectRootPath,
        })
      : undefined;
    const spec = await deps.generateSpec(userStory, {
      skill: specSkill,
      llmSettings,
      ...(designContext ? { designContext } : {}),
      ...(promptContext ? { promptContext } : {}),
    });
    const artifactContext = mergeSpecRevisionContext(state, userStory.id, spec);

    console.log(`[specAgentNode] Spec gerada: ${spec.id}`);

    const nextIndex = state.currentUSIndex + 1;

    return {
      specs: { [userStory.id]: spec },
      ...(state.workflowMode === "spec_generation"
        ? { currentUSIndex: nextIndex }
        : {}),
      ...(artifactContext
        ? { workspaceArtifactContext: { [userStory.id]: artifactContext } }
        : {}),
      agentResults: {
        [userStory.id]: [
          {
            status: "success",
            agentName: "spec",
            userStoryId: userStory.id,
            output: {
              specId: spec.id,
              specVersion: spec.version,
              ...(promptContext
                ? { promptContext: summarizePromptContextForResult(promptContext) }
                : {}),
            },
            executionTimeMs: Date.now() - start,
            completedAt: new Date().toISOString(),
            ...agentArtifactFields(artifactContext),
          },
        ],
      },
      status:
        state.workflowMode === "spec_generation"
          ? nextIndex >= state.userStories.length
            ? "completed"
            : "running"
          : "awaiting_human",
    };
  };
}

export const specAgentNode = createSpecAgentNode(defaultLangGraphDependencies);
