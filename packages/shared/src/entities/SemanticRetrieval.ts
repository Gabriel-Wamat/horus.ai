import { z } from "zod";
import { AstRangeSchema } from "./AstAnalysis.js";
import { RepositoryRetrievalCandidateSchema } from "./RepositoryRetrieval.js";

export const RepositoryChunkKindSchema = z.enum([
  "file",
  "symbol",
  "text_window",
]);

export const SemanticRetrievalStatusSchema = z.enum([
  "matched",
  "partial",
  "no_match",
  "unavailable",
]);

export const RepositoryChunkSchema = z.object({
  id: z.string().trim().min(1),
  path: z.string().trim().min(1),
  language: z.string().trim().min(1),
  kind: RepositoryChunkKindSchema,
  content: z.string(),
  contentHash: z.string().trim().min(1),
  indexVersion: z.string().trim().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  tokenEstimate: z.number().int().nonnegative(),
  range: AstRangeSchema.optional(),
  symbolIds: z.array(z.string().trim().min(1)).default([]),
  symbolNames: z.array(z.string().trim().min(1)).default([]),
});

export const SemanticScoreBreakdownSchema = z.object({
  lexicalScore: z.number().nonnegative(),
  vectorScore: z.number().nonnegative(),
  symbolScore: z.number().nonnegative(),
  graphScore: z.number().nonnegative(),
  explicitPathScore: z.number().nonnegative(),
  finalScore: z.number().nonnegative(),
  reasons: z.array(z.string().trim().min(1)).default([]),
});

export const SemanticRetrievalMatchSchema = z.object({
  chunk: RepositoryChunkSchema,
  candidate: RepositoryRetrievalCandidateSchema.optional(),
  scoreBreakdown: SemanticScoreBreakdownSchema,
});

export const SemanticRetrievalSummarySchema = z.object({
  chunkCount: z.number().int().nonnegative(),
  embeddedChunkCount: z.number().int().nonnegative(),
  matchedChunkCount: z.number().int().nonnegative(),
  omittedChunkCount: z.number().int().nonnegative(),
  embeddingModel: z.string().trim().min(1).optional(),
  dimensions: z.number().int().positive().optional(),
});

export const SemanticRetrievalResultSchema = z.object({
  query: z.string().trim().min(1),
  namespace: z.string().trim().min(1),
  status: SemanticRetrievalStatusSchema,
  indexVersion: z.string().trim().min(1),
  matches: z.array(SemanticRetrievalMatchSchema).default([]),
  summary: SemanticRetrievalSummarySchema,
  notes: z.array(z.string().trim().min(1)).default([]),
  generatedAt: z.string().datetime(),
});

export type RepositoryChunkKind = z.infer<typeof RepositoryChunkKindSchema>;
export type SemanticRetrievalStatus = z.infer<
  typeof SemanticRetrievalStatusSchema
>;
export type RepositoryChunk = z.infer<typeof RepositoryChunkSchema>;
export type SemanticScoreBreakdown = z.infer<
  typeof SemanticScoreBreakdownSchema
>;
export type SemanticRetrievalMatch = z.infer<
  typeof SemanticRetrievalMatchSchema
>;
export type SemanticRetrievalSummary = z.infer<
  typeof SemanticRetrievalSummarySchema
>;
export type SemanticRetrievalResult = z.infer<
  typeof SemanticRetrievalResultSchema
>;
