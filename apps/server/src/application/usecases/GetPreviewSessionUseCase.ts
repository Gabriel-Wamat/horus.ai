import type { PreviewRuntimeManager } from "../../infrastructure/preview/PreviewRuntimeManager.js";

export class GetPreviewSessionUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimeManager) {}

  async execute(sessionId: string) {
    return this.previewRuntime.getSession(sessionId);
  }
}
