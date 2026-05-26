import type { LlmSettings } from "@u-build/shared";

const runtimeSettingsByThread = new Map<string, LlmSettings>();

export function setRuntimeLlmSettings(
  threadId: string,
  settings: LlmSettings
): void {
  runtimeSettingsByThread.set(threadId, settings);
}

export function getRuntimeLlmSettings(
  threadId: string
): LlmSettings | undefined {
  return runtimeSettingsByThread.get(threadId);
}

export function clearRuntimeLlmSettings(threadId: string): void {
  runtimeSettingsByThread.delete(threadId);
}
