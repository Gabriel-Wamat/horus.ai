---
format_version: "agentic_sdd.v1"
task_id: "feature-99-agent-operational-session-ledger"
title: "Agent Operational Session Ledger"
created_at_utc: "2026-05-28T22:30:10Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_3_agent_code_execution_runtime"
depends_on:
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "spec/features/65-event-sourced-chat-and-progress-streaming.md"
  - "spec/features/72-agent-tool-runtime-react-loop-and-e2e-closure.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 99 - Agent Operational Session Ledger

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  Sessao operacional do agente. Cada execucao precisa ter estado proprio: arquivos lidos, tools usadas,
  comandos, diffs, erros, tentativas e status.
```

## 2. System Interpretation

```yaml
system_translation: |
  Add a durable AgentOperationalSession model that records every meaningful runtime action for one agent
  execution. The session is the source of truth for read-before-write, progress rendering, retries,
  cancellation, runbook generation and postmortem debugging.

expected_user_visible_result: |
  The Preview chat and Agent Flow can show what the agent is doing, which files it touched, which commands
  ran, and why it stopped or needs a decision.

expected_engineering_result: |
  Horus gains a typed operational session ledger with append-only events, compact state projection and
  recovery semantics.
```

## 3. Context, Scope, Entities

```yaml
business_context:
  user_problem: "Opaque agent runs make failures look like nothing happened."
  target_user: "Horus operator supervising code generation and correction."
  expected_outcome: "Every run has a durable, replayable operational record."
  product_surface:
    - "Preview chat"
    - "Agent Flow canvas"
    - "Run history/debug view"
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Zod"
      - "File/Postgres repositories"
    frontend:
      - "React event projections"
    database:
      - "Existing ledger/outbox"
    infrastructure:
      - "SSE"
  known_entrypoints:
    - "packages/shared/src/entities/AgentExecutionLedger.ts"
    - "packages/shared/src/entities/HorusRunFlow.ts"
    - "apps/server/src/application/services/AgentToolLoop.ts"
    - "apps/server/src/application/services/AgentToolRuntime.ts"
    - "apps/server/src/domain/services/WorkflowEventProjector.ts"
    - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
scope:
  in_scope:
    - "Define AgentOperationalSession, AgentOperationEvent and AgentOperationProjection schemas."
    - "Record files read, files changed, command evidence, tool calls, retries, errors, decisions and status."
    - "Persist session events in file and Postgres drivers through existing repository style."
    - "Expose compact projection to workflow snapshots and chat progress."
    - "Use session state as the enforcement source for read-before-write."
  out_of_scope:
    - "New UI timeline implementation beyond projection contract."
    - "Storing full file contents in the session ledger."
    - "Replacing workflow ledger/outbox."
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/AgentOperationalSession.ts"
      - "apps/server/src/application/ports/AgentOperationalSessionRepository.ts"
      - "apps/server/src/infrastructure/repositories/FileAgentOperationalSessionRepository.ts"
      - "apps/server/src/infrastructure/repositories/PostgresAgentOperationalSessionRepository.ts"
      - "apps/server/src/application/services/AgentToolLoop.ts"
      - "apps/server/src/application/services/AgentToolRuntime.ts"
    services:
      - "AgentToolLoop"
      - "WorkflowEventProjector"
    database:
      migrations_required: true
      tables:
        - "agent_operational_sessions"
        - "agent_operation_events"
  frontend:
    files:
      - "apps/web/src/features/visual-preview/workflowProgress.ts"
    components:
      - "Progress consumers"
  workflow:
    graph_nodes:
      - "frontAgentNode"
      - "qaAgentNode"
      - "curatorAgentNode"
    agents:
      - "Front Agent"
      - "QA Agent"
      - "Curator Agent"
  tests:
    unit:
      - "packages/shared/test/agentOperationalSession.test.mjs"
      - "apps/server/test/agentOperationalSessionRepository.test.mjs"
    integration:
      - "apps/server/test/agentToolLoopSession.test.mjs"
```

## 4. Integration Context Map

```yaml
integration_context:
  summary: |
    The operational session connects tool execution, workflow events, chat progress and safety guards.
    It must remain append-only and replayable so UI and recovery code can trust it.
  depends_on:
    - name: "Workflow execution ledger"
      type: "database"
      owner: "apps/server/infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "runId, threadId, userStoryId, agentName"
      required_for: "Associate operational sessions with durable workflow runs."
      assumptions: []
      failure_modes:
        - "Session events cannot be replayed after restart."
      fallback_or_recovery: "Persist file-driver fallback and reconcile orphan events."
      verification:
        - "apps/server/test/agentOperationalSessionRepository.test.mjs"
  depended_on_by:
    - name: "Incremental edit tool"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "filesRead projection with contentHash/baseVersion"
      compatibility_obligation: "Projection must be deterministic and current."
      expected_consumer_behavior: "Enforce read-before-write from session evidence."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/agentToolRuntimeIncrementalEdit.test.mjs"
    - name: "Runbook generator"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "operation events and projection"
      compatibility_obligation: "Events must preserve enough metadata for user-facing summaries."
      expected_consumer_behavior: "Summarize actions without reading raw logs."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/agentRunbookService.test.mjs"
  data_flow:
    inbound:
      - source: "AgentToolLoop"
        payload_or_state: "tool started/finished/blocked events"
        validation: "shared schema parse"
    outbound:
      - target: "Workflow projection and UI"
        payload_or_state: "compact session projection"
        compatibility: "Additive to existing run snapshot"
