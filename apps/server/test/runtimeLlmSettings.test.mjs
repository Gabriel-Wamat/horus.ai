import assert from "node:assert/strict";
import test from "node:test";
import {
  clearRuntimeLlmSettings,
  getRuntimeLlmSettings,
  setRuntimeLlmSettings,
} from "../dist/infrastructure/llm/runtimeLlmSettings.js";

test("runtime LLM settings are scoped by thread and clearable", () => {
  const threadId = "thread-1";
  const settings = {
    provider: "groq",
    model: "llama-test",
    apiKey: "secret-key",
  };

  setRuntimeLlmSettings(threadId, settings);

  assert.deepEqual(getRuntimeLlmSettings(threadId), settings);
  assert.equal(getRuntimeLlmSettings("thread-2"), undefined);

  clearRuntimeLlmSettings(threadId);
  assert.equal(getRuntimeLlmSettings(threadId), undefined);
});
