import type { LlmSettings } from "@u-build/shared";

export interface RuntimeLlmSettingsStore {
  set(threadId: string, settings: LlmSettings): void;
  clear(threadId: string): void;
}
