import { z } from "zod";
import { AgentProfileIdSchema } from "./AgentResult.js";
import { CodeContextBundleSchema } from "./CodeContext.js";
import { ProjectInspectionProfileSchema } from "./ProjectInspection.js";
import { ValidationStrategySchema } from "./ValidationStrategy.js";

// Restrictions an agent must respect when planning or applying edits in this
// project. The engine fills these once so consumers don't re-derive them from
// scattered heuristics.
export const ProjectEditRestrictionsSchema = z.object({
  protectedPaths: z.array(z.string().trim().min(1)).default([]),
  unsafePaths: z.array(z.string().trim().min(1)).default([]),
  editableRoots: z.array(z.string().trim().min(1)).default([]),
  // Patterns or paths that must never be modified even if technically editable
  // (e.g. lockfiles, .env files, generated artifacts).
  forbiddenWritePatterns: z.array(z.string().trim().min(1)).default([]),
});

// Lightweight summary of any runtime evidence already observed (build errors,
// previous validation runs, runtime errors from the preview). The engine takes
// this as a *hint* — it does not collect runtime evidence itself.
export const ProjectContextRuntimeHintSchema = z.object({
  kind: z.enum([
    "build_error",
    "type_error",
    "lint_error",
    "test_failure",
    "preview_error",
    "console_error",
    "network_error",
    "other",
  ]),
  source: z.string().trim().min(1),
  message: z.string().trim().min(1),
  path: z.string().trim().min(1).optional(),
  line: z.number().int().min(1).optional(),
  observedAt: z.string().datetime().optional(),
});

// A short trail of recent actions/decisions within the current run. Engine does
// not own this — it just forwards what the caller provided so the snapshot
// stays cohesive.
export const ProjectContextRunHistoryEntrySchema = z.object({
  turn: z.number().int().min(0),
  actor: z.string().trim().min(1),
  action: z.string().trim().min(1),
  outcome: z.enum(["success", "failure", "skipped", "pending"]).default("pending"),
  note: z.string().trim().min(1).optional(),
});

export const ProjectContextSnapshotSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  projectRootPath: z.string().trim().min(1),
  // The agent profile this snapshot is scoped to. Engine still returns a
  // single canonical bundle, but downstream packagers (e.g.
  // AgentContextProfileService) use this to decide which sections to expose.
  agentProfileId: AgentProfileIdSchema.optional(),
  query: z.string().trim().min(1).optional(),
  inspection: ProjectInspectionProfileSchema,
  codeContext: CodeContextBundleSchema,
  validationStrategy: ValidationStrategySchema,
  editRestrictions: ProjectEditRestrictionsSchema,
  runtimeHints: z.array(ProjectContextRuntimeHintSchema).default([]),
  runHistory: z.array(ProjectContextRunHistoryEntrySchema).default([]),
  notes: z.array(z.string().trim().min(1)).default([]),
  generatedAt: z.string().datetime(),
});

export type ProjectEditRestrictions = z.infer<
  typeof ProjectEditRestrictionsSchema
>;
export type ProjectContextRuntimeHint = z.infer<
  typeof ProjectContextRuntimeHintSchema
>;
export type ProjectContextRunHistoryEntry = z.infer<
  typeof ProjectContextRunHistoryEntrySchema
>;
export type ProjectContextSnapshot = z.infer<
  typeof ProjectContextSnapshotSchema
>;
