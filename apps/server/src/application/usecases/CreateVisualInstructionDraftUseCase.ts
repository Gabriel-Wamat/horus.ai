import type { CreateVisualInstructionDraftInput } from "@u-build/shared";
import type {
  PreviewRuntimeManager,
  VisualInstructionDraftResult,
} from "../../infrastructure/preview/PreviewRuntimeManager.js";

export class CreateVisualInstructionDraftUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimeManager) {}

  async execute(
    input: CreateVisualInstructionDraftInput
  ): Promise<VisualInstructionDraftResult> {
    return this.previewRuntime.createVisualInstructionDraft(input);
  }
}
