CREATE TABLE IF NOT EXISTS workflow_event_counters (
  thread_id uuid PRIMARY KEY,
  next_sequence integer NOT NULL CHECK (next_sequence >= 1)
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id text PRIMARY KEY,
  thread_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence >= 1),
  type text NOT NULL,
  node_id text NULL,
  agent_name text NULL,
  user_story_id uuid NULL REFERENCES user_stories(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(trim(title)) > 0),
  summary text NULL,
  timestamp timestamptz NOT NULL,
  event jsonb NOT NULL CHECK (jsonb_typeof(event) = 'object'),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_thread_sequence
  ON workflow_events(thread_id, sequence);

CREATE INDEX IF NOT EXISTS idx_workflow_events_thread_timestamp
  ON workflow_events(thread_id, timestamp);
