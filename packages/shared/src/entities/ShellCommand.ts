import { z } from "zod";
import { CodingValidationCommandKindSchema } from "./CodingValidation.js";

export const ShellCommandStatusSchema = z.enum([
  "awaiting_approval",
  "running",
  "completed",
  "failed",
  "timed_out",
  "aborted",
  "rejected",
]);

export const ShellCommandOutputStreamSchema = z.enum(["stdout", "stderr"]);

export const ShellCommandRequestSchema = z
  .object({
    commandId: z.string().trim().min(1),
    traceId: z.string().trim().min(1).optional(),
    spanId: z.string().trim().min(1).optional(),
    parentSpanId: z.string().trim().min(1).nullable().optional(),
    toolCallId: z.string().trim().min(1).nullable().optional(),
    runId: z.string().trim().min(1).nullable().optional(),
    projectId: z.string().trim().min(1).nullable().optional(),
    agentId: z.string().trim().min(1).nullable().optional(),
    filePath: z.string().trim().min(1).nullable().optional(),
    diffId: z.string().trim().min(1).nullable().optional(),
    kind: CodingValidationCommandKindSchema.default("unknown"),
    command: z.string().trim().min(1).optional(),
    shell: z.enum(["bash", "sh"]).default("bash"),
    executable: z.string().trim().min(1).optional(),
    args: z.array(z.string()).default([]),
    cwd: z.string().trim().min(1).default("."),
    env: z.record(z.string()).default({}),
    timeoutMs: z.number().int().positive().optional(),
    background: z.boolean().default(false),
    approved: z.boolean().default(false),
    approvedBy: z.string().trim().min(1).nullable().default(null),
    approvalReason: z.string().trim().min(1).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.command || value.executable) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["executable"],
      message: "executable or command is required",
    });
  });

export const ShellCommandOutputEventSchema = z.object({
  commandId: z.string().trim().min(1),
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
  stream: ShellCommandOutputStreamSchema,
  chunk: z.string(),
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});

export const ShellCommandResultSchema = z.object({
  commandId: z.string().trim().min(1),
  taskId: z.string().trim().min(1).nullable().default(null),
  traceId: z.string().trim().min(1).nullable().default(null),
  spanId: z.string().trim().min(1).nullable().default(null),
  parentSpanId: z.string().trim().min(1).nullable().default(null),
  toolCallId: z.string().trim().min(1).nullable().default(null),
  runId: z.string().trim().min(1).nullable().default(null),
  projectId: z.string().trim().min(1).nullable().default(null),
  agentId: z.string().trim().min(1).nullable().default(null),
  filePath: z.string().trim().min(1).nullable().default(null),
  diffId: z.string().trim().min(1).nullable().default(null),
  kind: CodingValidationCommandKindSchema.default("unknown"),
  command: z.string().trim().min(1),
  executable: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().trim().min(1),
  status: ShellCommandStatusSchema,
  approvalRequired: z.boolean().default(false),
  risk: z.enum(["low", "medium", "high"]).default("low"),
  policyReason: z.string().trim().min(1).nullable().default(null),
  approved: z.boolean().default(false),
  approvedBy: z.string().trim().min(1).nullable().default(null),
  approvalReason: z.string().trim().min(1).nullable().default(null),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable().default(null),
  stdoutTail: z.string().default(""),
  stderrTail: z.string().default(""),
  durationMs: z.number().int().nonnegative(),
  timedOut: z.boolean().default(false),
  spawned: z.boolean().default(false),
  processId: z.number().int().positive().nullable().default(null),
  stdoutPath: z.string().trim().min(1).nullable().default(null),
  stderrPath: z.string().trim().min(1).nullable().default(null),
  stdoutBytes: z.number().int().nonnegative().default(0),
  stderrBytes: z.number().int().nonnegative().default(0),
  lastOutputAt: z.string().datetime().nullable().default(null),
  interactivePromptDetected: z.boolean().default(false),
  interactivePromptText: z.string().trim().min(1).nullable().default(null),
  errorMessage: z.string().trim().min(1).nullable().default(null),
  background: z.boolean().default(false),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable().default(null),
});

export type ShellCommandStatus = z.infer<typeof ShellCommandStatusSchema>;
export type ShellCommandOutputStream = z.infer<
  typeof ShellCommandOutputStreamSchema
>;
export type ShellCommandRequest = z.infer<typeof ShellCommandRequestSchema>;
export type ShellCommandOutputEvent = z.infer<
  typeof ShellCommandOutputEventSchema
>;
export type ShellCommandResult = z.infer<typeof ShellCommandResultSchema>;
