import { z } from "zod";
import type { WorkflowState } from "@u-build/shared";
import type { WorkflowOrchestrator } from "../../domain/services/WorkflowOrchestrator.js";

const GetWorkflowStatusInputSchema = z.object({
  threadId: z.string().uuid(),
});

export class GetWorkflowStatusUseCase {
  constructor(private readonly orchestrator: WorkflowOrchestrator) {}

  async execute(input: unknown): Promise<WorkflowState | null> {
    const validated = GetWorkflowStatusInputSchema.parse(input);
    return this.orchestrator.getStatus(validated.threadId);
  }
}
