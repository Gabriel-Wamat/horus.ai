CREATE TABLE IF NOT EXISTS agent_memory_items (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('working', 'episodic', 'semantic', 'preference', 'rejected_decision')),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  content text NOT NULL,
  confidence numeric NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  stale_at timestamptz,
  superseded_by_memory_id uuid REFERENCES agent_memory_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (jsonb_typeof(source_refs) = 'array'),
  CHECK (jsonb_array_length(source_refs) > 0)
);

CREATE TABLE IF NOT EXISTS agent_memory_summaries (
  id uuid PRIMARY KEY,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text NOT NULL,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_message_sequence_min integer,
  source_message_sequence_max integer,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (jsonb_typeof(source_refs) = 'array'),
  CHECK (jsonb_array_length(source_refs) > 0),
  CHECK (
    source_message_sequence_min IS NULL
    OR source_message_sequence_max IS NULL
    OR source_message_sequence_min <= source_message_sequence_max
  )
);

CREATE TABLE IF NOT EXISTS agent_memory_links (
  id uuid PRIMARY KEY,
  from_memory_id uuid NOT NULL REFERENCES agent_memory_items(id) ON DELETE CASCADE,
  to_memory_id uuid NOT NULL REFERENCES agent_memory_items(id) ON DELETE CASCADE,
  relation text NOT NULL CHECK (relation IN ('supports', 'supersedes', 'contradicts', 'related')),
  created_at timestamptz NOT NULL,
  CHECK (from_memory_id <> to_memory_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_items_kind_updated
  ON agent_memory_items (kind, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_memory_items_scope_gin
  ON agent_memory_items USING gin (scope);

CREATE INDEX IF NOT EXISTS idx_agent_memory_items_active
  ON agent_memory_items (updated_at DESC)
  WHERE superseded_by_memory_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_memory_summaries_scope_gin
  ON agent_memory_summaries USING gin (scope);

CREATE INDEX IF NOT EXISTS idx_agent_memory_links_from
  ON agent_memory_links (from_memory_id);

CREATE INDEX IF NOT EXISTS idx_agent_memory_links_to
  ON agent_memory_links (to_memory_id);

ALTER TABLE agent_skill_usage_events
  ADD COLUMN IF NOT EXISTS run_id uuid NULL,
  ADD COLUMN IF NOT EXISTS attempt_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_agent_skill_usage_events_run
  ON agent_skill_usage_events(run_id, created_at DESC);
