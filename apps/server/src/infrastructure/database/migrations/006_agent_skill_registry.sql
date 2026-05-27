CREATE TABLE IF NOT EXISTS agent_skills (
  id uuid PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('system', 'project', 'workspace')),
  source_type text NOT NULL CHECK (source_type IN ('filesystem_seed', 'database', 'imported_bundle')),
  source_path text NULL,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  active_revision_id uuid NULL,
  created_by text NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_skill_revisions (
  id uuid PRIMARY KEY,
  skill_id uuid NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  status text NOT NULL CHECK (status IN ('draft', 'validated', 'published', 'rejected', 'archived')),
  skill_md text NOT NULL,
  frontmatter jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  validation_status text NOT NULL CHECK (validation_status IN ('pending', 'passed', 'failed')),
  created_at timestamptz NOT NULL,
  published_at timestamptz NULL,
  UNIQUE (skill_id, revision_number),
  UNIQUE (skill_id, content_hash)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_skills_active_revision_id_fkey'
  ) THEN
    ALTER TABLE agent_skills
      ADD CONSTRAINT agent_skills_active_revision_id_fkey
      FOREIGN KEY (active_revision_id)
      REFERENCES agent_skill_revisions(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_skill_files (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES agent_skill_revisions(id) ON DELETE CASCADE,
  relative_path text NOT NULL,
  media_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  content_text text NULL,
  content_sha256 text NOT NULL,
  UNIQUE (revision_id, relative_path)
);

CREATE TABLE IF NOT EXISTS agent_skill_bindings (
  id uuid PRIMARY KEY,
  skill_id uuid NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,
  agent_profile_id text NOT NULL,
  trigger_mode text NOT NULL CHECK (trigger_mode IN ('automatic', 'manual', 'disabled')),
  priority integer NOT NULL DEFAULT 100 CHECK (priority >= 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_skill_validation_reports (
  id uuid PRIMARY KEY,
  revision_id uuid NOT NULL REFERENCES agent_skill_revisions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('passed', 'failed')),
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_skill_usage_events (
  id uuid PRIMARY KEY,
  skill_id uuid NOT NULL REFERENCES agent_skills(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES agent_skill_revisions(id) ON DELETE CASCADE,
  workflow_thread_id uuid NULL,
  agent_profile_id text NOT NULL,
  trigger_mode text NOT NULL CHECK (trigger_mode IN ('automatic', 'manual', 'disabled')),
  trigger_reason text NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_status_source
  ON agent_skills(status, source_type);

CREATE INDEX IF NOT EXISTS idx_agent_skill_revisions_skill_created
  ON agent_skill_revisions(skill_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_skill_bindings_agent_enabled_priority
  ON agent_skill_bindings(agent_profile_id, enabled, priority);

CREATE INDEX IF NOT EXISTS idx_agent_skill_usage_events_workflow
  ON agent_skill_usage_events(workflow_thread_id, created_at DESC);
