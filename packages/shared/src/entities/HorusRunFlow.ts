import { z } from "zod";
import { AgentRunbookEntrySchema } from "./AgentRunbook.js";
import { AgentContextReceiptSchema } from "./AgentContextReceipt.js";
import {
  HorusRecoveryActionSchema,
  HorusRecoveryDecisionSchema,
} from "./HorusError.js";
import {
  AgentNameSchema,
  AgentProfileIdSchema,
  AgentProfileSchema,
  AgentToolNameSchema,
} from "./AgentResult.js";
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
  "command_output",
  "retry_started",
  "awaiting_approval",
  "recovery_decision",
  "fallback_executed",
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
	  "context_receipt",
  "awaiting_approval",
  "retry_started",
  "awaiting_retry_approval",
  "recovery_decision",
  "fallback_executed",
  "status_changed",
  "tool_call_started",
  "tool_call_finished",
  "tool_call_blocked",
  "command_output",
  "command_approval_requested",
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
  toolName: AgentToolNameSchema.optional(),
  userStoryId: z.string().uuid().optional(),
  attempt: z.number().int().nonnegative().optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  status: z.string().trim().min(1).optional(),
  action: HorusRecoveryActionSchema.optional(),
  message: z.string().trim().min(1).optional(),
  decision: HorusRecoveryDecisionSchema.optional(),
  evidence: RuntimeValidationEvidenceSchema.optional(),
  receipt: AgentContextReceiptSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  filePaths: z.array(z.string().trim().min(1)).optional(),
  commandIds: z.array(z.string().trim().min(1)).optional(),
  commandId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  traceId: z.string().trim().min(1).optional(),
  spanId: z.string().trim().min(1).optional(),
  parentSpanId: z.string().trim().min(1).nullable().optional(),
  toolCallId: z.string().trim().min(1).nullable().optional(),
  runId: z.string().trim().min(1).nullable().optional(),
  projectId: z.string().trim().min(1).nullable().optional(),
  agentId: z.string().trim().min(1).nullable().optional(),
  filePath: z.string().trim().min(1).nullable().optional(),
  diffId: z.string().trim().min(1).nullable().optional(),
  stream: z.enum(["stdout", "stderr"]).optional(),
  chunk: z.string().optional(),
  chunkSequence: z.number().int().nonnegative().optional(),
  approvalReason: z.string().trim().min(1).nullable().optional(),
  policyReason: z.string().trim().min(1).nullable().optional(),
  risk: z.enum(["low", "medium", "high"]).optional(),
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

export const AgentOperationTimelineItemKindSchema = z.enum([
  "file",
  "command",
  "diff",
  "failure",
  "retry",
  "validation",
  "event",
]);

export const AgentOperationTimelineStatusSchema = z.enum([
  "running",
  "succeeded",
  "failed",
  "blocked",
  "awaiting_approval",
  "info",
]);

export const AgentOperationTimelineItemSchema = z.object({
  id: z.string().min(1),
  kind: AgentOperationTimelineItemKindSchema,
  status: AgentOperationTimelineStatusSchema,
  title: z.string().min(1),
  detail: z.string().nullable().default(null),
  timestamp: z.string().datetime(),
  sourceEventId: z.string().min(1).nullable().default(null),
  operationId: z.string().min(1).nullable().default(null),
  commandId: z.string().trim().min(1).nullable().default(null),
  taskId: z.string().trim().min(1).nullable().default(null),
  filePath: z.string().trim().min(1).nullable().default(null),
  diffId: z.string().trim().min(1).nullable().default(null),
});

export const AgentOperationTimelineGroupSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().uuid(),
  groupKey: z.string().min(1),
  operationalSessionId: z.string().uuid().nullable().default(null),
  taskId: z.string().trim().min(1).nullable().default(null),
  agentName: AgentNameSchema.nullable().default(null),
  agentProfileId: AgentProfileIdSchema.nullable().default(null),
  nodeId: HorusWorkflowNodeIdSchema.nullable().default(null),
  toolName: AgentToolNameSchema.nullable().default(null),
  title: z.string().min(1),
  status: AgentOperationTimelineStatusSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable().default(null),
  items: z.array(AgentOperationTimelineItemSchema).default([]),
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
  operationTimeline: z.array(AgentOperationTimelineGroupSchema).default([]),
  runbookEntries: z.array(AgentRunbookEntrySchema).default([]),
  validationSummary: ValidationGateSummarySchema.optional(),
  sourceState: WorkflowStateSchema,
});

