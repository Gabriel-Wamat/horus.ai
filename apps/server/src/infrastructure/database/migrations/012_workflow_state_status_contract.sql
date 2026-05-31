ALTER TABLE workflow_states
  DROP CONSTRAINT IF EXISTS workflow_states_status_check;

ALTER TABLE workflow_states
  ADD CONSTRAINT workflow_states_status_check
  CHECK (status IN (
    'idle',
    'running',
    'awaiting_human',
    'completed',
    'completed_unverified',
    'failed_validation',
    'blocked',
    'cancelled',
    'error'
  ));
