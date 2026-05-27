CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_folders (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz NOT NULL,
  story_count integer NOT NULL DEFAULT 0 CHECK (story_count >= 0)
);

CREATE TABLE IF NOT EXISTS user_stories (
  id uuid PRIMARY KEY,
  folder_id uuid NOT NULL REFERENCES workspace_folders(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (char_length(description) > 0),
  acceptance_criteria jsonb NOT NULL CHECK (jsonb_typeof(acceptance_criteria) = 'array'),
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  labels jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(labels) = 'array'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  active_revision integer NOT NULL DEFAULT 1 CHECK (active_revision >= 1),
  UNIQUE (folder_id, id)
);

CREATE TABLE IF NOT EXISTS user_story_revisions (
  id uuid PRIMARY KEY,
  folder_id uuid NOT NULL REFERENCES workspace_folders(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision >= 1),
  story jsonb NOT NULL CHECK (jsonb_typeof(story) = 'object'),
  saved_at timestamptz NOT NULL,
  UNIQUE (story_id, revision)
);

CREATE TABLE IF NOT EXISTS specs (
  id uuid PRIMARY KEY,
  folder_id uuid NOT NULL REFERENCES workspace_folders(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  summary text NOT NULL CHECK (char_length(summary) > 0),
  technical_approach text NOT NULL CHECK (char_length(technical_approach) > 0),
  components jsonb NOT NULL CHECK (jsonb_typeof(components) = 'array'),
  api_endpoints jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(api_endpoints) = 'array'),
  data_models jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(data_models) = 'array'),
  acceptance_criteria jsonb NOT NULL CHECK (jsonb_typeof(acceptance_criteria) = 'array'),
  generated_at timestamptz NOT NULL,
  approved_at timestamptz NULL,
  approved_by text NULL CHECK (approved_by IS NULL OR approved_by IN ('human', 'auto')),
  active_revision integer NOT NULL DEFAULT 1 CHECK (active_revision >= 1),
  UNIQUE (story_id, id)
);

CREATE TABLE IF NOT EXISTS spec_revisions (
  id uuid PRIMARY KEY,
  folder_id uuid NOT NULL REFERENCES workspace_folders(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  spec_id uuid NOT NULL REFERENCES specs(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision >= 1),
  spec jsonb NOT NULL CHECK (jsonb_typeof(spec) = 'object'),
  saved_at timestamptz NOT NULL,
  UNIQUE (spec_id, revision)
);

CREATE TABLE IF NOT EXISTS workflow_states (
  thread_id uuid PRIMARY KEY,
  workspace_folder_id uuid NULL REFERENCES workspace_folders(id) ON DELETE SET NULL,
  workflow_mode text NOT NULL CHECK (workflow_mode IN ('standard', 'spec_generation', 'chat_code_change')),
  status text NOT NULL CHECK (status IN ('idle', 'running', 'awaiting_human', 'completed', 'cancelled', 'error')),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  error_message text NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY,
  workspace_folder_id uuid NOT NULL REFERENCES workspace_folders(id) ON DELETE CASCADE,
  user_story_id uuid NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  active_user_story_revision_id text NULL,
  active_spec_revision_id text NULL,
  workflow_thread_id uuid NULL REFERENCES workflow_states(thread_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'agent', 'system')),
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  context_snapshot jsonb NOT NULL CHECK (jsonb_typeof(context_snapshot) = 'object'),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS frontend_projects (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  root_path text NOT NULL CHECK (char_length(trim(root_path)) > 0),
  default_route text NOT NULL CHECK (default_route ~ '^/.*$'),
  dev_command text NULL,
  preview_command_id text NULL,
  command_catalog jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(command_catalog) = 'array'),
  preview_url text NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS preview_sessions (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES frontend_projects(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('waiting', 'stopped', 'starting', 'running', 'inspecting', 'applying', 'error')),
  route text NOT NULL CHECK (route ~ '^/.*$'),
  device jsonb NOT NULL CHECK (jsonb_typeof(device) = 'object'),
  preview_url text NULL,
  process_id integer NULL CHECK (process_id IS NULL OR process_id > 0),
  started_at timestamptz NULL,
  stopped_at timestamptz NULL,
  updated_at timestamptz NOT NULL,
  error_message text NULL
);

CREATE TABLE IF NOT EXISTS preview_events (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES preview_sessions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES frontend_projects(id) ON DELETE CASCADE,
  type text NOT NULL,
  timestamp timestamptz NOT NULL,
  status text NOT NULL,
  message text NOT NULL CHECK (char_length(trim(message)) > 0),
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object')
);

CREATE TABLE IF NOT EXISTS visual_instruction_drafts (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES preview_sessions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES frontend_projects(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('visual_edits', 'build')),
  message text NOT NULL CHECK (char_length(trim(message)) > 0),
  status text NOT NULL CHECK (status = 'drafted'),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_stories_folder_created ON user_stories(folder_id, created_at, title);
CREATE INDEX IF NOT EXISTS idx_user_story_revisions_story_revision ON user_story_revisions(story_id, revision DESC);
CREATE INDEX IF NOT EXISTS idx_specs_story_generated ON specs(story_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_spec_revisions_spec_revision ON spec_revisions(spec_id, revision DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_workspace_story_updated ON chat_sessions(workspace_folder_id, user_story_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workflow_states_workspace_updated ON workflow_states(workspace_folder_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_project_updated ON preview_sessions(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_preview_events_session_timestamp ON preview_events(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_visual_instruction_drafts_session_created ON visual_instruction_drafts(session_id, created_at);
