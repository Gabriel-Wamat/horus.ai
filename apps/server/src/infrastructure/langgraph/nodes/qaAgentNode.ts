import type { UBuildState, UBuildUpdate } from "../state.js";
import type { LangGraphDependencies } from "../dependencies.js";
import { defaultLangGraphDependencies } from "../dependencies.js";
import { agentArtifactFields, getArtifactContext } from "../artifactContext.js";
import type { QaPreviewSmokeResult } from "../../preview/QaPreviewSmokeValidationService.js";
import { buildRuntimeValidationEvidenceFromPreviewSmoke } from "../../agents/QaAgentImpl.js";
import { summarizePromptContextForResult } from "../../prompt/PromptContextAssembler.js";
import { attachAgentContextProfile } from "../../../application/services/AgentContextProfileService.js";
import {
  buildRuntimeHintsFromHistory,
  extractLatestRuntimeValidation,
} from "../agentRuntimeContext.js";
import type {
  ProjectContextSnapshot,
  RuntimeValidationCommandEvidence,
} from "@u-build/shared";
import { randomUUID } from "node:crypto";
import {
  missingQaRuntimeToolEvidence,
  planQaRuntimeValidation,
} from "./qaRuntimeValidationPlanner.js";
import { buildShellCommandCompletionWorkflowEvent } from "./shellCommandWorkflowEvents.js";

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

    const llmSettings = await deps.getRuntimeLlmSettings(state.threadId);
    // Same resilience pattern as Front: pull the previous turn's runtime
    // validation evidence (and curator feedback) into hints, and reuse the
    // Engine snapshot so QA sees the canonical validation strategy + edit
    // restrictions for this stack.
    const previousRuntimeEvidence = extractLatestRuntimeValidation(
      state.agentResults[userStory.id] ?? []
    );
    const runtimeHints = buildRuntimeHintsFromHistory({
      runtimeValidation: previousRuntimeEvidence,
      curatorFeedback,
    });
    let projectSnapshot: ProjectContextSnapshot | undefined;
    if (
      deps.buildProjectContextSnapshot &&
      state.frontendProjectId &&
      state.frontendProjectRootPath
    ) {
      projectSnapshot = await deps.buildProjectContextSnapshot({
        projectId: state.frontendProjectId,
        projectRootPath: state.frontendProjectRootPath,
        query: [userStory.title, state.executionBrief]
          .filter(Boolean)
          .join("\n") || userStory.title,
        agentProfileId: "qa_agent",
        runtimeHints,
      });
    }
    const designContext =
      state.frontendProjectRootPath && deps.buildDesignContext
        ? await deps.buildDesignContext({
            ...(state.frontendProjectId
              ? { projectId: state.frontendProjectId }
              : {}),
            projectRootPath: state.frontendProjectRootPath,
          })
        : undefined;
    const basePromptContext = deps.buildPromptContext
      ? await deps.buildPromptContext({
          agentProfileId: "qa_agent",
          workflowThreadId: state.threadId,
          ...(state.workspaceFolderId
            ? { workspaceFolderId: state.workspaceFolderId }
            : {}),
          userStoryId: userStory.id,
          ...(state.frontendProjectId ? { projectId: state.frontendProjectId } : {}),
          ...(state.sourceChatSessionId
            ? { chatSessionId: state.sourceChatSessionId }
            : {}),
          triggerReason: "qa_agent_prompt",
        })
      : undefined;
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
          agentName: "qa",
          agentProfileId: "qa_agent",
          userStory,
          spec,
          designContext,
          // Feed previous turn's runtime evidence so QA's runtime_errors
          // section in the envelope is populated on retry.
          ...(previousRuntimeEvidence
            ? { runtimeValidation: previousRuntimeEvidence }
            : {}),
          operationalMemory,
          curatorFeedback: curatorFeedback ?? null,
          workflowStatus: state.status,
          retryCount: state.retryCount,
        })
      : undefined;
    const promptContext = attachAgentContextProfile(
      basePromptContext,
      contextProfile
    );
    // Self-correction: curator feedback refines test coverage on retry
    const qaOutput = await deps.generateQaTests(
      userStory,
      spec,
      curatorFeedback,
      llmSettings,
      state.executionBrief,
      designContext,
      promptContext
    );
    const commandEvidence = await executeQaValidationCommands({
      state,
      deps,
      userStoryId: userStory.id,
      projectSnapshot,
    });
    const previewSmoke = await validatePreviewForQa({
      state,
      deps,
      userStoryId: userStory.id,
    });
    const runtimeValidation = buildRuntimeValidationEvidenceFromPreviewSmoke({
      workflowThreadId: state.threadId,
      userStoryId: userStory.id,
      ...(state.frontendProjectId ? { projectId: state.frontendProjectId } : {}),
      ...(previewSmoke ? { previewSmoke } : {}),
      ...(commandEvidence.length > 0 ? { commands: commandEvidence } : {}),
    });

    console.log(
      `[qaAgentNode] Generated ${qaOutput.testCases.length} test cases for: ${userStory.id}`
    );

    const previewOutcome = previewSmoke?.status;
    deps.recordAgentDebugTrace?.({
      projectId: state.frontendProjectId ?? null,
      workflowThreadId: state.threadId,
      userStoryId: userStory.id,
      agentName: "qa",
      agentProfileId: "qa_agent",
      turn: state.retryCount,
      ...(projectSnapshot ? { snapshot: projectSnapshot } : {}),
      hypothesis: previousRuntimeEvidence
        ? `Previous runtime evidence available (${previousRuntimeEvidence.status}); refining tests accordingly.`
        : "First QA pass for this story; baseline coverage.",
      action: previewSmoke
        ? "qa_generate_tests_and_preview_smoke"
        : "qa_generate_tests",
      outcome:
        previewOutcome === "failed"
          ? "failure"
          : previewOutcome === "blocked"
            ? "blocked"
            : "success",
      durationMs: Date.now() - start,
      notes: [
        `test_cases:${qaOutput.testCases.length}`,
        `runtime_hints:${runtimeHints.length}`,
        `qa_commands:${commandEvidence.length}`,
        ...(previewSmoke ? [`preview_smoke:${previewSmoke.status}`] : []),
      ],
    });

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
              ...(promptContext
                ? { promptContext: summarizePromptContextForResult(promptContext) }
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

export const qaAgentNode = createQaAgentNode(defaultLangGraphDependencies);

async function executeQaValidationCommands(input: {
  state: UBuildState;
  deps: LangGraphDependencies;
  userStoryId: string;
  projectSnapshot: ProjectContextSnapshot | undefined;
}): Promise<RuntimeValidationCommandEvidence[]> {
  if (!input.state.frontendProjectId) return [];
  if (!input.projectSnapshot) return [];

  const plan = planQaRuntimeValidation(input.projectSnapshot);
  if (plan.missingEvidence.length > 0) {
    emitQaValidationBlocked({
      state: input.state,
      deps: input.deps,
      userStoryId: input.userStoryId,
      commandIds: plan.missingEvidence.map((evidence) => evidence.commandId),
      errorMessage:
        plan.missingEvidence[0]?.stderrTail ||
        plan.missingEvidence[0]?.policyReason ||
        "QA validation commands unavailable.",
    });
    return plan.missingEvidence;
  }

  if (!input.deps.createAgentToolRuntime) {
    const evidence = missingQaRuntimeToolEvidence(
      input.projectSnapshot,
      "QA runtime tool is unavailable; validation commands cannot be executed."
    );
    emitQaValidationBlocked({
      state: input.state,
      deps: input.deps,
      userStoryId: input.userStoryId,
      commandIds: [evidence.commandId],
      errorMessage: evidence.stderrTail,
    });
    return [evidence];
  }

  const operationalSessionId = randomUUID();
  const runtime = input.deps.createAgentToolRuntime({
    agentProfileId: "qa_agent",
    projectId: input.state.frontendProjectId,
    workflowThreadId: input.state.threadId,
    userStoryId: input.userStoryId,
    maxToolCalls: plan.commandIds.length + 1,
    onShellOutput: ({ toolName, output }) => {
      const tracedOutput = output as typeof output & {
        traceId?: string;
        spanId?: string;
        parentSpanId?: string | null;
        toolCallId?: string | null;
        runId?: string | null;
        operationalSessionId?: string | null;
        projectId?: string | null;
        agentId?: string | null;
        filePath?: string | null;
        diffId?: string | null;
      };
      input.deps.emitWorkflowEvent?.({
        type: "command_output",
        threadId: input.state.threadId,
        agentName: "qa",
        agentProfileId: "qa_agent",
        toolName,
        commandId: output.commandId,
        ...(output.taskId ? { taskId: output.taskId } : {}),
        ...(tracedOutput.traceId ? { traceId: tracedOutput.traceId } : {}),
        ...(tracedOutput.spanId ? { spanId: tracedOutput.spanId } : {}),
        ...(tracedOutput.parentSpanId ? { parentSpanId: tracedOutput.parentSpanId } : {}),
        ...(tracedOutput.toolCallId ? { toolCallId: tracedOutput.toolCallId } : {}),
        ...(tracedOutput.runId ? { runId: tracedOutput.runId } : {}),
        operationalSessionId: tracedOutput.operationalSessionId ?? operationalSessionId,
        ...(tracedOutput.projectId ? { projectId: tracedOutput.projectId } : {}),
        ...(tracedOutput.agentId ? { agentId: tracedOutput.agentId } : {}),
        ...(tracedOutput.filePath ? { filePath: tracedOutput.filePath } : {}),
        ...(tracedOutput.diffId ? { diffId: tracedOutput.diffId } : {}),
        stream: output.stream,
        chunk: output.chunk,
        chunkSequence: output.sequence,
        userStoryId: input.userStoryId,
        timestamp: output.timestamp,
      });
    },
    onShellCommandComplete: ({ toolName, result }) => {
      input.deps.emitWorkflowEvent?.(
        buildShellCommandCompletionWorkflowEvent({
          result,
          threadId: input.state.threadId,
          agentName: "qa",
          agentProfileId: "qa_agent",
          toolName,
          userStoryId: input.userStoryId,
        })
      );
    },
  });

  const evidence: RuntimeValidationCommandEvidence[] = [];
  for (const commandId of plan.commandIds) {
    const toolStartedAt = Date.now();
    const toolCallId = randomUUID();
    const trace = {
      traceId: input.state.threadId,
      spanId: toolCallId,
      parentSpanId: null,
      toolCallId,
      runId: input.state.threadId,
      operationalSessionId,
      projectId: input.state.frontendProjectId,
      agentId: "qa_agent",
      filePath: null,
      diffId: null,
    };
    input.deps.emitWorkflowEvent?.({
      type: "tool_call_started",
      threadId: input.state.threadId,
      agentName: "qa",
      agentProfileId: "qa_agent",
      toolName: "run_validation_command",
      ...trace,
      userStoryId: input.userStoryId,
      summary: `QA validating command ${commandId}.`,
      commandIds: [commandId],
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await runtime.execute<{
        commandId: string;
        taskId: string | null;
        approvalRequired?: boolean;
        risk?: "low" | "medium" | "high";
        policyReason?: string | null;
        approved?: boolean;
        approvedBy?: string | null;
        approvalReason?: string | null;
        exitCode: number | null;
        stdoutTail: string;
        stderrTail: string;
        stdoutPath: string | null;
        stderrPath: string | null;
        interactivePromptDetected?: boolean;
        interactivePromptText?: string | null;
        durationMs: number;
        runs?: Array<{
          commandId: string;
          taskId: string | null;
          approvalRequired?: boolean;
          risk?: "low" | "medium" | "high";
          policyReason?: string | null;
          approved?: boolean;
          approvedBy?: string | null;
          approvalReason?: string | null;
          exitCode: number | null;
          stdoutTail: string;
          stderrTail: string;
          stdoutPath: string | null;
          stderrPath: string | null;
          interactivePromptDetected?: boolean;
          interactivePromptText?: string | null;
          durationMs: number;
        }>;
      }>({
        toolName: "run_validation_command",
        input: {
          commandId,
          roleName: "qa_specialist",
          ...trace,
        },
        reason: "QA execution agent validation",
      });
      const runs = result.runs?.length ? result.runs : [result];
      for (const run of runs) {
        evidence.push({
          commandId: run.commandId,
          taskId: run.taskId,
          command: run.commandId,
          cwd: input.projectSnapshot.projectRootPath,
          approvalRequired: run.approvalRequired ?? false,
          risk: run.risk ?? "low",
          policyReason: run.policyReason ?? null,
          approved: run.approved ?? false,
          approvedBy: run.approvedBy ?? null,
          approvalReason: run.approvalReason ?? null,
          exitCode: run.exitCode,
          stdoutTail: run.stdoutTail,
          stderrTail: run.stderrTail,
          stdoutPath: run.stdoutPath,
          stderrPath: run.stderrPath,
          interactivePromptDetected: run.interactivePromptDetected ?? false,
          interactivePromptText: run.interactivePromptText ?? null,
          durationMs: run.durationMs,
        });
      }
      const latestRun = runs[runs.length - 1] ?? result;
      const latestFailed =
        latestRun.exitCode !== 0 ||
        latestRun.interactivePromptDetected === true ||
        (latestRun.approvalRequired === true && latestRun.approved !== true);
      if (
        latestRun.approvalRequired === true &&
        latestRun.approved !== true &&
        latestRun.taskId
      ) {
        input.deps.emitWorkflowEvent?.({
          type: "command_approval_requested",
          threadId: input.state.threadId,
          agentName: "qa",
          agentProfileId: "qa_agent",
          toolName: "run_validation_command",
          commandId: latestRun.commandId,
          taskId: latestRun.taskId,
          ...trace,
          userStoryId: input.userStoryId,
          approvalReason: latestRun.approvalReason ?? null,
          policyReason: latestRun.policyReason ?? null,
          risk: latestRun.risk ?? "medium",
          timestamp: new Date().toISOString(),
        });
      }
      input.deps.emitWorkflowEvent?.({
        type: "tool_call_finished",
        threadId: input.state.threadId,
        agentName: "qa",
        agentProfileId: "qa_agent",
        toolName: "run_validation_command",
        status: latestFailed ? "failed" : "succeeded",
        ...trace,
        userStoryId: input.userStoryId,
        durationMs: Date.now() - toolStartedAt,
        summary:
          runs.length > 1
            ? `QA validation ${commandId} completed after ${runs.length} command runs.`
            : `QA validation ${commandId} completed.`,
        commandIds: [...new Set(runs.map((run) => run.commandId))],
        ...(latestRun.taskId ? { taskId: latestRun.taskId } : {}),
        ...(latestFailed
          ? { errorMessage: latestRun.stderrTail || latestRun.stdoutTail || "QA validation failed." }
          : {}),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      input.deps.emitWorkflowEvent?.({
        type: "tool_call_blocked",
        threadId: input.state.threadId,
        agentName: "qa",
        agentProfileId: "qa_agent",
        toolName: "run_validation_command",
        ...trace,
        userStoryId: input.userStoryId,
        summary: `QA validation command ${commandId} was blocked.`,
        errorMessage,
        commandIds: [commandId],
        timestamp: new Date().toISOString(),
      });
      evidence.push({
        commandId,
        taskId: null,
        command: commandId,
        cwd: input.projectSnapshot.projectRootPath,
        approvalRequired: false,
        risk: "high",
        policyReason: errorMessage,
        approved: false,
        approvedBy: null,
        approvalReason: null,
        exitCode: null,
        stdoutTail: "",
        stderrTail: errorMessage,
        stdoutPath: null,
        stderrPath: null,
        interactivePromptDetected: false,
        interactivePromptText: null,
        durationMs: 0,
      });
    }
  }
  return evidence;
}

function emitQaValidationBlocked(input: {
  state: UBuildState;
  deps: LangGraphDependencies;
  userStoryId: string;
  commandIds: string[];
  errorMessage: string;
}): void {
  const toolCallId = randomUUID();
  const operationalSessionId = randomUUID();
  input.deps.emitWorkflowEvent?.({
    type: "tool_call_blocked",
    threadId: input.state.threadId,
    agentName: "qa",
    agentProfileId: "qa_agent",
    toolName: "run_validation_command",
    traceId: input.state.threadId,
    spanId: toolCallId,
    parentSpanId: null,
    toolCallId,
    runId: input.state.threadId,
    operationalSessionId,
    projectId: input.state.frontendProjectId ?? null,
    agentId: "qa_agent",
    filePath: null,
    diffId: null,
    userStoryId: input.userStoryId,
    summary: "QA validation could not start.",
    errorMessage: input.errorMessage,
    commandIds: input.commandIds,
    timestamp: new Date().toISOString(),
  });
}

async function validatePreviewForQa(input: {
  state: UBuildState;
  deps: LangGraphDependencies;
  userStoryId: string;
}): Promise<QaPreviewSmokeResult | undefined> {
  const { state, deps, userStoryId } = input;
  if (!state.previewSessionId && state.workflowMode !== "chat_code_change") {
    return undefined;
  }

  const toolStartedAt = Date.now();
  const toolCallId = randomUUID();
  const trace = {
    traceId: state.threadId,
    spanId: toolCallId,
    parentSpanId: null,
    toolCallId,
    runId: state.threadId,
    projectId: state.frontendProjectId ?? null,
    agentId: "qa_agent",
    filePath: null,
    diffId: null,
  };
  const emitPreviewBlocked = (message: string): void => {
    deps.emitWorkflowEvent?.({
      type: "tool_call_blocked",
      threadId: state.threadId,
      agentName: "qa",
      agentProfileId: "qa_agent",
      toolName: "inspect_preview",
      ...trace,
      userStoryId,
      summary: "QA preview smoke could not start.",
      errorMessage: message,
      timestamp: new Date().toISOString(),
    });
  };

  if (state.previewSessionId && deps.createAgentToolRuntime && state.frontendProjectId) {
    deps.emitWorkflowEvent?.({
      type: "tool_call_started",
      threadId: state.threadId,
      agentName: "qa",
      agentProfileId: "qa_agent",
      toolName: "inspect_preview",
      ...trace,
      userStoryId,
      summary: `QA checking preview session ${state.previewSessionId}.`,
      timestamp: new Date().toISOString(),
    });
    try {
      const runtime = deps.createAgentToolRuntime({
        agentProfileId: "qa_agent",
        projectId: state.frontendProjectId,
        workflowThreadId: state.threadId,
        userStoryId,
        maxToolCalls: 1,
      });
      const runtimeTrace = { ...trace, projectId: state.frontendProjectId };
      const result = await runtime.execute<QaPreviewSmokeResult>({
        toolName: "inspect_preview",
        input: {
          previewSessionId: state.previewSessionId,
          ...runtimeTrace,
        },
        reason: "QA preview smoke validation",
      });
      const failed = result.status !== "passed";
      deps.emitWorkflowEvent?.({
        type: "tool_call_finished",
        threadId: state.threadId,
        agentName: "qa",
        agentProfileId: "qa_agent",
        toolName: "inspect_preview",
        status: failed ? "failed" : "succeeded",
        ...trace,
        userStoryId,
        durationMs: Date.now() - toolStartedAt,
        summary: `QA preview smoke ${result.status}: ${result.reason}.`,
        ...(failed ? { errorMessage: result.reason } : {}),
        timestamp: new Date().toISOString(),
      });
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      emitPreviewBlocked(errorMessage);
      return {
        status: "blocked",
        reason: errorMessage,
        ...(state.previewSessionId ? { previewSessionId: state.previewSessionId } : {}),
        elapsedMs: Date.now() - toolStartedAt,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  if (state.previewSessionId && deps.validatePreviewSmoke) {
    deps.emitWorkflowEvent?.({
      type: "tool_call_started",
      threadId: state.threadId,
      agentName: "qa",
      agentProfileId: "qa_agent",
      toolName: "inspect_preview",
      ...trace,
      userStoryId,
      summary: `QA checking preview session ${state.previewSessionId}.`,
      timestamp: new Date().toISOString(),
    });
    try {
      const result = await deps.validatePreviewSmoke(state.previewSessionId);
      const failed = result.status !== "passed";
      deps.emitWorkflowEvent?.({
        type: "tool_call_finished",
        threadId: state.threadId,
        agentName: "qa",
        agentProfileId: "qa_agent",
        toolName: "inspect_preview",
        status: failed ? "failed" : "succeeded",
        ...trace,
        userStoryId,
        durationMs: Date.now() - toolStartedAt,
        summary: `QA preview smoke ${result.status}: ${result.reason}.`,
        ...(failed ? { errorMessage: result.reason } : {}),
        timestamp: new Date().toISOString(),
      });
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      emitPreviewBlocked(errorMessage);
      return {
        status: "blocked",
        reason: errorMessage,
        ...(state.previewSessionId ? { previewSessionId: state.previewSessionId } : {}),
        elapsedMs: Date.now() - toolStartedAt,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  if (state.workflowMode === "chat_code_change" && state.frontendProjectId) {
    const reason = state.previewSessionId
      ? "preview_smoke_validator_unavailable"
      : "missing_preview_session_id";
    emitPreviewBlocked(reason);
    return {
      status: "blocked",
      reason,
      ...(state.previewSessionId ? { previewSessionId: state.previewSessionId } : {}),
      elapsedMs: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  return undefined;
}
