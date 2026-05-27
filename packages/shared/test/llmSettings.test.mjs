import assert from "node:assert/strict";
import test from "node:test";
import {
  LlmSettingsDraftSchema,
  LlmSettingsProfileSchema,
  LlmSettingsReferenceSchema,
  LlmSettingsSchema,
} from "../dist/entities/LlmSettings.js";

test("LlmSettingsSchema accepts supported provider settings", () => {
  const parsed = LlmSettingsSchema.parse({
    provider: "openrouter",
    model: "openai/gpt-5-mini",
    apiKey: " sk-test ",
  });

  assert.deepEqual(parsed, {
    provider: "openrouter",
    model: "openai/gpt-5-mini",
    apiKey: "sk-test",
  });
});

test("LlmSettingsDraftSchema supports redacted persistent settings", () => {
  const parsed = LlmSettingsDraftSchema.parse({
    provider: "openai",
    model: "gpt-5-mini",
    baseUrl: "https://api.openai.com/v1",
  });

  assert.equal(parsed.provider, "openai");
  assert.equal(parsed.persistenceMode, "persisted");
  assert.equal(parsed.apiKey, undefined);
});

test("LlmSettingsProfileSchema never requires raw API key", () => {
  const parsed = LlmSettingsProfileSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    provider: "groq",
    model: "llama-test",
    baseUrl: "https://api.groq.com/openai/v1",
    keyLast4: "test",
    keyFingerprint: "1234567890abcdef",
    validationStatus: "valid",
    createdAt: "2026-05-26T10:00:00.000Z",
    updatedAt: "2026-05-26T10:00:00.000Z",
  });

  assert.equal("apiKey" in parsed, false);
});

test("LlmSettingsReferenceSchema accepts profile and session settings", () => {
  const profileRef = LlmSettingsReferenceSchema.parse({
    profileId: "11111111-1111-4111-8111-111111111111",
  });
  const sessionRef = LlmSettingsReferenceSchema.parse({
    sessionSettings: {
      provider: "openrouter",
      model: "openai/gpt-test",
      apiKey: "sk-test",
    },
  });

  assert.equal(profileRef.profileId, "11111111-1111-4111-8111-111111111111");
  assert.equal(sessionRef.sessionSettings?.provider, "openrouter");
});

test("LlmSettingsSchema rejects unsupported providers", () => {
  assert.throws(
    () =>
      LlmSettingsSchema.parse({
        provider: "anthropic",
        model: "claude-test",
        apiKey: "secret",
      }),
    /Invalid enum value/
  );
});

test("LlmSettingsSchema requires model and API key", () => {
  assert.throws(
    () =>
      LlmSettingsSchema.parse({
        provider: "openai",
        model: "",
        apiKey: "secret",
      }),
    /String must contain at least 1 character/
  );

  assert.throws(
    () =>
      LlmSettingsSchema.parse({
        provider: "openai",
        model: "gpt-test",
        apiKey: "",
      }),
    /String must contain at least 1 character/
  );
});
