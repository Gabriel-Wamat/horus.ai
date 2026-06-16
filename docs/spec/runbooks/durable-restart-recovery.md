# Durable Restart Recovery Runbook

Status: active
Last updated: 2026-05-28
Related spec: `spec/features/76-durable-restart-and-chaos-validation.md`

## Minimum Evidence Before Claiming Resumability

1. Checkpointer continuity:
   - File mode must persist LangGraph checkpoints under `HORUS_DATA_DIR/langgraph-checkpoints/memory-saver.json`.
   - Postgres mode must use the configured LangGraph Postgres saver.
   - Validation command: `node --test apps/server/test/*restart*.test.mjs`.

2. Ledger/outbox idempotency:
   - A `workflow.start` outbox item that was already terminal in `agent_workflow_runs` must be completed without rerunning the graph.
   - `pending`, `processing`, and retryable `failed` outbox items are recoverable; `dead_letter` is terminal.
   - Validation command: `node --test apps/server/test/agentExecutionLedger.test.mjs apps/server/test/*restart*.test.mjs`.

3. Chat/progress contract:
   - Restart recovery must not duplicate user-visible progress for a completed run.
   - Workflow events must remain replayable from persisted event history.
   - Validation command: `node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs`.

4. Preview restart state:
   - Runtime sessions whose process disappeared after restart must be marked with explicit recovery/error timeline events.
   - Validation command: `node --test apps/server/test/processBrowserPreviewAdapter.test.mjs`.

5. Partial writes:
   - Failed apply operations must rollback or terminalize with explicit failed validation state.
   - Validation command: `node --test apps/server/test/projectCodeChangeSetApplier.test.mjs`.

## Operator Checklist

- Confirm `HORUS_DATA_DIR` points to a durable location for the environment.
- Run `pnpm --filter @u-build/server build` before recovery drills.
- Run the restart/recovery test pair:
  - `node --test apps/server/test/*restart*.test.mjs`
  - `node --test apps/server/test/*recovery*.test.mjs`
- For a stuck run, inspect in order:
  - persisted workflow state for the thread
  - workflow event log for the thread
  - agent execution ledger run status
  - outbox status and attempt count
  - LangGraph checkpoint storage
- A run is not resumable if the ledger says running but the checkpoint is missing. The system must either use stale-run recovery or require a fresh workflow.
