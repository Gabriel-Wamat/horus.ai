import type { CreateVisualInstructionDraftInput } from "@u-build/shared";
import type {
  PreviewRuntimePort,
  VisualInstructionDraftResult,
} from "../ports/PreviewRuntimePort.js";

export class CreateVisualInstructionDraftUseCase {
  constructor(private readonly previewRuntime: PreviewRuntimePort) {}

  async execute(
    input: CreateVisualInstructionDraftInput
  ): Promise<VisualInstructionDraftResult> {
    return this.previewRuntime.createVisualInstructionDraft(input);
  }
}
