import { z } from "zod";
import { CodingTaskSurfaceSchema } from "./CodingRuntime.js";

export const RepositoryRetrievalStatusSchema = z.enum([
  "matched",
  "partial",
  "no_match",
  "blocked",
]);

export const RepositoryFileSafetySchema = z.enum([
  "readable",
  "ignored",
  "blocked",
  "binary",
  "too_large",
]);

export const RepositoryScanBudgetSchema = z.object({
  maxFiles: z.number().int().positive(),
  maxDepth: z.number().int().positive(),
  maxBytesPerFile: z.number().int().positive(),
});

export const RepositoryRetrievalBudgetSchema = z.object({
  maxFiles: z.number().int().positive(),
  maxBytesPerFile: z.number().int().positive(),
  maxTotalBytes: z.number().int().positive(),
  maxContentScanFiles: z.number().int().positive(),
  maxExcerpts: z.number().int().positive(),
  concurrency: z.number().int().positive(),
});

export const RepositoryScanStatsSchema = z.object({
  totalEntries: z.number().int().nonnegative(),
  totalFiles: z.number().int().nonnegative(),
  indexedFiles: z.number().int().nonnegative(),
  ignoredEntries: z.number().int().nonnegative(),
  blockedFiles: z.number().int().nonnegative(),
  binaryFiles: z.number().int().nonnegative(),
  oversizedFiles: z.number().int().nonnegative(),
  partial: z.boolean(),
});

export const RepositoryFileEntrySchema = z.object({
  path: z.string().trim().min(1),
  language: z.string().trim().min(1),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: z.string().datetime(),
  safety: RepositoryFileSafetySchema,
  reason: z.string().trim().min(1).optional(),
});

export const RepositoryScanSnapshotSchema = z.object({
  projectId: z.string().uuid().optional(),
  projectRootPath: z.string().trim().min(1),
  selectedPaths: z.array(z.string().trim().min(1)).default([]),
  files: z.array(RepositoryFileEntrySchema),
  stats: RepositoryScanStatsSchema,
  notes: z.array(z.string().trim().min(1)).default([]),
  generatedAt: z.string().datetime(),
});

export const RepositoryRetrievalExcerptSchema = z.object({
  filePath: z.string().trim().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  content: z.string(),
  reason: z.string().trim().min(1),
  score: z.number().nonnegative(),
});

export const RepositoryRetrievalCandidateSchema = z.object({
  path: z.string().trim().min(1),
  language: z.string().trim().min(1),
  bytes: z.number().int().nonnegative(),
  content: z.string(),
  startLine: z.number().int().positive().default(1),
  endLine: z.number().int().positive().optional(),
  score: z.number().nonnegative(),
  matchedTerms: z.array(z.string().trim().min(1)).default([]),
  excerpts: z.array(RepositoryRetrievalExcerptSchema).default([]),
});

export const RepositoryRetrievalStatsSchema = z.object({
  totalFiles: z.number().int().nonnegative(),
  indexedFiles: z.number().int().nonnegative(),
  contentScannedFiles: z.number().int().nonnegative(),
  explicitPathCount: z.number().int().nonnegative(),
  blockedPathCount: z.number().int().nonnegative(),
});

export const RepositoryRoutingHintSchema = z.object({
  surface: CodingTaskSurfaceSchema,
  reason: z.string().trim().min(1),
  score: z.number().nonnegative(),
});

export const RepositoryRetrievalResultSchema = z.object({
  query: z.string().trim().min(1),
  status: RepositoryRetrievalStatusSchema,
  candidates: z.array(RepositoryRetrievalCandidateSchema),
  excerpts: z.array(RepositoryRetrievalExcerptSchema).default([]),
  omittedFilesCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  stats: RepositoryRetrievalStatsSchema,
  notes: z.array(z.string().trim().min(1)).default([]),
  routingHints: z.array(RepositoryRoutingHintSchema).default([]),
});

export type RepositoryRetrievalStatus = z.infer<
  typeof RepositoryRetrievalStatusSchema
>;
export type RepositoryFileSafety = z.infer<typeof RepositoryFileSafetySchema>;
export type RepositoryScanBudget = z.infer<typeof RepositoryScanBudgetSchema>;
export type RepositoryRetrievalBudget = z.infer<
  typeof RepositoryRetrievalBudgetSchema
>;
export type RepositoryScanStats = z.infer<typeof RepositoryScanStatsSchema>;
export type RepositoryFileEntry = z.infer<typeof RepositoryFileEntrySchema>;
export type RepositoryScanSnapshot = z.infer<typeof RepositoryScanSnapshotSchema>;
export type RepositoryRetrievalExcerpt = z.infer<
  typeof RepositoryRetrievalExcerptSchema
>;
export type RepositoryRetrievalCandidate = z.infer<
  typeof RepositoryRetrievalCandidateSchema
>;
export type RepositoryRetrievalStats = z.infer<
  typeof RepositoryRetrievalStatsSchema
>;
export type RepositoryRoutingHint = z.infer<typeof RepositoryRoutingHintSchema>;
export type RepositoryRetrievalResult = z.infer<
  typeof RepositoryRetrievalResultSchema
>;
