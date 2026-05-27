import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOpenRouter } from "@langchain/openrouter";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LlmSettings } from "@u-build/shared";
import {
  resolveAgentModelConfig,
  type AgentModelDefaults,
  type AgentModelConfig,
  type AgentRole,
} from "./providerConfig.js";

type Env = Record<string, string | undefined>;

interface ChatModelCommonFields {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export function createChatModel(
  role: AgentRole,
  defaults: AgentModelDefaults = {},
  runtimeSettings?: LlmSettings,
  env: Env = process.env
): BaseChatModel {
  const config = resolveAgentModelConfig(
    role,
    defaults,
    env,
    runtimeSettings
  );
  const common = getCommonFields(config);

  switch (config.provider) {
    case "openai":
      return new ChatOpenAI({
        ...common,
        apiKey: config.apiKey,
        configuration: { baseURL: config.baseUrl },
      });

    case "openrouter":
      return new ChatOpenRouter({
        ...common,
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        siteName: "Horus.AI",
      });

    case "groq":
      return new ChatGroq({
        ...common,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
      });
  }
}

function getCommonFields(config: AgentModelConfig): ChatModelCommonFields {
  return {
    model: config.model,
    ...(config.temperature !== undefined && supportsCustomTemperature(config)
      ? { temperature: config.temperature }
      : {}),
    ...(config.maxTokens !== undefined ? { maxTokens: config.maxTokens } : {}),
  };
}

function supportsCustomTemperature(config: AgentModelConfig): boolean {
  if (config.provider !== "openai") return true;
  return !config.model.toLowerCase().startsWith("gpt-5");
}
