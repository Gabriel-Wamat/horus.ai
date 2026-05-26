import type { IEventStream, WorkflowEvent } from "@u-build/shared";

type EventHandler = (event: WorkflowEvent) => void;

export class SseEventStreamAdapter implements IEventStream {
  private readonly subscribers = new Map<string, Set<EventHandler>>();
  private readonly history = new Map<string, WorkflowEvent[]>();
  private readonly maxHistory = 50;

  subscribe(threadId: string, handler: EventHandler): () => void {
    if (!this.subscribers.has(threadId)) {
      this.subscribers.set(threadId, new Set());
    }
    this.subscribers.get(threadId)!.add(handler);

    for (const event of this.history.get(threadId) ?? []) {
      handler(event);
    }

    return () => {
      this.subscribers.get(threadId)?.delete(handler);
    };
  }

  emit(event: WorkflowEvent): void {
    const history = this.history.get(event.threadId) ?? [];
    history.push(event);
    this.history.set(event.threadId, history.slice(-this.maxHistory));

    const handlers = this.subscribers.get(event.threadId);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error("[SseEventStreamAdapter] Handler error:", err);
      }
    }
  }

  cleanup(threadId: string): void {
    this.subscribers.delete(threadId);
    this.history.delete(threadId);
  }
}
