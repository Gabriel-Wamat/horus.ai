import { Command } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import type {
  IStorageProvider,
  IEventStream,
  Spec,
  AgentName,
  WorkflowStatus,
  WorkflowMode,
  AgentExecutionOutboxEvent,
  WorkflowEvent,
} from "@u-build/shared";
import { WorkflowEventProjector } from "./WorkflowEventProjector.js";
import {
  isTerminalWorkflowStatus,
  WorkflowStatePersister,
} from "./WorkflowStatePersister.js";
import { CodeChangeSetLifecycleService } from "./CodeChangeSetLifecycleService.js";
import type { PendingRetryApproval } from "../ports/WorkflowGraphStatePort.js";
import type { RuntimeLlmSettingsStore } from "../ports/RuntimeLlmSettingsStore.js";
import {
  WorkflowResumeUnavailableError,
  hasPendingCheckpoint,
} from "./resumeCheckpoint.js";
import { WorkflowRecoveryService } from "./WorkflowRecoveryService.js";
import {
  buildWorkflowInitialGraphState,
  buildWorkflowInitialStorageState,
} from "./WorkflowStartState.js";
import {
  WorkflowStartOutboxPayloadSchema,
  extractAgentResultStoryId,
  extractInputUserStoryId,
  extractRuntimeValidationEvidence,
  toErrorMessage,
} from "./WorkflowOrchestratorHelpers.js";
import type {
  AgentExecutionLedgerSink,
  ChatProgressSink,
  CuratorReviewDecisionOptions,
  ProjectConstructionRunSink,
  ResumeWorkflowOptions,
  RetryDecisionOptions,
  StartChatCodeChangeOptions,
  StartSpecGenerationOptions,
  StartWorkflowOptions,
  WorkflowArtifactControlPlaneSink,
  WorkflowCodeChangeSetApplier,
  WorkflowCodeChangeSetSink,
  WorkflowEventHistoryReader,
  WorkflowGraphRunner,
  WorkflowMemorySink,
  WorkspaceArtifactStore,
} from "./WorkflowOrchestratorPorts.js";

export type {
  AgentExecutionLedgerSink,
  ChatProgressSink,
  CuratorReviewDecisionOptions,
  ProjectConstructionRunSink,
  ResumeWorkflowOptions,
  RetryDecisionOptions,
  StartChatCodeChangeOptions,
  StartSpecGenerationOptions,
  StartWorkflowOptions,
  WorkflowArtifactControlPlaneSink,
  WorkflowCodeChangeSetApplier,
  WorkflowCodeChangeSetSink,
  WorkflowEventHistoryReader,
  WorkflowGraphRunner,
  WorkflowMemorySink,
  WorkspaceArtifactStore,
} from "./WorkflowOrchestratorPorts.js";

// Maps node names to typed AgentName values for SSE emission
const NODE_AGENT_MAP: Record<string, AgentName> = {
  odinAgent: "odin",
  frontAgent: "front",
  qaAgent: "qa",
  curatorAgent: "curator",
};

export class WorkflowOrchestrator {
  private readonly startTimes = new Map<string, string>();
  private readonly eventProjector: WorkflowEventProjector;
  private readonly statePersister: WorkflowStatePersister;
  private readonly codeChangeSetLifecycle: CodeChangeSetLifecycleService;
  private readonly recoveryService: WorkflowRecoveryService;

