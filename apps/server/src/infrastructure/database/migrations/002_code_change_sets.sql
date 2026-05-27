CREATE TABLE IF NOT EXISTS code_change_sets (
  id uuid PRIMARY KEY,
  workflow_thread_id uuid NOT NULL REFERENCES workflow_states(thread_id) ON DELETE CASCADE,
  workspace_folder_id uuid NULL REFERENCES workspace_folders(id) ON DELETE SET NULL,
  story_id uuid NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
  spec_revision_id text NULL,
  source_agent text NOT NULL CHECK (source_agent IN ('front', 'qa', 'curator', 'odin')),
  status text NOT NULL CHECK (status IN ('proposed', 'applied', 'validated', 'failed')),
  operations jsonb NOT NULL CHECK (jsonb_typeof(operations) = 'array'),
  validation jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation) = 'array'),
  created_at timestamptz NOT NULL,
  applied_at timestamptz NULL,
  failed_reason text NULL
);

CREATE INDEX IF NOT EXISTS idx_code_change_sets_workflow_created
  ON code_change_sets(workflow_thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_code_change_sets_story_created
  ON code_change_sets(story_id, created_at DESC);
