import type { LlmSettings } from "@u-build/shared";
import type { z } from "zod";

export type LlmModelRole = "spec" | "front" | "qa" | "curator" | "horus";

export interface LlmModelDefaults {
  temperature?: number;
  maxTokens?: number;
}

export interface StructuredLlmModel<TOutput> {
  invoke(input: unknown, options?: { signal?: AbortSignal }): Promise<TOutput>;
}

export interface ChatLlmModel<TOutput = unknown> {
  invoke(input: unknown, options?: { signal?: AbortSignal }): Promise<TOutput>;
}

export interface CreateStructuredLlmModelInput<TOutput> {
  role: LlmModelRole;
  schema: z.ZodType<TOutput>;
  defaults?: LlmModelDefaults;
  llmSettings?: LlmSettings;
}

export interface CreateChatLlmModelInput {
  role: LlmModelRole;
  defaults?: LlmModelDefaults;
  llmSettings?: LlmSettings;
}

export interface LlmModelProvider {
  createStructuredModel<TOutput>(
    input: CreateStructuredLlmModelInput<TOutput>
  ): StructuredLlmModel<TOutput>;

  createChat<TOutput = unknown>(
    input: CreateChatLlmModelInput
  ): ChatLlmModel<TOutput>;
}
