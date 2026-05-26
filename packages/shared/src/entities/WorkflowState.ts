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

export const WorkflowModeSchema = z.enum([
  "standard",
  "spec_generation",
  "chat_code_change",
]);

export const WorkspaceArtifactContextSchema = z.object({
  workspaceFolderId: z.string().uuid(),
  userStoryRevisionId: z.string().optional(),
  specRevisionId: z.string().optional(),
});

export const WorkflowStateSchema = z.object({
  threadId: z.string().uuid(),
  workspaceFolderId: z.string().uuid().optional(),
  workflowMode: WorkflowModeSchema.default("standard"),
  sourceChatSessionId: z.string().uuid().optional(),
  sourceChatMessageId: z.string().uuid().optional(),
  executionBrief: z.string().trim().min(1).optional(),
  userStories: z.array(UserStorySchema).min(1),
  currentUSIndex: z.number().int().min(0),
  specs: z.record(z.string(), SpecSchema),
  workspaceArtifactContext: z
    .record(z.string(), WorkspaceArtifactContextSchema)
    .default({}),
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
export type WorkflowMode = z.infer<typeof WorkflowModeSchema>;
export type WorkspaceArtifactContext = z.infer<
  typeof WorkspaceArtifactContextSchema
>;
