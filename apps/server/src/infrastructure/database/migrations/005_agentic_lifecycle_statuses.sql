ALTER TABLE code_change_sets
  DROP CONSTRAINT IF EXISTS code_change_sets_status_check;

ALTER TABLE code_change_sets
  ADD CONSTRAINT code_change_sets_status_check
  CHECK (status IN (
    'proposed',
    'curator_rejected',
    'curator_approved',
    'applied',
    'validated',
    'failed'
  ));

ALTER TABLE workflow_states
  DROP CONSTRAINT IF EXISTS workflow_states_workflow_mode_check;

ALTER TABLE workflow_states
  ADD CONSTRAINT workflow_states_workflow_mode_check
  CHECK (workflow_mode IN (
    'standard',
    'spec_generation',
    'chat_code_change',
    'project_construction'
  ));
