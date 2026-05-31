CREATE TABLE IF NOT EXISTS agent_execution_turns (
  id uuid PRIMARY KEY,
  chat_session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  source_message_id uuid NULL REFERENCES chat_messages(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(trim(idempotency_key)) > 0),
  intent jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(intent) = 'object'),
  status text NOT NULL CHECK (status IN ('pending','accepted','running','completed','blocked','failed','cancelled')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_workflow_runs (
  id uuid PRIMARY KEY,
  turn_id uuid NULL REFERENCES agent_execution_turns(id) ON DELETE SET NULL,
  thread_id uuid NOT NULL UNIQUE,
  workflow_mode text NOT NULL CHECK (workflow_mode IN ('standard','spec_generation','chat_code_change','project_construction')),
  status text NOT NULL CHECK (status IN ('idle','running','awaiting_human','completed','completed_unverified','failed_validation','blocked','cancelled','error')),
  lease_owner text NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_workflow_runs_turn_unique
  ON agent_workflow_runs(turn_id)
  WHERE turn_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_workflow_runs_status_updated
  ON agent_workflow_runs(status, updated_at);

CREATE TABLE IF NOT EXISTS agent_workflow_attempts (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES agent_workflow_runs(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  status text NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')),
  failure_class text NULL,
  UNIQUE (run_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS agent_execution_outbox (
  id uuid PRIMARY KEY,
  event_type text NOT NULL CHECK (char_length(trim(event_type)) > 0),
  dedupe_key text NOT NULL UNIQUE CHECK (char_length(trim(dedupe_key)) > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL CHECK (status IN ('pending','processing','processed','failed','dead_letter')),
  available_at timestamptz NOT NULL,
  locked_at timestamptz NULL,
  processed_at timestamptz NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_execution_outbox_pending
  ON agent_execution_outbox(status, available_at, created_at);

CREATE TABLE IF NOT EXISTS agent_execution_leases (
  run_id uuid PRIMARY KEY REFERENCES agent_workflow_runs(id) ON DELETE CASCADE,
  owner_id text NOT NULL CHECK (char_length(trim(owner_id)) > 0),
  expires_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_execution_leases_expiration
  ON agent_execution_leases(expires_at);
