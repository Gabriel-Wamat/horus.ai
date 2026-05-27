import assert from "node:assert/strict";
import test from "node:test";
import { LlmSettingsSchema } from "../dist/entities/LlmSettings.js";

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

test("LlmSettingsSchema rejects unsupported providers", () => {
  assert.throws(
    () =>
      LlmSettingsSchema.parse({
        provider: "anthropic",
        model: "unsupported-model",
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
