import { z } from "zod";
import { AstSymbolKindSchema } from "./AstAnalysis.js";
import { RepositoryFileSafetySchema } from "./RepositoryRetrieval.js";

export const RepositoryGraphNodeKindSchema = z.enum([
  "file",
  "symbol",
  "package_scope",
  "external_package",
]);

export const RepositoryGraphEdgeKindSchema = z.enum([
  "declares",
  "exports",
  "imports",
  "imports_external",
  "references",
  "related_test",
  "tests",
  "in_package",
]);

export const RepositoryGraphStatusSchema = z.enum([
  "complete",
  "partial",
  "unavailable",
]);

export const RepositoryGraphConnectivityStatusSchema = z.enum([
  "connected",
  "disconnected",
  "missing",
  "external",
]);

export const RepositoryGraphNodeSchema = z.object({
  id: z.string().trim().min(1),
  kind: RepositoryGraphNodeKindSchema,
  label: z.string().trim().min(1),
  path: z.string().trim().min(1).optional(),
  language: z.string().trim().min(1).optional(),
  safety: RepositoryFileSafetySchema.optional(),
  symbolId: z.string().trim().min(1).optional(),
  symbolName: z.string().trim().min(1).optional(),
  symbolKind: AstSymbolKindSchema.optional(),
  packageName: z.string().trim().min(1).optional(),
  packageRoot: z.string().trim().min(1).optional(),
});

export const RepositoryGraphEdgeSchema = z.object({
  id: z.string().trim().min(1),
  kind: RepositoryGraphEdgeKindSchema,
  sourceId: z.string().trim().min(1),
  targetId: z.string().trim().min(1),
  sourcePath: z.string().trim().min(1).optional(),
  targetPath: z.string().trim().min(1).optional(),
  sourceSymbolId: z.string().trim().min(1).optional(),
  targetSymbolId: z.string().trim().min(1).optional(),
  importSource: z.string().trim().min(1).optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).optional(),
});

export const RepositoryGraphImportSchema = z.object({
  id: z.string().trim().min(1),
  sourcePath: z.string().trim().min(1),
  source: z.string().trim().min(1),
  resolvedTargetPath: z.string().trim().min(1).optional(),
  packageName: z.string().trim().min(1).optional(),
  isTypeOnly: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
});

export const RepositoryGraphExportSchema = z.object({
  id: z.string().trim().min(1),
  sourcePath: z.string().trim().min(1),
  symbolName: z.string().trim().min(1),
  exportKind: z.enum(["named", "default", "namespace", "reexport"]),
  reexportSource: z.string().trim().min(1).optional(),
  confidence: z.number().min(0).max(1),
});

export const RepositoryGraphPackageScopeSchema = z.object({
  id: z.string().trim().min(1),
  rootPath: z.string().trim().min(1),
  name: z.string().trim().min(1),
  packageJsonPath: z.string().trim().min(1).optional(),
});

export const RepositoryGraphSummarySchema = z.object({
  fileNodeCount: z.number().int().nonnegative(),
  symbolNodeCount: z.number().int().nonnegative(),
  packageScopeCount: z.number().int().nonnegative(),
  importEdgeCount: z.number().int().nonnegative(),
  externalImportEdgeCount: z.number().int().nonnegative(),
  relatedTestEdgeCount: z.number().int().nonnegative(),
  disconnectedImportCount: z.number().int().nonnegative(),
});

export const RepositoryGraphSnapshotSchema = z.object({
  projectRootPath: z.string().trim().min(1),
  status: RepositoryGraphStatusSchema,
  nodes: z.array(RepositoryGraphNodeSchema).default([]),
  edges: z.array(RepositoryGraphEdgeSchema).default([]),
  imports: z.array(RepositoryGraphImportSchema).default([]),
  exports: z.array(RepositoryGraphExportSchema).default([]),
  packages: z.array(RepositoryGraphPackageScopeSchema).default([]),
  summary: RepositoryGraphSummarySchema,
  notes: z.array(z.string().trim().min(1)).default([]),
  generatedAt: z.string().datetime(),
});

export const RepositoryGraphNeighborhoodNodeSchema = z.object({
  node: RepositoryGraphNodeSchema,
  distance: z.number().int().nonnegative(),
  score: z.number().nonnegative(),
  viaEdgeIds: z.array(z.string().trim().min(1)).default([]),
});

export const RepositoryGraphNeighborhoodSummarySchema = z.object({
  seedCount: z.number().int().nonnegative(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  pathCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const RepositoryGraphNeighborhoodSchema = z.object({
  seedPaths: z.array(z.string().trim().min(1)).default([]),
  maxDepth: z.number().int().nonnegative(),
  nodeBudget: z.number().int().positive(),
  nodes: z.array(RepositoryGraphNeighborhoodNodeSchema).default([]),
  edges: z.array(RepositoryGraphEdgeSchema).default([]),
  paths: z.array(z.string().trim().min(1)).default([]),
  summary: RepositoryGraphNeighborhoodSummarySchema,
  notes: z.array(z.string().trim().min(1)).default([]),
});

export const RepositoryGraphConnectivitySchema = z.object({
  targetPath: z.string().trim().min(1),
  status: RepositoryGraphConnectivityStatusSchema,
  reason: z.string().trim().min(1),
  relatedPaths: z.array(z.string().trim().min(1)).default([]),
  confidence: z.number().min(0).max(1),
});

export type RepositoryGraphNodeKind = z.infer<
  typeof RepositoryGraphNodeKindSchema
>;
export type RepositoryGraphEdgeKind = z.infer<
  typeof RepositoryGraphEdgeKindSchema
>;
export type RepositoryGraphStatus = z.infer<typeof RepositoryGraphStatusSchema>;
export type RepositoryGraphConnectivityStatus = z.infer<
  typeof RepositoryGraphConnectivityStatusSchema
>;
export type RepositoryGraphNode = z.infer<typeof RepositoryGraphNodeSchema>;
export type RepositoryGraphEdge = z.infer<typeof RepositoryGraphEdgeSchema>;
export type RepositoryGraphImport = z.infer<typeof RepositoryGraphImportSchema>;
export type RepositoryGraphExport = z.infer<typeof RepositoryGraphExportSchema>;
export type RepositoryGraphPackageScope = z.infer<
  typeof RepositoryGraphPackageScopeSchema
>;
export type RepositoryGraphSummary = z.infer<typeof RepositoryGraphSummarySchema>;
export type RepositoryGraphSnapshot = z.infer<
  typeof RepositoryGraphSnapshotSchema
>;
export type RepositoryGraphNeighborhoodNode = z.infer<
  typeof RepositoryGraphNeighborhoodNodeSchema
>;
export type RepositoryGraphNeighborhoodSummary = z.infer<
  typeof RepositoryGraphNeighborhoodSummarySchema
>;
export type RepositoryGraphNeighborhood = z.infer<
  typeof RepositoryGraphNeighborhoodSchema
>;
export type RepositoryGraphConnectivity = z.infer<
  typeof RepositoryGraphConnectivitySchema
>;
