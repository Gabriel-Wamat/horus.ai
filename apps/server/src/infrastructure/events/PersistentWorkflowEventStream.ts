import type { IEventStream, WorkflowEvent } from "@u-build/shared";
import type { WorkflowEventLogRepository } from "../repositories/contracts.js";

export class PersistentWorkflowEventStream implements IEventStream {
  constructor(
    private readonly inner: IEventStream,
    private readonly eventLog: WorkflowEventLogRepository
  ) {}

  subscribe(threadId: string, handler: (event: WorkflowEvent) => void): () => void {
    return this.inner.subscribe(threadId, handler);
  }

  emit(event: WorkflowEvent): void {
    void this.eventLog.append(event).catch((err) => {
      console.error("Failed to persist workflow event", err);
    });
    this.inner.emit(event);
  }

  cleanup(threadId: string): void {
    this.inner.cleanup(threadId);
  }
}
