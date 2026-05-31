import type { PreviewRuntimePort } from "../ports/PreviewRuntimePort.js";

export class ListPreviewTimelineUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimePort) {}

  async execute(sessionId: string) {
    return this.previewRuntime.listTimeline(sessionId);
  }
}
