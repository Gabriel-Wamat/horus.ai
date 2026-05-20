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
