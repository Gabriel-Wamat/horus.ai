import { z } from "zod";
import { LlmSettingsReferenceSchema } from "./LlmSettings.js";

export const ProjectTargetModeSchema = z.enum(["new_project", "existing_project"]);

export const ProjectRunStatusSchema = z.enum([
  "pending",
  "bootstrapping",
  "running",
  "validating",
  "passed",
  "failed",
  "cancelled",
]);

export const ProjectRoleProfileSchema = z.object({
  allowedCommandIds: z.array(z.string().trim().min(1)).default([]),
  defaultValidationCommandIds: z.array(z.string().trim().min(1)).default([]),
});

export const ProjectCommandSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(100).optional(),
  executable: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().trim().min(1).default("."),
  env: z.record(z.string()).default({}),
  timeoutMs: z.number().int().positive().optional(),
});

export const HorusProjectConfigSchema = z.object({
  version: z.number().int().positive().default(1),
  projectName: z.string().trim().min(1),
  projectStack: z.string().trim().min(1).default("typescript-react"),
  baseRef: z.string().trim().min(1).default("main"),
  writeRoots: z.array(z.string().trim().min(1)).min(1),
  commandCatalog: z.array(ProjectCommandSchema).min(1),
  testRunnerIds: z.array(z.string().trim().min(1)).default([]),
  bootstrapCommandIds: z.array(z.string().trim().min(1)).default([]),
  roleProfiles: z.record(ProjectRoleProfileSchema),
});

export const HorusProjectManifestSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().trim().min(1),
  projectName: z.string().trim().min(1),
  rootPathPolicy: z.object({
    writeRoots: z.array(z.string().trim().min(1)).min(1),
    deniedPaths: z.array(z.string().trim().min(1)).default([]),
    generatedPaths: z.array(z.string().trim().min(1)).default([]),
  }),
  stack: z.object({
    frontend: z
      .enum(["react", "vue", "svelte", "angular", "next", "static", "unknown"])
      .default("unknown"),
    language: z
      .enum(["typescript", "javascript", "mixed", "unknown"])
      .default("unknown"),
    packageManager: z
      .enum(["pnpm", "npm", "yarn", "bun", "unknown"])
      .default("unknown"),
  }),
  entrypoints: z.array(z.string().trim().min(1)).default([]),
  commandCatalog: z.array(ProjectCommandSchema).default([]),
  architecture: z.object({
    summary: z.string().trim().min(1),
    sourceRoots: z.array(z.string().trim().min(1)).default([]),
    routeFiles: z.array(z.string().trim().min(1)).default([]),
    componentRoots: z.array(z.string().trim().min(1)).default([]),
  }),
  designSystem: z.object({
    referenceFiles: z.array(z.string().trim().min(1)).default([]),
    notes: z.array(z.string().trim().min(1)).default([]),
  }),
  agentRules: z.object({
    codingStyle: z.array(z.string().trim().min(1)).default([]),
    uiStyle: z.array(z.string().trim().min(1)).default([]),
    forbiddenPatterns: z.array(z.string().trim().min(1)).default([]),
    testingExpectations: z.array(z.string().trim().min(1)).default([]),
  }),
  security: z.object({
    denyPaths: z.array(z.string().trim().min(1)).default([]),
    secretPatterns: z.array(z.string().trim().min(1)).default([]),
    rulesCannotGrantPermissions: z.literal(true).default(true),
  }),
  lastValidatedAt: z.string().datetime().nullable().default(null),
  updatedAt: z.string().datetime(),
});

export const ProjectFileOperationSchema = z.object({
  operation: z.enum(["write", "delete"]),
  path: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  content: z.string().nullable().optional(),
  contentBase64: z.string().nullable().optional(),
});

