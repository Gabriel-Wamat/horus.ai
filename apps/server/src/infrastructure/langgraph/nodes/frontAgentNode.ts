import type { UBuildState, UBuildUpdate } from "../state.js";
import {
  CodeChangeSetSchema,
  type CodeChangeSet,
  type CodeContextBundle,
  type ProjectContextSnapshot,
  type StructuralPatchIntent,
  type UserStory,
  type WorkspaceArtifactContext,
} from "@u-build/shared";
import type { MultiFilePatchPrimaryIntent } from "../../../application/services/MultiFilePatchPlanner.js";
import type { LangGraphDependencies } from "../dependencies.js";
import { defaultLangGraphDependencies } from "../dependencies.js";
import { agentArtifactFields, getArtifactContext } from "../artifactContext.js";
import { buildGeneratedHtmlChangeSet } from "../../code/buildGeneratedHtmlChangeSet.js";
import {
  buildFrontendCodeChangeSet,
  type FrontendFileOperationPlan,
} from "../../code/buildFrontendCodeChangeSet.js";
import { summarizePromptContextForResult } from "../../prompt/PromptContextAssembler.js";
import { attachAgentContextProfile } from "../../../application/services/AgentContextProfileService.js";
import {
  buildRuntimeHintsFromHistory,
  extractLatestRuntimeValidation,
} from "../agentRuntimeContext.js";
import { buildShellCommandCompletionWorkflowEvent } from "./shellCommandWorkflowEvents.js";

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

    // Build runtime hints from previous-turn evidence so the Engine can carry
    // them forward into this turn's project context snapshot. Lets the Front
    // agent see "what failed last time" without re-deriving it from raw blobs.
    const previousRuntimeEvidence = extractLatestRuntimeValidation(
      state.agentResults[userStory.id] ?? []
    );
    const runtimeHints = buildRuntimeHintsFromHistory({
      runtimeValidation: previousRuntimeEvidence,
      curatorFeedback,
    });

    let projectSnapshot: ProjectContextSnapshot | undefined;
    let codeContext: CodeContextBundle | undefined;
    let designContext: Awaited<ReturnType<NonNullable<typeof deps.buildDesignContext>>> | undefined;
    if (state.frontendProjectId && state.frontendProjectRootPath) {
      const query = buildFrontendContextQuery(
        userStory.title,
        state.executionBrief
      );
      // Prefer the canonical engine when the host provides it; it returns the
      // same CodeContextBundle inside snapshot.codeContext plus the validation
      // strategy and edit restrictions the agent should respect.
      if (deps.buildProjectContextSnapshot) {
        projectSnapshot = await deps.buildProjectContextSnapshot({
          projectId: state.frontendProjectId,
          projectRootPath: state.frontendProjectRootPath,
          query,
          agentProfileId: "front_agent",
          runtimeHints,
        });
        codeContext = projectSnapshot.codeContext;
      } else {
        codeContext = await deps.buildFrontendCodeContext({
          projectId: state.frontendProjectId,
          projectRootPath: state.frontendProjectRootPath,
          query,
        });
      }
      designContext = deps.buildDesignContext
        ? await deps.buildDesignContext({
            projectId: state.frontendProjectId,
            projectRootPath: state.frontendProjectRootPath,
          })
        : undefined;
    }

    const llmSettings = await deps.getRuntimeLlmSettings(state.threadId);
    const basePromptContext = deps.buildPromptContext
      ? await deps.buildPromptContext({
          agentProfileId: "front_agent",
          workflowThreadId: state.threadId,
          ...(state.workspaceFolderId
            ? { workspaceFolderId: state.workspaceFolderId }
            : {}),
          userStoryId: userStory.id,
          ...(state.frontendProjectId ? { projectId: state.frontendProjectId } : {}),
          ...(state.sourceChatSessionId
            ? { chatSessionId: state.sourceChatSessionId }
            : {}),
          triggerReason: "front_agent_prompt",
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
          agentName: "front",
          agentProfileId: "front_agent",
          userStory,
          spec,
          codeContext,
          designContext,
          // Pull runtime evidence from the previous turn so the envelope's
          // runtime_errors section is non-empty on retries. This is the
          // resilience hook: Front sees the failing typecheck/build/preview
          // output without us having to bolt it onto a new contract.
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
    const contextReceipt = deps.buildAgentContextReceipt
      ? await deps.buildAgentContextReceipt({
          threadId: state.threadId,
          userStoryId: userStory.id,
          agentName: "front",
          agentProfileId: "front_agent",
          snapshot: projectSnapshot,
          codeContext,
        })
      : undefined;
    if (contextReceipt) {
      deps.emitWorkflowEvent?.({
        type: "context_receipt",
        threadId: state.threadId,
        userStoryId: userStory.id,
        receipt: contextReceipt,
        timestamp: new Date().toISOString(),
      });
    }
    // Self-correction: pass curator feedback so the agent improves on retry.
    const frontendOutput = await deps.generateFrontend(
      userStory,
      spec,
      curatorFeedback,
      llmSettings,
      state.executionBrief,
      codeContext,
      designContext,
      promptContext
    );
    const { html } = frontendOutput;

    console.log(
      `[frontAgentNode] HTML generated (${html.length} chars) for: ${userStory.id}`
    );

    // Expand any high-level multi-file primary intents (rename/create/delete
    // whole files) into the structural patch intents required to keep the
    // project compiling. When the LLM does not emit primary intents (current
    // default), this collapses to an empty pass-through and behavior is
    // unchanged.
    const expandedStructuralIntents = expandMultiFileIntents({
      deps,
      directIntents: frontendOutput.structuralPatchIntents ?? [],
      primaryIntents: frontendOutput.multiFilePrimaryIntents ?? [],
      protectedPaths:
        projectSnapshot?.editRestrictions.protectedPaths ?? [],
    });
    const hasStructuralPatchIntents = expandedStructuralIntents.length > 0;
    const hasFileOperations = Boolean(frontendOutput.operations?.length);
    const codeChangeSet =
      hasStructuralPatchIntents || hasFileOperations
        ? await buildFileCodeChangeSet({
            deps,
            workflowThreadId: state.threadId,
            userStory,
            codeContext,
            structuralPatchIntents: expandedStructuralIntents,
            operations: frontendOutput.operations ?? [],
            artifactContext,
          })
        : buildGeneratedHtmlChangeSet({
            workflowThreadId: state.threadId,
            userStory,
            html,
            ...(artifactContext ? { artifactContext } : {}),
          });
    // The tool loop is wrapped in workflowRunIsolation so that when the
    // HORUS_RUN_WORKTREE flag is on, the entire mutation+validation cycle
    // executes inside an ephemeral git worktree and is squash-merged into the
    // operator's branch only when the loop succeeds. When the flag is off
    // (default), runIsolated() is a transparent pass-through and behavior
    // matches the pre-isolation code path exactly.
    const toolLoopResult = await maybeRunIsolatedToolLoop({
      deps,
      state,
      userStory,
      codeChangeSet,
      hasStructuralPatchIntents,
      hasFileOperations,
    });

    if (
      toolLoopResult &&
      toolLoopResult.status !== "succeeded" &&
      toolLoopResult.status !== "proposed_only"
    ) {
      throw new Error(`Front Agent tool loop failed: ${toolLoopResult.summary}`);
    }

    // Record the per-turn debug trace — powers the "why did the agent choose
    // this?" UI panel. Best-effort: never block the workflow if the collector
    // is missing or throws.
    deps.recordAgentDebugTrace?.({
      projectId: state.frontendProjectId ?? null,
      workflowThreadId: state.threadId,
      userStoryId: userStory.id,
      agentName: "front",
      agentProfileId: "front_agent",
      turn: state.retryCount,
      ...(projectSnapshot ? { snapshot: projectSnapshot } : {}),
      hypothesis: curatorFeedback
        ? `Retry guided by curator feedback (passed=${curatorFeedback.passed}, fixTarget=${curatorFeedback.fixTarget}).`
        : "Initial generation from spec + project context.",
      action: hasStructuralPatchIntents
        ? "front_generate_structural_patch"
        : hasFileOperations
          ? "front_generate_file_operations"
          : "front_generate_html",
      outcome: toolLoopResult
        ? toolLoopResult.status === "succeeded" ||
          toolLoopResult.status === "proposed_only"
          ? "success"
          : "failure"
        : "success",
      durationMs: Date.now() - start,
      notes: [
        `runtime_hints:${runtimeHints.length}`,
        ...(curatorFeedback?.missingItems ?? []).slice(0, 3).map(
          (item) => `curator_missing:${item.slice(0, 80)}`
        ),
      ],
      filesRead: frontendOutput.inspectedFiles ?? [],
      filesWritten: codeChangeSet.operations.map((op) => op.targetPath),
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
              candidateId: codeChangeSet.artifactCandidateId ?? codeChangeSet.id,
              attempt: state.retryCount,
              ...(frontendOutput.inspectedFiles
                ? { inspectedFiles: frontendOutput.inspectedFiles }
                : {}),
              ...(promptContext
                ? { promptContext: summarizePromptContextForResult(promptContext) }
                : {}),
              ...(toolLoopResult
                ? {
                    toolEventCount: toolLoopResult.events.length,
                    toolLoop: {
                      status: toolLoopResult.status,
                      changedFiles: toolLoopResult.changedFiles,
                      validationCommandIds: toolLoopResult.validationCommandIds,
                      summary: toolLoopResult.summary,
                      ...("operationalSessionId" in toolLoopResult &&
                      toolLoopResult.operationalSessionId
                        ? {
                            operationalSessionId:
                              toolLoopResult.operationalSessionId,
                          }
                        : {}),
                    },
                  }
                : {}),
            },
            executionTimeMs: Date.now() - start,
            completedAt: new Date().toISOString(),
            ...(contextReceipt ? { contextReceipt } : {}),
            ...agentArtifactFields(artifactContext, state),
          },
        ],
      },
    };
  };
}

