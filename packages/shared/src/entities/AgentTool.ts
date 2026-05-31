import { z } from "zod";
import { ProjectFileVersionSchema } from "./ProjectFiles.js";

export const IncrementalEditBlockedReasonSchema = z.enum([
  "read_required",
  "stale_file",
  "no_match",
  "ambiguous_match",
  "binary_file",
  "truncated_file",
  "content_too_large",
  "path_forbidden",
]);

export const IncrementalEditInputSchema = z.object({
  path: z.string().trim().min(1),
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().default(false),
  expectedContentHash: z.string().trim().min(16).optional(),
  expectedMtimeMs: z.number().nonnegative().optional(),
  baseVersion: ProjectFileVersionSchema.optional(),
  reason: z.string().trim().min(1).optional(),
});

export const IncrementalEditResultSchema = z.object({
  path: z.string(),
  changed: z.boolean(),
  newVersionHash: z.string().trim().min(16),
  replacementCount: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  diff: z.string(),
});

export const WriteFileToolInputSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
  overwrite: z.boolean().default(false),
  reason: z.string().trim().min(1).optional(),
});

export const WriteFileToolResultSchema = z.object({
  path: z.string(),
  changed: z.boolean(),
  newVersionHash: z.string().trim().min(16).nullable().default(null),
});

export type IncrementalEditBlockedReason = z.infer<
  typeof IncrementalEditBlockedReasonSchema
>;
export type IncrementalEditInput = z.infer<typeof IncrementalEditInputSchema>;
export type IncrementalEditResult = z.infer<typeof IncrementalEditResultSchema>;
export type WriteFileToolInput = z.infer<typeof WriteFileToolInputSchema>;
export type WriteFileToolResult = z.infer<typeof WriteFileToolResultSchema>;