export const HorusRunLocatorSchema = z.object({
  threadId: z.string().uuid(),
  workspaceFolderId: z.string().uuid().optional(),
  frontendProjectId: z.string().uuid().optional(),
  workflowMode: WorkflowModeSchema,
  status: WorkflowStatusSchema,
  title: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  currentNode: HorusWorkflowNodeIdSchema.nullable(),
});

export const AgentFileOperationTypeSchema = z.enum([
  "read",
  "create",
  "update",
  "delete",
  "apply",
  "validate",
  "diff",
  "unknown",
]);

export const AgentFileOperationStatusSchema = z.enum([
  "running",
  "read",
  "changed",
  "proposed",
  "applied",
  "validated",
  "blocked",
  "failed",
  "skipped",
  "unknown",
]);

export const AgentFileOperationTelemetrySchema = z.object({
  id: z.string().min(1),
  threadId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  workflowSequence: z.number().int().nonnegative().nullable().default(null),
  operationalSequence: z.number().int().nonnegative().nullable().default(null),
  sourceEventId: z.string().min(1).nullable().default(null),
  sourceOperationEventId: z.string().uuid().nullable().default(null),
  operationalSessionId: z.string().uuid().nullable().default(null),
  runId: z.string().uuid().nullable().default(null),
  attemptId: z.string().uuid().nullable().default(null),
  userStoryId: z.string().uuid().nullable().default(null),
  nodeId: HorusWorkflowNodeIdSchema.nullable().default(null),
  agentName: AgentNameSchema.nullable().default(null),
  agentProfileId: AgentProfileIdSchema.nullable().default(null),
  toolName: AgentToolNameSchema.nullable().default(null),
  path: z.string().trim().min(1),
  operationType: AgentFileOperationTypeSchema,
  status: AgentFileOperationStatusSchema,
  changeType: z.enum(["create", "update", "delete", "unknown"]).nullable().default(null),
  versionHash: z.string().trim().min(16).nullable().default(null),
  newVersionHash: z.string().trim().min(16).nullable().default(null),
  additions: z.number().int().nonnegative().nullable().default(null),
  deletions: z.number().int().nonnegative().nullable().default(null),
  replacementCount: z.number().int().nonnegative().nullable().default(null),
  diffPreview: z.string().default(""),
  patchStrategy: z.string().trim().min(1).nullable().default(null),
  structuralIntentKinds: z.array(z.string().trim().min(1)).default([]),
  structuralSymbolName: z.string().trim().min(1).nullable().default(null),
  structuralSymbolKind: z.string().trim().min(1).nullable().default(null),
  preconditionCount: z.number().int().nonnegative().default(0),
  preconditionHash: z.string().trim().min(8).nullable().default(null),
  commandIds: z.array(z.string().trim().min(1)).default([]),
  errorMessage: z.string().trim().min(1).nullable().default(null),
  summary: z.string().trim().min(1).nullable().default(null),
  timestamp: z.string().datetime(),
});

export type HorusWorkflowNodeId = z.infer<typeof HorusWorkflowNodeIdSchema>;
export type AgentRunPhase = z.infer<typeof AgentRunPhaseSchema>;
export type AgentRunLoopEventType = z.infer<typeof AgentRunLoopEventTypeSchema>;
export type AgentRunActorKind = z.infer<typeof AgentRunActorKindSchema>;
export type HorusWorkflowStepSnapshot = z.infer<typeof HorusWorkflowStepSnapshotSchema>;
export type HorusRunEventSnapshot = z.infer<typeof HorusRunEventSnapshotSchema>;
export type HorusAgentExecutionSnapshot = z.infer<typeof HorusAgentExecutionSnapshotSchema>;
export type HorusAgentEvidenceSummary = z.infer<typeof HorusAgentEvidenceSummarySchema>;
export type AgentOperationTimelineItemKind = z.infer<
  typeof AgentOperationTimelineItemKindSchema
>;
export type AgentOperationTimelineStatus = z.infer<
  typeof AgentOperationTimelineStatusSchema
>;
export type AgentOperationTimelineItem = z.infer<
  typeof AgentOperationTimelineItemSchema
>;
export type AgentOperationTimelineGroup = z.infer<
  typeof AgentOperationTimelineGroupSchema
>;
export type HorusRunStorySnapshot = z.infer<typeof HorusRunStorySnapshotSchema>;
export type HorusRunSnapshot = z.infer<typeof HorusRunSnapshotSchema>;
export type HorusRunLocator = z.infer<typeof HorusRunLocatorSchema>;
export type AgentFileOperationType = z.infer<typeof AgentFileOperationTypeSchema>;
export type AgentFileOperationStatus = z.infer<typeof AgentFileOperationStatusSchema>;
export type AgentFileOperationTelemetry = z.infer<
  typeof AgentFileOperationTelemetrySchema
>;
