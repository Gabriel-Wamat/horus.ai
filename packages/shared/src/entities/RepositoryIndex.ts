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
  kind: z.string().trim().min(1).optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  symbolNames: z.array(z.string().trim().min(1)).default([]),
  vectorId: z.string().trim().min(1).optional(),
});

export const RepositoryIndexInvalidationStatusSchema = z.enum([
  "fresh",
  "stale",
  "rebuild_required",
]);

export const RepositoryIndexIgnorePolicySchema = z.object({
  gitignoreApplied: z.boolean().default(false),
  horusignoreApplied: z.boolean().default(false),
  ignoredEntries: z.number().int().nonnegative().default(0),
  blockedFiles: z.number().int().nonnegative().default(0),
  binaryFiles: z.number().int().nonnegative().default(0),
  oversizedFiles: z.number().int().nonnegative().default(0),
});

export const RepositoryIndexAstSummarySchema = z.object({
  status: z.enum(["complete", "partial", "failed", "unavailable"]),
  parsedDocumentCount: z.number().int().nonnegative().default(0),
  symbolCount: z.number().int().nonnegative().default(0),
  diagnosticCount: z.number().int().nonnegative().default(0),
  importCount: z.number().int().nonnegative().default(0),
});

export const RepositoryIndexEmbeddingSummarySchema = z.object({
  enabled: z.boolean(),
  provider: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  dimensions: z.number().int().positive().optional(),
  embeddedChunkCount: z.number().int().nonnegative().default(0),
});

export const RepositoryIndexGraphSummarySchema = z.object({
  status: z.enum(["complete", "partial", "failed", "unavailable"]),
  nodeCount: z.number().int().nonnegative().default(0),
  edgeCount: z.number().int().nonnegative().default(0),
  importCount: z.number().int().nonnegative().default(0),
  exportCount: z.number().int().nonnegative().default(0),
});

export const RepositoryIndexFreshnessSchema = z.object({
  status: RepositoryIndexInvalidationStatusSchema.default("fresh"),
  contentSignature: z.string().trim().min(1),
  merkleRoot: z.string().trim().min(1).optional(),
  stalePaths: z.array(z.string().trim().min(1)).default([]),
  checkedAt: z.string().datetime(),
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
  ignorePolicy: RepositoryIndexIgnorePolicySchema.optional(),
  ast: RepositoryIndexAstSummarySchema.optional(),
  embeddings: RepositoryIndexEmbeddingSummarySchema.optional(),
  graph: RepositoryIndexGraphSummarySchema.optional(),
  freshness: RepositoryIndexFreshnessSchema.optional(),
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
export type RepositoryIndexIgnorePolicy = z.infer<
  typeof RepositoryIndexIgnorePolicySchema
>;
export type RepositoryIndexAstSummary = z.infer<
  typeof RepositoryIndexAstSummarySchema
>;
export type RepositoryIndexEmbeddingSummary = z.infer<
  typeof RepositoryIndexEmbeddingSummarySchema
>;
export type RepositoryIndexGraphSummary = z.infer<
  typeof RepositoryIndexGraphSummarySchema
>;
export type RepositoryIndexFreshness = z.infer<
  typeof RepositoryIndexFreshnessSchema
>;
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
