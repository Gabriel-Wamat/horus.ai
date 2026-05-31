CREATE TABLE IF NOT EXISTS coding_tasks (
  id uuid PRIMARY KEY,
  idempotency_key text UNIQUE,
  prompt text NOT NULL,
  project_id uuid NOT NULL,
  project_root_path text,
  selected_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  surface text NOT NULL CHECK (
    surface IN ('frontend', 'backend', 'full_stack', 'config', 'unknown')
  ),
  route_reason text NOT NULL,
  state text NOT NULL CHECK (
    state IN (
      'accepted',
      'scanning',
      'retrieving',
      'ast_analyzing',
      'planning_patch',
      'validating_ast',
      'validating_runtime',
      'applying_patch',
      'completed',
      'failed',
      'cancelled'
    )
  ),
  workflow_thread_id uuid,
  chat_session_id uuid,
  source_message_id uuid,
  user_story_id uuid,
  artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  error jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_coding_tasks_project_updated
  ON coding_tasks (project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_coding_tasks_state_updated
  ON coding_tasks (state, updated_at DESC);

CREATE TABLE IF NOT EXISTS coding_task_events (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES coding_tasks(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  type text NOT NULL CHECK (
    type IN (
      'task_accepted',
      'scan_requested',
      'scan_completed',
      'retrieval_requested',
      'retrieval_completed',
      'ast_analysis_requested',
      'ast_analysis_completed',
      'patch_planning_requested',
      'patch_planning_completed',
      'ast_validation_requested',
      'ast_validation_completed',
      'runtime_validation_requested',
      'runtime_validation_completed',
      'patch_apply_requested',
      'patch_apply_completed',
      'task_completed',
      'task_failed',
      'task_cancelled'
    )
  ),
  from_state text,
  to_state text NOT NULL,
  message text NOT NULL,
  artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  error jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL,
  UNIQUE (task_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_coding_task_events_task_sequence
  ON coding_task_events (task_id, sequence);
