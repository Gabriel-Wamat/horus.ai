import { Command } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";
import type {
  IStorageProvider,
  IEventStream,
  UserStory,
  HumanFeedback,
  Spec,
  AgentName,
  WorkflowState,
  WorkflowStatus,
  LlmSettings,
  WorkspaceArtifactContext,
  WorkflowMode,
} from "@u-build/shared";
import type { PendingRetryApproval } from "../../infrastructure/langgraph/state.js";
import { graph } from "../../infrastructure/langgraph/graph.js";
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
  llmSettings?: LlmSettings;
}

export interface StartChatCodeChangeOptions {
  workspaceFolderId: string;
  userStory: UserStory;
  spec: Spec;
  artifactContext: WorkspaceArtifactContext;
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
    private readonly workspaceArtifacts?: WorkspaceArtifactStore,
    private readonly chatProgress?: ChatProgressSink
  ) {}

  async start(options: StartWorkflowOptions): Promise<{ threadId: string }> {
    const threadId = uuidv4();
    if (options.llmSettings) {
      setRuntimeLlmSettings(threadId, options.llmSettings);
    }

    this.startTimes.set(threadId, new Date().toISOString());
    const config = {
      configurable: { thread_id: threadId },
      streamMode: "updates" as const,
    };

    const initialState = {
      userStories: options.userStories,
      workspaceFolderId: options.workspaceFolderId,
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
    const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
    if (hasPendingCheckpoint(snapshot, nodeName)) return;

    const stored = await this.storage.load(threadId);
    const status = stored ? ` Last persisted status: ${stored.status}.` : "";
    throw new WorkflowResumeUnavailableError(
      `Workflow ${threadId} cannot be resumed because its in-memory checkpoint "${nodeName}" is unavailable.${status} Start a new workflow.`
    );
  }

  private async runGraphStream(
    input: Record<string, unknown> | Command,
    config: object,
    threadId: string,
    currentUserStoryId?: string
  ): Promise<void> {
    let userStoryId = currentUserStoryId;
    let workspaceFolderId = await this.resolveWorkspaceFolderId(input, threadId);
    const sourceChatSessionId = await this.resolveSourceChatSessionId(
      input,
      threadId
    );
    // Track retryCount locally to enrich retry_started events
    let trackedRetryCount = 0;

    try {
      for await (const chunk of await graph.stream(
        input as Parameters<typeof graph.stream>[0],
        config
      )) {
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
          this.events.emit({
            type: "node_completed",
            threadId,
            agentName,
            userStoryId,
            status: "success",
            timestamp: new Date().toISOString(),
          });
          await this.appendChatProgress(
            sourceChatSessionId,
            threadId,
            `${agentDisplayName(agentName)} concluiu a etapa do modo executor.`
          );
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
      await this.persistState(threadId, err instanceof Error ? err.message : String(err));
      clearRuntimeLlmSettings(threadId);
      await this.appendChatProgress(
        sourceChatSessionId,
        threadId,
        `A execução dos agentes falhou: ${err instanceof Error ? err.message : String(err)}`
      );
      this.events.emit({
        type: "error",
        threadId,
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async persistState(
    threadId: string,
    errorMessage?: string
  ): Promise<WorkflowStatus | undefined> {
    try {
      const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
      const values = snapshot.values as Record<string, unknown>;

      const startedAt = this.startTimes.get(threadId) ?? new Date().toISOString();
      const isError = Boolean(errorMessage);

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
        status: isError ? "error" : ((values["status"] as WorkflowState["status"]) ?? "completed"),
        startedAt,
        completedAt: new Date().toISOString(),
        ...(typeof values["workspaceFolderId"] === "string"
          ? { workspaceFolderId: values["workspaceFolderId"] }
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

  private async resolveSourceChatSessionId(
    input: Record<string, unknown> | Command,
    threadId: string
  ): Promise<string | undefined> {
    if (
      typeof input === "object" &&
      input !== null &&
      "sourceChatSessionId" in input &&
      typeof (input as Record<string, unknown>)["sourceChatSessionId"] ===
        "string"
    ) {
      return (input as Record<string, string>)["sourceChatSessionId"];
    }

    const stored = await this.storage.load(threadId);
    return stored?.sourceChatSessionId;
  }

  private async appendChatProgress(
    sessionId: string | undefined,
    threadId: string,
    body: string
  ): Promise<void> {
    if (!sessionId || !this.chatProgress) return;
    try {
      await this.chatProgress.appendMessage(sessionId, {
        role: "agent",
        body,
        workflowThreadId: threadId,
      });
    } catch (err) {
      console.warn("[WorkflowOrchestrator] Failed to append chat progress:", err);
    }
  }
}

function isTerminalStatus(status: WorkflowStatus | undefined): boolean {
  return status === "completed" || status === "cancelled" || status === "error";
}

function agentDisplayName(agentName: AgentName): string {
  const labels: Record<AgentName, string> = {
    spec: "Spec Agent",
    odin: "Horus/Odin",
    front: "Front Agent",
    qa: "QA Agent",
    curator: "Curator Agent",
  };
  return labels[agentName];
}
