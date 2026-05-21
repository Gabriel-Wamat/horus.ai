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
} from "@u-build/shared";
import type { PendingRetryApproval } from "../../infrastructure/langgraph/state.js";
import { graph } from "../../infrastructure/langgraph/graph.js";

export interface StartWorkflowOptions {
  userStories: UserStory[];
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
    private readonly events: IEventStream
  ) {}

  async start(options: StartWorkflowOptions): Promise<{ threadId: string }> {
    const threadId = uuidv4();
    this.startTimes.set(threadId, new Date().toISOString());
    const config = {
      configurable: { thread_id: threadId },
      streamMode: "updates" as const,
    };

    const initialState = {
      userStories: options.userStories,
      currentUSIndex: 0,
      specs: {},
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

  async resume(options: ResumeWorkflowOptions): Promise<void> {
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

  private async runGraphStream(
    input: Record<string, unknown> | Command,
    config: object,
    threadId: string,
    currentUserStoryId?: string
  ): Promise<void> {
    let userStoryId = currentUserStoryId;
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
        }

        // ── Emit status_changed: completed when any node signals done ──────
        const nodeStatus = nodeUpdate?.["status"] as string | undefined;
        if (nodeStatus === "completed") {
          this.events.emit({
            type: "status_changed",
            threadId,
            status: "completed",
            timestamp: new Date().toISOString(),
          });
        }
      }
      await this.persistState(threadId);
    } catch (err) {
      await this.persistState(threadId, err instanceof Error ? err.message : String(err));
      this.events.emit({
        type: "error",
        threadId,
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async persistState(threadId: string, errorMessage?: string): Promise<void> {
    try {
      const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
      const values = snapshot.values as Record<string, unknown>;

      const startedAt = this.startTimes.get(threadId) ?? new Date().toISOString();
      const isError = Boolean(errorMessage);

      const state: WorkflowState = {
        threadId,
        userStories: (values["userStories"] as WorkflowState["userStories"]) ?? [],
        currentUSIndex: (values["currentUSIndex"] as number) ?? 0,
        specs: (values["specs"] as WorkflowState["specs"]) ?? {},
        humanFeedback: (values["humanFeedback"] as WorkflowState["humanFeedback"]) ?? {},
        agentResults: (values["agentResults"] as WorkflowState["agentResults"]) ?? {},
        status: isError ? "error" : ((values["status"] as WorkflowState["status"]) ?? "completed"),
        startedAt,
        completedAt: new Date().toISOString(),
        ...(errorMessage ? { errorMessage } : {}),
      };

      await this.storage.save(state);
    } catch (saveErr) {
      console.error("[WorkflowOrchestrator] Failed to persist state:", saveErr);
    }
  }
}