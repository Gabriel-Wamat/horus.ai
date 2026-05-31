import { z } from "zod";
import { RepositoryFileSafetySchema } from "./RepositoryRetrieval.js";

export const RepositoryIndexFileSchema = z.object({
  path: z.string().trim().min(1),
  sourceHash: z.string().trim().min(1),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: z.string().datetime(),
  safety: RepositoryFileSafetySchema,
  reason: z.string().trim().min(1).optional(),
});

export const RepositoryIndexChunkSchema = z.object({
  id: z.string().trim().min(1),
  path: z.string().trim().min(1),
  contentHash: z.string().trim().min(1),
  indexVersion: z.string().trim().min(1),
  tokenEstimate: z.number().int().nonnegative(),
  vectorId: z.string().trim().min(1).optional(),
});

export const RepositoryIndexManifestSchema = z.object({
  id: z.string().trim().min(1),
  namespace: z.string().trim().min(1),
  projectId: z.string().uuid().optional(),
  indexVersion: z.string().trim().min(1),
  embeddingModel: z.string().trim().min(1).optional(),
  dimensions: z.number().int().positive().optional(),
  files: z.array(RepositoryIndexFileSchema).default([]),
  chunks: z.array(RepositoryIndexChunkSchema).default([]),
  sourceFileCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

export const RepositoryIndexInvalidationReasonSchema = z.enum([
  "index_version_changed",
  "missing_file",
  "source_hash_changed",
  "safety_changed",
  "chunk_hash_changed",
]);

export const RepositoryIndexInvalidationStatusSchema = z.enum([
  "fresh",
  "stale",
  "rebuild_required",
]);

export const RepositoryIndexInvalidationEntrySchema = z.object({
  path: z.string().trim().min(1),
  reasons: z.array(RepositoryIndexInvalidationReasonSchema).min(1),
  previousSourceHash: z.string().trim().min(1).optional(),
  currentSourceHash: z.string().trim().min(1).optional(),
});

export const RepositoryIndexInvalidationPlanSchema = z.object({
  namespace: z.string().trim().min(1),
  status: RepositoryIndexInvalidationStatusSchema,
  stalePaths: z.array(z.string().trim().min(1)).default([]),
  staleChunkIds: z.array(z.string().trim().min(1)).default([]),
  entries: z.array(RepositoryIndexInvalidationEntrySchema).default([]),
  generatedAt: z.string().datetime(),
});

export const RepositoryIndexCleanupPlanSchema = z.object({
  namespace: z.string().trim().min(1),
  cutoffAt: z.string().datetime(),
  expiredManifestIds: z.array(z.string().trim().min(1)).default([]),
  expiredMemoryIds: z.array(z.string().uuid()).default([]),
  generatedAt: z.string().datetime(),
});

export type RepositoryIndexFile = z.infer<typeof RepositoryIndexFileSchema>;
export type RepositoryIndexChunk = z.infer<typeof RepositoryIndexChunkSchema>;
export type RepositoryIndexManifest = z.infer<
  typeof RepositoryIndexManifestSchema
>;
export type RepositoryIndexInvalidationReason = z.infer<
  typeof RepositoryIndexInvalidationReasonSchema
>;
export type RepositoryIndexInvalidationStatus = z.infer<
  typeof RepositoryIndexInvalidationStatusSchema
>;
export type RepositoryIndexInvalidationEntry = z.infer<
  typeof RepositoryIndexInvalidationEntrySchema
>;
export type RepositoryIndexInvalidationPlan = z.infer<
  typeof RepositoryIndexInvalidationPlanSchema
>;
export type RepositoryIndexCleanupPlan = z.infer<
  typeof RepositoryIndexCleanupPlanSchema
>;
