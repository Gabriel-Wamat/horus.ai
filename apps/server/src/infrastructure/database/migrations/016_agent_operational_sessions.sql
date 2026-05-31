CREATE TABLE IF NOT EXISTS agent_operational_sessions (
  id uuid PRIMARY KEY,
  workflow_thread_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_story_id uuid NOT NULL,
  run_id uuid,
  code_change_set_id uuid,
  agent_name text NOT NULL CHECK (
    agent_name IN ('spec', 'odin', 'front', 'qa', 'curator')
  ),
  agent_profile_id text NOT NULL CHECK (
    agent_profile_id IN (
      'chat_agent',
      'spec_agent',
      'odin_agent',
      'front_agent',
      'qa_agent',
      'curator_agent'
    )
  ),
  status text NOT NULL CHECK (
    status IN ('running', 'completed', 'failed', 'blocked', 'cancelled')
  ),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_agent_operational_sessions_workflow
  ON agent_operational_sessions (workflow_thread_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_operational_sessions_status
  ON agent_operational_sessions (status, started_at DESC);

CREATE TABLE IF NOT EXISTS agent_operation_events (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES agent_operational_sessions(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  type text NOT NULL CHECK (
    type IN (
      'session_started',
      'tool_started',
      'tool_succeeded',
      'tool_failed',
      'tool_blocked',
      'file_read',
      'file_changed',
      'command_ran',
      'diff_recorded',
      'retry_recorded',
      'decision_recorded',
      'session_finished'
    )
  ),
  tool_name text,
  tool_status text CHECK (
    tool_status IS NULL OR tool_status IN ('started', 'succeeded', 'failed', 'blocked')
  ),
  summary text,
  file_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  command_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  UNIQUE (session_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_agent_operation_events_session_sequence
  ON agent_operation_events (session_id, sequence);

CREATE INDEX IF NOT EXISTS idx_agent_operation_events_type_created
  ON agent_operation_events (type, created_at DESC);
