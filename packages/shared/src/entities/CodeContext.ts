import { z } from "zod";
import { AstDiagnosticSeveritySchema, AstSymbolKindSchema } from "./AstAnalysis.js";
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

export const CodeContextRetrievalStatusSchema = z.enum([
  "matched",
  "partial",
  "no_match",
  "blocked",
]);

export const CodeContextRetrievalStatsSchema = z.object({
  totalFiles: z.number().int().nonnegative(),
  indexedFiles: z.number().int().nonnegative(),
  contentScannedFiles: z.number().int().nonnegative(),
  explicitPathCount: z.number().int().nonnegative(),
});

export const CodeContextStructuralStatusSchema = z.enum([
  "complete",
  "partial",
  "failed",
  "unavailable",
]);

export const CodeContextStructuralSymbolSchema = z.object({
  path: z.string().trim().min(1),
  name: z.string().trim().min(1),
  kind: AstSymbolKindSchema,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  detail: z.string().trim().min(1).optional(),
});

export const CodeContextStructuralDiagnosticSchema = z.object({
  path: z.string().trim().min(1),
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  severity: AstDiagnosticSeveritySchema,
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

export const CodeContextSemanticMatchSchema = z.object({
  path: z.string().trim().min(1),
  kind: z.enum(["file", "symbol", "text_window"]),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  score: z.number().nonnegative(),
  symbolNames: z.array(z.string().trim().min(1)).default([]),
  reasons: z.array(z.string().trim().min(1)).default([]),
});

export const CodeContextStructuralContextSchema = z.object({
  status: CodeContextStructuralStatusSchema,
  parsedDocumentCount: z.number().int().nonnegative(),
  symbolCount: z.number().int().nonnegative(),
  diagnosticCount: z.number().int().nonnegative(),
  symbols: z.array(CodeContextStructuralSymbolSchema).default([]),
  diagnostics: z.array(CodeContextStructuralDiagnosticSchema).default([]),
  semanticMatches: z.array(CodeContextSemanticMatchSchema).default([]),
  notes: z.array(z.string().trim().min(1)).default([]),
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
  retrievalStatus: CodeContextRetrievalStatusSchema.default("partial"),
  retrievalNotes: z.array(z.string()).default([]),
  retrievalStats: CodeContextRetrievalStatsSchema.optional(),
  manifest: HorusProjectManifestSchema.nullable().default(null),
  structuralContext: CodeContextStructuralContextSchema.nullable().default(null),
});

export type CodeContextFile = z.infer<typeof CodeContextFileSchema>;
export type CodeContextExcerpt = z.infer<typeof CodeContextExcerptSchema>;
export type CodeContextLimits = z.infer<typeof CodeContextLimitsSchema>;
export type CodeContextRetrievalStatus = z.infer<
  typeof CodeContextRetrievalStatusSchema
>;
export type CodeContextRetrievalStats = z.infer<
  typeof CodeContextRetrievalStatsSchema
>;
export type CodeContextStructuralStatus = z.infer<
  typeof CodeContextStructuralStatusSchema
>;
export type CodeContextStructuralSymbol = z.infer<
  typeof CodeContextStructuralSymbolSchema
>;
export type CodeContextStructuralDiagnostic = z.infer<
  typeof CodeContextStructuralDiagnosticSchema
>;
export type CodeContextSemanticMatch = z.infer<
  typeof CodeContextSemanticMatchSchema
>;
export type CodeContextStructuralContext = z.infer<
  typeof CodeContextStructuralContextSchema
>;
export type CodeContextBundle = z.infer<typeof CodeContextBundleSchema>;
