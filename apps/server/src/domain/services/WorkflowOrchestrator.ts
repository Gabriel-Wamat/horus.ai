import { Command } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import {
  CodeChangeSetSchema,
  RuntimeValidationEvidenceSchema,
} from "@u-build/shared";
import type {
  IStorageProvider,
  IEventStream,
  UserStory,
  HumanFeedback,
  Spec,
  AgentName,
  CodeChangeSet,
  FrontendProject,
  RuntimeValidationEvidence,
  WorkflowState,
  WorkflowStatus,
  LlmSettings,
  WorkspaceArtifactContext,
  WorkflowMode,
  WorkflowCheckpointNode,
} from "@u-build/shared";
import type { PendingRetryApproval } from "../../infrastructure/langgraph/state.js";
import {
  WorkflowResumeUnavailableError,
  hasPendingCheckpoint,
} from "./resumeCheckpoint.js";
import {
  clearRuntimeLlmSettings,
  setRuntimeLlmSettings,
} from "../../infrastructure/llm/runtimeLlmSettings.js";

export interface StartWorkflowOptions {
  workspaceFolderId: string;
  userStories: UserStory[];
  workspaceArtifactContext?: Record<string, WorkspaceArtifactContext>;
  initialSpecs?: Record<string, Spec>;
  workflowMode?: WorkflowMode;
  sourceChatSessionId?: string;
  sourceChatMessageId?: string;
  executionBrief?: string;
  frontendProjectId?: string;
  frontendProjectRootPath?: string;
  previewSessionId?: string;
  llmSettings?: LlmSettings;
}

export interface StartChatCodeChangeOptions {
  workspaceFolderId: string;
  userStory: UserStory;
  spec: Spec;
  artifactContext: WorkspaceArtifactContext;
  project: FrontendProject;
  chatSessionId: string;
  sourceMessageId: string;
  executionBrief: string;
  previewSessionId?: string;
  llmSettings?: LlmSettings;
}

export interface StartSpecGenerationOptions {
  workspaceFolderId: string;
  userStory: UserStory;
  chatSessionId: string;
  sourceMessageId: string;
  executionBrief: string;
  llmSettings?: LlmSettings;
}

export interface ResumeWorkflowOptions {
  threadId: string;
  userStoryId: string;
  feedback: HumanFeedback;
}

export interface RetryDecisionOptions {
  threadId: string;
  userStoryId: string;
  continueRetry: boolean;
}

export interface WorkspaceArtifactStore {
  saveSpec(folderId: string, storyId: string, spec: Spec): Promise<Spec>;
}

export interface ChatProgressSink {
  appendMessage(
    sessionId: string,
    input: {
      role: "agent";
      body: string;
      workflowThreadId?: string;
    }
  ): Promise<unknown>;
}

export interface WorkflowCodeChangeSetSink {
  save(changeSet: CodeChangeSet): Promise<unknown>;
  listByWorkflow?(threadId: string): Promise<CodeChangeSet[]>;
}

export interface WorkflowCodeChangeSetApplier {
  apply(input: {
    changeSet: CodeChangeSet;
    projectRootPath: string;
  }): Promise<CodeChangeSet>;
}

export interface WorkflowGraphRunner {
  stream(
    input: unknown,
    config: object
  ): Promise<AsyncIterable<unknown>>;
  getState(config: object): Promise<{ values: unknown; next?: readonly unknown[] }>;
}

// Maps node names to typed AgentName values for SSE emission
const NODE_AGENT_MAP: Record<string, AgentName> = {
  odinAgent: "odin",
  frontAgent: "front",
  qaAgent: "qa",
  curatorAgent: "curator",
};

export class WorkflowOrchestrator {
  private readonly startTimes = new Map<string, string>();

