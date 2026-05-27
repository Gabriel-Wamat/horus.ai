import { z } from "zod";
import { AgentNameSchema, AgentProfileIdSchema, AgentProfileSchema } from "./AgentResult.js";
import { RuntimeValidationEvidenceSchema } from "./ProjectConstruction.js";
import {
  ValidationGateResultSchema,
  ValidationGateSummarySchema,
  WorkflowModeSchema,
  WorkflowStateSchema,
  WorkflowStatusSchema,
} from "./WorkflowState.js";

export const AgentRunPhaseSchema = z.enum([
  "received",
  "understanding",
  "planning",
  "context_reading",
  "patching",
  "applying",
  "validating",
  "reviewing",
  "retrying",
  "completed",
  "failed",
  "cancelled",
]);

export const AgentRunLoopEventTypeSchema = z.enum([
  "received",
  "understanding",
  "planning",
  "context_read",
  "patch_proposed",
  "patch_applied",
  "validation_started",
  "validation_failed",
  "validation_passed",
  "review_started",
  "review_failed",
  "review_passed",
  "tool_call_started",
  "tool_call_finished",
  "tool_call_blocked",
  "retry_started",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
]);

export const AgentRunActorKindSchema = z.enum([
  "system",
  "agent",
  "tool",
  "human",
]);

export const HorusRunEventTypeSchema = z.enum([
  "node_started",
  "node_completed",
  "patch_proposed",
  "patch_applied",
  "validation_evidence",
  "awaiting_approval",
  "retry_started",
  "awaiting_retry_approval",
  "status_changed",
  "tool_call_started",
  "tool_call_finished",
  "tool_call_blocked",
  "error",
]);

export const HorusWorkflowNodeIdSchema = z.enum([
  "specAgent",
  "hitlCheckpoint",
  "odinAgent",
  "frontAgent",
  "qaAgent",
  "curatorAgent",
  "retryCheckpoint",
  "finalize",
  "fail",
]);

export const HorusWorkflowStepSnapshotSchema = z.object({
  id: z.string().min(1),
  nodeId: HorusWorkflowNodeIdSchema,
  label: z.string().min(1),
  status: z.union([WorkflowStatusSchema, z.enum(["pending", "success", "skipped"])]),
  userStoryId: z.string().uuid().nullable().optional(),
  latency_ms: z.number().int().nonnegative().nullable().optional(),
  error_message: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});

export const HorusRunEventSnapshotSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().uuid(),
  sequence: z.number().int().positive(),
  type: HorusRunEventTypeSchema,
  phase: AgentRunPhaseSchema.default("received"),
  eventType: AgentRunLoopEventTypeSchema.default("received"),
  actorKind: AgentRunActorKindSchema.default("system"),
  actorName: z.string().min(1).default("Horus"),
  nodeId: HorusWorkflowNodeIdSchema.optional(),
  agentName: AgentNameSchema.optional(),
  agentProfileId: AgentProfileIdSchema.optional(),
  agentProfile: AgentProfileSchema.optional(),
  userStoryId: z.string().uuid().optional(),
  attempt: z.number().int().nonnegative().optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  evidence: RuntimeValidationEvidenceSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  filePaths: z.array(z.string().trim().min(1)).optional(),
  commandIds: z.array(z.string().trim().min(1)).optional(),
  validationGateId: z.string().trim().min(1).optional(),
  causedByEventId: z.string().trim().min(1).optional(),
  errorMessage: z.string().optional(),
  timestamp: z.string().datetime(),
});

export const HorusAgentExecutionSnapshotSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().positive(),
  userStoryId: z.string().uuid(),
  agentName: AgentNameSchema,
  agentProfileId: AgentProfileIdSchema.optional(),
  agentProfile: AgentProfileSchema.optional(),
  nodeId: HorusWorkflowNodeIdSchema,
  status: z.enum(["success", "error", "skipped", "running"]),
  executionTimeMs: z.number().int().nonnegative().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  summary: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  outputPreview: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const HorusAgentEvidenceSummarySchema = z.object({
  id: z.string().min(1),
  nodeId: HorusWorkflowNodeIdSchema,
  agentName: AgentNameSchema.optional(),
  title: z.string().min(1),
  phase: AgentRunPhaseSchema,
  status: z.string().min(1),
  latestEventTitle: z.string().nullable().default(null),
  filesRead: z.array(z.string().trim().min(1)).default([]),
  filesChanged: z.array(z.string().trim().min(1)).default([]),
  toolNames: z.array(z.string().trim().min(1)).default([]),
  commandIds: z.array(z.string().trim().min(1)).default([]),
  validationGates: z.array(ValidationGateResultSchema).default([]),
  errorMessages: z.array(z.string().trim().min(1)).default([]),
});

export const HorusRunStorySnapshotSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  index: z.number().int().nonnegative(),
  hasSpec: z.boolean(),
});

export const HorusRunSnapshotSchema = z.object({
  threadId: z.string().uuid(),
  workspaceFolderId: z.string().uuid().optional(),
  workflowMode: WorkflowModeSchema,
  status: WorkflowStatusSchema,
  currentPhase: AgentRunPhaseSchema.default("received"),
  currentNode: HorusWorkflowNodeIdSchema.nullable(),
  currentUserStoryId: z.string().uuid().nullable(),
  currentUserStoryTitle: z.string().nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
  userStories: z.array(HorusRunStorySnapshotSchema),
  steps: z.array(HorusWorkflowStepSnapshotSchema),
  agentExecutions: z.array(HorusAgentExecutionSnapshotSchema),
  events: z.array(HorusRunEventSnapshotSchema),
  evidenceSummaries: z.array(HorusAgentEvidenceSummarySchema).default([]),
  validationSummary: ValidationGateSummarySchema.optional(),
  sourceState: WorkflowStateSchema,
});

export const HorusRunLocatorSchema = z.object({
  threadId: z.string().uuid(),
  workspaceFolderId: z.string().uuid().optional(),
  workflowMode: WorkflowModeSchema,
  status: WorkflowStatusSchema,
  title: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  currentNode: HorusWorkflowNodeIdSchema.nullable(),
});

export type HorusWorkflowNodeId = z.infer<typeof HorusWorkflowNodeIdSchema>;
export type AgentRunPhase = z.infer<typeof AgentRunPhaseSchema>;
export type AgentRunLoopEventType = z.infer<typeof AgentRunLoopEventTypeSchema>;
export type AgentRunActorKind = z.infer<typeof AgentRunActorKindSchema>;
export type HorusWorkflowStepSnapshot = z.infer<typeof HorusWorkflowStepSnapshotSchema>;
export type HorusRunEventSnapshot = z.infer<typeof HorusRunEventSnapshotSchema>;
export type HorusAgentExecutionSnapshot = z.infer<typeof HorusAgentExecutionSnapshotSchema>;
export type HorusAgentEvidenceSummary = z.infer<typeof HorusAgentEvidenceSummarySchema>;
export type HorusRunStorySnapshot = z.infer<typeof HorusRunStorySnapshotSchema>;
export type HorusRunSnapshot = z.infer<typeof HorusRunSnapshotSchema>;
export type HorusRunLocator = z.infer<typeof HorusRunLocatorSchema>;
