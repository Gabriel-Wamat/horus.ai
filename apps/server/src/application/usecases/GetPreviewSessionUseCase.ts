import type { PreviewRuntimePort } from "../ports/PreviewRuntimePort.js";

export class GetPreviewSessionUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimePort) {}

  async execute(sessionId: string) {
    return this.previewRuntime.getSession(sessionId);
  }
}
