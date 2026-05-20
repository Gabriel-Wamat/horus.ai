import { z } from "zod";
import { UserStorySchema } from "@u-build/shared";
import type { WorkflowOrchestrator } from "../../domain/services/WorkflowOrchestrator.js";

export const StartWorkflowInputSchema = z.object({
  userStories: z.array(UserStorySchema).min(1).max(50),
});

export type StartWorkflowInput = z.infer<typeof StartWorkflowInputSchema>;

export class StartWorkflowUseCase {
  constructor(private readonly orchestrator: WorkflowOrchestrator) {}

  async execute(input: unknown): Promise<{ threadId: string }> {
    const validated = StartWorkflowInputSchema.parse(input);
    return this.orchestrator.start({ userStories: validated.userStories });
  }
}
