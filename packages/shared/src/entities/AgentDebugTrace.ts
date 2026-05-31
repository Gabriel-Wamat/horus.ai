import { z } from "zod";
import { AgentNameSchema, AgentProfileIdSchema } from "./AgentResult.js";

// Per-turn debug record that powers the "why did the agent choose this?" view.
// Each workflow node records one entry per turn: the context snapshot it used,
// the hypothesis it formed, the action it took, the outcome it observed, and
// the next step it would try if asked to retry.
//
// Stored in a ring buffer per (projectId, threadId, userStoryId, agentName).
// The UI consumes the latest N entries to render the agent's decision trail.

export const AgentDebugTraceOutcomeSchema = z.enum([
  "success",
  "failure",
  "skipped",
  "blocked",
  "pending",
]);

export const AgentDebugTraceEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().trim().min(1).nullable().default(null),
  workflowThreadId: z.string().trim().min(1).nullable().default(null),
  userStoryId: z.string().trim().min(1).nullable().default(null),
  agentName: AgentNameSchema.nullable().default(null),
  agentProfileId: AgentProfileIdSchema.nullable().default(null),
  turn: z.number().int().nonnegative(),
  // Hash of the ProjectContextSnapshot used by this turn — lets the UI
  // correlate decisions with which version of the context was in scope.
  contextSnapshotHash: z.string().trim().min(1).nullable().default(null),
  // Counts to drive at-a-glance UI without re-fetching the whole snapshot.
  contextSummary: z
    .object({
      stack: z.string().nullable().default(null),
      runtimeHintCount: z.number().int().nonnegative().default(0),
      editableRootCount: z.number().int().nonnegative().default(0),
      protectedPathCount: z.number().int().nonnegative().default(0),
      requiredValidationKinds: z.array(z.string()).default([]),
    })
    .default({}),
  hypothesis: z.string().trim().min(1).nullable().default(null),
  action: z.string().trim().min(1),
  outcome: AgentDebugTraceOutcomeSchema,
  durationMs: z.number().int().nonnegative().default(0),
  // Free-form notes — e.g. "retry 2: same failure as retry 1", "switched
  // strategy because typecheck unavailable".
  notes: z.array(z.string().trim().min(1)).default([]),
  // Filenames the agent read or wrote, so the UI can show "this turn touched
  // these files" without re-parsing tool events.
  filesRead: z.array(z.string().trim().min(1)).default([]),
  filesWritten: z.array(z.string().trim().min(1)).default([]),
  createdAt: z.string().datetime(),
});

export type AgentDebugTraceOutcome = z.infer<typeof AgentDebugTraceOutcomeSchema>;
export type AgentDebugTraceEntry = z.infer<typeof AgentDebugTraceEntrySchema>;