  constructor(
    private readonly storage: IStorageProvider,
    private readonly events: IEventStream,
    private readonly workflowGraph: WorkflowGraphRunner,
    private readonly workspaceArtifacts?: WorkspaceArtifactStore,
    private readonly chatProgress?: ChatProgressSink,
    private readonly codeChangeSets?: WorkflowCodeChangeSetSink,
    private readonly codeChangeSetApplier?: WorkflowCodeChangeSetApplier
  ) {}

  async start(options: StartWorkflowOptions): Promise<{ threadId: string }> {
    const threadId = uuidv4();
    if (options.llmSettings) {
      setRuntimeLlmSettings(threadId, options.llmSettings);
    }

    const startedAt = new Date().toISOString();
    this.startTimes.set(threadId, startedAt);
    const config = {
      configurable: { thread_id: threadId },
      streamMode: "updates" as const,
    };

    const initialState = {
      userStories: options.userStories,
      workspaceFolderId: options.workspaceFolderId,
      ...(options.frontendProjectId
        ? { frontendProjectId: options.frontendProjectId }
        : {}),
      ...(options.frontendProjectRootPath
        ? { frontendProjectRootPath: options.frontendProjectRootPath }
        : {}),
      ...(options.previewSessionId
        ? { previewSessionId: options.previewSessionId }
        : {}),
      workflowMode: options.workflowMode ?? "standard",
      ...(options.sourceChatSessionId
        ? { sourceChatSessionId: options.sourceChatSessionId }
        : {}),
      ...(options.sourceChatMessageId
        ? { sourceChatMessageId: options.sourceChatMessageId }
        : {}),
      ...(options.executionBrief ? { executionBrief: options.executionBrief } : {}),
      workspaceArtifactContext: options.workspaceArtifactContext ?? {},
      currentUSIndex: 0,
      specs: options.initialSpecs ?? {},
      humanFeedback: {},
      agentResults: {},
      status: "running" as const,
      threadId,
      routingDecision: [],
      curatorFeedback: {},
      retryCount: 0,
      pendingRetryApproval: null,
    };

    await this.storage.save({
      threadId,
      workspaceFolderId: options.workspaceFolderId,
      ...(options.frontendProjectId
        ? { frontendProjectId: options.frontendProjectId }
        : {}),
      ...(options.frontendProjectRootPath
        ? { frontendProjectRootPath: options.frontendProjectRootPath }
        : {}),
      ...(options.previewSessionId
        ? { previewSessionId: options.previewSessionId }
        : {}),
      workflowMode: options.workflowMode ?? "standard",
      ...(options.sourceChatSessionId
        ? { sourceChatSessionId: options.sourceChatSessionId }
        : {}),
      ...(options.sourceChatMessageId
        ? { sourceChatMessageId: options.sourceChatMessageId }
        : {}),
      ...(options.executionBrief ? { executionBrief: options.executionBrief } : {}),
      userStories: options.userStories,
      currentUSIndex: 0,
      specs: options.initialSpecs ?? {},
      workspaceArtifactContext: options.workspaceArtifactContext ?? {},
      humanFeedback: {},
      agentResults: {},
      pendingCheckpoints: [],
      validationGates: [],
      status: "running",
      startedAt,
    });

    this.events.emit({
      type: "status_changed",
      threadId,
      status: "running",
      timestamp: new Date().toISOString(),
    });

    void this.runGraphStream(initialState, config, threadId);

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
      frontendProjectId: options.project.id,
      frontendProjectRootPath: options.project.rootPath,
      sourceChatSessionId: options.chatSessionId,
      sourceChatMessageId: options.sourceMessageId,
      executionBrief: options.executionBrief,
      ...(options.previewSessionId
        ? { previewSessionId: options.previewSessionId }
        : {}),
      ...(options.llmSettings ? { llmSettings: options.llmSettings } : {}),
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
    });
  }

  async resume(options: ResumeWorkflowOptions): Promise<void> {
    await this.assertResumableCheckpoint(options.threadId, "hitlCheckpoint");

    const config = {
      configurable: { thread_id: options.threadId },
      streamMode: "updates" as const,
    };

    this.events.emit({
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
      this.events.emit({
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
    currentUserStoryId?: string
  ): Promise<void> {
    let userStoryId = currentUserStoryId ?? extractInputUserStoryId(input);
    let workspaceFolderId = await this.resolveWorkspaceFolderId(input, threadId);
    const frontendProjectRootPath = await this.resolveFrontendProjectRootPath(
      input,
      threadId
    );
    // Track retryCount locally to enrich retry_started events
    let trackedRetryCount = 0;

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
                this.events.emit({
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

          const pending = nodeUpdate?.["pendingRetryApproval"] as
            | PendingRetryApproval
            | null
            | undefined;

          if (pending) {
            // Max retries exceeded → surface to frontend
            this.events.emit({
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

          if (userStoryId) {
            await this.finalizeLatestCodeChangeSetAfterCurator({
              nodeUpdate,
              threadId,
              userStoryId,
              frontendProjectRootPath,
            });
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

          const curFeedback = nodeUpdate?.["curatorFeedback"] as
            | Record<string, { score?: number; notes?: string }>
            | undefined;
          const feedbackEntry = userStoryId
            ? curFeedback?.[userStoryId]
            : undefined;

          if (userStoryId) {
            this.events.emit({
              type: "retry_started",
              threadId,
              userStoryId,
              retryCount: trackedRetryCount,
              fixTarget,
              score: feedbackEntry?.score ?? 0,
              notes: feedbackEntry?.notes ?? "",
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
            await this.persistProposedCodeChangeSets(nodeUpdate);
          }
          if (nodeName === "qaAgent" || nodeName === "curatorAgent") {
            const evidence = extractRuntimeValidationEvidence(nodeUpdate);
            if (evidence) {
              this.events.emit({
                type: "validation_evidence",
                threadId,
                userStoryId,
                evidence,
                timestamp: new Date().toISOString(),
              });
            }
          }
          this.events.emit({
            type: "node_completed",
            threadId,
            agentName,
            userStoryId,
            status: "success",
            timestamp: new Date().toISOString(),
          });
        }

        // ── Emit status_changed when any node signals a terminal state ─────
        const nodeStatus = nodeUpdate?.["status"] as string | undefined;
        if (nodeStatus === "completed" || nodeStatus === "cancelled") {
          this.events.emit({
            type: "status_changed",
            threadId,
            status: nodeStatus,
            timestamp: new Date().toISOString(),
          });
        }
      }
      const status = await this.persistState(threadId);
      if (isTerminalStatus(status)) {
        clearRuntimeLlmSettings(threadId);
      }
    } catch (err) {
      const message = toErrorMessage(err);
      console.error(`[WorkflowOrchestrator] Graph execution failed: ${message}`);
      await this.persistState(threadId, message);
      clearRuntimeLlmSettings(threadId);
      this.events.emit({
        type: "error",
        threadId,
        message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async persistState(
    threadId: string,
    errorMessage?: string
  ): Promise<WorkflowStatus | undefined> {
    try {
      const snapshot = await this.workflowGraph.getState({
        configurable: { thread_id: threadId },
      });
      const values = snapshot.values as Record<string, unknown>;

      const startedAt = this.startTimes.get(threadId) ?? new Date().toISOString();
      const isError = Boolean(errorMessage);
      const now = new Date().toISOString();
      const status: WorkflowStatus = isError
        ? "error"
        : ((values["status"] as WorkflowStatus | undefined) ?? "completed");
      const pendingCheckpoints = extractPendingCheckpoints(
        snapshot.next,
        values,
        now
      );

      const state: WorkflowState = {
        threadId,
        workflowMode:
          (values["workflowMode"] as WorkflowState["workflowMode"]) ??
          "standard",
        ...(typeof values["sourceChatSessionId"] === "string"
          ? { sourceChatSessionId: values["sourceChatSessionId"] }
          : {}),
        ...(typeof values["sourceChatMessageId"] === "string"
          ? { sourceChatMessageId: values["sourceChatMessageId"] }
          : {}),
        ...(typeof values["executionBrief"] === "string"
          ? { executionBrief: values["executionBrief"] }
          : {}),
        userStories: (values["userStories"] as WorkflowState["userStories"]) ?? [],
        currentUSIndex: (values["currentUSIndex"] as number) ?? 0,
        specs: (values["specs"] as WorkflowState["specs"]) ?? {},
        workspaceArtifactContext:
          (values["workspaceArtifactContext"] as WorkflowState["workspaceArtifactContext"]) ??
          {},
        humanFeedback: (values["humanFeedback"] as WorkflowState["humanFeedback"]) ?? {},
        agentResults: (values["agentResults"] as WorkflowState["agentResults"]) ?? {},
        pendingCheckpoints,
        validationGates:
          (values["validationGates"] as WorkflowState["validationGates"]) ?? [],
        status,
        startedAt,
        ...(isTerminalStatus(status) ? { completedAt: now } : {}),
        ...(typeof values["workspaceFolderId"] === "string"
          ? { workspaceFolderId: values["workspaceFolderId"] }
          : {}),
        ...(typeof values["frontendProjectId"] === "string"
          ? { frontendProjectId: values["frontendProjectId"] }
          : {}),
        ...(typeof values["frontendProjectRootPath"] === "string"
          ? { frontendProjectRootPath: values["frontendProjectRootPath"] }
          : {}),
        ...(errorMessage ? { errorMessage } : {}),
      };

      await this.storage.save(state);
      return state.status;
    } catch (saveErr) {
      console.error("[WorkflowOrchestrator] Failed to persist state:", saveErr);
      return undefined;
    }
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

  private async persistProposedCodeChangeSets(
    nodeUpdate: Record<string, unknown> | undefined
  ): Promise<void> {
    if (!nodeUpdate || !this.codeChangeSets) return;

    for (const proposedChangeSet of extractCodeChangeSets(nodeUpdate)) {
      const saved = CodeChangeSetSchema.parse({
        ...proposedChangeSet,
        status:
          proposedChangeSet.status === "failed"
            ? proposedChangeSet.status
            : "proposed",
      });
      await this.codeChangeSets.save(saved);
      this.events.emit({
        type: "patch_proposed",
        threadId: saved.workflowThreadId,
        userStoryId: saved.userStoryId,
        changeSetId: saved.id,
        filePaths: saved.operations.map((operation) => operation.targetPath),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async finalizeLatestCodeChangeSetAfterCurator(input: {
    nodeUpdate: Record<string, unknown> | undefined;
    threadId: string;
    userStoryId: string;
    frontendProjectRootPath: string | undefined;
  }): Promise<void> {
    if (!input.nodeUpdate || !this.codeChangeSets) return;

    const verdict = extractCuratorVerdict(input.nodeUpdate, input.userStoryId);
    if (!verdict) return;

    const proposedChangeSet = await this.findLatestProposedCodeChangeSet(
      input.threadId,
      input.userStoryId
    );
    if (!proposedChangeSet) return;

    if (!verdict.passed) {
      await this.codeChangeSets.save(
        CodeChangeSetSchema.parse({
          ...proposedChangeSet,
          status: "curator_rejected",
          failedReason: buildCuratorRejectionReason(verdict),
        })
      );
      return;
    }

    const approvedChangeSet = CodeChangeSetSchema.parse({
      ...proposedChangeSet,
      status: "curator_approved",
    });
    await this.codeChangeSets.save(approvedChangeSet);

    if (!input.frontendProjectRootPath || !this.codeChangeSetApplier) return;

    const appliedChangeSet = await this.codeChangeSetApplier.apply({
      changeSet: approvedChangeSet,
      projectRootPath: input.frontendProjectRootPath,
    });
    await this.codeChangeSets.save(appliedChangeSet);
    if (appliedChangeSet.status === "failed") {
      this.events.emit({
        type: "validation_evidence",
        threadId: appliedChangeSet.workflowThreadId,
        userStoryId: appliedChangeSet.userStoryId,
        evidence: buildRuntimeEvidenceFromFailedChangeSet(appliedChangeSet),
        timestamp: new Date().toISOString(),
      });
      this.events.emit({
        type: "error",
        threadId: appliedChangeSet.workflowThreadId,
        message:
          appliedChangeSet.failedReason ??
          "CodeChangeSet failed final validation and was not delivered.",
        timestamp: new Date().toISOString(),
      });
      return;
    }
    this.events.emit({
      type: "patch_applied",
      threadId: appliedChangeSet.workflowThreadId,
      userStoryId: appliedChangeSet.userStoryId,
      changeSetId: appliedChangeSet.id,
      filePaths: appliedChangeSet.operations.map((operation) => operation.targetPath),
      timestamp: new Date().toISOString(),
    });
  }

  private async findLatestProposedCodeChangeSet(
    threadId: string,
    userStoryId: string
  ): Promise<CodeChangeSet | undefined> {
    if (!this.codeChangeSets?.listByWorkflow) return undefined;
    const changeSets = await this.codeChangeSets.listByWorkflow(threadId);
    return changeSets
      .filter(
        (changeSet) =>
          changeSet.userStoryId === userStoryId &&
          changeSet.sourceAgent === "front" &&
          changeSet.status === "proposed"
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }
}

interface CuratorVerdict {
  passed: boolean;
  score?: number;
  notes?: string;
  missingItems?: string[];
}

function extractCodeChangeSets(
  nodeUpdate: Record<string, unknown> | undefined
): CodeChangeSet[] {
  if (!nodeUpdate) return [];
  const agentResults = nodeUpdate["agentResults"];
  if (!agentResults || typeof agentResults !== "object") return [];

  const changeSets: CodeChangeSet[] = [];
  for (const results of Object.values(agentResults as Record<string, unknown>)) {
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      if (!result || typeof result !== "object") continue;
      const output = (result as { output?: unknown }).output;
      if (!output || typeof output !== "object") continue;
      const rawChangeSet = (output as Record<string, unknown>)["codeChangeSet"];
      if (!rawChangeSet) continue;
      changeSets.push(CodeChangeSetSchema.parse(rawChangeSet));
    }
  }
  return changeSets;
}

function extractAgentResultStoryId(
  nodeUpdate: Record<string, unknown> | undefined
): string | undefined {
  if (!nodeUpdate) return undefined;
  const agentResults = nodeUpdate["agentResults"];
  if (!agentResults || typeof agentResults !== "object") return undefined;
  const [storyId] = Object.keys(agentResults as Record<string, unknown>);
  return storyId;
}

function extractCuratorVerdict(
  nodeUpdate: Record<string, unknown> | undefined,
  userStoryId: string
): CuratorVerdict | undefined {
  if (!nodeUpdate) return undefined;
  const agentResults = nodeUpdate["agentResults"];
  if (!agentResults || typeof agentResults !== "object") return undefined;
  const results = (agentResults as Record<string, unknown>)[userStoryId];
  if (!Array.isArray(results)) return undefined;
  const latest = [...results].reverse().find((result) => {
    return (
      result &&
      typeof result === "object" &&
      (result as { agentName?: unknown }).agentName === "curator"
    );
  });
  const output =
    latest && typeof latest === "object"
      ? (latest as { output?: unknown }).output
      : undefined;
  if (!output || typeof output !== "object") return undefined;
  const passed = (output as Record<string, unknown>)["passed"];
  if (typeof passed !== "boolean") return undefined;
  const score = (output as Record<string, unknown>)["score"];
  const notes = (output as Record<string, unknown>)["notes"];
  const missingItems = (output as Record<string, unknown>)["missingItems"];
  return {
    passed,
    ...(typeof score === "number" ? { score } : {}),
    ...(typeof notes === "string" ? { notes } : {}),
    ...(Array.isArray(missingItems) ? { missingItems: missingItems as string[] } : {}),
  };
}

function extractRuntimeValidationEvidence(
  nodeUpdate: Record<string, unknown> | undefined
) {
  if (!nodeUpdate) return undefined;
  const agentResults = nodeUpdate["agentResults"];
  if (!agentResults || typeof agentResults !== "object") return undefined;
  for (const results of Object.values(agentResults as Record<string, unknown>)) {
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      if (!result || typeof result !== "object") continue;
      const output = (result as { output?: unknown }).output;
      if (!output || typeof output !== "object") continue;
      const rawEvidence = (output as Record<string, unknown>)["runtimeValidation"];
      if (rawEvidence) return RuntimeValidationEvidenceSchema.parse(rawEvidence);
    }
  }
  return undefined;
}

function buildRuntimeEvidenceFromFailedChangeSet(
  changeSet: CodeChangeSet
): RuntimeValidationEvidence {
  return RuntimeValidationEvidenceSchema.parse({
    id: uuidv4(),
    workflowThreadId: changeSet.workflowThreadId,
    constructionRunId: null,
    userStoryId: changeSet.userStoryId,
    projectId: null,
    status: "failed",
    skippedReason: null,
    commands: changeSet.validation.map((entry) => ({
      commandId: entry.command,
      command: entry.command,
      cwd: entry.cwd,
      exitCode: entry.exitCode,
      stdoutTail: entry.stdout ?? "",
      stderrTail: entry.stderr ?? "",
      durationMs: 0,
    })),
    preview: {
      status: "skipped",
      url: null,
      message:
        changeSet.failedReason ??
        "CodeChangeSet failed final validation and was not delivered.",
      evidence: {
        title: null,
        bodySnippet: null,
        screenshotPath: null,
      },
    },
    createdAt: new Date().toISOString(),
  });
}

function buildCuratorRejectionReason(verdict: CuratorVerdict): string {
  return [
    verdict.notes ?? "Curator rejected this CodeChangeSet.",
    ...(verdict.missingItems ?? []),
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown workflow error";
  }
}

function isTerminalStatus(status: WorkflowStatus | undefined): boolean {
  return status === "completed" || status === "cancelled" || status === "error";
}

function extractInputUserStoryId(
  input: Record<string, unknown> | Command
): string | undefined {
  if (
    typeof input !== "object" ||
    input === null ||
    !("userStories" in input) ||
    !Array.isArray((input as Record<string, unknown>)["userStories"])
  ) {
    return undefined;
  }

  const [firstStory] = (input as { userStories: unknown[] }).userStories;
  if (
    typeof firstStory === "object" &&
    firstStory !== null &&
    typeof (firstStory as Record<string, unknown>)["id"] === "string"
  ) {
    return (firstStory as Record<string, string>)["id"];
  }

  return undefined;
}

function extractPendingCheckpoints(
  next: readonly unknown[] | undefined,
  values: Record<string, unknown>,
  createdAt: string
): WorkflowCheckpointNode[] {
  if (!Array.isArray(next) || next.length === 0) return [];

  const userStories = Array.isArray(values["userStories"])
    ? (values["userStories"] as UserStory[])
    : [];
  const currentUSIndex =
    typeof values["currentUSIndex"] === "number"
      ? values["currentUSIndex"]
      : 0;
  const currentUserStory = userStories[currentUSIndex];

  return next
    .filter(isWorkflowCheckpointNodeName)
    .map((nodeName) => ({
      nodeName,
      ...(currentUserStory?.id ? { userStoryId: currentUserStory.id } : {}),
      createdAt,
    }));
}

function isWorkflowCheckpointNodeName(
  value: unknown
): value is WorkflowCheckpointNode["nodeName"] {
  return value === "hitlCheckpoint" || value === "retryCheckpoint";
}
