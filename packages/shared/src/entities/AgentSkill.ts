import { z } from "zod";
import { AgentProfileSchema } from "./AgentToolProfile.js";

export const AgentSkillSourceTypeSchema = z.enum([
  "filesystem_seed",
  "database",
  "imported_bundle",
]);

export const AgentSkillScopeSchema = z.enum(["system", "project", "workspace"]);

export const AgentSkillStatusSchema = z.enum([
  "draft",
  "active",
  "archived",
]);

export const AgentSkillRevisionStatusSchema = z.enum([
  "draft",
  "validated",
  "published",
  "rejected",
  "archived",
]);

export const AgentSkillValidationStatusSchema = z.enum([
  "pending",
  "passed",
  "failed",
]);

export const AgentSkillBindingTriggerModeSchema = z.enum([
  "automatic",
  "manual",
  "disabled",
]);

export const AgentSkillFileSchema = z.object({
  id: z.string().uuid(),
  revisionId: z.string().uuid(),
  relativePath: z.string().trim().min(1).max(240),
  mediaType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().nonnegative(),
  contentText: z.string().nullable().default(null),
  contentSha256: z.string().trim().min(32),
});

export const AgentSkillValidationIssueSchema = z.object({
  severity: z.enum(["info", "warning", "error"]),
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  path: z.string().trim().min(1).nullable().default(null),
});

export const AgentSkillValidationCheckSchema = z.object({
  code: z.string().trim().min(1),
  status: z.enum(["passed", "failed", "warning"]),
  message: z.string().trim().min(1),
});

export const AgentSkillValidationReportSchema = z.object({
  id: z.string().uuid(),
  revisionId: z.string().uuid(),
  status: z.enum(["passed", "failed"]),
  checks: z.array(AgentSkillValidationCheckSchema).default([]),
  issues: z.array(AgentSkillValidationIssueSchema).default([]),
  createdAt: z.string().datetime(),
});

export const AgentSkillRevisionSchema = z.object({
  id: z.string().uuid(),
  skillId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  status: AgentSkillRevisionStatusSchema,
  skillMd: z.string().min(1),
  frontmatter: z.record(z.unknown()).default({}),
  contentHash: z.string().trim().min(32),
  validationStatus: AgentSkillValidationStatusSchema,
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable().default(null),
});

export const AgentSkillSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(600),
  scope: AgentSkillScopeSchema,
  sourceType: AgentSkillSourceTypeSchema,
  sourcePath: z.string().trim().min(1).nullable().default(null),
  status: AgentSkillStatusSchema,
  activeRevisionId: z.string().uuid().nullable().default(null),
  createdBy: z.string().trim().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AgentSkillBindingSchema = z.object({
  id: z.string().uuid(),
  skillId: z.string().uuid(),
  agentProfileId: z.string().trim().min(1).max(120),
  triggerMode: AgentSkillBindingTriggerModeSchema,
  priority: z.number().int().min(0).max(1000).default(100),
  enabled: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const AgentSkillUsageEventSchema = z.object({
  id: z.string().uuid(),
  skillId: z.string().uuid(),
  revisionId: z.string().uuid(),
  workflowThreadId: z.string().uuid().nullable().default(null),
  runId: z.string().uuid().nullable().default(null),
  attemptId: z.string().uuid().nullable().default(null),
  agentProfileId: z.string().trim().min(1),
  triggerMode: AgentSkillBindingTriggerModeSchema,
  triggerReason: z.string().trim().min(1).nullable().default(null),
  createdAt: z.string().datetime(),
});

export const CreateAgentSkillFileInputSchema = z.object({
  relativePath: z.string().trim().min(1).max(240),
  mediaType: z.string().trim().min(1).max(120).default("text/markdown"),
  contentText: z.string().max(64_000).nullable().default(null),
});

export const CreateAgentSkillBindingInputSchema = z.object({
  agentProfileId: z.string().trim().min(1).max(120),
  triggerMode: AgentSkillBindingTriggerModeSchema.default("manual"),
  priority: z.number().int().min(0).max(1000).default(100),
  enabled: z.boolean().default(true),
});

export const CreateAgentSkillInputSchema = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  displayName: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(600),
  skillMd: z.string().min(1).max(96_000),
  files: z.array(CreateAgentSkillFileInputSchema).default([]),
  bindings: z.array(CreateAgentSkillBindingInputSchema).default([]),
  scope: AgentSkillScopeSchema.default("project"),
  createdBy: z.string().trim().min(1).nullable().default(null),
});

export const ValidateAgentSkillInputSchema = z.object({
  skillMd: z.string().min(1).max(96_000),
  files: z.array(CreateAgentSkillFileInputSchema).default([]),
  bindingAgentProfileIds: z.array(z.string().trim().min(1)).default([]),
});

export const PublishAgentSkillInputSchema = z.object({
  expectedRevisionHash: z.string().trim().min(32),
  bindingUpdates: z.array(CreateAgentSkillBindingInputSchema).optional(),
});

export const UpdateAgentSkillBindingsInputSchema = z.object({
  bindings: z.array(CreateAgentSkillBindingInputSchema),
});

export const AgentSkillListQuerySchema = z.object({
  status: AgentSkillStatusSchema.optional(),
  sourceType: AgentSkillSourceTypeSchema.optional(),
  agentProfileId: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
});

