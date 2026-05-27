import type {
  PreviewActionResult,
  PreviewRuntimeManager,
} from "../../infrastructure/preview/PreviewRuntimeManager.js";

export class StopPreviewSessionUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimeManager) {}

  async execute(sessionId: string): Promise<PreviewActionResult> {
    return this.previewRuntime.stopSession(sessionId);
  }
}