  constructor(
    private readonly storage: IStorageProvider,
    private readonly events: IEventStream,
    private readonly workflowGraph: WorkflowGraphRunner,
    private readonly workspaceArtifacts?: WorkspaceArtifactStore,
    private readonly chatProgress?: ChatProgressSink,
    private readonly codeChangeSets?: WorkflowCodeChangeSetSink,
    private readonly codeChangeSetApplier?: WorkflowCodeChangeSetApplier,
    private readonly projectConstructionRuns?: ProjectConstructionRunSink,
    private readonly executionLedger?: AgentExecutionLedgerSink,
    private readonly memorySink?: WorkflowMemorySink,
    private readonly artifactControlPlane?: WorkflowArtifactControlPlaneSink,
    private readonly workflowEventHistory?: WorkflowEventHistoryReader,
    private readonly runtimeLlmSettings?: RuntimeLlmSettingsStore
  ) {
    this.eventProjector = new WorkflowEventProjector(
      storage,
      events,
      chatProgress,
      executionLedger,
      memorySink
    );
    this.statePersister = new WorkflowStatePersister(
      storage,
      workflowGraph,
      projectConstructionRuns
    );
    this.codeChangeSetLifecycle = new CodeChangeSetLifecycleService(
      (event) => this.emitWorkflowEvent(event),
      codeChangeSets,
      codeChangeSetApplier,
      artifactControlPlane
    );
    this.recoveryService = new WorkflowRecoveryService(
      storage,
      executionLedger,
      workflowEventHistory,
      (event) => this.emitWorkflowEvent(event)
    );
  }

  async start(options: StartWorkflowOptions): Promise<{ threadId: string }> {
    const workflowMode = options.workflowMode ?? "standard";
    const turn = await this.createExecutionTurn(options, workflowMode);
    if (turn) {
      const existingRun = await this.executionLedger?.getRunByTurnId(turn.id);
      if (existingRun) return { threadId: existingRun.threadId };
    }

    const threadId = uuidv4();
    if (options.llmSettings) {
      this.runtimeLlmSettings?.set(threadId, options.llmSettings);
    }

    const startedAt = new Date().toISOString();
    const run = this.executionLedger
      ? await this.executionLedger.createRun({
          id: uuidv4(),
          turnId: turn?.id ?? null,
          threadId,
          workflowMode,
          status: "running",
          startedAt,
          createdAt: startedAt,
        })
      : undefined;
    const attempt = run
      ? await this.executionLedger?.createAttempt({
          id: uuidv4(),
          runId: run.id,
          attemptNumber: 1,
          startedAt,
          status: "running",
        })
      : undefined;

    this.startTimes.set(threadId, startedAt);
    const config = {
      configurable: { thread_id: threadId },
      streamMode: "updates" as const,
    };

    const initialState = buildWorkflowInitialGraphState({
      options,
      threadId,
      workflowMode,
    });

    await this.storage.save(buildWorkflowInitialStorageState({
      options,
      threadId,
      workflowMode,
      startedAt,
    }));

    this.emitWorkflowEvent({
      type: "status_changed",
      threadId,
      status: "running",
      timestamp: new Date().toISOString(),
    });

    if (this.executionLedger && run && attempt) {
      if (turn) {
        await this.executionLedger.updateTurnStatus(turn.id, "running");
      }
      await this.executionLedger.enqueueOutbox({
        id: uuidv4(),
        eventType: "workflow.start",
        dedupeKey: `workflow.start:${run.id}`,
        payload: {
          threadId,
          runId: run.id,
          attemptId: attempt.id,
          turnId: turn?.id ?? null,
          input: initialState,
          config,
        },
        createdAt: startedAt,
        availableAt: startedAt,
      });
      void this.drainExecutionOutbox();
    } else {
      void this.runGraphStream(initialState, config, threadId);
    }

    return { threadId };
  }

  async startChatCodeChange(
    options: StartChatCodeChangeOptions
  ): Promise<{ threadId: string }> {
    return this.start({
      workspaceFolderId: options.workspaceFolderId,
      userStories: [options.userStory],
      workspaceArtifactContext: {
        [options.userStory.id]: options.artifactContext,
      },
      initialSpecs: {
        [options.userStory.id]: options.spec,
      },
      workflowMode: "chat_code_change",
      ...(options.project.projectWorkspaceId
        ? { projectWorkspaceId: options.project.projectWorkspaceId }
        : {}),
      frontendProjectId: options.project.id,
      frontendProjectRootPath: options.project.rootPath,
      sourceChatSessionId: options.chatSessionId,
      sourceChatMessageId: options.sourceMessageId,
      executionBrief: options.executionBrief,
      ...(options.previewSessionId
        ? { previewSessionId: options.previewSessionId }
        : {}),
      ...(options.llmSettings ? { llmSettings: options.llmSettings } : {}),
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    });
  }