async function buildFileCodeChangeSet(input: {
  deps: LangGraphDependencies;
  workflowThreadId: string;
  userStory: UserStory;
  codeContext: CodeContextBundle | undefined;
  structuralPatchIntents: readonly StructuralPatchIntent[];
  operations: readonly FrontendFileOperationPlan[];
  artifactContext: WorkspaceArtifactContext | undefined;
}): Promise<CodeChangeSet> {
  const changeSets: CodeChangeSet[] = [];

  if (input.structuralPatchIntents.length > 0) {
    if (!input.codeContext) {
      throw new Error(
        "Front Agent returned structuralPatchIntents without code context."
      );
    }
    if (!input.deps.buildStructuralCodeChangeSet) {
      throw new Error(
        "Front Agent returned structuralPatchIntents but no structural patch builder is configured."
      );
    }
    changeSets.push(
      await input.deps.buildStructuralCodeChangeSet({
        workflowThreadId: input.workflowThreadId,
        userStory: input.userStory,
        codeContext: input.codeContext,
        structuralPatchIntents: input.structuralPatchIntents,
        ...(input.artifactContext
          ? { artifactContext: input.artifactContext }
          : {}),
      })
    );
  }

  if (input.operations.length > 0) {
    changeSets.push(
      buildFrontendCodeChangeSet({
        workflowThreadId: input.workflowThreadId,
        userStory: input.userStory,
        operations: [...input.operations],
        ...(input.codeContext ? { codeContext: input.codeContext } : {}),
        ...(input.artifactContext ? { artifactContext: input.artifactContext } : {}),
      })
    );
  }

  return mergeFrontCodeChangeSets(changeSets);
}

