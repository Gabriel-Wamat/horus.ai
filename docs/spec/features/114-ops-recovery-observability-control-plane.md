---
format_version: "agentic_sdd.v1"
task_id: "feature-114-ops-recovery-observability-control-plane"
title: "Operations Recovery And Observability Control Plane"
created_at_utc: "2026-06-08T18:29:35Z"
author: "agent"
target_mode: "refactor"
priority: "p2"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "docs/spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "docs/spec/features/67-artifact-validation-self-healing-and-observability-control-plane.md"
  - "docs/spec/features/68-preview-chat-durable-workflow-recovery.md"
  - "docs/spec/features/74-error-taxonomy-and-recovery-engine.md"
  - "docs/spec/features/76-durable-restart-and-chaos-validation.md"
  - "docs/spec/features/99-agent-operational-session-ledger.md"
  - "docs/spec/features/103-agent-runbook-progress-projection.md"
---

# 114 - Operations Recovery And Observability Control Plane

## 1. Original User Request

```yaml
raw_user_request: |
  o que ainda precisamos para ficar profissional?
```

## 2. System Interpretation

```yaml
system_translation: |
  Fechar a camada operacional que torna o Horus confiável no dia a dia: run history, recuperação após restart,
  dead-letter/retry, métricas mínimas, diagnóstico de preview/agentes e mensagens de falha acionáveis.

expected_user_visible_result: |
  O usuário entende o que está rodando, o que falhou, por que falhou, qual arquivo/projeto foi afetado, qual ação tomar
  e consegue retomar/retry/parar sem olhar logs internos.

expected_engineering_result: |
  Eventos, ledger, runbook, preview sessions, validation evidence e error taxonomy alimentam um control plane coerente,
  com testes de recuperação e indicadores básicos de qualidade.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Expose run history with terminal/running/recovered/failed states."
    - "Show failed step, agent, error type, evidence and next action in UI."
    - "Add retry/resume/cancel controls where backend supports them."
    - "Reconcile stale running workflows and preview sessions after restart."
    - "Expose dead-letter/outbox backlog and recovery attempts in operator-safe UI."
    - "Add metrics for run success rate, preview startup time, curator fail reasons, retry count and validation duration."
    - "Create chaos/restart validation scripts for file and Postgres modes."
  out_of_scope:
    - "Full enterprise observability stack with OpenTelemetry collector."
    - "Multi-tenant admin dashboards."
    - "Remote production incident management."
```