export const ProjectCommandRequestSchema = z.object({
  commandId: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

export const ProjectExecutionPlanSchema = z.object({
  summary: z.string().trim().min(1),
  fileOperations: z.array(ProjectFileOperationSchema).default([]),
  commandRequests: z.array(ProjectCommandRequestSchema).default([]),
  validationCommandIds: z.array(z.string().trim().min(1)).default([]),
  risks: z.array(z.string()).default([]),
});

export const ProjectWorkspaceSchema = z.object({
  id: z.string().uuid(),
  workspaceFolderId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1),
  targetMode: ProjectTargetModeSchema,
  rootPath: z.string().trim().min(1),
  configPath: z.string().trim().min(1),
  gitRepositoryPath: z.string().trim().min(1).nullable().default(null),
  currentBranch: z.string().trim().min(1).nullable().default(null),
  baseRef: z.string().trim().min(1).nullable().default(null),
  projectStack: z.string().trim().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ProjectConstructionRunSchema = z.object({
  id: z.string().uuid(),
  projectWorkspaceId: z.string().uuid(),
  workflowRunId: z.string().uuid().nullable().default(null),
  status: ProjectRunStatusSchema,
  workspacePath: z.string().trim().min(1),
  branchName: z.string().trim().min(1).nullable().default(null),
  baseRef: z.string().trim().min(1).nullable().default(null),
  selectedUserStoryIds: z.array(z.string().uuid()).default([]),
  selectedSpecIds: z.array(z.string()).default([]),
  startedAt: z.string().datetime().nullable().default(null),
  finishedAt: z.string().datetime().nullable().default(null),
  error: z.string().nullable().default(null),
});

export const ProjectCommandRunSchema = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid().nullable().default(null),
  constructionRunId: z.string().uuid(),
  commandId: z.string().trim().min(1),
  command: z.string().trim().min(1),
  cwd: z.string().trim().min(1),
  exitCode: z.number().int().nullable(),
  stdoutTail: z.string().default(""),
  stderrTail: z.string().default(""),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable().default(null),
  durationMs: z.number().int().nonnegative().default(0),
  sandboxProfile: z.string().nullable().default(null),
});

export const ProjectQualityGateSchema = z.object({
  id: z.string().uuid(),
  constructionRunId: z.string().uuid(),
  assignmentId: z.string().uuid().nullable().default(null),
  status: z.enum(["pending", "passed", "failed", "skipped"]),
  checks: z.array(z.record(z.unknown())).default([]),
  failedChecks: z.array(z.record(z.unknown())).default([]),
  diffStats: z.record(z.unknown()).nullable().default(null),
  commitSha: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
});

export const RuntimeValidationCommandEvidenceSchema = z.object({
  commandId: z.string().trim().min(1),
  command: z.string().trim().min(1),
  cwd: z.string().trim().min(1),
  exitCode: z.number().int().nullable(),
  stdoutTail: z.string().default(""),
  stderrTail: z.string().default(""),
  durationMs: z.number().int().nonnegative().default(0),
});

export const RuntimeValidationPreviewEvidenceSchema = z.object({
  status: z.enum(["passed", "failed", "skipped"]),
  url: z.string().url().nullable().default(null),
  message: z.string().trim().min(1),
  evidence: z
    .object({
      title: z.string().nullable().default(null),
      bodySnippet: z.string().nullable().default(null),
      screenshotPath: z.string().nullable().default(null),
    })
    .default({}),
});

export const RuntimeValidationEvidenceSchema = z.object({
  id: z.string().uuid(),
  workflowThreadId: z.string().uuid().nullable().default(null),
  constructionRunId: z.string().uuid().nullable().default(null),
  userStoryId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  status: z.enum(["passed", "failed", "skipped", "running"]),
  skippedReason: z.string().trim().min(1).nullable().default(null),
  commands: z.array(RuntimeValidationCommandEvidenceSchema).default([]),
  preview: RuntimeValidationPreviewEvidenceSchema.default({
    status: "skipped",
    url: null,
    message: "Preview smoke was not executed.",
    evidence: {
      title: null,
      bodySnippet: null,
      screenshotPath: null,
    },
  }),
  createdAt: z.string().datetime(),
});

export const VisualGateViewportSchema = z.enum(["desktop", "mobile"]);

export const VisualGateIssueSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const VisualGateIssueCategorySchema = z.enum([
  "blank_render",
  "render_error",
  "responsive_overflow",
  "visual_identity_drift",
  "excessive_frames",
  "missing_state",
  "capture_unavailable",
]);

export const VisualGateScreenshotEvidenceSchema = z.object({
  id: z.string().trim().min(1),
  viewport: VisualGateViewportSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  captureKind: z.enum(["browser_screenshot", "static_dom"]).default("static_dom"),
  artifactPath: z.string().trim().min(1).nullable().default(null),
  artifactUrl: z.string().url().nullable().default(null),
  nonBlank: z.boolean(),
  diagnostics: z.record(z.unknown()).default({}),
});

export const VisualGateIssueSchema = z.object({
  id: z.string().trim().min(1),
  severity: VisualGateIssueSeveritySchema,
  category: VisualGateIssueCategorySchema,
  location: z.string().trim().min(1),
  observed: z.string().trim().min(1),
  expected: z.string().trim().min(1),
  fixTarget: z.enum(["front", "qa", "both"]).default("front"),
  evidenceIds: z.array(z.string().trim().min(1)).default([]),
});

export const VisualGateResultSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["passed", "failed", "inconclusive"]),
  score: z.number().min(0).max(100),
  threshold: z.number().min(0).max(100),
  summary: z.string().trim().min(1),
  issues: z.array(VisualGateIssueSchema).default([]),
  screenshots: z.array(VisualGateScreenshotEvidenceSchema).default([]),
  previewUrl: z.string().url().nullable().default(null),
  captureUnavailableReason: z.string().trim().min(1).nullable().default(null),
  designSystemSourceFiles: z.array(z.string().trim().min(1)).default([]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
});