  async startSpecGeneration(
    options: StartSpecGenerationOptions
  ): Promise<{ threadId: string }> {
    return this.start({
      workspaceFolderId: options.workspaceFolderId,
      userStories: [options.userStory],
      workflowMode: "spec_generation",
      sourceChatSessionId: options.chatSessionId,
      sourceChatMessageId: options.sourceMessageId,
      executionBrief: options.executionBrief,
      ...(options.llmSettings ? { llmSettings: options.llmSettings } : {}),
      ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    });
  }

  async recoverPendingExecutions(): Promise<void> {
    await this.drainExecutionOutbox();
    await this.recoveryService.markStaleRecoverableRuns();
    await this.recoveryService.markLegacyStaleWorkflowStates();
  }

  private async createExecutionTurn(
    options: StartWorkflowOptions,
    workflowMode: WorkflowMode
  ): Promise<{ id: string; status: string } | undefined> {
    if (
      !this.executionLedger ||
      !options.sourceChatSessionId ||
      !options.sourceChatMessageId
    ) {
      return undefined;
    }

    const idempotencyKey =
      options.idempotencyKey ??
      [
        "workflow",
        workflowMode,
        options.sourceChatSessionId,
        options.sourceChatMessageId,
      ].join(":");

    return this.executionLedger.createTurn({
      id: uuidv4(),
      chatSessionId: options.sourceChatSessionId,
      sourceMessageId: options.sourceChatMessageId,
      idempotencyKey,
      intent: {
        workflowMode,
        source: "horus_chat",
        ...(options.executionBrief ? { brief: options.executionBrief } : {}),
      },
      status: "accepted",
    });
  }

  private async drainExecutionOutbox(): Promise<void> {
    if (!this.executionLedger) return;
    const ownerId = `workflow-orchestrator:${process.pid}`;
    while (true) {
      const event = await this.executionLedger.claimNextOutbox({ ownerId });
      if (!event) return;
      try {
        await this.processExecutionOutboxEvent(event);
        await this.executionLedger.completeOutbox(event.id);
      } catch (err) {
        await this.executionLedger.failOutbox({
          outboxId: event.id,
          status: event.attemptCount >= 3 ? "dead_letter" : "failed",
          error: toErrorMessage(err),
        });
      }
    }
  }

  private async processExecutionOutboxEvent(
    event: AgentExecutionOutboxEvent
  ): Promise<void> {
    if (event.eventType !== "workflow.start") {
      throw new Error(`Unsupported agent execution outbox event: ${event.eventType}`);
    }
    const payload = WorkflowStartOutboxPayloadSchema.parse(event.payload);
    const run = await this.executionLedger?.getRunByThreadId(payload.threadId);
    if (run?.status && isTerminalWorkflowStatus(run.status)) {
      return;
    }
    await this.runGraphStream(
      payload.input,
      payload.config,
      payload.threadId,
      undefined,
      {
        runId: payload.runId,
        attemptId: payload.attemptId,
        ...(payload.turnId !== undefined ? { turnId: payload.turnId } : {}),
      }
    );
  }

  async resume(options: ResumeWorkflowOptions): Promise<void> {
    await this.assertResumableCheckpoint(options.threadId, "hitlCheckpoint");

    const config = {
      configurable: { thread_id: options.threadId },
      streamMode: "updates" as const,
    };

    this.emitWorkflowEvent({
      type: "status_changed",
      threadId: options.threadId,
      status: "running",
      timestamp: new Date().toISOString(),
    });

    const command = new Command({ resume: options.feedback });

    void this.runGraphStream(
      command,
      config,
      options.threadId,
      options.userStoryId
    );
  }

