import type { SetPreviewDeviceInput } from "@u-build/shared";
import type {
  PreviewActionResult,
  PreviewRuntimePort,
} from "../ports/PreviewRuntimePort.js";

export class SetPreviewDeviceUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimePort) {}

  async execute(
    sessionId: string,
    input: SetPreviewDeviceInput
  ): Promise<PreviewActionResult> {
    return this.previewRuntime.setDevice(sessionId, input);
  }
}
