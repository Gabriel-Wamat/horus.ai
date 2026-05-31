import { z } from "zod";
import { AgentNameSchema } from "./AgentResult.js";

export const AgentArtifactTypeSchema = z.enum([
  "code_change_set",
  "qa_plan",
  "visual_report",
  "spec",
]);

export const AgentArtifactCandidateStatusSchema = z.enum([
  "draft",
  "proposed",
  "validating",
  "rejected",
  "approved",
  "applied",
  "failed",
]);

export const AgentValidationGateTypeSchema = z.enum([
  "schema",
  "path_safety",
  "command",
  "preview",
  "qa",
  "visual",
  "curator",
  "apply",
]);

export const AgentValidationEvidenceStatusSchema = z.enum([
  "passed",
  "failed",
  "blocked",
  "skipped",
  "inconclusive",
]);

export const AgentTraceSpanTypeSchema = z.enum([
  "llm",
  "tool",
  "gate",
  "handoff",
  "retry",
  "approval",
  "apply",
]);

export const AgentTraceSpanStatusSchema = z.enum([
  "started",
  "succeeded",
  "failed",
  "blocked",
]);

export const AgentArtifactCandidateSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid().nullable().default(null),
  attemptId: z.string().uuid().nullable().default(null),
  workflowThreadId: z.string().uuid(),
  userStoryId: z.string().uuid(),
  sourceAgent: AgentNameSchema,
  artifactType: AgentArtifactTypeSchema,
  status: AgentArtifactCandidateStatusSchema,
  sourceResultId: z.string().trim().min(1).nullable().default(null),
  contentHash: z.string().trim().min(12),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AgentValidationEvidenceRecordSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  runId: z.string().uuid().nullable().default(null),
  attemptId: z.string().uuid().nullable().default(null),
  workflowThreadId: z.string().uuid(),
  userStoryId: z.string().uuid().nullable().default(null),
  gateId: z.string().trim().min(1),
  gateType: AgentValidationGateTypeSchema,
  status: AgentValidationEvidenceStatusSchema,
  required: z.boolean(),
  summary: z.string().trim().min(1),
  rawEvidenceRef: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export const AgentTraceSpanSchema = z.object({
  id: z.string().uuid(),
  workflowThreadId: z.string().uuid(),
  runId: z.string().uuid().nullable().default(null),
  attemptId: z.string().uuid().nullable().default(null),
  candidateId: z.string().uuid().nullable().default(null),
  spanType: AgentTraceSpanTypeSchema,
  name: z.string().trim().min(1),
  status: AgentTraceSpanStatusSchema,
  redactedInput: z.record(z.string(), z.unknown()).default({}),
  redactedOutput: z.record(z.string(), z.unknown()).default({}),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  errorMessage: z.string().trim().min(1).nullable().default(null),
});

export type AgentArtifactType = z.infer<typeof AgentArtifactTypeSchema>;
export type AgentArtifactCandidateStatus = z.infer<
  typeof AgentArtifactCandidateStatusSchema
>;
export type AgentValidationGateType = z.infer<typeof AgentValidationGateTypeSchema>;
export type AgentValidationEvidenceStatus = z.infer<
  typeof AgentValidationEvidenceStatusSchema
>;
export type AgentTraceSpanType = z.infer<typeof AgentTraceSpanTypeSchema>;
export type AgentTraceSpanStatus = z.infer<typeof AgentTraceSpanStatusSchema>;
export type AgentArtifactCandidate = z.infer<typeof AgentArtifactCandidateSchema>;
export type AgentValidationEvidenceRecord = z.infer<
  typeof AgentValidationEvidenceRecordSchema
>;
export type AgentTraceSpan = z.infer<typeof AgentTraceSpanSchema>;
