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

export const DesignSurfaceTypeSchema = z.enum([
  "crud",
  "dashboard",
  "calendar",
  "kanban",
  "editor-canvas",
  "chat-preview",
  "workflow-map",
  "auth",
  "onboarding",
  "settings",
  "file-browser",
  "report",
  "checkout",
  "media-gallery",
  "form",
  "search-results",
  "detail-view",
  "data-table",
  "custom",
]);

export const DesignIntentSchema = z.object({
  primaryUserGoal: z.string().trim().min(1),
  userMentalModel: z.string().trim().min(1),
  successOutcome: z.string().trim().min(1),
  nonGoals: z.array(z.string().trim().min(1)).default([]),
});

export const DesignRegionSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  priority: z.enum(["primary", "secondary", "supporting"]),
  contents: z.array(z.string().trim().min(1)).default([]),
});

export const DesignInformationArchitectureSchema = z.object({
  regions: z.array(DesignRegionSchema).min(1),
  hierarchy: z.array(z.string().trim().min(1)).min(1),
  navigationModel: z.string().trim().min(1),
  primaryFlow: z.array(z.string().trim().min(1)).min(1),
});

export const DesignComponentInventoryItemSchema = z.object({
  name: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  variants: z.array(z.string().trim().min(1)).default([]),
  useWhen: z.string().trim().min(1),
});

export const DesignStateRequirementSchema = z.object({
  trigger: z.string().trim().min(1),
  expectedUi: z.string().trim().min(1),
  validationSignal: z.string().trim().min(1),
});

export const DesignStateMatrixSchema = z.object({
  empty: z.array(DesignStateRequirementSchema).default([]),
  loading: z.array(DesignStateRequirementSchema).default([]),
  success: z.array(DesignStateRequirementSchema).default([]),
  error: z.array(DesignStateRequirementSchema).default([]),
  selected: z.array(DesignStateRequirementSchema).default([]),
  disabled: z.array(DesignStateRequirementSchema).default([]),
  validation: z.array(DesignStateRequirementSchema).default([]),
  overflow: z.array(DesignStateRequirementSchema).default([]),
  mobile: z.array(DesignStateRequirementSchema).default([]),
});

export const DesignSystemBindingSchema = z.object({
  tokens: z.array(z.string().trim().min(1)).default([]),
  components: z.array(z.string().trim().min(1)).default([]),
  allowedLibraries: z.array(z.string().trim().min(1)).default([]),
  imports: z.array(z.string().trim().min(1)).default([]),
  antiPatterns: z.array(z.string().trim().min(1)).default([]),
});

export const DesignColorRolesSchema = z.object({
  background: z.array(z.string().trim().min(1)).default([]),
  surface: z.array(z.string().trim().min(1)).default([]),
  text: z.array(z.string().trim().min(1)).default([]),
  accent: z.array(z.string().trim().min(1)).default([]),
  semanticStatus: z.array(z.string().trim().min(1)).default([]),
  categoryUtility: z.array(z.string().trim().min(1)).default([]),
});

export const DesignVisualStrategySchema = z.object({
  colorRoles: DesignColorRolesSchema.default({}),
  typography: z.array(z.string().trim().min(1)).default([]),
  density: z.string().trim().min(1),
  radius: z.array(z.string().trim().min(1)).default([]),
  shadow: z.array(z.string().trim().min(1)).default([]),
  motion: z.array(z.string().trim().min(1)).default([]),
  domainRationale: z.string().trim().min(1),
});

export const DesignBriefSchema = z.object({
  surfaceType: DesignSurfaceTypeSchema,
  userIntent: DesignIntentSchema,
  informationArchitecture: DesignInformationArchitectureSchema,
  componentInventory: z.array(DesignComponentInventoryItemSchema).min(1),
  stateMatrix: DesignStateMatrixSchema.default({}),
  designSystemBinding: DesignSystemBindingSchema.default({}),
  visualStrategy: DesignVisualStrategySchema,
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
  designBrief: DesignBriefSchema.optional(),
  generatedAt: z.string().datetime(),
  approvedAt: z.string().datetime().optional(),
  approvedBy: z.enum(["human", "auto"]).optional(),
});

export type Spec = z.infer<typeof SpecSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>;
export type VisualContract = z.infer<typeof VisualContractSchema>;
export type DesignSurfaceType = z.infer<typeof DesignSurfaceTypeSchema>;
export type DesignBrief = z.infer<typeof DesignBriefSchema>;
export type DesignContextComponent = z.infer<
  typeof DesignContextComponentSchema
>;
export type DesignContextBundle = z.infer<typeof DesignContextBundleSchema>;
