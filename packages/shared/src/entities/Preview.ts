import { z } from "zod";

export interface ResolvePreviewPublicHostInput {
  configuredPublicHost?: string | null | undefined;
  bindHost: string;
  runtimeHostname?: string | null | undefined;
}

export function resolvePreviewPublicHost(
  input: ResolvePreviewPublicHostInput
): string {
  const configured = firstNonEmpty([
    input.configuredPublicHost,
    isWildcardBindHost(input.bindHost) ? input.runtimeHostname : input.bindHost,
    input.runtimeHostname,
  ]);
  if (!configured) {
    throw new Error(
      "Preview public host could not be resolved. Set HORUS_PUBLIC_HOST or a preview-specific public host."
    );
  }
  return configured;
}

export function isWildcardBindHost(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]";
}

function firstNonEmpty(values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized && normalized.length > 0) return normalized;
  }
  return undefined;
}

export const PreviewDeviceNameSchema = z.enum(["pc", "phone", "tablet"]);

export const PreviewDeviceSchema = z.object({
  name: PreviewDeviceNameSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const PreviewCommandSchema = z.object({
  id: z.string().trim().min(1).regex(/^[a-z0-9]+(?:[-_:][a-z0-9]+)*$/),
  label: z.string().trim().min(1).max(100).optional(),
  executable: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().trim().min(1).default("."),
  env: z.record(z.string()).default({}),
  timeoutMs: z.number().int().positive().optional(),
});

export const PreviewStatusSchema = z.enum([
  "waiting",
  "stopped",
  "starting",
  "running",
  "inspecting",
  "applying",
  "error",
]);

export const FrontendProjectKindSchema = z.enum([
  "seed",
  "generated",
  "legacy_static",
]);

export const FrontendProjectLifecycleStatusSchema = z.enum([
  "draft",
  "running",
  "published",
  "failed",
  "archived",
  "superseded",
]);

export const FrontendProjectVisibilitySchema = z.enum(["visible", "hidden"]);

export const FrontendProjectHealthStatusSchema = z.enum([
  "unknown",
  "healthy",
  "warning",
  "blocked",
]);

export const FrontendProjectHealthReasonSchema = z.enum([
  "root_missing",
  "manifest_missing",
  "manifest_invalid",
  "preview_command_missing",
  "preview_url_missing",
  "preview_url_collision",
  "wrong_owner_port",
  "scaffold_only",
  "duplicate_app_hash",
  "superseded_by_canonical",
  "stale_running_run",
  "legacy_static",
  "seed_project",
]);

export const FrontendProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  rootPath: z.string().trim().min(1),
  defaultRoute: z.string().regex(/^\/(?:.*)?$/),
  devCommand: z.string().trim().min(1).nullable(),
  previewCommandId: z.string().trim().min(1).nullable().default(null),
  commandCatalog: z.array(PreviewCommandSchema).default([]),
  previewUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
  projectKind: FrontendProjectKindSchema.default("generated"),
  lifecycleStatus: FrontendProjectLifecycleStatusSchema.default("published"),
  visibility: FrontendProjectVisibilitySchema.default("visible"),
  healthStatus: FrontendProjectHealthStatusSchema.default("unknown"),
  healthReasons: z.array(FrontendProjectHealthReasonSchema).default([]),
  canonicalProjectId: z.string().uuid().nullable().default(null),
  projectWorkspaceId: z.string().uuid().nullable().default(null),
  appFingerprint: z.string().trim().min(1).nullable().default(null),
  lastHealthCheckedAt: z.string().datetime().nullable().default(null),
  archivedAt: z.string().datetime().nullable().default(null),
  archivedReason: z.string().trim().min(1).nullable().default(null),
});

export const CreatePreviewSessionInputSchema = z.object({
  projectId: z.string().uuid(),
  route: z.string().regex(/^\/(?:.*)?$/).optional(),
  device: PreviewDeviceNameSchema.optional(),
});

export const PreviewSessionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: PreviewStatusSchema,
  route: z.string().regex(/^\/(?:.*)?$/),
  device: PreviewDeviceSchema,
  previewUrl: z.string().url().nullable(),
  processId: z.number().int().positive().nullable(),
  startedAt: z.string().datetime().nullable(),
  stoppedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  errorMessage: z.string().nullable(),
});

export const PreviewEventTypeSchema = z.enum([
  "preview_created",
  "preview_started",
  "preview_ready",
  "preview_stopped",
  "preview_reloaded",
  "device_changed",
  "route_changed",
  "dom_snapshot_unavailable",
  "visual_instruction_drafted",
  "preview_error",
  "preview_recovered_after_restart",
]);

export const PreviewEventSchema = z.object({
  id: z.string().uuid(),
  type: PreviewEventTypeSchema,
  sessionId: z.string().uuid(),
  projectId: z.string().uuid(),
  timestamp: z.string().datetime(),
  status: PreviewStatusSchema,
  message: z.string().trim().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const SetPreviewDeviceInputSchema = z.object({
  device: PreviewDeviceNameSchema,
});

export const VisualInstructionModeSchema = z.enum(["visual_edits", "build"]);

export const CreateVisualInstructionDraftInputSchema = z.object({
  sessionId: z.string().uuid(),
  mode: VisualInstructionModeSchema,
  message: z.string().trim().min(1).max(8000),
});

export const VisualInstructionDraftSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  projectId: z.string().uuid(),
  mode: VisualInstructionModeSchema,
  message: z.string().trim().min(1),
  status: z.literal("drafted"),
  createdAt: z.string().datetime(),
});

export type PreviewDeviceName = z.infer<typeof PreviewDeviceNameSchema>;
export type PreviewDevice = z.infer<typeof PreviewDeviceSchema>;
export type PreviewCommand = z.infer<typeof PreviewCommandSchema>;
export type PreviewStatus = z.infer<typeof PreviewStatusSchema>;
export type FrontendProjectKind = z.infer<typeof FrontendProjectKindSchema>;
export type FrontendProjectLifecycleStatus = z.infer<
  typeof FrontendProjectLifecycleStatusSchema
>;
export type FrontendProjectVisibility = z.infer<
  typeof FrontendProjectVisibilitySchema
>;
export type FrontendProjectHealthStatus = z.infer<
  typeof FrontendProjectHealthStatusSchema
>;
export type FrontendProjectHealthReason = z.infer<
  typeof FrontendProjectHealthReasonSchema
>;
export type FrontendProject = z.infer<typeof FrontendProjectSchema>;
export type CreatePreviewSessionInput = z.infer<
  typeof CreatePreviewSessionInputSchema
>;
export type PreviewSession = z.infer<typeof PreviewSessionSchema>;
export type PreviewEventType = z.infer<typeof PreviewEventTypeSchema>;
export type PreviewEvent = z.infer<typeof PreviewEventSchema>;
export type SetPreviewDeviceInput = z.infer<typeof SetPreviewDeviceInputSchema>;
export type VisualInstructionMode = z.infer<typeof VisualInstructionModeSchema>;
export type CreateVisualInstructionDraftInput = z.infer<
  typeof CreateVisualInstructionDraftInputSchema
>;
export type VisualInstructionDraft = z.infer<typeof VisualInstructionDraftSchema>;
