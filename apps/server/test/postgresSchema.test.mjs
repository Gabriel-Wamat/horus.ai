import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationPath =
  "apps/server/src/infrastructure/database/migrations/001_initial_schema.sql";
const previewHygieneMigrationPath =
  "apps/server/src/infrastructure/database/migrations/007_preview_project_registry_hygiene.sql";
const agentExecutionLedgerMigrationPath =
  "apps/server/src/infrastructure/database/migrations/008_agent_execution_ledger.sql";
const eventSourcedChatMigrationPath =
  "apps/server/src/infrastructure/database/migrations/009_event_sourced_chat_messages.sql";
const agentMemoryMigrationPath =
  "apps/server/src/infrastructure/database/migrations/010_agent_memory.sql";
const agentArtifactsMigrationPath =
  "apps/server/src/infrastructure/database/migrations/011_agent_artifacts_control_plane.sql";
const workflowStateStatusContractMigrationPath =
  "apps/server/src/infrastructure/database/migrations/012_workflow_state_status_contract.sql";
const agentCircuitBreakerMigrationPath =
  "apps/server/src/infrastructure/database/migrations/013_agent_circuit_breaker_state.sql";
const chatTurnIdempotencyMigrationPath =
  "apps/server/src/infrastructure/database/migrations/014_chat_turn_idempotency.sql";
const codingRuntimeMigrationPath =
  "apps/server/src/infrastructure/database/migrations/015_coding_runtime_tasks.sql";
const agentOperationalSessionMigrationPath =
  "apps/server/src/infrastructure/database/migrations/016_agent_operational_sessions.sql";

