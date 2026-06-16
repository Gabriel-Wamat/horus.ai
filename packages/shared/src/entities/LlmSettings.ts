import { z } from "zod";

export const LlmProviderSchema = z.enum(["openai", "openrouter", "groq"]);

export const LlmSettingsSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().min(1),
  baseUrl: z.string().trim().url().optional(),
});

export const LlmProviderCapabilitySchema = z.object({
  provider: LlmProviderSchema,
  label: z.string().trim().min(1),
  defaultBaseUrl: z.string().trim().url(),
  supportsStructuredOutput: z.boolean(),
  supportsResponsesApi: z.boolean(),
  defaultModels: z.array(z.string().trim().min(1)),
});

export const LlmSettingsDraftSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().min(1).optional(),
  baseUrl: z.string().trim().url().optional(),
  persistenceMode: z.enum(["persisted", "session"]).default("persisted"),
});

export const LlmSettingsProfileSchema = z.object({
  id: z.string().uuid(),
  provider: LlmProviderSchema,
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().url(),
  keyLast4: z.string().min(4).max(8).optional(),
  keyFingerprint: z.string().min(12).optional(),
  validationStatus: z.enum(["untested", "valid", "invalid"]),
  validationMessage: z.string().optional(),
  validatedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const LlmSettingsReferenceSchema = z.object({
  profileId: z.string().uuid().optional(),
  sessionSettings: LlmSettingsDraftSchema.optional(),
});

export const LlmProvidersResponseSchema = z.object({
  providers: z.array(LlmProviderCapabilitySchema),
});

export const LlmSettingsNullableProfileResponseSchema = z.object({
  profile: LlmSettingsProfileSchema.nullable(),
});

export const LlmSettingsProfileResponseSchema = z.object({
  profile: LlmSettingsProfileSchema,
});

export const LlmSettingsTestResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string().trim().min(1),
  testedAt: z.string().datetime(),
});

export const LlmSettingsResolveResponseSchema = z.object({
  resolved: z.boolean(),
  provider: LlmProviderSchema.optional(),
  model: z.string().trim().min(1).max(200).optional(),
  baseUrl: z.string().trim().url().optional(),
});

export type LlmProvider = z.infer<typeof LlmProviderSchema>;
export type LlmSettings = z.infer<typeof LlmSettingsSchema>;
export type LlmProviderCapability = z.infer<typeof LlmProviderCapabilitySchema>;
export type LlmSettingsDraft = z.infer<typeof LlmSettingsDraftSchema>;
export type LlmSettingsProfile = z.infer<typeof LlmSettingsProfileSchema>;
export type LlmSettingsReference = z.infer<typeof LlmSettingsReferenceSchema>;
export type LlmProvidersResponse = z.infer<typeof LlmProvidersResponseSchema>;
export type LlmSettingsNullableProfileResponse = z.infer<
  typeof LlmSettingsNullableProfileResponseSchema
>;
export type LlmSettingsProfileResponse = z.infer<
  typeof LlmSettingsProfileResponseSchema
>;
export type LlmSettingsTestResponse = z.infer<
  typeof LlmSettingsTestResponseSchema
>;
export type LlmSettingsResolveResponse = z.infer<
  typeof LlmSettingsResolveResponseSchema
>;
