import { z } from "zod";
import {
  RepositoryFileEntrySchema,
  RepositoryScanStatsSchema,
} from "./RepositoryRetrieval.js";

export const ProjectInspectionStatusSchema = z.enum([
  "detected",
  "unknown",
  "partial",
  "ambiguous",
]);

export const ProjectPackageManagerSchema = z.enum([
  "pnpm",
  "npm",
  "yarn",
  "bun",
  "unknown",
]);

export const ProjectFrameworkSchema = z.enum([
  "react-vite",
  "next",
  "react",
  "node",
  "unknown",
]);

export const ProjectScriptCategorySchema = z.enum([
  "dev",
  "build",
  "test",
  "typecheck",
  "lint",
  "check",
  "preview",
  "other",
]);

export const ProjectEntrypointKindSchema = z.enum([
  "app",
  "page",
  "route",
  "config",
  "package",
  "html",
  "test",
]);

export const ProjectRouteKindSchema = z.enum([
  "next-app",
  "next-pages",
  "react-router",
  "static",
]);

export const ProjectDetectionEvidenceSchema = z.object({
  path: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

export const ProjectPackageManagerDetectionSchema = z.object({
  name: ProjectPackageManagerSchema,
  status: ProjectInspectionStatusSchema,
  evidence: z.array(ProjectDetectionEvidenceSchema).default([]),
});

export const ProjectFrameworkDetectionSchema = z.object({
  name: ProjectFrameworkSchema,
  status: ProjectInspectionStatusSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(ProjectDetectionEvidenceSchema).default([]),
});

export const ProjectScriptSchema = z.object({
  name: z.string().trim().min(1),
  command: z.string().trim().min(1),
  category: ProjectScriptCategorySchema,
});

export const ProjectEntrypointSchema = z.object({
  path: z.string().trim().min(1),
  kind: ProjectEntrypointKindSchema,
  evidence: z.string().trim().min(1),
});

export const ProjectRouteSchema = z.object({
  path: z.string().trim().min(1),
  route: z.string().trim().min(1),
  kind: ProjectRouteKindSchema,
});

export const ProjectInspectionRootsSchema = z.object({
  sourceRoots: z.array(z.string().trim().min(1)).default([]),
  testRoots: z.array(z.string().trim().min(1)).default([]),
  publicRoots: z.array(z.string().trim().min(1)).default([]),
  editableRoots: z.array(z.string().trim().min(1)).default([]),
});

export const ProjectEditableFileSchema = RepositoryFileEntrySchema.pick({
  path: true,
  language: true,
  sizeBytes: true,
  modifiedAt: true,
});

export const ProjectInspectionProfileSchema = z.object({
  projectId: z.string().uuid().optional(),
  projectRootPath: z.string().trim().min(1),
  packageManager: ProjectPackageManagerDetectionSchema,
  framework: ProjectFrameworkDetectionSchema,
  scripts: z.array(ProjectScriptSchema).default([]),
  roots: ProjectInspectionRootsSchema,
  entrypoints: z.array(ProjectEntrypointSchema).default([]),
  routes: z.array(ProjectRouteSchema).default([]),
  editableFiles: z.array(ProjectEditableFileSchema).default([]),
  protectedPaths: z.array(ProjectDetectionEvidenceSchema).default([]),
  unsafePaths: z.array(RepositoryFileEntrySchema).default([]),
  warnings: z.array(z.string().trim().min(1)).default([]),
  stats: RepositoryScanStatsSchema,
  generatedAt: z.string().datetime(),
});

export type ProjectInspectionStatus = z.infer<typeof ProjectInspectionStatusSchema>;
export type ProjectPackageManager = z.infer<typeof ProjectPackageManagerSchema>;
export type ProjectFramework = z.infer<typeof ProjectFrameworkSchema>;
export type ProjectScriptCategory = z.infer<typeof ProjectScriptCategorySchema>;
export type ProjectEntrypointKind = z.infer<typeof ProjectEntrypointKindSchema>;
export type ProjectRouteKind = z.infer<typeof ProjectRouteKindSchema>;
export type ProjectDetectionEvidence = z.infer<
  typeof ProjectDetectionEvidenceSchema
>;
export type ProjectPackageManagerDetection = z.infer<
  typeof ProjectPackageManagerDetectionSchema
>;
export type ProjectFrameworkDetection = z.infer<
  typeof ProjectFrameworkDetectionSchema
>;
export type ProjectScript = z.infer<typeof ProjectScriptSchema>;
export type ProjectEntrypoint = z.infer<typeof ProjectEntrypointSchema>;
export type ProjectRoute = z.infer<typeof ProjectRouteSchema>;
export type ProjectInspectionRoots = z.infer<typeof ProjectInspectionRootsSchema>;
export type ProjectEditableFile = z.infer<typeof ProjectEditableFileSchema>;
export type ProjectInspectionProfile = z.infer<
  typeof ProjectInspectionProfileSchema
>;