test("initial Postgres migration defines versioned workspace and runtime tables", async () => {
  const sql = await readFile(migrationPath, "utf-8");

  for (const table of [
    "workspace_folders",
    "user_stories",
    "user_story_revisions",
    "specs",
    "spec_revisions",
    "workflow_states",
    "chat_sessions",
    "chat_messages",
    "frontend_projects",
    "preview_sessions",
    "preview_events",
    "visual_instruction_drafts",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(sql, /REFERENCES workspace_folders\(id\) ON DELETE CASCADE/);
  assert.match(sql, /UNIQUE \(story_id, revision\)/);
  assert.match(sql, /UNIQUE \(spec_id, revision\)/);
  assert.match(sql, /CHECK \(priority IN \('low', 'medium', 'high', 'critical'\)\)/);
});

test("preview project hygiene migration adds lifecycle and health metadata", async () => {
  const sql = await readFile(previewHygieneMigrationPath, "utf-8");

  for (const column of [
    "project_kind",
    "lifecycle_status",
    "visibility",
    "health_status",
    "health_reasons",
    "canonical_project_id",
    "project_workspace_id",
    "app_fingerprint",
    "last_health_checked_at",
    "archived_at",
    "archived_reason",
  ]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  }

  assert.match(sql, /idx_frontend_projects_visibility_health/);
  assert.match(sql, /idx_frontend_projects_canonical/);
});

test("agent execution ledger migration adds durable run and outbox tables", async () => {
  const sql = await readFile(agentExecutionLedgerMigrationPath, "utf-8");

  for (const table of [
    "agent_execution_turns",
    "agent_workflow_runs",
    "agent_workflow_attempts",
    "agent_execution_outbox",
    "agent_execution_leases",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(sql, /idempotency_key text NOT NULL UNIQUE/);
  assert.match(sql, /dedupe_key text NOT NULL UNIQUE/);
  assert.match(sql, /idx_agent_workflow_runs_status_updated/);
  assert.match(sql, /idx_agent_execution_outbox_pending/);
});

test("event-sourced chat migration adds ordered workflow message metadata", async () => {
  const sql = await readFile(eventSourcedChatMigrationPath, "utf-8");

  for (const column of [
    "sequence",
    "event_type",
    "visibility",
    "delivery_status",
    "compact_body",
    "turn_id",
    "run_id",
    "attempt_id",
    "metadata",
  ]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  }

  assert.match(sql, /idx_chat_messages_session_sequence_unique/);
  assert.match(sql, /idx_chat_messages_workflow_thread/);
  assert.match(sql, /idx_chat_messages_run/);
});

test("agent memory migration adds scoped memory, summary, and provenance tables", async () => {
  const sql = await readFile(agentMemoryMigrationPath, "utf-8");

  for (const table of [
    "agent_memory_items",
    "agent_memory_summaries",
    "agent_memory_links",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(sql, /source_refs jsonb NOT NULL/);
  assert.match(sql, /jsonb_array_length\(source_refs\) > 0/);
  assert.match(sql, /superseded_by_memory_id uuid REFERENCES agent_memory_items/);
  assert.match(sql, /idx_agent_memory_items_scope_gin/);
  assert.match(sql, /idx_agent_memory_summaries_scope_gin/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS run_id uuid NULL/);
  assert.match(sql, /idx_agent_skill_usage_events_run/);
});

test("agent artifacts migration adds candidate lineage, evidence, and trace tables", async () => {
  const sql = await readFile(agentArtifactsMigrationPath, "utf-8");

  for (const table of [
    "agent_artifact_candidates",
    "agent_validation_evidence",
    "agent_trace_spans",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  for (const column of ["artifact_candidate_id", "run_id", "attempt_id"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  }

  assert.match(sql, /candidate_id uuid NOT NULL REFERENCES agent_artifact_candidates/);
  assert.match(sql, /raw_evidence_ref jsonb NOT NULL/);
  assert.match(sql, /redacted_input jsonb NOT NULL/);
  assert.match(sql, /idx_agent_artifact_candidates_workflow_story/);
  assert.match(sql, /idx_agent_validation_evidence_candidate/);
  assert.match(sql, /idx_agent_trace_spans_candidate/);
});

test("workflow state status contract migration matches shared terminal statuses", async () => {
  const sql = await readFile(workflowStateStatusContractMigrationPath, "utf-8");

  assert.match(sql, /DROP CONSTRAINT IF EXISTS workflow_states_status_check/);
  assert.match(sql, /ADD CONSTRAINT workflow_states_status_check/);
  for (const status of [
    "idle",
    "running",
    "awaiting_human",
    "completed",
    "completed_unverified",
    "failed_validation",
    "blocked",
    "cancelled",
    "error",
  ]) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
});

test("agent circuit breaker migration adds distributed breaker state table", async () => {
  const sql = await readFile(agentCircuitBreakerMigrationPath, "utf-8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS agent_circuit_breaker_states/);
  assert.match(sql, /agent_profile_id text PRIMARY KEY/);
  assert.match(sql, /failure_count integer NOT NULL DEFAULT 0/);
  assert.match(sql, /opened_at_ms bigint NULL/);
  assert.match(sql, /idx_agent_circuit_breaker_states_opened/);
});

test("chat turn idempotency migration adds per-session turn guard", async () => {
  const sql = await readFile(chatTurnIdempotencyMigrationPath, "utf-8");

  assert.match(sql, /idx_chat_messages_session_horus_turn_role/);
  assert.match(sql, /metadata->'horusChat'->>'idempotencyKey'/);
  assert.match(sql, /session_id/);
  assert.match(sql, /role/);
});

test("coding runtime migration adds deterministic task and event lifecycle tables", async () => {
  const sql = await readFile(codingRuntimeMigrationPath, "utf-8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS coding_tasks/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS coding_task_events/);
  assert.match(sql, /idempotency_key text UNIQUE/);
  assert.match(sql, /surface IN \('frontend', 'backend', 'full_stack', 'config', 'unknown'\)/);
  for (const state of [
    "accepted",
    "scanning",
    "retrieving",
    "ast_analyzing",
    "planning_patch",
    "validating_ast",
    "validating_runtime",
    "applying_patch",
    "completed",
    "failed",
    "cancelled",
  ]) {
    assert.match(sql, new RegExp(`'${state}'`));
  }
  assert.match(sql, /UNIQUE \(task_id, sequence\)/);
  assert.match(sql, /idx_coding_task_events_task_sequence/);
});

test("agent operational session migration adds durable session and operation event tables", async () => {
  const sql = await readFile(agentOperationalSessionMigrationPath, "utf-8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS agent_operational_sessions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS agent_operation_events/);
  assert.match(sql, /workflow_thread_id uuid NOT NULL/);
  assert.match(sql, /project_id uuid NOT NULL/);
  assert.match(sql, /code_change_set_id uuid/);
  assert.match(sql, /REFERENCES agent_operational_sessions\(id\) ON DELETE CASCADE/);
  assert.match(sql, /UNIQUE \(session_id, sequence\)/);

  for (const status of ["running", "completed", "failed", "blocked", "cancelled"]) {
    assert.match(sql, new RegExp(`'${status}'`));
  }

  for (const eventType of [
    "session_started",
    "tool_started",
    "tool_succeeded",
    "tool_failed",
    "tool_blocked",
    "file_read",
    "file_changed",
    "command_ran",
    "session_finished",
  ]) {
    assert.match(sql, new RegExp(`'${eventType}'`));
  }

  assert.match(sql, /idx_agent_operational_sessions_workflow/);
  assert.match(sql, /idx_agent_operation_events_session_sequence/);
});
