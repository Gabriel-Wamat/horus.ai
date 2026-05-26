import { z } from "zod";
import { UserStorySchema } from "./UserStory.js";
import { SpecSchema } from "./Spec.js";
import { AgentResultSchema } from "./AgentResult.js";

export const HumanFeedbackSchema = z.object({
  approved: z.boolean(),
  editedSpec: SpecSchema.optional(),
  comment: z.string().optional(),
  reviewedAt: z.string().datetime(),
  reviewedBy: z.string().optional(),
});

export const WorkflowStatusSchema = z.enum([
  "idle",
  "running",
  "awaiting_human",
  "completed",
  "cancelled",
  "error",
]);

export const WorkflowStateSchema = z.object({
  threadId: z.string().uuid(),
  userStories: z.array(UserStorySchema).min(1),
  currentUSIndex: z.number().int().min(0),
  specs: z.record(z.string(), SpecSchema),
  humanFeedback: z.record(z.string(), HumanFeedbackSchema),
  agentResults: z.record(z.string(), z.array(AgentResultSchema)),
  status: WorkflowStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type HumanFeedback = z.infer<typeof HumanFeedbackSchema>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
