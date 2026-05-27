import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FileLlmCredentialStore } from "../dist/infrastructure/llm/LlmCredentialStore.js";
import { LlmSettingsResolver } from "../dist/infrastructure/llm/LlmSettingsResolver.js";

test("FileLlmCredentialStore persists redacted profile and encrypted secret", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "horus-llm-"));
  try {
    const store = new FileLlmCredentialStore({
      HORUS_DATA_DIR: dir,
      HORUS_SECRET_KEY: "test-secret",
    });

    const profile = await store.saveDefaultProfile({
      provider: "openrouter",
      model: "openai/gpt-test",
      apiKey: "sk-test-secret",
      validationStatus: "valid",
      validationMessage: "ok",
      validatedAt: "2026-05-26T10:00:00.000Z",
    });

    assert.equal(profile.provider, "openrouter");
    assert.equal(profile.keyLast4, "cret");
    assert.equal("apiKey" in profile, false);

    const profilesRaw = await readFile(
      path.join(dir, "llm", "profiles.json"),
      "utf8"
    );
    const secretsRaw = await readFile(
      path.join(dir, "llm", "secrets.json"),
      "utf8"
    );
    assert.equal(profilesRaw.includes("sk-test-secret"), false);
    assert.equal(secretsRaw.includes("sk-test-secret"), false);

    const resolved = await store.resolveDefaultProfile();
    assert.equal(resolved?.settings.apiKey, "sk-test-secret");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("LlmSettingsResolver prefers session settings over persisted profile", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "horus-llm-"));
  try {
    const store = new FileLlmCredentialStore({
      HORUS_DATA_DIR: dir,
      HORUS_SECRET_KEY: "test-secret",
    });
    await store.saveDefaultProfile({
      provider: "openai",
      model: "gpt-default",
      apiKey: "sk-default",
    });
    const resolver = new LlmSettingsResolver(store);

    const resolved = await resolver.resolveReference({
      sessionSettings: {
        provider: "groq",
        model: "llama-test",
        apiKey: "gsk_session",
      },
    });

    assert.deepEqual(resolved, {
      provider: "groq",
      model: "llama-test",
      apiKey: "gsk_session",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
