import {
  LlmSettingsReferenceSchema,
  LlmSettingsSchema,
  type LlmSettings,
  type LlmSettingsReference,
} from "@u-build/shared";
import type { LlmCredentialStore } from "./LlmCredentialStore.js";

export class LlmSettingsResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmSettingsResolutionError";
  }
}

export class LlmSettingsResolver {
  constructor(private readonly credentials: LlmCredentialStore) {}

  async resolveReference(
    reference?: LlmSettingsReference,
    legacySettings?: LlmSettings
  ): Promise<LlmSettings | undefined> {
    if (legacySettings) return LlmSettingsSchema.parse(legacySettings);

    const parsed = reference ? LlmSettingsReferenceSchema.parse(reference) : undefined;
    if (parsed?.sessionSettings) {
      const session = parsed.sessionSettings;
      if (!session.apiKey) {
        throw new LlmSettingsResolutionError(
          "Session LLM settings require an API key."
        );
      }
      return LlmSettingsSchema.parse({
        provider: session.provider,
        model: session.model,
        apiKey: session.apiKey,
        ...(session.baseUrl ? { baseUrl: session.baseUrl } : {}),
      });
    }

    if (parsed?.profileId) {
      return (await this.credentials.resolveProfile(parsed.profileId)).settings;
    }

    return (await this.credentials.resolveDefaultProfile())?.settings;
  }
}
