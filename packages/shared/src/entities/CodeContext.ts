import { z } from "zod";
import { HorusProjectManifestSchema } from "./ProjectConstruction.js";

export const CodeContextFileSchema = z.object({
  path: z.string().trim().min(1),
  bytes: z.number().int().nonnegative(),
  content: z.string(),
  startLine: z.number().int().positive().default(1),
  endLine: z.number().int().positive().optional(),
  matchedTerms: z.array(z.string()).default([]),
});

export const CodeContextExcerptSchema = z.object({
  filePath: z.string().trim().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  content: z.string(),
  reason: z.string().trim().min(1),
  score: z.number().nonnegative(),
});

export const CodeContextLimitsSchema = z.object({
  maxFiles: z.number().int().positive(),
  maxBytesPerFile: z.number().int().positive(),
  maxTotalBytes: z.number().int().positive(),
});

export const CodeContextBundleSchema = z.object({
  projectId: z.string().uuid(),
  query: z.string().trim().min(1),
  inspectedFiles: z.array(z.string().trim().min(1)),
  files: z.array(CodeContextFileSchema),
  excerpts: z.array(CodeContextExcerptSchema).default([]),
  omittedFilesCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  limits: CodeContextLimitsSchema,
  retrievalStatus: z.enum(["matched", "partial", "no_match"]).default("partial"),
  retrievalNotes: z.array(z.string()).default([]),
  manifest: HorusProjectManifestSchema.nullable().default(null),
});

export type CodeContextFile = z.infer<typeof CodeContextFileSchema>;
export type CodeContextExcerpt = z.infer<typeof CodeContextExcerptSchema>;
export type CodeContextLimits = z.infer<typeof CodeContextLimitsSchema>;
export type CodeContextBundle = z.infer<typeof CodeContextBundleSchema>;
