import { z } from "zod";

export const ProjectFileKindSchema = z.enum(["dir", "file"]);

export const ProjectFileLanguageSchema = z.string().trim().min(1);

export const ProjectFileBrowserErrorCodeSchema = z.enum([
  "invalid_request",
  "project_not_found",
  "run_not_found",
  "file_not_found",
  "forbidden_path",
  "sensitive_path",
  "not_regular_file",
  "binary_file",
  "file_too_large",
  "content_too_large",
  "truncated_file",
  "version_conflict",
  "permission_denied",
  "write_failed",
  "internal_error",
]);

export const ProjectFileVersionSchema = z.object({
  hash: z.string().trim().min(16),
  sizeBytes: z.number().int().nonnegative(),
  mtimeMs: z.number().nonnegative(),
});

export const ProjectFileBrowserProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  rootLabel: z.string().trim().min(1),
  latestRunId: z.string().uuid().nullable().default(null),
  status: z.string().trim().min(1).nullable().default(null),
  updatedAt: z.string().datetime().nullable().default(null),
});

export const ProjectFileEntrySchema = z.object({
  path: z.string(),
  kind: ProjectFileKindSchema,
  sizeBytes: z.number().int().nonnegative().optional(),
  modifiedAt: z.string().datetime().optional(),
  language: ProjectFileLanguageSchema.optional(),
});

export const ProjectFileListProjectsResponseSchema = z.object({
  projects: z.array(ProjectFileBrowserProjectSchema),
});

export const ProjectFileProjectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const ProjectFileTreeQuerySchema = z.object({
  runId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(10_000).optional(),
  depth: z.coerce.number().int().positive().max(24).optional(),
});

export const ProjectFileTreeResponseSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid().nullable().default(null),
  rootLabel: z.string().trim().min(1),
  entries: z.array(ProjectFileEntrySchema),
  partial: z.boolean(),
  ignoredCount: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

export const ProjectFileContentQuerySchema = z.object({
  runId: z.string().uuid().optional(),
  path: z.string().trim().min(1),
  maxBytes: z.coerce.number().int().positive().max(2_000_000).optional(),
});

export const ProjectFileContentResponseSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid().nullable().default(null),
  path: z.string(),
  content: z.string().nullable(),
  encoding: z.literal("utf-8"),
  language: ProjectFileLanguageSchema,
  sizeBytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  binary: z.boolean(),
  version: ProjectFileVersionSchema.optional(),
  generatedAt: z.string().datetime(),
});

export const SaveProjectFileRequestSchema = z.object({
  path: z.string().trim().min(1),
  runId: z.string().uuid().optional().nullable(),
  content: z.string(),
  baseVersion: ProjectFileVersionSchema,
  expectedEncoding: z.literal("utf-8").default("utf-8"),
});

export const SaveProjectFileResponseSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid().nullable().default(null),
  path: z.string(),
  content: z.string(),
  encoding: z.literal("utf-8"),
  language: ProjectFileLanguageSchema,
  sizeBytes: z.number().int().nonnegative(),
  truncated: z.literal(false),
  binary: z.literal(false),
  version: ProjectFileVersionSchema,
  savedAt: z.string().datetime(),
});

export const ProjectFileBrowserErrorResponseSchema = z.object({
  error: ProjectFileBrowserErrorCodeSchema,
  message: z.string(),
});

export type ProjectFileKind = z.infer<typeof ProjectFileKindSchema>;
export type ProjectFileBrowserErrorCode = z.infer<
  typeof ProjectFileBrowserErrorCodeSchema
>;
export type ProjectFileBrowserProject = z.infer<
  typeof ProjectFileBrowserProjectSchema
>;
export type ProjectFileEntry = z.infer<typeof ProjectFileEntrySchema>;
export type ProjectFileListProjectsResponse = z.infer<
  typeof ProjectFileListProjectsResponseSchema
>;
export type ProjectFileProjectParams = z.infer<
  typeof ProjectFileProjectParamsSchema
>;
export type ProjectFileTreeQuery = z.infer<typeof ProjectFileTreeQuerySchema>;
export type ProjectFileTreeResponse = z.infer<
  typeof ProjectFileTreeResponseSchema
>;
export type ProjectFileContentQuery = z.infer<
  typeof ProjectFileContentQuerySchema
>;
export type ProjectFileContentResponse = z.infer<
  typeof ProjectFileContentResponseSchema
>;
export type ProjectFileVersion = z.infer<typeof ProjectFileVersionSchema>;
export type SaveProjectFileRequest = z.infer<
  typeof SaveProjectFileRequestSchema
>;
export type SaveProjectFileResponse = z.infer<
  typeof SaveProjectFileResponseSchema
>;
export type ProjectFileBrowserErrorResponse = z.infer<
  typeof ProjectFileBrowserErrorResponseSchema
>;
