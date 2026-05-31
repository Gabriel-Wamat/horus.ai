ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS sequence integer,
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'message',
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'persisted',
  ADD COLUMN IF NOT EXISTS compact_body text NULL,
  ADD COLUMN IF NOT EXISTS turn_id uuid NULL REFERENCES agent_execution_turns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS run_id uuid NULL REFERENCES agent_workflow_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attempt_id uuid NULL REFERENCES agent_workflow_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY session_id
      ORDER BY created_at, id
    ) AS next_sequence
  FROM chat_messages
  WHERE sequence IS NULL
)
UPDATE chat_messages
SET sequence = ranked.next_sequence
FROM ranked
WHERE chat_messages.id = ranked.id;

ALTER TABLE chat_messages
  ALTER COLUMN sequence SET NOT NULL,
  ADD CONSTRAINT chat_messages_sequence_positive CHECK (sequence > 0),
  ADD CONSTRAINT chat_messages_event_type_check CHECK (
    event_type IN ('message','progress','evidence','warning','error','action_state','trace')
  ),
  ADD CONSTRAINT chat_messages_visibility_check CHECK (
    visibility IN ('user','developer','hidden')
  ),
  ADD CONSTRAINT chat_messages_delivery_status_check CHECK (
    delivery_status IN ('pending','streaming','persisted','failed','superseded')
  ),
  ADD CONSTRAINT chat_messages_metadata_object CHECK (jsonb_typeof(metadata) = 'object');

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_session_sequence_unique
  ON chat_messages(session_id, sequence);

CREATE INDEX IF NOT EXISTS idx_chat_messages_workflow_thread
  ON chat_messages ((context_snapshot->>'workflowThreadId'), sequence)
  WHERE context_snapshot ? 'workflowThreadId';

CREATE INDEX IF NOT EXISTS idx_chat_messages_run
  ON chat_messages(run_id, sequence)
  WHERE run_id IS NOT NULL;
