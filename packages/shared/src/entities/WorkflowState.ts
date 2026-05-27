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
  "completed_unverified",
  "failed_validation",
  "blocked",
  "cancelled",
  "error",
]);

export const ValidationGateStatusSchema = z.enum([
  "pending",
  "running",
  "passed",
  "failed",
  "skipped",
  "blocked",
]);

export const ValidationGateResultSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  status: ValidationGateStatusSchema,
  required: z.boolean().default(true),
  message: z.string().trim().min(1).nullable().default(null),
  evidenceType: z
    .enum(["schema", "path_safety", "quality_gate", "command", "preview", "qa", "curator", "grounding", "manifest", "apply"])
    .default("quality_gate"),
  commandId: z.string().trim().min(1).nullable().default(null),
  filePaths: z.array(z.string().trim().min(1)).default([]),
  createdAt: z.string().datetime(),
});

export const ValidationFinalStatusSchema = z.enum([
  "completed",
  "completed_unverified",
  "failed_validation",
  "blocked",
  "failed",
]);

export const ValidationGateSummarySchema = z.object({
  finalStatus: ValidationFinalStatusSchema,
  gates: z.array(ValidationGateResultSchema).default([]),
  passedCount: z.number().int().nonnegative().default(0),
  failedCount: z.number().int().nonnegative().default(0),
  skippedCount: z.number().int().nonnegative().default(0),
  blockedCount: z.number().int().nonnegative().default(0),
  message: z.string().trim().min(1),
});

export const WorkflowModeSchema = z.enum([
  "standard",
  "spec_generation",
  "chat_code_change",
  "project_construction",
]);

export const WorkspaceArtifactContextSchema = z.object({
  workspaceFolderId: z.string().uuid(),
  userStoryRevisionId: z.string().optional(),
  specRevisionId: z.string().optional(),
});

export const WorkflowCheckpointNodeSchema = z.object({
  nodeName: z.enum(["hitlCheckpoint", "retryCheckpoint"]),
  userStoryId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
});

export const WorkflowStateSchema = z.object({
  threadId: z.string().uuid(),
  workspaceFolderId: z.string().uuid().optional(),
  frontendProjectId: z.string().uuid().optional(),
  frontendProjectRootPath: z.string().trim().min(1).optional(),
  previewSessionId: z.string().uuid().optional(),
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
  pendingCheckpoints: z.array(WorkflowCheckpointNodeSchema).default([]),
  validationGates: z.array(ValidationGateResultSchema).default([]),
  status: WorkflowStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type HumanFeedback = z.infer<typeof HumanFeedbackSchema>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type ValidationGateStatus = z.infer<typeof ValidationGateStatusSchema>;
export type ValidationGateResult = z.infer<typeof ValidationGateResultSchema>;
export type ValidationFinalStatus = z.infer<typeof ValidationFinalStatusSchema>;
export type ValidationGateSummary = z.infer<typeof ValidationGateSummarySchema>;
export type WorkflowMode = z.infer<typeof WorkflowModeSchema>;
export type WorkflowCheckpointNode = z.infer<
  typeof WorkflowCheckpointNodeSchema
>;
export type WorkspaceArtifactContext = z.infer<
  typeof WorkspaceArtifactContextSchema
>;
