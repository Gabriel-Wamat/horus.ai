import { z } from "zod";
import type { WorkflowOrchestrator } from "../../domain/services/WorkflowOrchestrator.js";

export const CuratorReviewDecisionInputSchema = z.object({
  threadId: z.string().uuid(),
  userStoryId: z.string().uuid(),
  accepted: z.boolean(),
});

export type CuratorReviewDecisionInput = z.infer<typeof CuratorReviewDecisionInputSchema>;

export class CuratorReviewDecisionUseCase {
  constructor(private readonly orchestrator: WorkflowOrchestrator) {}

  async execute(input: unknown): Promise<void> {
    const validated = CuratorReviewDecisionInputSchema.parse(input);
    await this.orchestrator.curatorReviewDecision(validated);
  }
}
