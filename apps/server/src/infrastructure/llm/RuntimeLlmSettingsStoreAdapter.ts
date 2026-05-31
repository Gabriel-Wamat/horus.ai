import type { RuntimeLlmSettingsStore } from "../../domain/ports/RuntimeLlmSettingsStore.js";
import type { LlmSettings } from "@u-build/shared";
import {
  clearRuntimeLlmSettings,
  setRuntimeLlmSettings,
} from "./runtimeLlmSettings.js";

export class RuntimeLlmSettingsStoreAdapter implements RuntimeLlmSettingsStore {
  set(threadId: string, settings: LlmSettings): void {
    setRuntimeLlmSettings(threadId, settings);
  }

  clear(threadId: string): void {
    clearRuntimeLlmSettings(threadId);
  }
}
