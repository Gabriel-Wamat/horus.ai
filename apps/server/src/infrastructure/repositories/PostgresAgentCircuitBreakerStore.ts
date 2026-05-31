import {
  AgentProfileIdSchema,
  type AgentProfileId,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import type {
  AgentCircuitBreakerStore,
  AgentCircuitState,
} from "../../application/services/AgentCircuitBreakerStore.js";

interface AgentCircuitBreakerRow {
  agent_profile_id: string;
  failure_count: number;
  opened_at_ms: string | number | null;
}

export class PostgresAgentCircuitBreakerStore
  implements AgentCircuitBreakerStore
{
  constructor(private readonly pool: PgPool) {}

  async get(
    agentProfileId: AgentProfileId
  ): Promise<AgentCircuitState | undefined> {
    const profileId = AgentProfileIdSchema.parse(agentProfileId);
    const result = await this.pool.query<AgentCircuitBreakerRow>(
      `
      SELECT agent_profile_id, failure_count, opened_at_ms
      FROM agent_circuit_breaker_states
      WHERE agent_profile_id = $1
      `,
      [profileId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      failureCount: row.failure_count,
      openedAtMs:
        row.opened_at_ms === null ? null : Number(row.opened_at_ms),
    };
  }

  async set(
    agentProfileId: AgentProfileId,
    state: AgentCircuitState
  ): Promise<void> {
    const profileId = AgentProfileIdSchema.parse(agentProfileId);
    await this.pool.query(
      `
      INSERT INTO agent_circuit_breaker_states (
        agent_profile_id, failure_count, opened_at_ms, updated_at
      )
      VALUES ($1, $2, $3, now())
      ON CONFLICT (agent_profile_id) DO UPDATE SET
        failure_count = EXCLUDED.failure_count,
        opened_at_ms = EXCLUDED.opened_at_ms,
        updated_at = now()
      `,
      [profileId, state.failureCount, state.openedAtMs]
    );
  }

  async clear(agentProfileId: AgentProfileId): Promise<void> {
    const profileId = AgentProfileIdSchema.parse(agentProfileId);
    await this.pool.query(
      "DELETE FROM agent_circuit_breaker_states WHERE agent_profile_id = $1",
      [profileId]
    );
  }
}
