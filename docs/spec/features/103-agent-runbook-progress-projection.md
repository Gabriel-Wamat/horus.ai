---
format_version: "agentic_sdd.v1"
task_id: "feature-103-agent-runbook-progress-projection"
title: "Agent Runbook Progress Projection"
created_at_utc: "2026-05-28T22:30:10Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_3_agent_code_execution_runtime"
depends_on:
  - "spec/features/65-event-sourced-chat-and-progress-streaming.md"
  - "spec/features/99-agent-operational-session-ledger.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 103 - Agent Runbook Progress Projection

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  Runbook automatico por execucao. A UI precisa mostrar: li X, editei Y, rodei Z, falhou por W,
  aguardando decisao.
```

## 2. System Interpretation

```yaml
system_translation: |
  Build a runbook projection service that converts low-level operational session events into compact,
  user-facing progress entries. The runbook must be deterministic, replayable and suitable for chat,
  Agent Flow and future debug views.

expected_user_visible_result: |
  The user sees a live narrative of agent work without waiting for the final answer: inspected project,
  read files, edited files, ran commands, validated, blocked or requested decision.

expected_engineering_result: |
  Horus gains AgentRunbookService and shared runbook event contracts derived from operational session
  events and workflow projections.
```

## 3. Scope And Entities

```yaml
scope:
  in_scope:
    - "Define AgentRunbookEntry shared schema."
    - "Project operational session events into user-facing summaries."
    - "Group repeated low-level events into stable progress steps."
    - "Support statuses: pending, running, succeeded, failed, blocked, waiting_for_decision."
    - "Persist or rebuild runbook from session events."
    - "Expose runbook entries through existing workflow snapshot/SSE projection."
  out_of_scope:
    - "Full new design system screen."
    - "LLM-generated summaries for every event."
    - "Storing secret command output."
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/AgentRunbook.ts"
      - "apps/server/src/application/services/AgentRunbookService.ts"
      - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
      - "apps/server/src/domain/services/WorkflowEventProjector.ts"
    services:
      - "AgentRunbookService"
      - "HorusRunFlowSnapshotBuilder"
    database:
      migrations_required: false
  frontend:
    files:
      - "apps/web/src/features/visual-preview/workflowProgress.ts"
      - "apps/web/src/features/visual-preview/previewChatMessages.ts"
    components:
      - "Preview progress"
      - "Agent Flow activity"
  workflow:
    agents:
      - "All agents with operational sessions"
  tests:
    unit:
      - "packages/shared/test/agentRunbook.test.mjs"
      - "apps/server/test/agentRunbookService.test.mjs"
      - "apps/web/src/features/visual-preview/workflowProgress.test.ts"
```

## 4. Integration Context Map

```yaml
integration_context:
  summary: |
    Runbook projection is downstream of the operational session ledger and upstream of UI progress.
    It must not invent actions; every entry maps to real events.
  depends_on:
    - name: "Agent operational session"
      type: "database"
      owner: "apps/server/application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "AgentOperationEvent stream"
      required_for: "Build factual runbook entries."
      assumptions:
        - "SPEC 99 provides durable session events."
      failure_modes:
        - "Runbook reports work that did not happen."
      fallback_or_recovery: "Only produce entries from parsed events; otherwise show no evidence."
      verification:
        - "apps/server/test/agentRunbookService.test.mjs"
  depended_on_by:
    - name: "Preview UI progress"
      type: "frontend_component"
      owner: "apps/web/features/visual-preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "AgentRunbookEntry[]"
      compatibility_obligation: "Existing progress rendering remains compatible."
      expected_consumer_behavior: "Render compact live progress rows."
      migration_or_notification_required: false
      verification:
        - "apps/web workflowProgress tests"
```

## 5. Architecture, Plan, Acceptance

```yaml
architecture_rules:
  project_specific:
    - "Runbook entries must be projections of real events."
    - "Do not use LLM summarization for correctness-critical status."
    - "Keep raw output tails out of primary runbook text."
contracts:
  ui_contracts:
    - name: "Agent runbook progress"
      producer: "AgentRunbookService"
      consumers:
        - "Preview progress UI"
        - "Agent Flow UI"
      requirement: "Show current action, status, agent, target file/command and failure reason."
execution_plan:
  - step: 1
    name: "Define shared runbook entries"
    agent: "backend_specialist"
    action: "Add schema with stable action types and statuses."
    expected_output: "Typed runbook contract."
  - step: 2
    name: "Implement projection service"
    agent: "backend_specialist"
    action: "Map session events to grouped progress entries."
    expected_output: "Deterministic runbook from event stream."
  - step: 3
    name: "Wire workflow snapshot"
    agent: "backend_specialist"
    action: "Expose compact runbook in snapshot/SSE."
    expected_output: "Frontend receives runbook entries."
  - step: 4
    name: "Render in existing UI"
    agent: "frontend_specialist"
    action: "Adapt Preview progress rendering with stable rows."
    expected_output: "User-visible action list."
acceptance_criteria:
  functional:
    - "Read/edit/command/failure/waiting events produce clear runbook entries."
    - "Reload can rebuild the same runbook from session events."
  observability:
    - "Runbook states exactly why an agent is blocked or waiting."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server test -- agentRunbookService"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate projection."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web test"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate frontend progress rendering."
      success_condition: "Exit code 0."
implementation_notes:
  preferred_approach: |
    Use opencode session projector and tool status UI patterns as the main reference. Copy/adapt grouping and
    status-title behavior where possible, but derive every Horus runbook entry from typed operational-session
    events rather than free-form agent narration.
risks:
  - risk: "Runbook becomes too noisy."
    severity: "medium"
    mitigation: "Group low-level chunks into one entry per tool/action."
```

## 6. Implementation Log

```yaml
implemented_at_utc: "2026-05-29T01:40:00Z"
implementation_summary:
  - "Added shared AgentRunbookEntry, AgentRunbookAction and AgentRunbookStatus contracts."
  - "Added AgentRunbookService to project operational-session events and workflow events into deterministic progress rows."
  - "Extended the operational-session repository port with listSessionsByWorkflowThread for replay-based snapshot rebuilding."
  - "Exposed runbookEntries through HorusRunSnapshot and wired HorusRunFlowSnapshotBuilder to merge workflow and operational entries."
  - "Rendered runbook rows in the Agent Flow drawer and added preview-progress helpers for runbook-backed live activity."
  - "Added focused shared, server and frontend guard coverage."
validation:
  - command: "pnpm --filter @u-build/shared build && pnpm --filter @u-build/server build && pnpm --filter @u-build/web type-check"
    result: "passed"
  - command: "node --test packages/shared/test/agentRunbook.test.mjs apps/server/test/agentRunbookService.test.mjs apps/server/test/agentOperationalSessionRepository.test.mjs apps/web/test/workflowProgressRunbook.test.mjs"
    result: "passed"
```
