import { z } from "zod";
import {
  AgentNameSchema,
  AgentProfileIdSchema,
  AgentToolNameSchema,
} from "./AgentResult.js";

export const AgentRunbookStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "blocked",
  "waiting_for_decision",
]);

export const AgentRunbookActionSchema = z.enum([
  "session",
  "inspect_project",
  "read_file",
  "change_file",
  "run_command",
  "inspect_diff",
  "propose_change",
  "validate",
  "retry",
  "decision",
  "tool",
  "completed",
]);

export const AgentRunbookEntrySchema = z.object({
  id: z.string().trim().min(1),
  workflowThreadId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  sourceEventIds: z.array(z.string().uuid()).default([]),
  sequence: z.number().int().nonnegative(),
  agentName: AgentNameSchema.optional(),
  agentProfileId: AgentProfileIdSchema.optional(),
  toolName: AgentToolNameSchema.optional(),
  action: AgentRunbookActionSchema,
  status: AgentRunbookStatusSchema,
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1).optional(),
  target: z.string().trim().min(1).optional(),
  filePaths: z.array(z.string().trim().min(1)).default([]),
  commandIds: z.array(z.string().trim().min(1)).default([]),
  errorMessage: z.string().trim().min(1).optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AgentRunbookStatus = z.infer<typeof AgentRunbookStatusSchema>;
export type AgentRunbookAction = z.infer<typeof AgentRunbookActionSchema>;
export type AgentRunbookEntry = z.infer<typeof AgentRunbookEntrySchema>;