  async retryDecision(options: RetryDecisionOptions): Promise<void> {
    await this.assertResumableCheckpoint(options.threadId, "retryCheckpoint");

    const config = {
      configurable: { thread_id: options.threadId },
      streamMode: "updates" as const,
    };

    if (options.continueRetry) {
      this.emitWorkflowEvent({
        type: "status_changed",
        threadId: options.threadId,
        status: "running",
        timestamp: new Date().toISOString(),
      });
    }

    const command = new Command({ resume: { continueRetry: options.continueRetry } });

    void this.runGraphStream(
      command,
      config,
      options.threadId,
      options.userStoryId
    );
  }

  async curatorReviewDecision(options: CuratorReviewDecisionOptions): Promise<void> {
    await this.assertResumableCheckpoint(options.threadId, "curatorReviewCheckpoint");

    const config = {
      configurable: { thread_id: options.threadId },
      streamMode: "updates" as const,
    };

    if (options.accepted) {
      this.emitWorkflowEvent({
        type: "status_changed",
        threadId: options.threadId,
        status: "running",
        timestamp: new Date().toISOString(),
      });
    }

    const command = new Command({ resume: { accepted: options.accepted } });

    void this.runGraphStream(command, config, options.threadId, options.userStoryId);
  }

  async getStatus(threadId: string) {
    return this.storage.load(threadId);
  }

  private async assertResumableCheckpoint(
    threadId: string,
    nodeName: string
  ): Promise<void> {
    const snapshot = await this.workflowGraph.getState({
      configurable: { thread_id: threadId },
    });
    if (hasPendingCheckpoint(snapshot, nodeName)) return;

    const stored = await this.storage.load(threadId);
    const status = stored ? ` Last persisted status: ${stored.status}.` : "";
    throw new WorkflowResumeUnavailableError(
      `Workflow ${threadId} cannot be resumed because checkpoint "${nodeName}" is unavailable in the active workflow checkpointer.${status} File mode stores restart-safe checkpoints under HORUS_DATA_DIR; Postgres mode stores them in the configured database. Start a new workflow if the checkpoint file or database row is missing.`
    );
  }