function mergeFrontCodeChangeSets(
  changeSets: readonly CodeChangeSet[]
): CodeChangeSet {
  if (changeSets.length === 0) {
    throw new Error("Front Agent did not produce file changes.");
  }
  if (changeSets.length === 1) return changeSets[0]!;

  const targetPaths = new Set<string>();
  const operations = changeSets.flatMap((changeSet) => changeSet.operations);
  for (const operation of operations) {
    if (targetPaths.has(operation.targetPath)) {
      throw new Error(
        `Front Agent produced conflicting structural and file operations for ${operation.targetPath}.`
      );
    }
    targetPaths.add(operation.targetPath);
  }

  const [first] = changeSets;
  return CodeChangeSetSchema.parse({
    ...first,
    operations,
    validation: [
      {
        command: "pending-controlled-frontend-validation",
        cwd: ".",
        exitCode: null,
        status: "not_run",
      },
    ],
  });
}

// Expands multi-file primary intents (rename/create/delete whole files) into
// the structural patch intents required to keep the project compiling. When
// no primary intents are provided (current default for the LLM output),
// returns the direct intents unchanged.
function expandMultiFileIntents(input: {
  deps: LangGraphDependencies;
  directIntents: readonly StructuralPatchIntent[];
  primaryIntents: readonly MultiFilePatchPrimaryIntent[];
  protectedPaths: readonly string[];
}): StructuralPatchIntent[] {
  if (input.primaryIntents.length === 0 || !input.deps.planMultiFilePatch) {
    return [...input.directIntents];
  }
  const expanded: StructuralPatchIntent[] = [...input.directIntents];
  for (const primary of input.primaryIntents) {
    const plan = input.deps.planMultiFilePatch({
      primaryIntent: primary,
      protectedPaths: input.protectedPaths,
    });
    for (const step of plan.steps) {
      expanded.push(step.intent);
    }
  }
  return expanded;
}

