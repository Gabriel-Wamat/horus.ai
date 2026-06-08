#!/usr/bin/env node

import assert from "node:assert/strict";
import { FileLlmCredentialStore } from "../apps/server/dist/infrastructure/llm/LlmCredentialStore.js";
import { createChatModel } from "../apps/server/dist/infrastructure/llm/createChatModel.js";
import {
  getDefaultBaseUrl,
  getDefaultModel,
  parseLlmProvider,
  resolveAgentModelConfig,
} from "../apps/server/dist/infrastructure/llm/providerConfig.js";

const providers = [
  {
    provider: "openai",
    keyEnv: "OPENAI_API_KEY",
    key: "sk-openai-test-key",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
  },
  {
    provider: "openrouter",
    keyEnv: "OPENROUTER_API_KEY",
    key: "sk-or-test-key",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5-mini",
  },
  {
    provider: "groq",
    keyEnv: "GROQ_API_KEY",
    key: "gsk-test-key",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
];

for (const item of providers) {
  assert.equal(parseLlmProvider(item.provider), item.provider);
  assert.equal(getDefaultBaseUrl(item.provider), item.baseUrl);
  assert.equal(getDefaultModel(item.provider), item.model);

  const config = resolveAgentModelConfig("horus", { maxTokens: 32 }, {
    LLM_PROVIDER: item.provider,
    [item.keyEnv]: item.key,
  });
  assert.deepEqual(config, {
    provider: item.provider,
    model: item.model,
    apiKey: item.key,
    baseUrl: item.baseUrl,
    maxTokens: 32,
  });

  const overrideConfig = resolveAgentModelConfig("qa", {}, {
    QA_AGENT_PROVIDER: item.provider,
    QA_AGENT_MODEL: `${item.model}-override`,
    [item.keyEnv]: item.key,
  });
  assert.equal(overrideConfig.provider, item.provider);
  assert.equal(overrideConfig.model, `${item.model}-override`);
  assert.equal(overrideConfig.apiKey, item.key);

  const runtimeConfig = resolveAgentModelConfig(
    "front",
    { temperature: 0.1 },
    {},
    {
      provider: item.provider,
      model: item.model,
      apiKey: item.key,
    }
  );
  assert.equal(runtimeConfig.provider, item.provider);
  assert.equal(runtimeConfig.model, item.model);
  assert.equal(runtimeConfig.apiKey, item.key);
  assert.equal(runtimeConfig.baseUrl, item.baseUrl);

  const model = createChatModel(
    "horus",
    { temperature: 0.1, maxTokens: 32 },
    {
      provider: item.provider,
      model: item.model,
      apiKey: item.key,
    },
    {}
  );
  assert.equal(typeof model.invoke, "function");
  assert.equal(typeof model.withStructuredOutput, "function");

  assertMissingProviderKey(item);
}

const credentialStore = new FileLlmCredentialStore({}, process.cwd());
const capabilities = credentialStore.listProviders();
assert.deepEqual(
  capabilities.map((item) => item.provider),
  providers.map((item) => item.provider)
);
for (const item of providers) {
  const capability = capabilities.find(
    (candidate) => candidate.provider === item.provider
  );
  assert.ok(capability);
  assert.equal(capability.defaultBaseUrl, item.baseUrl);
  assert.equal(capability.defaultModels[0], item.model);
}

console.log("LLM provider smoke passed for openai, openrouter, groq.");

function assertMissingProviderKey(item) {
  try {
    resolveAgentModelConfig("horus", {}, {
      LLM_PROVIDER: item.provider,
      OPENAI_API_KEY: item.provider === "openai" ? undefined : "wrong-key",
    });
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes(`requires ${item.keyEnv}`));
    return;
  }
  throw new Error(`Expected missing ${item.keyEnv} to fail.`);
}
