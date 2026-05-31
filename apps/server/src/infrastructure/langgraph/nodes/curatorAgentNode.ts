import type { UBuildState, UBuildUpdate, CuratorFeedback } from "../state.js";
import { selectCuratorInputs } from "../curatorInputs.js";
import type { LangGraphDependencies } from "../dependencies.js";
import { defaultLangGraphDependencies } from "../dependencies.js";
import { agentArtifactFields, getArtifactContext } from "../artifactContext.js";
import {
  visualGateFeedbackItems,
  visualGateToRuntimeEvidence,
} from "../../visual/VisualDesignGateService.js";
import { summarizePromptContextForResult } from "../../prompt/PromptContextAssembler.js";
import { attachAgentContextProfile } from "../../../application/services/AgentContextProfileService.js";
import { defaultRuntimeHintCollector } from "../../../application/services/RuntimeHintCollector.js";
import { buildRuntimeHintsFromHistory } from "../agentRuntimeContext.js";
import type { ProjectContextSnapshot } from "@u-build/shared";

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
    const { html, qaOutput, codeChangeSet, candidateId } =
      selectCuratorInputs(results);
    const frontToolLoop = selectLatestFrontToolLoop(results);
    const artifactContext = getArtifactContext(state, userStory.id);

    const start = Date.now();
    console.log(
      `[curatorAgentNode] Validating story: ${userStory.id} (attempt ${state.retryCount + 1})`
    );

    const llmSettings = await deps.getRuntimeLlmSettings(state.threadId);
    const basePromptContext = deps.buildPromptContext
      ? await deps.buildPromptContext({
          agentProfileId: "curator_agent",
          workflowThreadId: state.threadId,
          ...(state.workspaceFolderId
            ? { workspaceFolderId: state.workspaceFolderId }
            : {}),
          userStoryId: userStory.id,
          ...(state.frontendProjectId ? { projectId: state.frontendProjectId } : {}),
          ...(state.sourceChatSessionId
            ? { chatSessionId: state.sourceChatSessionId }
            : {}),
          triggerReason: "curator_agent_prompt",
        })
      : undefined;
    const designContext =
      state.frontendProjectRootPath && deps.buildDesignContext
        ? await deps.buildDesignContext({
            ...(state.frontendProjectId
              ? { projectId: state.frontendProjectId }
              : {}),
            projectRootPath: state.frontendProjectRootPath,
          })
        : undefined;
    const preflight =
      codeChangeSet && state.frontendProjectRootPath && deps.preflightCodeChangeSet
        ? await deps.preflightCodeChangeSet({
            changeSet: codeChangeSet,
            projectRootPath: state.frontendProjectRootPath,
            constructionRunId: artifactContext?.constructionRunId ?? null,
            workflowThreadId: state.threadId,
            userStoryId: userStory.id,
            ...(state.frontendProjectId ? { projectId: state.frontendProjectId } : {}),
            trace: buildCuratorPreflightTraceContext({
              state,
              codeChangeSet,
              constructionRunId: artifactContext?.constructionRunId ?? null,
            }),
            onCommandOutput: (output) => {
              deps.emitWorkflowEvent?.({
                type: "command_output",
                threadId: state.threadId,
                agentName: "curator",
                agentProfileId: "curator_agent",
                toolName: "run_validation_command",
                commandId: output.commandId,
                ...(output.taskId ? { taskId: output.taskId } : {}),
                ...(output.traceId ? { traceId: output.traceId } : {}),
                ...(output.spanId ? { spanId: output.spanId } : {}),
                ...(output.parentSpanId
                  ? { parentSpanId: output.parentSpanId }
                  : {}),
                ...(output.toolCallId ? { toolCallId: output.toolCallId } : {}),
                ...(output.runId ? { runId: output.runId } : {}),
                ...(output.projectId ? { projectId: output.projectId } : {}),
                ...(output.agentId ? { agentId: output.agentId } : {}),
                ...(output.filePath ? { filePath: output.filePath } : {}),
                ...(output.diffId ? { diffId: output.diffId } : {}),
                stream: output.stream,
                chunk: output.chunk,
                chunkSequence: output.sequence,
                userStoryId: userStory.id,
                timestamp: output.timestamp,
              });
            },
          })
        : undefined;

    const visualGate =
      (!preflight || preflight.passed) && deps.validateVisualGate
        ? await deps.validateVisualGate({
            spec,
            html,
            codeChangeSet,
            ...(state.frontendProjectRootPath
              ? { projectRootPath: state.frontendProjectRootPath }
              : {}),
            workflowThreadId: state.threadId,
            userStoryId: userStory.id,
            ...(state.frontendProjectId ? { projectId: state.frontendProjectId } : {}),
            designContext,
          })
        : undefined;

    const visualRuntimeEvidence = visualGate
      ? visualGateToRuntimeEvidence({
          result: visualGate,
          workflowThreadId: state.threadId,
          userStoryId: userStory.id,
          projectId: state.frontendProjectId ?? null,
        })
      : undefined;
    const runtimeValidationEvidence = visualRuntimeEvidence ?? preflight?.runtimeEvidence;
    const previousCuratorFeedback = state.curatorFeedback[userStory.id] ?? null;
    const traceabilityForPrompt = deps.buildSpecTraceability
      ? await deps.buildSpecTraceability({
          spec,
          codeChangeSet,
          qaOutput,
          runtimeValidation: runtimeValidationEvidence,
          curatorFeedback: previousCuratorFeedback,
        })
      : undefined;
    const operationalMemory = deps.buildOperationalMemory
      ? await deps.buildOperationalMemory({
          workflowThreadId: state.threadId,
          userStoryId: userStory.id,
          agentResults: results,
          curatorFeedback: previousCuratorFeedback,
          retryCount: state.retryCount,
        })
      : undefined;
    // Build hints from this turn's runtime evidence (curator sees evidence
    // produced by preflight + visual gate immediately) and from the previous
    // curator feedback. These get passed to the Engine so the snapshot cache
    // can reflect the *current* failure picture for downstream consumers
    // (e.g. the chat agent during a curator-rejected retry).
    const curatorRuntimeHints = [
      ...defaultRuntimeHintCollector.collect({
        ...(runtimeValidationEvidence
          ? { runtimeValidation: runtimeValidationEvidence }
          : {}),
      }),
      ...buildRuntimeHintsFromHistory({
        runtimeValidation: undefined,
        curatorFeedback: previousCuratorFeedback ?? undefined,
      }),
    ];
    let curatorProjectSnapshot: ProjectContextSnapshot | undefined;
    if (
      deps.buildProjectContextSnapshot &&
      state.frontendProjectId &&
      state.frontendProjectRootPath
    ) {
      curatorProjectSnapshot = await deps.buildProjectContextSnapshot({
        projectId: state.frontendProjectId,
        projectRootPath: state.frontendProjectRootPath,
        query: [userStory.title, state.executionBrief]
          .filter(Boolean)
          .join("\n") || userStory.title,
        agentProfileId: "curator_agent",
        runtimeHints: curatorRuntimeHints,
      });
    }
    // If a snapshot is available, prefer the deterministic auto-mapper for
    // pre-prompt traceability so the envelope's traceability section reflects
    // real symbol/file/test coverage rather than vague LLM evidence. Falls
    // back to the LLM-based service when snapshot is absent.
    const autoTraceability =
      curatorProjectSnapshot && deps.buildAutoTraceabilityFromSnapshot
        ? deps.buildAutoTraceabilityFromSnapshot({
            spec,
            userStoryId: userStory.id,
            snapshot: curatorProjectSnapshot,
          })
        : undefined;
    const traceabilityForPromptResolved =
      autoTraceability ?? traceabilityForPrompt;
    const contextProfile = deps.buildAgentContextProfile
      ? await deps.buildAgentContextProfile({
          agentName: "curator",
          agentProfileId: "curator_agent",
          userStory,
          spec,
          designContext,
          codeChangeSet,
          qaOutput,
          runtimeValidation: runtimeValidationEvidence,
          operationalMemory,
          traceability: traceabilityForPromptResolved,
          curatorFeedback: previousCuratorFeedback,
          workflowStatus: state.status,
          retryCount: state.retryCount,
        })
      : undefined;
    const promptContext = attachAgentContextProfile(
      basePromptContext,
      contextProfile
    );

    const deterministicCodeChangeGatesRequired =
      Boolean(codeChangeSet) &&
      (state.workflowMode === "project_construction" ||
        state.workflowMode === "chat_code_change");

    const deterministicCodeChangeGatesUnavailable =
      deterministicCodeChangeGatesRequired &&
      (!state.frontendProjectRootPath || !deps.preflightCodeChangeSet);

    const chatToolEditSucceeded =
      state.workflowMode === "chat_code_change" &&
      codeChangeSet &&
      frontToolLoop?.status === "succeeded" &&
      frontToolLoop.changedFiles.length > 0;

    const validation =
      deterministicCodeChangeGatesUnavailable
        ? {
            passed: false,
            score: 0,
            notes:
              "Curador bloqueou a entrega porque uma alteração de código exige CodeChangeSet + preflight determinística, mas o projeto ou o serviço de preflight não está disponível.",
            missingItems: [
              "missing deterministic validation evidence: codeChangeSet preflight was not executed",
            ],
            fixTarget: "front" as const,
          }
        : preflight && !preflight.passed
        ? {
            passed: false,
            score: 0,
            notes:
              "Curador bloqueou a entrega porque a preflight terminal/estática falhou antes de aplicar o projeto.",
            missingItems: preflight.issues,
            fixTarget: "front" as const,
          }
        : visualGate && visualGate.status !== "passed"
          ? {
              passed: false,
              score: visualGate.score,
              notes:
                visualGate.status === "inconclusive"
                  ? "Curador bloqueou a entrega porque a validação visual ficou inconclusiva."
                  : "Curador bloqueou a entrega porque a validação visual reprovou.",
              missingItems: visualGateFeedbackItems(visualGate),
              fixTarget: "front" as const,
            }
          : deterministicCodeChangeGatesRequired &&
              codeChangeSet &&
              preflight?.passed === true &&
              (!visualGate || visualGate.status === "passed")
            ? {
                passed: true,
                score: Math.max(visualGate?.score ?? 0, 94),
                notes:
                  "Curador aprovou a entrega pelos gates determinísticos: preflight terminal/estática passou e validação visual não encontrou bloqueios.",
                missingItems: [],
                fixTarget: "front" as const,
              }
          : deterministicCodeChangeGatesRequired && codeChangeSet
            ? {
                passed: false,
                score: 0,
                notes:
                  "Curador bloqueou a entrega porque uma alteração de código precisa de evidência determinística antes de ser marcada como concluída.",
                missingItems: [
                  chatToolEditSucceeded
                    ? "governed tool edit exists, but deterministic preflight/runtime evidence is missing"
                    : "codeChangeSet exists, but deterministic preflight/runtime evidence is missing",
                ],
                fixTarget: "front" as const,
              }
          : await deps.validateOutput(
              spec,
              html,
              qaOutput,
              codeChangeSet,
              llmSettings,
              state.executionBrief,
              designContext,
              promptContext
            );

    const feedback: CuratorFeedback = {
      passed: validation.passed,
      score: validation.score,
      notes: validation.notes,
      missingItems: validation.missingItems,
      fixTarget: validation.fixTarget,
    };
    const traceability = deps.buildSpecTraceability
      ? await deps.buildSpecTraceability({
          spec,
          codeChangeSet,
          qaOutput,
          runtimeValidation: runtimeValidationEvidence,
          curatorFeedback: feedback,
        })
      : traceabilityForPromptResolved;

    const agentResultEntry = {
      status: "success" as const,
      agentName: "curator" as const,
      userStoryId: userStory.id,
      output: {
        ...validation,
        attempt: state.retryCount + 1,
        ...(candidateId ? { candidateId } : {}),
        ...(preflight
          ? {
              preflightValidation: {
                passed: preflight.passed,
                issues: preflight.issues,
                validation: preflight.validation,
              },
              terminalRuntimeValidation: preflight.runtimeEvidence,
            }
          : {}),
        ...(visualGate
          ? {
              visualGate,
              runtimeValidation: visualRuntimeEvidence,
            }
          : preflight
            ? {
                runtimeValidation: preflight.runtimeEvidence,
            }
            : {}),
        ...(operationalMemory ? { operationalMemory } : {}),
        ...(traceability ? { traceability } : {}),
        ...(promptContext
          ? { promptContext: summarizePromptContextForResult(promptContext) }
          : {}),
      },
      executionTimeMs: Date.now() - start,
      completedAt: new Date().toISOString(),
      ...agentArtifactFields(artifactContext, state),
    };

    console.log(
      `[curatorAgentNode] score=${validation.score} passed=${validation.passed} fixTarget=${validation.fixTarget}`
    );

    deps.recordAgentDebugTrace?.({
      projectId: state.frontendProjectId ?? null,
      workflowThreadId: state.threadId,
      userStoryId: userStory.id,
      agentName: "curator",
      agentProfileId: "curator_agent",
      turn: state.retryCount,
      ...(curatorProjectSnapshot ? { snapshot: curatorProjectSnapshot } : {}),
      hypothesis: deterministicCodeChangeGatesRequired
        ? "Deterministic gates required (preflight + visual). Verdict comes from gate outcomes."
        : "LLM-based curator verdict from spec + diff + runtime evidence.",
      action: visualGate
        ? "curator_validate_with_visual_gate"
        : preflight
          ? "curator_validate_with_preflight"
          : "curator_validate_llm",
      outcome: validation.passed ? "success" : "failure",
      durationMs: Date.now() - start,
      notes: [
        `score:${validation.score}`,
        `fix_target:${validation.fixTarget}`,
        `runtime_hints:${curatorRuntimeHints.length}`,
        ...(traceability
          ? [
              `traceability:covered=${traceability.summary.covered}/${traceability.summary.totalRequirements}`,
            ]
          : []),
      ],
      filesWritten: codeChangeSet
        ? codeChangeSet.operations.map((op) => op.targetPath)
        : [],
    });

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

    if (chatToolEditSucceeded || deterministicCodeChangeGatesUnavailable) {
      return {
        retryCount: state.retryCount,
        curatorFeedback: { [userStory.id]: feedback },
        pendingRetryApproval: null,
        status: "blocked",
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

function selectLatestFrontToolLoop(
  results: readonly unknown[]
): { status: string; changedFiles: string[] } | undefined {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (!result || typeof result !== "object") continue;
    const record = result as Record<string, unknown>;
    if (record["status"] !== "success" || record["agentName"] !== "front") {
      continue;
    }
    const output = record["output"];
    if (!output || typeof output !== "object") continue;
    const toolLoop = (output as Record<string, unknown>)["toolLoop"];
    if (!toolLoop || typeof toolLoop !== "object") continue;
    const toolLoopRecord = toolLoop as Record<string, unknown>;
    const status = toolLoopRecord["status"];
    const changedFiles = toolLoopRecord["changedFiles"];
    if (
      typeof status === "string" &&
      Array.isArray(changedFiles) &&
      changedFiles.every((file) => typeof file === "string")
    ) {
      return { status, changedFiles };
    }
  }
  return undefined;
}

function buildCuratorPreflightTraceContext(input: {
  state: UBuildState;
  codeChangeSet: {
    id: string;
    workflowThreadId: string;
    operations: readonly { targetPath: string }[];
  };
  constructionRunId?: string | null;
}) {
  const firstTouchedFile = input.codeChangeSet.operations[0]?.targetPath ?? null;
  const runId = input.constructionRunId ?? input.state.threadId;
  const spanId = `curator-preflight-${input.codeChangeSet.id}`;

  return {
    traceId: input.state.threadId,
    spanId,
    parentSpanId: null,
    toolCallId: spanId,
    runId,
    projectId: input.state.frontendProjectId ?? null,
    agentId: "curator_agent",
    filePath: firstTouchedFile,
    diffId: input.codeChangeSet.id,
  };
}
