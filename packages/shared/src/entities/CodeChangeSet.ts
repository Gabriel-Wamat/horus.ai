import { z } from "zod";

export const CodeChangeSetStatusSchema = z.enum([
  "proposed",
  "curator_rejected",
  "curator_approved",
  "applied",
  "validated",
  "failed",
]);

export const CodeChangeOperationSchema = z.object({
  targetPath: z.string().trim().min(1),
  changeType: z.enum(["create", "update"]),
  beforeContent: z.string().nullable(),
  afterContent: z.string(),
  diff: z.string().trim().min(1),
});

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
export type CodeChangeValidationCommand = z.infer<
  typeof CodeChangeValidationCommandSchema
>;
export type CodeChangeSet = z.infer<typeof CodeChangeSetSchema>;
