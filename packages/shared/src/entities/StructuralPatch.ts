import { z } from "zod";
import { AstDiagnosticSchema, AstRangeSchema, AstSymbolKindSchema } from "./AstAnalysis.js";

export const StructuralPatchOperationKindSchema = z.enum([
  "insert",
  "replace",
  "delete",
  "rename_local",
  "add_import",
  "remove_import",
  "update_export",
]);

export const StructuralPatchInsertionPositionSchema = z.enum([
  "file_start",
  "file_end",
  "before_symbol",
  "after_symbol",
  "after_imports",
]);

export const StructuralPatchPreconditionSchema = z.object({
  path: z.string().trim().min(1),
  kind: z.enum(["content_hash", "exists", "missing"]),
  expected: z.string().trim().min(1).optional(),
  actual: z.string().trim().min(1).optional(),
});

export const StructuralPatchDiffStatsSchema = z.object({
  addedLines: z.number().int().nonnegative(),
  removedLines: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
});

export const StructuralPatchIntentSchema = z.object({
  id: z.string().trim().min(1),
  kind: StructuralPatchOperationKindSchema,
  targetPath: z.string().trim().min(1),
  targetSymbolId: z.string().trim().min(1).optional(),
  targetSymbolName: z.string().trim().min(1).optional(),
  targetSymbolKind: AstSymbolKindSchema.optional(),
  position: StructuralPatchInsertionPositionSchema.optional(),
  content: z.string().optional(),
  newName: z.string().trim().min(1).optional(),
  importSource: z.string().trim().min(1).optional(),
  namedImports: z.array(z.string().trim().min(1)).default([]),
  defaultImport: z.string().trim().min(1).optional(),
  namespaceImport: z.string().trim().min(1).optional(),
  rationale: z.string().trim().min(1).optional(),
});

export const StructuralPatchOperationSchema = z.object({
  id: z.string().trim().min(1),
  kind: StructuralPatchOperationKindSchema,
  targetPath: z.string().trim().min(1),
  targetSymbolId: z.string().trim().min(1).optional(),
  targetSymbolName: z.string().trim().min(1).optional(),
  targetSymbolKind: AstSymbolKindSchema.optional(),
  range: AstRangeSchema.optional(),
  beforeSnippet: z.string().optional(),
  afterSnippet: z.string().optional(),
  rationale: z.string().trim().min(1).optional(),
});

export const StructuralPatchFileChangeSchema = z.object({
  targetPath: z.string().trim().min(1),
  changeType: z.enum(["create", "update", "delete"]),
  beforeContent: z.string().nullable(),
  afterContent: z.string().nullable(),
  diff: z.string().trim().min(1),
  diffStats: StructuralPatchDiffStatsSchema,
  preconditions: z.array(StructuralPatchPreconditionSchema).default([]),
  operations: z.array(StructuralPatchOperationSchema).default([]),
});

export const StructuralPatchPlanStatusSchema = z.enum([
  "planned",
  "blocked",
  "applied",
  "failed",
  "rolled_back",
]);

export const StructuralPatchPlanSummarySchema = z.object({
  fileCount: z.number().int().nonnegative(),
  operationCount: z.number().int().nonnegative(),
  diagnosticCount: z.number().int().nonnegative(),
  diffStats: StructuralPatchDiffStatsSchema,
});

export const StructuralPatchPlanSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  status: StructuralPatchPlanStatusSchema,
  fileChanges: z.array(StructuralPatchFileChangeSchema).default([]),
  diagnostics: z.array(AstDiagnosticSchema).default([]),
  summary: StructuralPatchPlanSummarySchema,
  createdAt: z.string().datetime(),
});

export type StructuralPatchOperationKind = z.infer<
  typeof StructuralPatchOperationKindSchema
>;
export type StructuralPatchInsertionPosition = z.infer<
  typeof StructuralPatchInsertionPositionSchema
>;
export type StructuralPatchPrecondition = z.infer<
  typeof StructuralPatchPreconditionSchema
>;
export type StructuralPatchDiffStats = z.infer<
  typeof StructuralPatchDiffStatsSchema
>;
export type StructuralPatchIntent = z.infer<typeof StructuralPatchIntentSchema>;
export type StructuralPatchOperation = z.infer<
  typeof StructuralPatchOperationSchema
>;
export type StructuralPatchFileChange = z.infer<
  typeof StructuralPatchFileChangeSchema
>;
export type StructuralPatchPlanStatus = z.infer<
  typeof StructuralPatchPlanStatusSchema
>;
export type StructuralPatchPlanSummary = z.infer<
  typeof StructuralPatchPlanSummarySchema
>;
export type StructuralPatchPlan = z.infer<typeof StructuralPatchPlanSchema>;