  private async runGraphStream(
    input: Record<string, unknown> | Command,
    config: object,
    threadId: string,
    currentUserStoryId?: string,
    execution?: { runId: string; attemptId: string; turnId?: string | null }
  ): Promise<void> {
    let userStoryId = currentUserStoryId ?? extractInputUserStoryId(input);
    let workspaceFolderId = await this.resolveWorkspaceFolderId(input, threadId);
    const frontendProjectRootPath = await this.resolveFrontendProjectRootPath(
      input,
      threadId
    );
    // Track retryCount locally to enrich retry_started events
    let trackedRetryCount = 0;
    let lastCuratorFeedback: { score: number; notes: string } | undefined;
    let deliveryBlockedMessage: string | undefined;

    try {
      for await (const rawChunk of await this.workflowGraph.stream(input, config)) {
        const chunk = rawChunk as Record<string, Record<string, unknown>>;
        const nodeName = Object.keys(chunk)[0];
        if (!nodeName) continue;

        const nodeUpdate = (
          chunk as Record<string, Record<string, unknown>>
        )[nodeName];

        console.log(`[WorkflowOrchestrator] Node completed: ${nodeName}`);

        // ── specAgent: track userStoryId + emit awaiting_approval ──────────
        if (nodeName === "specAgent") {
          const specs = nodeUpdate?.["specs"] as
            | Record<string, Spec>
            | undefined;
          if (specs) {
            const entries = Object.entries(specs);
            if (entries.length > 0) {
              const [storyId, spec] = entries[entries.length - 1]!;
              userStoryId = storyId;
              if (workspaceFolderId) {
                await this.workspaceArtifacts?.saveSpec(
                  workspaceFolderId,
                  storyId,
                  spec
                );
              }
              if (nodeUpdate?.["status"] === "awaiting_human") {
                this.emitWorkflowEvent({
                  type: "awaiting_approval",
                  threadId,
                  userStoryId: storyId,
                  spec,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
        }

        if (nodeName === "hitlCheckpoint") {
          const specs = nodeUpdate?.["specs"] as
            | Record<string, Spec>
            | undefined;
          if (specs && workspaceFolderId) {
            const entries = Object.entries(specs);
            if (entries.length > 0) {
              const [storyId, spec] = entries[entries.length - 1]!;
              userStoryId = storyId;
              await this.workspaceArtifacts?.saveSpec(
                workspaceFolderId,
                storyId,
                spec
              );
            }
          }
        }

        // ── curatorAgent: track retryCount + emit escalation event ─────────
        if (nodeName === "curatorAgent") {
          const resultStoryId = extractAgentResultStoryId(nodeUpdate);
          if (resultStoryId) userStoryId = resultStoryId;

          const newCount = nodeUpdate?.["retryCount"] as number | undefined;
          if (newCount !== undefined) trackedRetryCount = newCount;

          const curFeedbackMap = nodeUpdate?.["curatorFeedback"] as
            | Record<string, { score?: number; notes?: string }>
            | undefined;
          const curFeedbackEntry = userStoryId ? curFeedbackMap?.[userStoryId] : undefined;
          if (curFeedbackEntry) {
            lastCuratorFeedback = {
              score: curFeedbackEntry.score ?? 0,
              notes: curFeedbackEntry.notes ?? "",
            };
          }

          const pending = nodeUpdate?.["pendingRetryApproval"] as
            | PendingRetryApproval
            | null
            | undefined;

          if (pending) {
            // Max retries exceeded → surface to frontend
            this.emitWorkflowEvent({
              type: "awaiting_retry_approval",
              threadId,
              userStoryId: pending.userStoryId,
              retryCount: pending.retryCount,
              score: pending.score,
              notes: pending.notes,
              missingItems: pending.missingItems,
              timestamp: new Date().toISOString(),
            });
          }

          const pendingReview = nodeUpdate?.["pendingCuratorReview"] as
            | { userStoryId: string; score: number; notes: string }
            | null
            | undefined;

          if (pendingReview) {
            const previewSessionId =
              (await this.storage.load(threadId))?.previewSessionId ?? null;
            this.emitWorkflowEvent({
              type: "awaiting_curator_review",
              threadId,
              userStoryId: pendingReview.userStoryId,
              score: pendingReview.score,
              notes: pendingReview.notes,
              previewSessionId: previewSessionId ?? null,
              timestamp: new Date().toISOString(),
            });
          }

          if (userStoryId) {
            const blockedMessage =
              await this.codeChangeSetLifecycle.finalizeAfterCurator({
                nodeUpdate,
                threadId,
                userStoryId,
                frontendProjectRootPath,
                ...(execution ? { execution } : {}),
              });
            if (blockedMessage) deliveryBlockedMessage = blockedMessage;
          }
        }

        // ── odinAgent on retry: emit retry_started ─────────────────────────
        if (nodeName === "odinAgent" && trackedRetryCount > 0) {
          const routing = nodeUpdate?.["routingDecision"] as
            | string[]
            | undefined;

          const hasFront = routing?.includes("frontAgent") ?? false;
          const hasQa = routing?.includes("qaAgent") ?? false;
          const fixTarget =
            hasFront && hasQa ? "both" : hasFront ? "front" : "qa";

          if (userStoryId) {
            this.emitWorkflowEvent({
              type: "retry_started",
              threadId,
              userStoryId,
              retryCount: trackedRetryCount,
              fixTarget,
              score: lastCuratorFeedback?.score ?? 0,
              notes: lastCuratorFeedback?.notes ?? "",
              timestamp: new Date().toISOString(),
            });
          }
        }

        // ── Emit node_completed for all agent nodes ────────────────────────
        const agentName = NODE_AGENT_MAP[nodeName];
        if (agentName && userStoryId) {
          const resultStoryId = extractAgentResultStoryId(nodeUpdate);
          if (resultStoryId) userStoryId = resultStoryId;
          if (nodeName === "frontAgent") {
            await this.codeChangeSetLifecycle.persistProposedCodeChangeSets(
              nodeUpdate,
              execution
            );
          }
          if (nodeName === "qaAgent" || nodeName === "curatorAgent") {
            const evidence = extractRuntimeValidationEvidence(nodeUpdate);
            if (evidence) {
              this.emitWorkflowEvent({
                type: "validation_evidence",
                threadId,
                userStoryId,
                evidence,
                timestamp: new Date().toISOString(),
              });
            }
          }
          this.emitWorkflowEvent({
            type: "node_completed",
            threadId,
            agentName,
            userStoryId,
            status: "success",
            timestamp: new Date().toISOString(),
          });
        }

        // ── Emit status_changed when any node signals a terminal state ─────
        const nodeStatus = nodeUpdate?.["status"] as WorkflowStatus | undefined;
        if (nodeStatus && isTerminalWorkflowStatus(nodeStatus)) {
          this.emitWorkflowEvent({
            type: "status_changed",
            threadId,
            status: nodeStatus,
            timestamp: new Date().toISOString(),
          });
        }
      }
      const status = await this.persistState(threadId, deliveryBlockedMessage);
      if (execution && status) {
        const completedAt = isTerminalWorkflowStatus(status)
          ? new Date().toISOString()
          : null;
        await this.executionLedger?.updateRunStatus({
          runId: execution.runId,
          status,
          completedAt,
          lastError: deliveryBlockedMessage ?? null,
          leaseOwner: null,
        });
        await this.executionLedger?.updateAttemptStatus({
          attemptId: execution.attemptId,
          status: status === "error" ? "failed" : "completed",
          completedAt: completedAt ?? new Date().toISOString(),
          failureClass: status === "error" ? "artifact_validation_failed" : null,
        });
        if (execution.turnId) {
          await this.executionLedger?.updateTurnStatus(
            execution.turnId,
            status === "error"
              ? "failed"
              : isTerminalWorkflowStatus(status)
                ? "completed"
                : "running"
          );
        }
      }
      if (isTerminalWorkflowStatus(status)) {
        this.runtimeLlmSettings?.clear(threadId);
      }
    } catch (err) {
      const message = toErrorMessage(err);
      console.error(`[WorkflowOrchestrator] Graph execution failed: ${message}`);
      await this.persistState(threadId, message);
      if (execution) {
        const completedAt = new Date().toISOString();
        await this.executionLedger?.updateRunStatus({
          runId: execution.runId,
          status: "error",
          completedAt,
          lastError: message,
          leaseOwner: null,
        });
        await this.executionLedger?.updateAttemptStatus({
          attemptId: execution.attemptId,
          status: "failed",
          completedAt,
          failureClass: "graph_error",
        });
        if (execution.turnId) {
          await this.executionLedger?.updateTurnStatus(execution.turnId, "failed");
        }
      }
      this.runtimeLlmSettings?.clear(threadId);
      this.emitWorkflowEvent({
        type: "error",
        threadId,
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private emitWorkflowEvent(event: WorkflowEvent): void {
    this.eventProjector.emit(event);
  }

  private async persistState(
    threadId: string,
    errorMessage?: string
  ): Promise<WorkflowStatus | undefined> {
    const startedAt = this.startTimes.get(threadId);
    return this.statePersister.persist({
      threadId,
      ...(startedAt ? { startedAt } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    });
  }

  private async resolveWorkspaceFolderId(
    input: Record<string, unknown> | Command,
    threadId: string
  ): Promise<string | undefined> {
    if (
      typeof input === "object" &&
      input !== null &&
      "workspaceFolderId" in input &&
      typeof (input as Record<string, unknown>)["workspaceFolderId"] === "string"
    ) {
      return (input as Record<string, string>)["workspaceFolderId"];
    }

    const stored = await this.storage.load(threadId);
    return stored?.workspaceFolderId;
  }

  private async resolveFrontendProjectRootPath(
    input: Record<string, unknown> | Command,
    threadId: string
  ): Promise<string | undefined> {
    if (
      typeof input === "object" &&
      input !== null &&
      "frontendProjectRootPath" in input &&
      typeof (input as Record<string, unknown>)["frontendProjectRootPath"] ===
        "string"
    ) {
      return (input as Record<string, string>)["frontendProjectRootPath"];
    }

    const stored = await this.storage.load(threadId);
    return stored?.frontendProjectRootPath;
  }

}
