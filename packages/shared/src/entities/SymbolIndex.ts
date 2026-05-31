import { z } from "zod";
import {
  AstRangeSchema,
  AstSymbolKindSchema,
  AstSymbolSchema,
} from "./AstAnalysis.js";

export const SymbolLocationSchema = z.object({
  path: z.string().trim().min(1),
  range: AstRangeSchema,
  uri: z.string().trim().min(1).optional(),
});

export const LspDocumentSymbolSchema = z.object({
  name: z.string().trim().min(1),
  kind: AstSymbolKindSchema,
  location: SymbolLocationSchema,
  containerName: z.string().trim().min(1).optional(),
});

export const LspDiagnosticSeveritySchema = z.enum([
  "error",
  "warning",
  "info",
  "hint",
]);

export const LspDiagnosticSchema = z.object({
  path: z.string().trim().min(1),
  message: z.string().trim().min(1),
  severity: LspDiagnosticSeveritySchema,
  source: z.string().trim().min(1).default("lsp"),
  code: z.string().trim().min(1).optional(),
  range: AstRangeSchema.optional(),
});

export const SymbolReferenceResolutionSchema = z.enum([
  "complete",
  "truncated",
  "unavailable",
]);

export const SymbolIndexEntrySchema = z.object({
  symbol: AstSymbolSchema,
  location: SymbolLocationSchema,
  definitionLocations: z.array(SymbolLocationSchema).default([]),
  referenceCount: z.number().int().nonnegative(),
  referenceLocations: z.array(SymbolLocationSchema).default([]),
  referenceResolution: SymbolReferenceResolutionSchema,
});

export const SymbolIndexStatusSchema = z.enum([
  "complete",
  "partial",
  "unavailable",
  "failed",
]);

export const SymbolIndexSummarySchema = z.object({
  documentCount: z.number().int().nonnegative(),
  indexedSymbolCount: z.number().int().nonnegative(),
  diagnosticCount: z.number().int().nonnegative(),
  unresolvedSymbolCount: z.number().int().nonnegative(),
});

export const SymbolIndexResultSchema = z.object({
  projectRootPath: z.string().trim().min(1),
  status: SymbolIndexStatusSchema,
  entries: z.array(SymbolIndexEntrySchema).default([]),
  diagnostics: z.array(LspDiagnosticSchema).default([]),
  summary: SymbolIndexSummarySchema,
  notes: z.array(z.string().trim().min(1)).default([]),
  generatedAt: z.string().datetime(),
});

export type SymbolLocation = z.infer<typeof SymbolLocationSchema>;
export type LspDocumentSymbol = z.infer<typeof LspDocumentSymbolSchema>;
export type LspDiagnosticSeverity = z.infer<typeof LspDiagnosticSeveritySchema>;
export type LspDiagnostic = z.infer<typeof LspDiagnosticSchema>;
export type SymbolReferenceResolution = z.infer<
  typeof SymbolReferenceResolutionSchema
>;
export type SymbolIndexEntry = z.infer<typeof SymbolIndexEntrySchema>;
export type SymbolIndexStatus = z.infer<typeof SymbolIndexStatusSchema>;
export type SymbolIndexSummary = z.infer<typeof SymbolIndexSummarySchema>;
export type SymbolIndexResult = z.infer<typeof SymbolIndexResultSchema>;
