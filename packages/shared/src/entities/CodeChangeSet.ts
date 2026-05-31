import { z } from "zod";
import { StructuralPatchPreconditionSchema } from "./StructuralPatch.js";

export const CodeChangeSetStatusSchema = z.enum([
  "proposed",
  "curator_rejected",
  "curator_approved",
  "applied",
  "validated",
  "failed",
]);

const CodeChangeOperationBaseSchema = z.object({
  targetPath: z.string().trim().min(1),
  beforeContent: z.string().nullable(),
  diff: z.string().trim().min(1),
  preconditions: z.array(StructuralPatchPreconditionSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const CodeChangeWriteOperationSchema =
  CodeChangeOperationBaseSchema.extend({
    changeType: z.enum(["create", "update"]),
    afterContent: z.string(),
  });

export const CodeChangeDeleteOperationSchema =
  CodeChangeOperationBaseSchema.extend({
    changeType: z.literal("delete"),
    afterContent: z.null(),
  });

export const CodeChangeOperationSchema = z.discriminatedUnion("changeType", [
  CodeChangeWriteOperationSchema,
  CodeChangeDeleteOperationSchema,
]);

export const CodeChangeValidationCommandSchema = z.object({
  command: z.string().trim().min(1),
  cwd: z.string().trim().min(1),
  exitCode: z.number().int().nullable(),
  status: z.enum(["passed", "failed", "not_run"]),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
});

export const CodeChangeSetSchema = z.object({
  id: z.string().uuid(),
  artifactCandidateId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  attemptId: z.string().uuid().optional(),
  workflowThreadId: z.string().uuid(),
  workspaceFolderId: z.string().uuid().optional(),
  userStoryId: z.string().uuid(),
  specRevisionId: z.string().optional(),
  sourceAgent: z.enum(["front", "qa", "curator", "odin"]),
  status: CodeChangeSetStatusSchema,
  operations: z.array(CodeChangeOperationSchema).min(1),
  validation: z.array(CodeChangeValidationCommandSchema).default([]),
  createdAt: z.string().datetime(),
  appliedAt: z.string().datetime().optional(),
  failedReason: z.string().optional(),
});

export type CodeChangeSetStatus = z.infer<typeof CodeChangeSetStatusSchema>;
export type CodeChangeOperation = z.infer<typeof CodeChangeOperationSchema>;
export type CodeChangeOperationPrecondition = z.infer<
  typeof StructuralPatchPreconditionSchema
>;
export type CodeChangeWriteOperation = z.infer<
  typeof CodeChangeWriteOperationSchema
>;
export type CodeChangeDeleteOperation = z.infer<
  typeof CodeChangeDeleteOperationSchema
>;
export type CodeChangeValidationCommand = z.infer<
  typeof CodeChangeValidationCommandSchema
>;
export type CodeChangeSet = z.infer<typeof CodeChangeSetSchema>;

export function isCodeChangeDeleteOperation(
  operation: CodeChangeOperation
): operation is CodeChangeDeleteOperation {
  return operation.changeType === "delete";
}

export function isCodeChangeWriteOperation(
  operation: CodeChangeOperation
): operation is CodeChangeWriteOperation {
  return operation.changeType === "create" || operation.changeType === "update";
}
