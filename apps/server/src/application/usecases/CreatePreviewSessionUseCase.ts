import type { CreatePreviewSessionInput } from "@u-build/shared";
import type {
  PreviewActionResult,
  PreviewRuntimeManager,
} from "../../infrastructure/preview/PreviewRuntimeManager.js";

export class CreatePreviewSessionUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimeManager) {}

  async execute(input: CreatePreviewSessionInput): Promise<PreviewActionResult> {
    return this.previewRuntime.createSession(input);
  }
}
