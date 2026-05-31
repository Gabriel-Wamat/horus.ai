import { z } from "zod";
import { CodeChangeValidationCommandSchema } from "./CodeChangeSet.js";

export const CodingValidationCommandKindSchema = z.enum([
  "ast",
  "static_gate",
  "type_check",
  "check",
  "test",
  "build",
  "lint",
  "unknown",
]);

export const CodingValidationCommandStatusSchema = z.enum([
  "passed",
  "failed",
  "rejected",
  "timed_out",
  "aborted",
  "skipped",
]);

export const CodingValidationResultStatusSchema = z.enum([
  "passed",
  "failed",
  "rejected",
  "timed_out",
  "aborted",
  "skipped",
]);

export const CodingValidationPlanCommandSchema = z.object({
  id: z.string().trim().min(1),
  kind: CodingValidationCommandKindSchema,
  label: z.string().trim().min(1).optional(),
  executable: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().trim().min(1).default("."),
  env: z.record(z.string()).default({}),
  timeoutMs: z.number().int().positive().optional(),
  required: z.boolean().default(true),
});

export const CodingValidationPlanSchema = z.object({
  id: z.string().uuid(),
  patchPlanId: z.string().uuid(),
  projectRootPath: z.string().trim().min(1),
  commands: z.array(CodingValidationPlanCommandSchema).default([]),
  createdAt: z.string().datetime(),
});

export const CodingValidationCommandEvidenceSchema = z.object({
  commandId: z.string().trim().min(1),
  kind: CodingValidationCommandKindSchema,
  command: z.string().trim().min(1),
  cwd: z.string().trim().min(1),
  status: CodingValidationCommandStatusSchema,
  exitCode: z.number().int().nullable(),
  stdoutTail: z.string().default(""),
  stderrTail: z.string().default(""),
  durationMs: z.number().int().nonnegative().default(0),
  errorMessage: z.string().trim().min(1).nullable().default(null),
  startedAt: z.string().datetime().nullable().default(null),
  finishedAt: z.string().datetime().nullable().default(null),
});

export const CodingValidationResultSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  patchPlanId: z.string().uuid(),
  status: CodingValidationResultStatusSchema,
  passed: z.boolean(),
  commands: z.array(CodingValidationCommandEvidenceSchema).default([]),
  codeChangeValidation: z.array(CodeChangeValidationCommandSchema).default([]),
  issues: z.array(z.string().trim().min(1)).default([]),
  skippedReason: z.string().trim().min(1).nullable().default(null),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
});

export type CodingValidationCommandKind = z.infer<
  typeof CodingValidationCommandKindSchema
>;
export type CodingValidationCommandStatus = z.infer<
  typeof CodingValidationCommandStatusSchema
>;
export type CodingValidationResultStatus = z.infer<
  typeof CodingValidationResultStatusSchema
>;
export type CodingValidationPlanCommand = z.infer<
  typeof CodingValidationPlanCommandSchema
>;
export type CodingValidationPlan = z.infer<typeof CodingValidationPlanSchema>;
export type CodingValidationCommandEvidence = z.infer<
  typeof CodingValidationCommandEvidenceSchema
>;
export type CodingValidationResult = z.infer<
  typeof CodingValidationResultSchema
>;
