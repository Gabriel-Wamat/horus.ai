import type { IPreviewEventStream, PreviewEvent } from "@u-build/shared";

type EventHandler = (event: PreviewEvent) => void;

export class PreviewEventStreamAdapter implements IPreviewEventStream {
  private readonly subscribers = new Map<string, Set<EventHandler>>();

  subscribe(sessionId: string, handler: EventHandler): () => void {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set());
    }
    this.subscribers.get(sessionId)!.add(handler);

    return () => {
      this.subscribers.get(sessionId)?.delete(handler);
    };
  }

  emit(event: PreviewEvent): void {
    const handlers = this.subscribers.get(event.sessionId);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error("[PreviewEventStreamAdapter] Handler error:", err);
      }
    }
  }

  cleanup(sessionId: string): void {
    this.subscribers.delete(sessionId);
  }
}
