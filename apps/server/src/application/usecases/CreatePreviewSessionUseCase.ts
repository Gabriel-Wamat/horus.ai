import type { CreatePreviewSessionInput } from "@u-build/shared";
import type {
  PreviewActionResult,
  PreviewRuntimePort,
} from "../ports/PreviewRuntimePort.js";

export class CreatePreviewSessionUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimePort) {}

  async execute(input: CreatePreviewSessionInput): Promise<PreviewActionResult> {
    return this.previewRuntime.createSession(input);
  }
}
