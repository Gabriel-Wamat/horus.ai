import { z } from "zod";
import {
  AgentNameSchema,
  AgentProfileIdSchema,
} from "./AgentResult.js";

export const OperationalMemoryFileReadSchema = z.object({
  path: z.string().trim().min(1),
  versionHash: z.string().trim().min(8).nullable().default(null),
  readAt: z.string().datetime().nullable().default(null),
});

export const OperationalMemoryFileChangeSchema = z.object({
  path: z.string().trim().min(1),
  changeType: z.enum(["create", "update", "delete", "unknown"]),
  patchStrategy: z.string().trim().min(1).nullable().default(null),
  diffPreview: z.string().default(""),
  changedAt: z.string().datetime().nullable().default(null),
});

export const OperationalMemoryCommandSchema = z.object({
  commandId: z.string().trim().min(1),
  status: z.string().trim().min(1),
  exitCode: z.number().int().nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  ranAt: z.string().datetime().nullable().default(null),
});

export const OperationalMemoryErrorSchema = z.object({
  message: z.string().trim().min(1),
  source: z.enum(["tool", "workflow", "curator", "runtime", "unknown"]).default("unknown"),
  occurredAt: z.string().datetime().nullable().default(null),
});

export const OperationalMemoryAttemptSchema = z.object({
  attempt: z.number().int().nonnegative(),
  status: z.string().trim().min(1),
  summary: z.string().trim().min(1).nullable().default(null),
  eventCount: z.number().int().nonnegative().default(0),
});

export const OperationalMemoryCuratorDecisionSchema = z.object({
  passed: z.boolean(),
  score: z.number().nullable().default(null),
  fixTarget: z.enum(["front", "qa", "both"]).nullable().default(null),
  notes: z.string().trim().min(1).nullable().default(null),
  missingItems: z.array(z.string().trim().min(1)).default([]),
  decidedAt: z.string().datetime().nullable().default(null),
});

export const OperationalMemoryNextStepSchema = z.object({
  reason: z.string().trim().min(1),
  recommendedAgent: AgentNameSchema.nullable().default(null),
  recommendedAgentProfileId: AgentProfileIdSchema.nullable().default(null),
  blocked: z.boolean().default(false),
  source: z.enum(["curator", "runtime", "workflow", "inferred"]).default("inferred"),
});

export const OperationalMemorySummarySchema = z.object({
  workflowThreadId: z.string().uuid(),
  runId: z.string().uuid().nullable().default(null),
  userStoryId: z.string().uuid().nullable().default(null),
  operationalSessionIds: z.array(z.string().uuid()).default([]),
  filesRead: z.array(OperationalMemoryFileReadSchema).default([]),
  filesChanged: z.array(OperationalMemoryFileChangeSchema).default([]),
  commandsRun: z.array(OperationalMemoryCommandSchema).default([]),
  diffsApplied: z.array(OperationalMemoryFileChangeSchema).default([]),
  errorsSeen: z.array(OperationalMemoryErrorSchema).default([]),
  attempts: z.array(OperationalMemoryAttemptSchema).default([]),
  curatorDecisions: z.array(OperationalMemoryCuratorDecisionSchema).default([]),
  nextStep: OperationalMemoryNextStepSchema,
  generatedAt: z.string().datetime(),
});

export type OperationalMemoryFileRead = z.infer<
  typeof OperationalMemoryFileReadSchema
>;
export type OperationalMemoryFileChange = z.infer<
  typeof OperationalMemoryFileChangeSchema
>;
export type OperationalMemoryCommand = z.infer<
  typeof OperationalMemoryCommandSchema
>;
export type OperationalMemoryError = z.infer<
  typeof OperationalMemoryErrorSchema
>;
export type OperationalMemoryAttempt = z.infer<
  typeof OperationalMemoryAttemptSchema
>;
export type OperationalMemoryCuratorDecision = z.infer<
  typeof OperationalMemoryCuratorDecisionSchema
>;
export type OperationalMemoryNextStep = z.infer<
  typeof OperationalMemoryNextStepSchema
>;
export type OperationalMemorySummary = z.infer<
  typeof OperationalMemorySummarySchema
>;
