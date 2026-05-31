import type {
  PreviewActionResult,
  PreviewRuntimePort,
} from "../ports/PreviewRuntimePort.js";

export class ReloadPreviewSessionUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimePort) {}

  async execute(sessionId: string): Promise<PreviewActionResult> {
    return this.previewRuntime.reloadSession(sessionId);
  }
}
