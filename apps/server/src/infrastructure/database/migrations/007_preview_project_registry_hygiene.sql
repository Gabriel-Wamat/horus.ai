ALTER TABLE frontend_projects
  ADD COLUMN IF NOT EXISTS project_kind text NOT NULL DEFAULT 'generated'
    CHECK (project_kind IN ('seed', 'generated', 'legacy_static')),
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'published'
    CHECK (lifecycle_status IN ('draft', 'running', 'published', 'failed', 'archived', 'superseded')),
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'visible'
    CHECK (visibility IN ('visible', 'hidden')),
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'unknown'
    CHECK (health_status IN ('unknown', 'healthy', 'warning', 'blocked')),
  ADD COLUMN IF NOT EXISTS health_reasons jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(health_reasons) = 'array'),
  ADD COLUMN IF NOT EXISTS canonical_project_id uuid NULL REFERENCES frontend_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_workspace_id uuid NULL,
  ADD COLUMN IF NOT EXISTS app_fingerprint text NULL,
  ADD COLUMN IF NOT EXISTS last_health_checked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS archived_reason text NULL;

UPDATE frontend_projects
SET
  project_kind = CASE
    WHEN slug = 'user-stories' OR name = 'user_stories' THEN 'seed'
    ELSE project_kind
  END,
  health_reasons = CASE
    WHEN slug = 'user-stories' OR name = 'user_stories' THEN '["seed_project"]'::jsonb
    ELSE health_reasons
  END
WHERE project_kind = 'generated';

CREATE INDEX IF NOT EXISTS idx_frontend_projects_visibility_health
  ON frontend_projects(visibility, health_status, lifecycle_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_frontend_projects_canonical
  ON frontend_projects(canonical_project_id)
  WHERE canonical_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_frontend_projects_workspace
  ON frontend_projects(project_workspace_id)
  WHERE project_workspace_id IS NOT NULL;
