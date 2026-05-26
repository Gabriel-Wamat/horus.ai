import type { PreviewEvent } from "../entities/Preview.js";

export interface IPreviewEventStream {
  subscribe(sessionId: string, handler: (event: PreviewEvent) => void): () => void;
  emit(event: PreviewEvent): void;
  cleanup(sessionId: string): void;
}
