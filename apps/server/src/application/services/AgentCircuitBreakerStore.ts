import type { AgentProfileId } from "@u-build/shared";

export interface AgentCircuitState {
  failureCount: number;
  openedAtMs: number | null;
}

export interface AgentCircuitBreakerStore {
  get(agentProfileId: AgentProfileId): Promise<AgentCircuitState | undefined>;
  set(
    agentProfileId: AgentProfileId,
    state: AgentCircuitState
  ): Promise<void>;
  clear(agentProfileId: AgentProfileId): Promise<void>;
}

export class InMemoryAgentCircuitBreakerStore
  implements AgentCircuitBreakerStore
{
  private readonly circuits = new Map<AgentProfileId, AgentCircuitState>();

  async get(
    agentProfileId: AgentProfileId
  ): Promise<AgentCircuitState | undefined> {
    const state = this.circuits.get(agentProfileId);
    return state ? { ...state } : undefined;
  }

  async set(
    agentProfileId: AgentProfileId,
    state: AgentCircuitState
  ): Promise<void> {
    this.circuits.set(agentProfileId, { ...state });
  }

  async clear(agentProfileId: AgentProfileId): Promise<void> {
    this.circuits.delete(agentProfileId);
  }
}
