import { z } from "zod";

export const ComponentSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["ui", "api", "service", "model", "utility"]),
  description: z.string(),
  dependencies: z.array(z.string()).default([]),
  props: z.record(z.string(), z.unknown()).optional(),
});

export const ApiEndpointSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().startsWith("/"),
  description: z.string(),
  requestSchema: z.record(z.string(), z.unknown()).optional(),
  responseSchema: z.record(z.string(), z.unknown()).optional(),
});

export const VisualColorPolicySchema = z.object({
  background: z.array(z.string().trim().min(1)).default([]),
  surface: z.array(z.string().trim().min(1)).default([]),
  text: z.array(z.string().trim().min(1)).default([]),
  accent: z.array(z.string().trim().min(1)).default([]),
  forbidden: z.array(z.string().trim().min(1)).default([]),
  usageRules: z.array(z.string().trim().min(1)).default([]),
});

export const VisualTypographySchema = z.object({
  families: z.array(z.string().trim().min(1)).default([]),
  scaleRules: z.array(z.string().trim().min(1)).default([]),
});

export const VisualSpacingAndShapeSchema = z.object({
  spacingScale: z.array(z.string().trim().min(1)).default([]),
  radiusRules: z.array(z.string().trim().min(1)).default([]),
  strokeRules: z.array(z.string().trim().min(1)).default([]),
  shadowRules: z.array(z.string().trim().min(1)).default([]),
});

export const VisualComponentPolicySchema = z.object({
  preferExistingComponents: z.boolean().default(true),
  allowedLibraries: z.array(z.string().trim().min(1)).default([]),
  requiredPatterns: z.array(z.string().trim().min(1)).default([]),
  forbiddenPatterns: z.array(z.string().trim().min(1)).default([]),
});

export const VisualStateSchema = z.enum([
  "default",
  "loading",
  "empty",
  "error",
  "success",
  "selected",
  "focus",
  "disabled",
]);

export const VisualContractSchema = z.object({
  mode: z
    .enum(["preserve_identity", "guided_redesign", "blank_project"])
    .default("preserve_identity"),
  designSource: z
    .enum(["project_files", "user_reference", "generated_default", "mixed"])
    .default("project_files"),
  layoutArchetype: z.string().trim().min(1).max(120),
  density: z.enum(["compact", "balanced", "spacious"]).default("balanced"),
  tone: z.string().trim().min(1).max(240),
  colorPolicy: VisualColorPolicySchema.default({}),
  typography: VisualTypographySchema.default({}),
  spacingAndShape: VisualSpacingAndShapeSchema.default({}),
  componentPolicy: VisualComponentPolicySchema.default({}),
  states: z.array(VisualStateSchema).default([]),
  responsiveRules: z.array(z.string().trim().min(1)).default([]),
  accessibilityRules: z.array(z.string().trim().min(1)).default([]),
  antiPatterns: z.array(z.string().trim().min(1)).default([]),
  referenceFiles: z.array(z.string().trim().min(1)).default([]),
});

export const DesignContextComponentSchema = z.object({
  name: z.string().trim().min(1),
  path: z.string().trim().min(1).optional(),
  purpose: z.string().trim().min(1).optional(),
});

export const DesignContextBundleSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  sourceFiles: z.array(z.string().trim().min(1)),
  tokens: z.record(z.string(), z.string()).default({}),
  components: z.array(DesignContextComponentSchema).default([]),
  visualSummary: z.string().trim().min(1),
  constraints: z.array(z.string().trim().min(1)).default([]),
  antiPatterns: z.array(z.string().trim().min(1)).default([]),
  warnings: z.array(z.string().trim().min(1)).default([]),
  generatedAt: z.string().datetime(),
});

export const SpecSchema = z.object({
  id: z.string().uuid(),
  userStoryId: z.string().uuid(),
  version: z.number().int().min(1).default(1),
  summary: z.string().min(1),
  technicalApproach: z.string().min(1),
  components: z.array(ComponentSchema).min(1),
  apiEndpoints: z.array(ApiEndpointSchema).default([]),
  dataModels: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).min(1),
  visualContract: VisualContractSchema.optional(),
  generatedAt: z.string().datetime(),
  approvedAt: z.string().datetime().optional(),
  approvedBy: z.enum(["human", "auto"]).optional(),
});

export type Spec = z.infer<typeof SpecSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>;
export type VisualContract = z.infer<typeof VisualContractSchema>;
export type DesignContextComponent = z.infer<
  typeof DesignContextComponentSchema
>;
export type DesignContextBundle = z.infer<typeof DesignContextBundleSchema>;
