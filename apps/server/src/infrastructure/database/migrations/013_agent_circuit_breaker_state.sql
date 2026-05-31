CREATE TABLE IF NOT EXISTS agent_circuit_breaker_states (
  agent_profile_id text PRIMARY KEY,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  opened_at_ms bigint NULL CHECK (opened_at_ms IS NULL OR opened_at_ms >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_circuit_breaker_states_opened
  ON agent_circuit_breaker_states (opened_at_ms)
  WHERE opened_at_ms IS NOT NULL;
