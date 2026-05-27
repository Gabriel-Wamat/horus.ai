CREATE TABLE IF NOT EXISTS project_workspaces (
  id uuid PRIMARY KEY,
  workspace_folder_id uuid NULL REFERENCES workspace_folders(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  slug text NOT NULL CHECK (char_length(trim(slug)) > 0),
  target_mode text NOT NULL CHECK (target_mode IN ('new_project', 'existing_project')),
  root_path text NOT NULL UNIQUE CHECK (char_length(trim(root_path)) > 0),
  config_path text NOT NULL CHECK (char_length(trim(config_path)) > 0),
  git_repository_path text NULL,
  current_branch text NULL,
  base_ref text NULL,
  project_stack text NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS project_construction_runs (
  id uuid PRIMARY KEY,
  project_workspace_id uuid NOT NULL REFERENCES project_workspaces(id) ON DELETE CASCADE,
  workflow_run_id uuid NULL,
  status text NOT NULL CHECK (status IN ('pending','bootstrapping','running','validating','passed','failed','cancelled')),
  workspace_path text NOT NULL CHECK (char_length(trim(workspace_path)) > 0),
  branch_name text NULL,
  base_ref text NULL,
  selected_user_story_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(selected_user_story_ids) = 'array'),
  selected_spec_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(selected_spec_ids) = 'array'),
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  error text NULL
);

CREATE TABLE IF NOT EXISTS project_agent_assignments (
  id uuid PRIMARY KEY,
  construction_run_id uuid NOT NULL REFERENCES project_construction_runs(id) ON DELETE CASCADE,
  agent_role text NOT NULL,
  status text NOT NULL,
  input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input_snapshot) = 'object'),
  execution_plan jsonb NULL CHECK (execution_plan IS NULL OR jsonb_typeof(execution_plan) = 'object'),
  result_snapshot jsonb NULL CHECK (result_snapshot IS NULL OR jsonb_typeof(result_snapshot) = 'object'),
  created_at timestamptz NOT NULL,
  finished_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS project_file_operations (
  id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES project_agent_assignments(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('write', 'delete')),
  path text NOT NULL CHECK (char_length(trim(path)) > 0),
  reason text NOT NULL CHECK (char_length(trim(reason)) > 0),
  applied boolean NOT NULL DEFAULT false,
  error text NULL
);

CREATE TABLE IF NOT EXISTS project_command_runs (
  id uuid PRIMARY KEY,
  assignment_id uuid NULL REFERENCES project_agent_assignments(id) ON DELETE SET NULL,
  construction_run_id uuid NOT NULL REFERENCES project_construction_runs(id) ON DELETE CASCADE,
  command_id text NOT NULL CHECK (char_length(trim(command_id)) > 0),
  command text NOT NULL CHECK (char_length(trim(command)) > 0),
  cwd text NOT NULL CHECK (char_length(trim(cwd)) > 0),
  exit_code integer NULL,
  stdout_tail text NOT NULL DEFAULT '',
  stderr_tail text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL,
  finished_at timestamptz NULL,
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  sandbox_profile text NULL
);

CREATE TABLE IF NOT EXISTS project_quality_gates (
  id uuid PRIMARY KEY,
  construction_run_id uuid NOT NULL REFERENCES project_construction_runs(id) ON DELETE CASCADE,
  assignment_id uuid NULL REFERENCES project_agent_assignments(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending', 'passed', 'failed', 'skipped')),
  checks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(checks) = 'array'),
  failed_checks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(failed_checks) = 'array'),
  diff_stats jsonb NULL CHECK (diff_stats IS NULL OR jsonb_typeof(diff_stats) = 'object'),
  commit_sha text NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_workspaces_workspace_folder
  ON project_workspaces(workspace_folder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_construction_runs_workspace
  ON project_construction_runs(project_workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_command_runs_run
  ON project_command_runs(construction_run_id, started_at);

CREATE INDEX IF NOT EXISTS idx_project_quality_gates_run
  ON project_quality_gates(construction_run_id, created_at);