```

## 5. Architecture, Contracts, Plan

```yaml
architecture_rules:
  project_specific:
    - "Session events are append-only."
    - "Full file contents are not persisted in session events."
    - "Projection can be rebuilt from events."
contracts:
  data_contracts:
    - name: "AgentOperationEvent"
      producer: "AgentToolLoop"
      consumers:
        - "AgentOperationalSessionRepository"
        - "Runbook generator"
        - "Workflow projection"
      migration_required: true
      compatibility_notes: "Postgres migration required for durable event rows."
  domain_contracts:
    - name: "Session status"
      producer: "AgentToolLoop"
      consumers:
        - "Preview UI"
      invariant: "A session has one terminal status: completed, failed, blocked or cancelled."
execution_plan:
  - step: 1
    name: "Inspect ledger/outbox conventions"
    agent: "repo_explorer"
    action: "Read existing file and Postgres repository patterns."
    expected_output: "Persistence pattern map."
  - step: 2
    name: "Add shared schemas"
    agent: "backend_specialist"
    action: "Define session, event and projection contracts."
    expected_output: "Shared schemas with tests."
  - step: 3
    name: "Add repositories and migration"
    agent: "backend_specialist"
    action: "Implement file/Postgres append/list/project operations."
    expected_output: "Durable session event storage."
  - step: 4
    name: "Wire AgentToolLoop"
    agent: "backend_specialist"
    action: "Append events around every tool action and terminal decision."
    expected_output: "Complete session trail for tool mode."
  - step: 5
    name: "Validate replay"
    agent: "qa_specialist"
    action: "Test projection rebuild and restart-safe read."
    expected_output: "Replay is deterministic."
```

## 6. Acceptance, Validation, Notes

```yaml
acceptance_criteria:
  functional:
    - "Every tool-mode agent run creates one operational session."
    - "Session records files read, files changed, commands, diffs, errors, retries and terminal status."
    - "Projection can be rebuilt after restart."
  integration:
    - "edit_file can query session read evidence."
    - "Workflow projection exposes compact session status."
  architectural:
    - "Session ledger extends existing durability model; it does not replace workflow ledger."
  quality:
    - "Repository, projection and tool-loop tests pass."
  observability:
    - "Blocked/failed sessions include actionable reason."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate shared session schemas."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test -- agentOperationalSession"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate repositories and projections."
      success_condition: "Exit code 0."
    - command: "pnpm typecheck"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate cross-package types."
      success_condition: "Exit code 0."
implementation_notes:
  preferred_approach: |
    Use opencode session/message/projector structure as the main implementation reference, but model it as
    Horus durable operational-session events linked to workflow run IDs and project IDs. Copy projector and
    event-reduction patterns where practical; do not copy storage or API shapes without adapting them to
    Horus repositories.
risks:
  - risk: "Operational session duplicates workflow event responsibilities."
    severity: "medium"
    mitigation: "Use session for low-level tool evidence and workflow projection for user-facing run state."
completion_checklist:
  implementation:
    - "Session schemas, persistence and tool-loop wiring are complete."
  validation:
    - "Replay and terminal status tests pass."
```

## 7. Implementation Log

```yaml
implemented_at_utc: "2026-05-29T00:30:00Z"
implementation_summary:
  - "Added shared AgentOperationalSession, AgentOperationEvent and AgentOperationProjection contracts with deterministic projection helpers."
  - "Added file and Postgres operational-session repositories with append-only operation events and restart-safe projection rebuilding."
  - "Added Postgres migration 016 for agent_operational_sessions and agent_operation_events."
  - "Wired AgentToolLoop to create one operational session per governed tool-loop execution and record tool starts, successes, blocks, failures, file reads, file changes, command evidence, diff inspection and terminal status."
  - "Extended AgentToolRuntime so read-before-write evidence can be seeded from an operational-session projection after restart."
  - "Exposed operationalSessionId through tool workflow events and Front Agent tool-loop output metadata."
validation:
  - "pnpm build"
  - "node --test packages/shared/test/agentOperationalSession.test.mjs apps/server/test/agentOperationalSessionRepository.test.mjs apps/server/test/agentToolRuntime.test.mjs apps/server/test/agentToolLoop.test.mjs apps/server/test/workflowToolEvents.test.mjs apps/server/test/postgresSchema.test.mjs"
  - "pnpm test"
known_followups:
  - "Spec 103 should turn the operational projection into a richer user-facing runbook timeline."
  - "Spec 100 should consume the same session evidence inside the full preflight/applier path."
```
