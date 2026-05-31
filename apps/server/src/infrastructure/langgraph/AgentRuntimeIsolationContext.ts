import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentProfileId } from "@u-build/shared";

export interface AgentRuntimeIsolationContext {
  agentProfileId: AgentProfileId;
  attempt: number;
  signal: AbortSignal;
}

const agentRuntimeIsolationStorage =
  new AsyncLocalStorage<AgentRuntimeIsolationContext>();

export function runWithAgentRuntimeIsolationContext<T>(
  context: AgentRuntimeIsolationContext,
  callback: () => Promise<T>
): Promise<T> {
  return agentRuntimeIsolationStorage.run(context, callback);
}

export function getCurrentAgentRuntimeIsolationContext():
  | AgentRuntimeIsolationContext
  | undefined {
  return agentRuntimeIsolationStorage.getStore();
}

export function getCurrentAgentAbortSignal(): AbortSignal | undefined {
  return getCurrentAgentRuntimeIsolationContext()?.signal;
}
