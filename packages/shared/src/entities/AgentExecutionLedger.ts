import { z } from "zod";
import { WorkflowModeSchema, WorkflowStatusSchema } from "./WorkflowState.js";

export const AgentExecutionTurnStatusSchema = z.enum([
  "pending",
  "accepted",
  "running",
  "completed",
  "blocked",
  "failed",
  "cancelled",
]);

export const AgentWorkflowAttemptStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const AgentExecutionOutboxStatusSchema = z.enum([
  "pending",
  "processing",
  "processed",
  "failed",
  "dead_letter",
]);

export const AgentExecutionTurnSchema = z.object({
  id: z.string().uuid(),
  chatSessionId: z.string().uuid(),
  sourceMessageId: z.string().uuid().nullable().default(null),
  idempotencyKey: z.string().trim().min(1),
  intent: z.record(z.string(), z.unknown()).default({}),
  status: AgentExecutionTurnStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AgentWorkflowRunSchema = z.object({
  id: z.string().uuid(),
  turnId: z.string().uuid().nullable().default(null),
  threadId: z.string().uuid(),
  workflowMode: WorkflowModeSchema,
  status: WorkflowStatusSchema,
  leaseOwner: z.string().trim().min(1).nullable().default(null),
  startedAt: z.string().datetime().nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
  updatedAt: z.string().datetime(),
  lastError: z.string().trim().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
});

export const AgentWorkflowAttemptSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  attemptNumber: z.number().int().positive(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
  status: AgentWorkflowAttemptStatusSchema,
  failureClass: z.string().trim().min(1).nullable().default(null),
});

export const AgentExecutionOutboxEventSchema = z.object({
  id: z.string().uuid(),
  eventType: z.string().trim().min(1),
  dedupeKey: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()),
  status: AgentExecutionOutboxStatusSchema,
  availableAt: z.string().datetime(),
  lockedAt: z.string().datetime().nullable().default(null),
  processedAt: z.string().datetime().nullable().default(null),
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().trim().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AgentExecutionLeaseSchema = z.object({
  runId: z.string().uuid(),
  ownerId: z.string().trim().min(1),
  expiresAt: z.string().datetime(),
  heartbeatAt: z.string().datetime(),
});

export type AgentExecutionTurnStatus = z.infer<
  typeof AgentExecutionTurnStatusSchema
>;
export type AgentWorkflowAttemptStatus = z.infer<
  typeof AgentWorkflowAttemptStatusSchema
>;
export type AgentExecutionOutboxStatus = z.infer<
  typeof AgentExecutionOutboxStatusSchema
>;
export type AgentExecutionTurn = z.infer<typeof AgentExecutionTurnSchema>;
export type AgentWorkflowRun = z.infer<typeof AgentWorkflowRunSchema>;
export type AgentWorkflowAttempt = z.infer<typeof AgentWorkflowAttemptSchema>;
export type AgentExecutionOutboxEvent = z.infer<
  typeof AgentExecutionOutboxEventSchema
>;
export type AgentExecutionLease = z.infer<typeof AgentExecutionLeaseSchema>;
