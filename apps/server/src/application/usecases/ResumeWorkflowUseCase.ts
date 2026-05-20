import { z } from "zod";
import { HumanFeedbackSchema } from "@u-build/shared";
import type { WorkflowOrchestrator } from "../../domain/services/WorkflowOrchestrator.js";

export const ResumeWorkflowInputSchema = z.object({
  threadId: z.string().uuid(),
  userStoryId: z.string().uuid(),
  feedback: HumanFeedbackSchema,
});

export type ResumeWorkflowInput = z.infer<typeof ResumeWorkflowInputSchema>;

export class ResumeWorkflowUseCase {
  constructor(private readonly orchestrator: WorkflowOrchestrator) {}

  async execute(input: unknown): Promise<void> {
    const validated = ResumeWorkflowInputSchema.parse(input);
    await this.orchestrator.resume(validated);
  }
}
