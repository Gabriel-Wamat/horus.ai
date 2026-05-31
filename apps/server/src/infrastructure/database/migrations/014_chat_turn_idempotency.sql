CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_session_horus_turn_role
  ON chat_messages (
    session_id,
    ((metadata->'horusChat'->>'idempotencyKey')),
    role
  )
  WHERE metadata ? 'horusChat'
    AND (metadata->'horusChat'->>'idempotencyKey') IS NOT NULL;