export const CreateProjectWorkspaceInputSchema = z.object({
  workspaceFolderId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  targetMode: ProjectTargetModeSchema.default("new_project"),
  projectStack: z.string().trim().min(1).optional(),
  rootPath: z.string().trim().min(1).optional(),
  existingRepoPath: z.string().trim().min(1).optional(),
});

export const StartProjectConstructionInputSchema = z.object({
  projectWorkspaceId: z.string().uuid().optional(),
  workspaceFolderId: z.string().uuid(),
  projectName: z.string().trim().min(1).max(100).optional(),
  projectStack: z.string().trim().min(1).optional(),
  userStoryIds: z.array(z.string().uuid()).min(1),
  specIds: z.array(z.string()).default([]),
  llmSettingsRef: LlmSettingsReferenceSchema.optional(),
});

export type ProjectTargetMode = z.infer<typeof ProjectTargetModeSchema>;
export type ProjectRunStatus = z.infer<typeof ProjectRunStatusSchema>;
export type ProjectRoleProfile = z.infer<typeof ProjectRoleProfileSchema>;
export type ProjectCommand = z.infer<typeof ProjectCommandSchema>;
export type HorusProjectConfig = z.infer<typeof HorusProjectConfigSchema>;
export type HorusProjectManifest = z.infer<typeof HorusProjectManifestSchema>;
export type ProjectFileOperation = z.infer<typeof ProjectFileOperationSchema>;
export type ProjectCommandRequest = z.infer<typeof ProjectCommandRequestSchema>;
export type ProjectExecutionPlan = z.infer<typeof ProjectExecutionPlanSchema>;
export type ProjectWorkspace = z.infer<typeof ProjectWorkspaceSchema>;
export type ProjectConstructionRun = z.infer<
  typeof ProjectConstructionRunSchema
>;
export type ProjectCommandRun = z.infer<typeof ProjectCommandRunSchema>;
export type ProjectQualityGate = z.infer<typeof ProjectQualityGateSchema>;
export type RuntimeValidationCommandEvidence = z.infer<
  typeof RuntimeValidationCommandEvidenceSchema
>;
export type RuntimeValidationPreviewEvidence = z.infer<
  typeof RuntimeValidationPreviewEvidenceSchema
>;
export type RuntimeValidationEvidence = z.infer<
  typeof RuntimeValidationEvidenceSchema
>;
export type VisualGateViewport = z.infer<typeof VisualGateViewportSchema>;
export type VisualGateIssueSeverity = z.infer<
  typeof VisualGateIssueSeveritySchema
>;
export type VisualGateIssueCategory = z.infer<
  typeof VisualGateIssueCategorySchema
>;
export type VisualGateScreenshotEvidence = z.infer<
  typeof VisualGateScreenshotEvidenceSchema
>;
export type VisualGateIssue = z.infer<typeof VisualGateIssueSchema>;
export type VisualGateResult = z.infer<typeof VisualGateResultSchema>;
export type CreateProjectWorkspaceInput = z.infer<
  typeof CreateProjectWorkspaceInputSchema
>;
export type StartProjectConstructionInput = z.infer<
  typeof StartProjectConstructionInputSchema
>;
