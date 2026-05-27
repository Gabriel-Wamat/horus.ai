import type { UBuildState, UBuildUpdate, CuratorFeedback } from "../state.js";
import { selectCuratorInputs } from "../curatorInputs.js";
import type { LangGraphDependencies } from "../dependencies.js";
import { defaultLangGraphDependencies } from "../dependencies.js";
import { agentArtifactFields, getArtifactContext } from "../artifactContext.js";

const MAX_RETRIES = 3;

export function createCuratorAgentNode(deps: LangGraphDependencies) {
  return async function curatorAgentNode(
    state: UBuildState
  ): Promise<UBuildUpdate> {
    const userStory = state.userStories[state.currentUSIndex];

    if (!userStory) {
      throw new Error("curatorAgentNode: missing user story");
    }

    const spec = state.specs[userStory.id];
    if (!spec) {
      throw new Error(`curatorAgentNode: missing spec for story ${userStory.id}`);
    }

    const results = state.agentResults[userStory.id] ?? [];
    const { html, qaOutput, codeChangeSet } = selectCuratorInputs(results);
    const artifactContext = getArtifactContext(state, userStory.id);

    const start = Date.now();
    console.log(
      `[curatorAgentNode] Validating story: ${userStory.id} (attempt ${state.retryCount + 1})`
    );

    const llmSettings = await deps.getRuntimeLlmSettings(state.threadId);
    const preflight =
      codeChangeSet && state.frontendProjectRootPath && deps.preflightCodeChangeSet
        ? await deps.preflightCodeChangeSet({
            changeSet: codeChangeSet,
            projectRootPath: state.frontendProjectRootPath,
            workflowThreadId: state.threadId,
            userStoryId: userStory.id,
            ...(state.frontendProjectId ? { projectId: state.frontendProjectId } : {}),
          })
        : undefined;

    const validation =
      preflight && !preflight.passed
        ? {
            passed: false,
            score: 0,
            notes:
              "Curador bloqueou a entrega porque a preflight terminal/estática falhou antes de aplicar o projeto.",
            missingItems: preflight.issues,
            fixTarget: "front" as const,
          }
        : await deps.validateOutput(
            spec,
            html,
            qaOutput,
            codeChangeSet,
            llmSettings,
            state.executionBrief
          );

    const feedback: CuratorFeedback = {
      passed: validation.passed,
      score: validation.score,
      notes: validation.notes,
      missingItems: validation.missingItems,
      fixTarget: validation.fixTarget,
    };

    const agentResultEntry = {
      status: "success" as const,
      agentName: "curator" as const,
      userStoryId: userStory.id,
      output: {
        ...validation,
        attempt: state.retryCount + 1,
        ...(preflight
          ? {
              preflightValidation: {
                passed: preflight.passed,
                issues: preflight.issues,
                validation: preflight.validation,
              },
              runtimeValidation: preflight.runtimeEvidence,
            }
          : {}),
      },
      executionTimeMs: Date.now() - start,
      completedAt: new Date().toISOString(),
      ...agentArtifactFields(artifactContext, state),
    };

    console.log(
      `[curatorAgentNode] score=${validation.score} passed=${validation.passed} fixTarget=${validation.fixTarget}`
    );

    // ── Success path ──────────────────────────────────────────────────────────
    if (validation.passed) {
      const nextIndex = state.currentUSIndex + 1;
      return {
        currentUSIndex: nextIndex,
        retryCount: 0,
        pendingRetryApproval: null,
        curatorFeedback: { [userStory.id]: feedback },
        status: nextIndex >= state.userStories.length ? "completed" : "running",
        agentResults: { [userStory.id]: [agentResultEntry] },
      };
    }

    const newRetryCount = state.retryCount + 1;

    // ── Max retries exceeded → escalate to HITL ───────────────────────────────
    if (newRetryCount > MAX_RETRIES) {
      return {
        retryCount: newRetryCount,
        curatorFeedback: { [userStory.id]: feedback },
        pendingRetryApproval: {
          userStoryId: userStory.id,
          retryCount: newRetryCount,
          score: validation.score,
          notes: validation.notes,
          missingItems: validation.missingItems,
        },
        status: "awaiting_human",
        agentResults: { [userStory.id]: [agentResultEntry] },
      };
    }

    // ── Retry path ────────────────────────────────────────────────────────────
    return {
      retryCount: newRetryCount,
      curatorFeedback: { [userStory.id]: feedback },
      pendingRetryApproval: null,
      status: "running",
      agentResults: { [userStory.id]: [agentResultEntry] },
    };
  };
}

export const curatorAgentNode = createCuratorAgentNode(
  defaultLangGraphDependencies
);
