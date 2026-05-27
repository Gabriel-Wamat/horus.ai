import type { LlmSettings } from "@u-build/shared";

export type LlmProvider = "openai" | "openrouter" | "groq";
export type AgentRole = "spec" | "front" | "qa" | "curator" | "horus";

export interface AgentModelDefaults {
  temperature?: number;
  maxTokens?: number;
}

export interface AgentModelConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature?: number;
  maxTokens?: number;
}

export class LlmProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmProviderConfigError";
  }
}

type Env = Record<string, string | undefined>;

const PROVIDERS = ["openai", "openrouter", "groq"] as const;

const PROVIDER_KEY_ENV: Record<LlmProvider, string> = {
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
};

const PROVIDER_BASE_URL_ENV: Record<LlmProvider, string> = {
  openai: "OPENAI_BASE_URL",
  openrouter: "OPENROUTER_BASE_URL",
  groq: "GROQ_BASE_URL",
};

const DEFAULT_BASE_URL: Record<LlmProvider, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
};

const ROLE_ENV_PREFIX: Record<AgentRole, string> = {
  spec: "SPEC_AGENT",
  front: "FRONT_AGENT",
  qa: "QA_AGENT",
  curator: "CURATOR_AGENT",
  horus: "HORUS_AGENT",
};

export function parseLlmProvider(value: string | undefined): LlmProvider {
  const normalized = value?.trim().toLowerCase();
  if (isLlmProvider(normalized)) return normalized;

  const received = value === undefined || value.trim() === "" ? "missing" : `"${value}"`;
  throw new LlmProviderConfigError(
    `Unsupported or missing LLM provider ${received}. Expected one of: ${PROVIDERS.join(", ")}.`
  );
}

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === "string" && PROVIDERS.includes(value as LlmProvider);
}

export function resolveAgentModelConfig(
  role: AgentRole,
  defaults: AgentModelDefaults = {},
  env: Env = process.env,
  runtimeSettings?: LlmSettings
): AgentModelConfig {
  const prefix = ROLE_ENV_PREFIX[role];
  const provider = parseLlmProvider(
    runtimeSettings?.provider ?? env[`${prefix}_PROVIDER`] ?? env["LLM_PROVIDER"]
  );

  const model = firstNonEmpty(
    runtimeSettings?.model,
    env[`${prefix}_MODEL`],
    env["LLM_MODEL"]
  );
  if (!model) {
    throw new LlmProviderConfigError(
      `LLM model is required for agent "${role}". Set ${prefix}_MODEL or LLM_MODEL.`
    );
  }

  const keyEnv = PROVIDER_KEY_ENV[provider];
  const apiKey = firstNonEmpty(runtimeSettings?.apiKey, env[keyEnv]);
  if (!apiKey) {
    throw new LlmProviderConfigError(
      `LLM provider "${provider}" requires ${keyEnv}.`
    );
  }

  const temperature =
    parseOptionalNumber(env[`${prefix}_TEMPERATURE`], `${prefix}_TEMPERATURE`) ??
    defaults.temperature;
  const maxTokens =
    parseOptionalNumber(env[`${prefix}_MAX_TOKENS`], `${prefix}_MAX_TOKENS`) ??
    defaults.maxTokens;

  return {
    provider,
    model,
    apiKey,
    baseUrl:
      firstNonEmpty(runtimeSettings?.baseUrl, env[PROVIDER_BASE_URL_ENV[provider]]) ??
      DEFAULT_BASE_URL[provider],
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  };
}

export function getDefaultBaseUrl(provider: LlmProvider): string {
  return DEFAULT_BASE_URL[provider];
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function parseOptionalNumber(
  value: string | undefined,
  envName: string
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new LlmProviderConfigError(`${envName} must be a finite number.`);
  }
  return parsed;
}