export const AgentSkillSummarySchema = AgentSkillSchema.extend({
  activeRevision: AgentSkillRevisionSchema.nullable().default(null),
  bindings: z.array(AgentSkillBindingSchema).default([]),
  latestValidationReport: AgentSkillValidationReportSchema.nullable().default(null),
});

export const AgentSkillDetailSchema = AgentSkillSummarySchema.extend({
  revisions: z.array(AgentSkillRevisionSchema).default([]),
  files: z.array(AgentSkillFileSchema).default([]),
  validationReports: z.array(AgentSkillValidationReportSchema).default([]),
});

export const RuntimeAgentSkillSchema = z.object({
  skillId: z.string().uuid(),
  slug: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  revisionId: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  contentHash: z.string().trim().min(32),
  triggerMode: AgentSkillBindingTriggerModeSchema,
  agentProfileId: z.string().trim().min(1),
  skillMd: z.string().min(1),
  files: z.array(AgentSkillFileSchema).default([]),
});

export const AgentSkillsListResponseSchema = z.object({
  skills: z.array(AgentSkillSummarySchema),
});

export const AgentProfilesResponseSchema = z.object({
  profiles: z.array(AgentProfileSchema),
});

export const RuntimeAgentSkillsResponseSchema = z.object({
  skills: z.array(RuntimeAgentSkillSchema),
});

export const ValidateAgentSkillResponseSchema = z.object({
  validationReport: AgentSkillValidationReportSchema,
  contentHash: z.string().trim().min(32),
});

export const CreateAgentSkillResponseSchema = z.object({
  skill: AgentSkillSummarySchema,
  draftRevision: AgentSkillRevisionSchema,
  files: z.array(AgentSkillFileSchema),
  validationReport: AgentSkillValidationReportSchema,
  bindings: z.array(AgentSkillBindingSchema),
});

export const PublishAgentSkillResponseSchema = z.object({
  skill: AgentSkillSummarySchema,
  activeRevision: AgentSkillRevisionSchema,
  bindings: z.array(AgentSkillBindingSchema),
});

export const AgentSkillBindingsResponseSchema = z.object({
  bindings: z.array(AgentSkillBindingSchema),
});

export const AgentSkillSummaryResponseSchema = z.object({
  skill: AgentSkillSummarySchema,
});

export type AgentSkillSourceType = z.infer<typeof AgentSkillSourceTypeSchema>;
export type AgentSkillScope = z.infer<typeof AgentSkillScopeSchema>;
export type AgentSkillStatus = z.infer<typeof AgentSkillStatusSchema>;
export type AgentSkillRevisionStatus = z.infer<
  typeof AgentSkillRevisionStatusSchema
>;
export type AgentSkillValidationStatus = z.infer<
  typeof AgentSkillValidationStatusSchema
>;
export type AgentSkillBindingTriggerMode = z.infer<
  typeof AgentSkillBindingTriggerModeSchema
>;
export type AgentSkillFile = z.infer<typeof AgentSkillFileSchema>;
export type AgentSkillValidationIssue = z.infer<
  typeof AgentSkillValidationIssueSchema
>;
export type AgentSkillValidationCheck = z.infer<
  typeof AgentSkillValidationCheckSchema
>;
export type AgentSkillValidationReport = z.infer<
  typeof AgentSkillValidationReportSchema
>;
export type AgentSkillRevision = z.infer<typeof AgentSkillRevisionSchema>;
export type AgentSkill = z.infer<typeof AgentSkillSchema>;
export type AgentSkillBinding = z.infer<typeof AgentSkillBindingSchema>;
export type AgentSkillUsageEvent = z.infer<typeof AgentSkillUsageEventSchema>;
export type CreateAgentSkillInput = z.infer<typeof CreateAgentSkillInputSchema>;
export type CreateAgentSkillFileInput = z.infer<
  typeof CreateAgentSkillFileInputSchema
>;
export type CreateAgentSkillBindingInput = z.infer<
  typeof CreateAgentSkillBindingInputSchema
>;
export type ValidateAgentSkillInput = z.infer<
  typeof ValidateAgentSkillInputSchema
>;
export type PublishAgentSkillInput = z.infer<typeof PublishAgentSkillInputSchema>;
export type UpdateAgentSkillBindingsInput = z.infer<
  typeof UpdateAgentSkillBindingsInputSchema
>;
export type AgentSkillListQuery = z.infer<typeof AgentSkillListQuerySchema>;
export type AgentSkillSummary = z.infer<typeof AgentSkillSummarySchema>;
export type AgentSkillDetail = z.infer<typeof AgentSkillDetailSchema>;
export type RuntimeAgentSkill = z.infer<typeof RuntimeAgentSkillSchema>;
export type AgentSkillsListResponse = z.infer<
  typeof AgentSkillsListResponseSchema
>;
export type AgentProfilesResponse = z.infer<typeof AgentProfilesResponseSchema>;
export type RuntimeAgentSkillsResponse = z.infer<
  typeof RuntimeAgentSkillsResponseSchema
>;
export type ValidateAgentSkillResponse = z.infer<
  typeof ValidateAgentSkillResponseSchema
>;
export type CreateAgentSkillResponse = z.infer<
  typeof CreateAgentSkillResponseSchema
>;
export type PublishAgentSkillResponse = z.infer<
  typeof PublishAgentSkillResponseSchema
>;
export type AgentSkillBindingsResponse = z.infer<
  typeof AgentSkillBindingsResponseSchema
>;
export type AgentSkillSummaryResponse = z.infer<
  typeof AgentSkillSummaryResponseSchema
>;
