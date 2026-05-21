import { z } from "zod";
import type { WorkflowOrchestrator } from "../../domain/services/WorkflowOrchestrator.js";

export const RetryDecisionInputSchema = z.object({
  threadId: z.string().uuid(),
  userStoryId: z.string().uuid(),
  continueRetry: z.boolean(),
});

export type RetryDecisionInput = z.infer<typeof RetryDecisionInputSchema>;

export class RetryDecisionUseCase {
  constructor(private readonly orchestrator: WorkflowOrchestrator) {}

  async execute(input: unknown): Promise<void> {
    const validated = RetryDecisionInputSchema.parse(input);
    await this.orchestrator.retryDecision(validated);
  }
}