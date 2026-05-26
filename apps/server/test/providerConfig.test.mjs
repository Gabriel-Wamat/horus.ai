import assert from "node:assert/strict";
import test from "node:test";
import {
  getDefaultBaseUrl,
  parseLlmProvider,
  resolveAgentModelConfig,
} from "../dist/infrastructure/llm/providerConfig.js";

test("parseLlmProvider accepts supported providers", () => {
  assert.equal(parseLlmProvider("openai"), "openai");
  assert.equal(parseLlmProvider("OpenRouter"), "openrouter");
  assert.equal(parseLlmProvider(" GROQ "), "groq");
});

test("parseLlmProvider rejects unsupported providers", () => {
  assert.throws(
    () => parseLlmProvider("anthropic"),
    /Expected one of: openai, openrouter, groq/
  );
});

test("resolveAgentModelConfig applies global defaults", () => {
  const config = resolveAgentModelConfig(
    "spec",
    { temperature: 0.2, maxTokens: 1000 },
    {
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-test",
      OPENAI_API_KEY: "secret",
    }
  );

  assert.deepEqual(config, {
    provider: "openai",
    model: "gpt-test",
    apiKey: "secret",
    baseUrl: "https://api.openai.com/v1",
    temperature: 0.2,
    maxTokens: 1000,
  });
});

test("resolveAgentModelConfig applies per-agent overrides", () => {
  const config = resolveAgentModelConfig(
    "qa",
    { temperature: 0.1 },
    {
      LLM_PROVIDER: "openai",
      LLM_MODEL: "global-model",
      OPENAI_API_KEY: "openai-key",
      QA_AGENT_PROVIDER: "groq",
      QA_AGENT_MODEL: "groq-model",
      QA_AGENT_TEMPERATURE: "0.8",
      QA_AGENT_MAX_TOKENS: "2048",
      GROQ_API_KEY: "groq-key",
    }
  );

  assert.equal(config.provider, "groq");
  assert.equal(config.model, "groq-model");
  assert.equal(config.apiKey, "groq-key");
  assert.equal(config.baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(config.temperature, 0.8);
  assert.equal(config.maxTokens, 2048);
});

test("resolveAgentModelConfig validates provider-specific API keys", () => {
  assert.throws(
    () =>
      resolveAgentModelConfig("front", {}, {
        LLM_PROVIDER: "openrouter",
        LLM_MODEL: "openai/gpt-test",
        OPENAI_API_KEY: "wrong-key",
      }),
    /requires OPENROUTER_API_KEY/
  );
});

test("resolveAgentModelConfig supports provider base URL overrides", () => {
  const config = resolveAgentModelConfig("curator", {}, {
    LLM_PROVIDER: "openrouter",
    LLM_MODEL: "openai/gpt-test",
    OPENROUTER_API_KEY: "secret",
    OPENROUTER_BASE_URL: "https://example.test/api/v1",
  });

  assert.equal(config.baseUrl, "https://example.test/api/v1");
});

test("resolveAgentModelConfig prefers runtime settings over env provider credentials", () => {
  const config = resolveAgentModelConfig(
    "front",
    { temperature: 0.3 },
    {
      LLM_PROVIDER: "openai",
      LLM_MODEL: "env-model",
      OPENAI_API_KEY: "env-key",
    },
    {
      provider: "groq",
      model: "runtime-model",
      apiKey: "runtime-key",
    }
  );

  assert.deepEqual(config, {
    provider: "groq",
    model: "runtime-model",
    apiKey: "runtime-key",
    baseUrl: "https://api.groq.com/openai/v1",
    temperature: 0.3,
  });
});

test("getDefaultBaseUrl returns provider defaults", () => {
  assert.equal(getDefaultBaseUrl("openai"), "https://api.openai.com/v1");
  assert.equal(getDefaultBaseUrl("openrouter"), "https://openrouter.ai/api/v1");
  assert.equal(getDefaultBaseUrl("groq"), "https://api.groq.com/openai/v1");
});
