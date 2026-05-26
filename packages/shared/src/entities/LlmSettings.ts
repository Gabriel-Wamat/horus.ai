import { z } from "zod";

export const LlmProviderSchema = z.enum(["openai", "openrouter", "groq"]);

export const LlmSettingsSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().min(1),
});

export type LlmProvider = z.infer<typeof LlmProviderSchema>;
export type LlmSettings = z.infer<typeof LlmSettingsSchema>;
