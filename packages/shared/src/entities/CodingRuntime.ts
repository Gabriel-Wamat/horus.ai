import { z } from "zod";

export const CodingRuntimeStateSchema = z.enum([
  "accepted",
  "scanning",
  "retrieving",
  "ast_analyzing",
  "planning_patch",
  "validating_ast",
  "validating_runtime",
  "applying_patch",
  "completed",
  "failed",
  "cancelled",
]);

export const CodingRuntimeTerminalStateSchema = z.enum([
  "completed",
  "failed",
  "cancelled",
]);

export const CodingRuntimeSignalSchema = z.enum([
  "task_accepted",
  "scan_requested",
  "scan_completed",
  "retrieval_requested",
  "retrieval_completed",
  "ast_analysis_requested",
  "ast_analysis_completed",
  "patch_planning_requested",
  "patch_planning_completed",
  "ast_validation_requested",
  "ast_validation_completed",
  "runtime_validation_requested",
  "runtime_validation_completed",
  "patch_apply_requested",
  "patch_apply_completed",
  "task_completed",
  "task_failed",
  "task_cancelled",
]);

export const CodingTaskSurfaceSchema = z.enum([
  "frontend",
  "backend",
  "full_stack",
  "config",
  "unknown",
]);

export const CodingRuntimeArtifactKindSchema = z.enum([
  "scan",
  "retrieval",
  "ast_analysis",
  "patch_plan",
  "ast_validation",
  "runtime_validation",
  "patch_apply",
  "diagnostic",
]);

export const CodingRuntimeArtifactStatusSchema = z.enum([
  "pending",
  "ready",
  "failed",
  "skipped",
]);

export const CodingRuntimeErrorSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  retryable: z.boolean().default(false),
  details: z.record(z.unknown()).optional(),
});

export const CodingRuntimeArtifactRefSchema = z.object({
  id: z.string().uuid(),
  kind: CodingRuntimeArtifactKindSchema,
  label: z.string().trim().min(1),
  status: CodingRuntimeArtifactStatusSchema,
  createdAt: z.string().datetime(),
  summary: z.string().trim().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
});

export const CodingTaskSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  prompt: z.string().trim().min(1),
  projectId: z.string().uuid(),
  projectRootPath: z.string().trim().min(1).optional(),
  selectedPaths: z.array(z.string().trim().min(1)).default([]),
  surface: CodingTaskSurfaceSchema,
  routeReason: z.string().trim().min(1),
  state: CodingRuntimeStateSchema,
  workflowThreadId: z.string().uuid().optional(),
  chatSessionId: z.string().uuid().optional(),
  sourceMessageId: z.string().uuid().optional(),
  userStoryId: z.string().uuid().optional(),
  artifacts: z.array(CodingRuntimeArtifactRefSchema).default([]),
  error: CodingRuntimeErrorSchema.nullable().default(null),
  metadata: z.record(z.unknown()).default({}),
  version: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
  cancelledAt: z.string().datetime().nullable().default(null),
});

export const CodingRuntimeEventSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  sequence: z.number().int().positive(),
  type: CodingRuntimeSignalSchema,
  fromState: CodingRuntimeStateSchema.nullable(),
  toState: CodingRuntimeStateSchema,
  message: z.string().trim().min(1),
  artifactRefs: z.array(CodingRuntimeArtifactRefSchema).default([]),
  error: CodingRuntimeErrorSchema.nullable().default(null),
  durationMs: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
});

export const CodingRuntimeSnapshotSchema = z.object({
  task: CodingTaskSchema,
  events: z.array(CodingRuntimeEventSchema),
  latestSequence: z.number().int().nonnegative(),
});

export const CreateCodingTaskRequestSchema = z.object({
  prompt: z.string().trim().min(1),
  projectId: z.string().uuid(),
  projectRootPath: z.string().trim().min(1).optional(),
  selectedPaths: z.array(z.string().trim().min(1)).default([]),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  workflowThreadId: z.string().uuid().optional(),
  chatSessionId: z.string().uuid().optional(),
  sourceMessageId: z.string().uuid().optional(),
  userStoryId: z.string().uuid().optional(),
  autoRun: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({}),
});

export const RunCodingTaskRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export const CancelCodingTaskRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

export const CodingTaskParamsSchema = z.object({
  taskId: z.string().uuid(),
});

export const CodingTaskEventsQuerySchema = z.object({
  afterSequence: z.coerce.number().int().nonnegative().optional(),
});

export type CodingRuntimeState = z.infer<typeof CodingRuntimeStateSchema>;
export type CodingRuntimeTerminalState = z.infer<
  typeof CodingRuntimeTerminalStateSchema
>;
export type CodingRuntimeSignal = z.infer<typeof CodingRuntimeSignalSchema>;
export type CodingTaskSurface = z.infer<typeof CodingTaskSurfaceSchema>;
export type CodingRuntimeArtifactKind = z.infer<
  typeof CodingRuntimeArtifactKindSchema
>;
export type CodingRuntimeError = z.infer<typeof CodingRuntimeErrorSchema>;
export type CodingRuntimeArtifactRef = z.infer<
  typeof CodingRuntimeArtifactRefSchema
>;
export type CodingTask = z.infer<typeof CodingTaskSchema>;
export type CodingRuntimeEvent = z.infer<typeof CodingRuntimeEventSchema>;
export type CodingRuntimeSnapshot = z.infer<
  typeof CodingRuntimeSnapshotSchema
>;
export type CreateCodingTaskRequest = z.infer<
  typeof CreateCodingTaskRequestSchema
>;
export type RunCodingTaskRequest = z.infer<typeof RunCodingTaskRequestSchema>;
export type CancelCodingTaskRequest = z.infer<
  typeof CancelCodingTaskRequestSchema
>;

export function isTerminalCodingRuntimeState(
  state: CodingRuntimeState
): state is CodingRuntimeTerminalState {
  return (
    state === "completed" ||
    state === "failed" ||
    state === "cancelled"
  );
}
