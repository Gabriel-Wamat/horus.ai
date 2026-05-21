import type { AgentName } from "../entities/AgentResult.js";
import type { Spec } from "../entities/Spec.js";
import type { WorkflowStatus } from "../entities/WorkflowState.js";

export type WorkflowEvent =
  | {
      type: "node_started";
      threadId: string;
      agentName: AgentName;
      userStoryId: string;
      timestamp: string;
    }
  | {
      type: "node_completed";
      threadId: string;
      agentName: AgentName;
      userStoryId: string;
      status: "success" | "error" | "skipped";
      timestamp: string;
    }
  | {
      type: "awaiting_approval";
      threadId: string;
      userStoryId: string;
      spec: Spec;
      timestamp: string;
    }
  | {
      // Curator failed and is asking for a retry within the loop
      type: "retry_started";
      threadId: string;
      userStoryId: string;
      retryCount: number;
      fixTarget: "front" | "qa" | "both";
      score: number;
      notes: string;
      timestamp: string;
    }
  | {
      // Max retries exceeded — waiting for user to decide (HITL escalation)
      type: "awaiting_retry_approval";
      threadId: string;
      userStoryId: string;
      retryCount: number;
      score: number;
      notes: string;
      missingItems: string[];
      timestamp: string;
    }
  | {
      type: "status_changed";
      threadId: string;
      status: WorkflowStatus;
      timestamp: string;
    }
  | {
      type: "error";
      threadId: string;
      message: string;
      timestamp: string;
    };

export interface IEventStream {
  subscribe(
    threadId: string,
    handler: (event: WorkflowEvent) => void
  ): () => void;

  emit(event: WorkflowEvent): void;

  cleanup(threadId: string): void;
}