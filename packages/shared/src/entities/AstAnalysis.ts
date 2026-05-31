import { z } from "zod";

export const AstPositionSchema = z.object({
  row: z.number().int().nonnegative(),
  column: z.number().int().nonnegative(),
});

export const AstRangeSchema = z.object({
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  startPosition: AstPositionSchema,
  endPosition: AstPositionSchema,
});

export const AstDocumentParseStatusSchema = z.enum([
  "parsed",
  "parse_error",
  "unsupported_language",
  "parser_unavailable",
]);

export const AstDiagnosticSeveritySchema = z.enum([
  "error",
  "warning",
  "info",
]);

export const AstDiagnosticSchema = z.object({
  path: z.string().trim().min(1),
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  severity: AstDiagnosticSeveritySchema,
  source: z.string().trim().min(1).default("ast"),
  range: AstRangeSchema.optional(),
});

export const AstSymbolKindSchema = z.enum([
  "import",
  "export",
  "function",
  "class",
  "method",
  "variable",
  "component",
  "hook",
  "type",
  "interface",
  "unknown",
]);

export const AstSymbolSchema = z.object({
  id: z.string().trim().min(1),
  path: z.string().trim().min(1),
  language: z.string().trim().min(1),
  name: z.string().trim().min(1),
  kind: AstSymbolKindSchema,
  range: AstRangeSchema,
  nameRange: AstRangeSchema.optional(),
  parentId: z.string().trim().min(1).optional(),
  importSource: z.string().trim().min(1).optional(),
  exportKind: z.enum(["named", "default", "namespace", "reexport"]).optional(),
  detail: z.string().trim().min(1).optional(),
});

export const AstDocumentSchema = z.object({
  path: z.string().trim().min(1),
  language: z.string().trim().min(1),
  contentHash: z.string().trim().min(1),
  bytes: z.number().int().nonnegative(),
  lineCount: z.number().int().positive(),
  parseStatus: AstDocumentParseStatusSchema,
  rootType: z.string().trim().min(1).optional(),
  symbols: z.array(AstSymbolSchema).default([]),
  diagnostics: z.array(AstDiagnosticSchema).default([]),
});

export const AstAnalysisSummarySchema = z.object({
  documentCount: z.number().int().nonnegative(),
  parsedDocumentCount: z.number().int().nonnegative(),
  unsupportedDocumentCount: z.number().int().nonnegative(),
  parseErrorDocumentCount: z.number().int().nonnegative(),
  diagnosticCount: z.number().int().nonnegative(),
  symbolCount: z.number().int().nonnegative(),
  hasBlockingDiagnostics: z.boolean(),
  languageCounts: z.record(z.number().int().nonnegative()).default({}),
});

export const AstAnalysisStatusSchema = z.enum([
  "complete",
  "partial",
  "failed",
]);

export const AstAnalysisResultSchema = z.object({
  status: AstAnalysisStatusSchema,
  documents: z.array(AstDocumentSchema),
  diagnostics: z.array(AstDiagnosticSchema).default([]),
  summary: AstAnalysisSummarySchema,
  generatedAt: z.string().datetime(),
});

export type AstPosition = z.infer<typeof AstPositionSchema>;
export type AstRange = z.infer<typeof AstRangeSchema>;
export type AstDocumentParseStatus = z.infer<
  typeof AstDocumentParseStatusSchema
>;
export type AstDiagnosticSeverity = z.infer<typeof AstDiagnosticSeveritySchema>;
export type AstDiagnostic = z.infer<typeof AstDiagnosticSchema>;
export type AstSymbolKind = z.infer<typeof AstSymbolKindSchema>;
export type AstSymbol = z.infer<typeof AstSymbolSchema>;
export type AstDocument = z.infer<typeof AstDocumentSchema>;
export type AstAnalysisSummary = z.infer<typeof AstAnalysisSummarySchema>;
export type AstAnalysisStatus = z.infer<typeof AstAnalysisStatusSchema>;
export type AstAnalysisResult = z.infer<typeof AstAnalysisResultSchema>;