## 4. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/HorusRunFlow.ts"
      - "packages/shared/src/entities/AgentOperationalSession.ts"
      - "apps/server/src/domain/services/WorkflowRecoveryService.ts"
      - "apps/server/src/domain/services/WorkflowEventProjector.ts"
      - "apps/server/src/infrastructure/repositories/*AgentExecutionLedgerRepository.ts"
      - "apps/server/src/infrastructure/http/routes/*"
    services:
      - "WorkflowRecoveryService"
      - "AgentExecutionLedger"
      - "WorkflowEventProjector"
      - "AgentRunbookService"
      - "Preview session recovery"
    database:
      migrations_required: "conditional"
      tables:
        - "agent_execution_runs"
        - "agent_execution_outbox"
        - "workflow_events"
        - "preview_sessions"
  frontend:
    files:
      - "apps/web/src/components/AgentFlow*"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/features/visual-preview/*"
      - "apps/web/src/api/*"
    components:
      - "Run history"
      - "Execution console"
      - "Recovery panel"
      - "Validation evidence panel"
  tests:
    unit:
      - "apps/server/test/workflowRecoveryService.test.mjs"
      - "apps/server/test/agentRunbookProjection.test.mjs"
    integration:
      - "apps/server/test/durableRestartRecovery.test.mjs"
      - "scripts/restart-chaos-smoke.mjs"
```

## 5. Integration Context Map

```yaml
integration_context:
  summary: |
    The control plane consumes events from workflow execution, preview runtime, agent operational sessions,
    validation evidence and durable ledger/outbox. It exposes a coherent user/operator view and recovery actions.

  depends_on:
    - name: "Agent execution ledger and outbox"
      type: "database"
      owner: "apps/server repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "run/attempt/outbox status, leases, terminal states"
      required_for: "Recover stale work and show durable state."
      failure_modes:
        - "Run appears active forever."
        - "Outbox retries silently fail."
      fallback_or_recovery: "Dead-letter and visible recovery status."
      verification:
        - "restart/chaos tests"

    - name: "Error taxonomy"
      type: "internal_module"
      owner: "packages/shared / domain services"
      direction: "this_spec_consumes_dependency"
      contract_used: "typed error category, retryability, suggested action"
      required_for: "Actionable UI failures and correct retry behavior."
      failure_modes:
        - "All failures look generic."
        - "Non-retryable errors are retried blindly."
      fallback_or_recovery: "Unknown errors render with safe generic action and trace id."
      verification:
        - "error projection tests"

  depended_on_by:
    - name: "Preview/Agent Flow UI"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Run/recovery/evidence snapshots"
      compatibility_obligation: "Existing run progress remains visible while new recovery details are additive."
      expected_consumer_behavior: "Show status, evidence, retry/cancel controls and diagnostic details."
      migration_or_notification_required: false
      verification:
        - "web typecheck"
        - "frontend state projection tests"
```

## 6. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Map current operational events"
    agent: "repo_explorer"
    action: "Read ledger, outbox, recovery, runbook, preview and run-flow projection code."
    expected_output: "Event/state map with missing recovery affordances."
  - step: 2
    name: "Normalize operator snapshot"
    agent: "backend_specialist"
    action: "Create or extend shared snapshot for run status, current step, failures, evidence and recovery actions."
    expected_output: "Typed snapshot consumed by UI."
  - step: 3
    name: "Implement recovery visibility"
    agent: "backend_specialist"
    action: "Expose stale-run reconciliation, outbox/dead-letter status and preview session recovery."
    expected_output: "Operator can see and act on recovery states."
  - step: 4
    name: "Add product metrics"
    agent: "observability_engineer"
    action: "Compute success rate, preview startup duration, curator fail reasons, retry counts and validation durations."
    expected_output: "Metrics available in local UI/logs without external stack."
  - step: 5
    name: "Build UI control plane"
    agent: "frontend_specialist"
    action: "Render run history, failure details, retry/resume/cancel and evidence summaries."
    expected_output: "Professional operator console."
  - step: 6
    name: "Chaos/restart validation"
    agent: "qa_specialist"
    action: "Add restart tests/scripts proving stale work is reconciled."
    expected_output: "Recovery validation evidence."
```

## 7. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "A failed run shows failing step, agent, error type, evidence and next action."
    - "A stale running run is reconciled after restart into recovered, failed or resumable state."
    - "Preview sessions with dead processes show recovery/error state instead of running."
    - "Operator can retry eligible failures and cannot retry non-retryable failures without explicit new run."
    - "Run history shows latest project, preview and validation evidence."
  integration:
    - "Ledger/outbox state, workflow events and UI snapshots agree on terminal status."
    - "Error taxonomy drives both backend retry policy and frontend copy."
  quality:
    - "Chaos/restart tests cover file mode and Postgres mode when available."
    - "Metrics do not leak secrets or prompt contents."
  observability:
    - "Success rate, preview startup duration, curator fail reason and retry count are visible or queryable."
```

## 8. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared type-check"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate operator snapshot contracts."
      success_condition: "exit code 0"
    - command: "pnpm --filter @u-build/server type-check && pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate recovery and observability services."
      success_condition: "exit code 0"
    - command: "pnpm --filter @u-build/web type-check && pnpm --filter @u-build/web build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate control plane UI."
      success_condition: "exit code 0"
    - command: "node --test apps/server/test/*.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Run recovery/projection regressions."
      success_condition: "all tests pass"
  runtime_checks:
    - name: "Restart reconciliation"
      method: "chaos script"
      expected: "Interrupted run is not left indefinitely running."
```

## 9. Risks

```yaml
risks:
  - risk: "Control plane becomes another large UI component."
    severity: "medium"
    mitigation: "Use focused hooks/components and shared projection helpers."
  - risk: "Recovery action mutates the wrong run/project."
    severity: "critical"
    mitigation: "Every action requires runId/projectId/sessionId and current version/hash where applicable."
  - risk: "Metrics imply production observability but are only local."
    severity: "low"
    mitigation: "Document local metrics scope and future OpenTelemetry boundary."
```
