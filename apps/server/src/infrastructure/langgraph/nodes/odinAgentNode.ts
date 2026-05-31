import type { UBuildState, UBuildUpdate } from "../state.js";
import type { LangGraphDependencies } from "../dependencies.js";
import { defaultLangGraphDependencies } from "../dependencies.js";
import { summarizePromptContextForResult } from "../../prompt/PromptContextAssembler.js";
import { attachAgentContextProfile } from "../../../application/services/AgentContextProfileService.js";

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
    const basePromptContext = deps.buildPromptContext
      ? await deps.buildPromptContext({
          agentProfileId: "odin_agent",
          workflowThreadId: state.threadId,
          ...(state.workspaceFolderId
            ? { workspaceFolderId: state.workspaceFolderId }
            : {}),
          userStoryId: userStory.id,
          ...(state.frontendProjectId ? { projectId: state.frontendProjectId } : {}),
          ...(state.sourceChatSessionId
            ? { chatSessionId: state.sourceChatSessionId }
            : {}),
          triggerReason: "odin_agent_prompt",
        })
      : undefined;

    // Reflection pattern: pass curator feedback so Odin can narrow routing on retry
    const curatorFeedback = state.curatorFeedback[userStory.id];
    const agents =
      state.workflowMode === "chat_code_change" && !curatorFeedback
        ? ["frontAgent"]
      : deps.decideRouting(spec, curatorFeedback);
    const operationalMemory = deps.buildOperationalMemory
      ? await deps.buildOperationalMemory({
          workflowThreadId: state.threadId,
          userStoryId: userStory.id,
          agentResults: state.agentResults[userStory.id] ?? [],
          curatorFeedback: curatorFeedback ?? null,
          retryCount: state.retryCount,
        })
      : undefined;
    const contextProfile = deps.buildAgentContextProfile
      ? await deps.buildAgentContextProfile({
          agentName: "odin",
          agentProfileId: "odin_agent",
          userStory,
          spec,
          operationalMemory,
          curatorFeedback: curatorFeedback ?? null,
          routingDecision: agents,
          workflowStatus: state.status,
          retryCount: state.retryCount,
        })
      : undefined;
    const promptContext = attachAgentContextProfile(
      basePromptContext,
      contextProfile
    );

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
              ...(promptContext
                ? { promptContext: summarizePromptContextForResult(promptContext) }
                : {}),
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
