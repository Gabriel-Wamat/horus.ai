ALTER TABLE code_change_sets
  ADD COLUMN IF NOT EXISTS artifact_candidate_id uuid NULL,
  ADD COLUMN IF NOT EXISTS run_id uuid NULL,
  ADD COLUMN IF NOT EXISTS attempt_id uuid NULL;

CREATE TABLE IF NOT EXISTS agent_artifact_candidates (
  id uuid PRIMARY KEY,
  run_id uuid NULL REFERENCES agent_workflow_runs(id) ON DELETE SET NULL,
  attempt_id uuid NULL REFERENCES agent_workflow_attempts(id) ON DELETE SET NULL,
  workflow_thread_id uuid NOT NULL REFERENCES workflow_states(thread_id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  source_agent text NOT NULL CHECK (source_agent IN ('spec','odin','front','qa','curator')),
  artifact_type text NOT NULL CHECK (artifact_type IN ('code_change_set','qa_plan','visual_report','spec')),
  status text NOT NULL CHECK (status IN ('draft','proposed','validating','rejected','approved','applied','failed')),
  source_result_id text NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_validation_evidence (
  id uuid PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES agent_artifact_candidates(id) ON DELETE CASCADE,
  run_id uuid NULL REFERENCES agent_workflow_runs(id) ON DELETE SET NULL,
  attempt_id uuid NULL REFERENCES agent_workflow_attempts(id) ON DELETE SET NULL,
  workflow_thread_id uuid NOT NULL REFERENCES workflow_states(thread_id) ON DELETE CASCADE,
  story_id uuid NULL REFERENCES user_stories(id) ON DELETE SET NULL,
  gate_id text NOT NULL,
  gate_type text NOT NULL CHECK (gate_type IN ('schema','path_safety','command','preview','qa','visual','curator','apply')),
  status text NOT NULL CHECK (status IN ('passed','failed','blocked','skipped','inconclusive')),
  required boolean NOT NULL DEFAULT true,
  summary text NOT NULL,
  raw_evidence_ref jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_evidence_ref) = 'object'),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_trace_spans (
  id uuid PRIMARY KEY,
  workflow_thread_id uuid NOT NULL REFERENCES workflow_states(thread_id) ON DELETE CASCADE,
  run_id uuid NULL REFERENCES agent_workflow_runs(id) ON DELETE SET NULL,
  attempt_id uuid NULL REFERENCES agent_workflow_attempts(id) ON DELETE SET NULL,
  candidate_id uuid NULL REFERENCES agent_artifact_candidates(id) ON DELETE SET NULL,
  span_type text NOT NULL CHECK (span_type IN ('llm','tool','gate','handoff','retry','approval','apply')),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('started','succeeded','failed','blocked')),
  redacted_input jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(redacted_input) = 'object'),
  redacted_output jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(redacted_output) = 'object'),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NULL,
  duration_ms integer NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_message text NULL
);

CREATE INDEX IF NOT EXISTS idx_code_change_sets_candidate
  ON code_change_sets(artifact_candidate_id);

CREATE INDEX IF NOT EXISTS idx_code_change_sets_run_attempt
  ON code_change_sets(run_id, attempt_id);

CREATE INDEX IF NOT EXISTS idx_agent_artifact_candidates_workflow_story
  ON agent_artifact_candidates(workflow_thread_id, story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_artifact_candidates_run_attempt
  ON agent_artifact_candidates(run_id, attempt_id);

CREATE INDEX IF NOT EXISTS idx_agent_validation_evidence_candidate
  ON agent_validation_evidence(candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_validation_evidence_workflow
  ON agent_validation_evidence(workflow_thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_trace_spans_workflow
  ON agent_trace_spans(workflow_thread_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_trace_spans_candidate
  ON agent_trace_spans(candidate_id, started_at DESC);
