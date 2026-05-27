import type { SetPreviewDeviceInput } from "@u-build/shared";
import type {
  PreviewActionResult,
  PreviewRuntimeManager,
} from "../../infrastructure/preview/PreviewRuntimeManager.js";

export class SetPreviewDeviceUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimeManager) {}

  async execute(
    sessionId: string,
    input: SetPreviewDeviceInput
  ): Promise<PreviewActionResult> {
    return this.previewRuntime.setDevice(sessionId, input);
  }
}