// Decides whether to run the tool loop directly or wrap it in
// WorkflowRunIsolation. Encapsulates the gating logic so the main node body
// stays focused on the agent's decision flow.
async function maybeRunIsolatedToolLoop(input: {
  deps: LangGraphDependencies;
  state: UBuildState;
  userStory: UserStory;
  codeChangeSet: CodeChangeSet;
  hasStructuralPatchIntents: boolean;
  hasFileOperations: boolean;
}) {
  const { deps, state, userStory, codeChangeSet } = input;
  if (
    !shouldUseFrontAgentToolMode(state) ||
    !deps.createAgentToolRuntime ||
    !deps.agentToolLoop
  ) {
    return undefined;
  }
  const projectId = getToolProjectId(state);
  if (!projectId) return undefined;

  const run = (projectRootOverride?: string) =>
    executeChangeSetThroughToolLoop({
      deps,
      projectId,
      workflowThreadId: state.threadId,
      userStoryId: userStory.id,
      codeChangeSet,
      projectRootOverride,
      allowDirectMutations:
        input.hasStructuralPatchIntents || input.hasFileOperations,
    });

  if (!deps.workflowRunIsolation || !deps.workflowRunIsolation.isEnabled()) {
    return run();
  }
  const isolated = await deps.workflowRunIsolation.runIsolated({
    projectRootPath: state.frontendProjectRootPath,
    runId: `${state.threadId}-${userStory.id}-${state.retryCount}`,
    execute: async ({ rootPath }) => run(rootPath),
    mergeMessage: `Horus front-agent run for ${userStory.id} (attempt ${state.retryCount + 1})`,
  });
  return isolated.value;
}

async function executeChangeSetThroughToolLoop(input: {
  deps: LangGraphDependencies;
  projectId: string;
  workflowThreadId: string;
  userStoryId: string;
  codeChangeSet: CodeChangeSet;
  projectRootOverride?: string | undefined;
  allowDirectMutations: boolean;
}) {
  const runtime = input.deps.createAgentToolRuntime?.({
    agentProfileId: "front_agent",
    projectId: input.projectId,
    ...(input.projectRootOverride
      ? { projectRootOverride: input.projectRootOverride }
      : {}),
    workflowThreadId: input.workflowThreadId,
    userStoryId: input.userStoryId,
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
        threadId: input.workflowThreadId,
        agentName: "front",
        agentProfileId: "front_agent",
        toolName,
        commandId: output.commandId,
        ...(output.taskId ? { taskId: output.taskId } : {}),
        ...(tracedOutput.traceId ? { traceId: tracedOutput.traceId } : {}),
        ...(tracedOutput.spanId ? { spanId: tracedOutput.spanId } : {}),
        ...(tracedOutput.parentSpanId ? { parentSpanId: tracedOutput.parentSpanId } : {}),
        ...(tracedOutput.toolCallId ? { toolCallId: tracedOutput.toolCallId } : {}),
        ...(tracedOutput.runId ? { runId: tracedOutput.runId } : {}),
        ...(tracedOutput.operationalSessionId
          ? { operationalSessionId: tracedOutput.operationalSessionId }
          : {}),
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
          threadId: input.workflowThreadId,
          agentName: "front",
          agentProfileId: "front_agent",
          toolName,
          userStoryId: input.userStoryId,
        })
      );
    },
  });
  if (!runtime) return undefined;
  if (input.allowDirectMutations && input.deps.agentToolLoop) {
    return input.deps.agentToolLoop.executeCodeChangeSet({
      runtime,
      agentName: "front",
      agentProfileId: "front_agent",
      projectId: input.projectId,
      threadId: input.workflowThreadId,
      userStoryId: input.userStoryId,
      codeChangeSet: input.codeChangeSet,
      eventSink: input.deps.emitWorkflowEvent
        ? { emit: input.deps.emitWorkflowEvent }
        : undefined,
      operationalSessionRepository: input.deps.agentOperationalSessions,
    });
  }

  await runtime.execute({
    toolName: "propose_code_change_set",
    input: input.codeChangeSet,
    reason: "FrontAgent proposed a CodeChangeSet through governed tool runtime.",
  });
  return {
    status: "proposed_only" as const,
    changedFiles: [],
    validationCommandIds: [],
    events: runtime.getEvents(),
    summary: "CodeChangeSet registrado; nenhuma mutação direta foi executada porque o Front Agent não retornou operações de arquivo.",
  };
}

function shouldUseFrontAgentToolMode(state: UBuildState): boolean {
  return (
    state.workflowMode === "project_construction" ||
    state.workflowMode === "chat_code_change" ||
    process.env["HORUS_ENABLE_TOOL_MODE"] === "true"
  );
}

function getToolProjectId(state: UBuildState): string | undefined {
  return state.projectWorkspaceId ?? state.frontendProjectId;
}

export const frontAgentNode = createFrontAgentNode(defaultLangGraphDependencies);

function buildFrontendContextQuery(
  userStoryTitle: string,
  executionBrief: string | undefined
): string {
  return [userStoryTitle, executionBrief].filter(Boolean).join("\n");
}
