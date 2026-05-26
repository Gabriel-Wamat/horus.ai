import type { PreviewRuntimeManager } from "../../infrastructure/preview/PreviewRuntimeManager.js";

export class ListPreviewTimelineUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimeManager) {}

  async execute(sessionId: string) {
    return this.previewRuntime.listTimeline(sessionId);
  }
}
