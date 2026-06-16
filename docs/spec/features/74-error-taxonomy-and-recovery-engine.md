---
format_version: "agentic_sdd.v1"
task_id: "feature-74-error-taxonomy-and-recovery-engine"
title: "Error Taxonomy And Recovery Engine"
created_at_utc: "2026-05-28T14:19:19Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
depends_on:
  - "spec/features/67-artifact-validation-self-healing-and-observability-control-plane.md"
  - "spec/features/73-workflow-chat-memory-contract-spine.md"
---

# 74 - Error Taxonomy And Recovery Engine

## 1. Original User Request

```yaml
raw_user_request: |
  garantir que erros sejam tratados no sistema de forma automática com fallback... nível produto final
```

## 2. System Interpretation

```yaml
system_translation: |
  Substituir tratamento ad hoc de erros por uma taxonomia central de HorusError, politicas de retry/fallback,
  dead-letter/recovery queue, telemetria estruturada e escalonamento humano quando a recuperacao automatica
  for insegura.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Define HorusErrorCode, HorusFailureClass, retryability and severity in packages/shared."
    - "Create RecoveryPolicyEngine replacing summary-string heuristics in SelfHealingRecoveryService."
    - "Normalize errors from LLM, tool runtime, validation, preview, persistence, chat context and SSE."
    - "Persist recovery decisions as workflow events and ledger evidence."
    - "Add fallback matrix: retry, alternate agent path, validation skip disclosure, user approval, terminal failure."
    - "Replace console error paths with structured logger adapter."
  out_of_scope:
    - "Introducing an external queue provider."
    - "Changing public UX copy beyond truthful error/fallback state."
```

## 4. Integration Context

```yaml
integration_context:
  depends_on:
    - "packages/shared workflow/chat/run contracts"
    - "WorkflowOrchestrator retry loop"
    - "SelfHealingRecoveryService"
    - "AgentExecutionLedger"
    - "PreviewRuntimeManager"
  depended_on_by:
    - "ODIN retry routing"
    - "Curator gate decisions"
    - "Preview chat failure state"
    - "Agent Flow error rendering"
    - "Observability/alerts"
```

## 5. Execution Plan

```yaml
execution_plan:
  - "Add shared error taxonomy and schemas."
  - "Introduce HorusError factory and adapter helpers at infrastructure boundaries."
  - "Replace SelfHealingRecoveryService classify-by-summary with policy-table classification."
  - "Emit recovery_decision and fallback_executed workflow events."
  - "Add tests for transient, contract, safety, model-output, preview and persistence failures."
```

## 6. Validation

```yaml
validation:
  required_commands:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test apps/server/test/*recovery*.test.mjs"
  acceptance_criteria:
    - "Every automatic retry has a typed reason, max bound and user-visible/final outcome."
    - "Contract and safety errors never auto-apply code."
    - "Unhandled errors produce structured terminal state with correlation metadata."
```

## 7. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T14:32:45Z"
implemented_version: "1.0.0"
changes:
  - "Added shared HorusError taxonomy, recovery decision schemas and error envelope contracts."
  - "Introduced RecoveryPolicyEngine and routed SelfHealingRecoveryService through typed policy decisions instead of summary-string heuristics."
  - "Added recovery_decision and fallback_executed workflow events across shared schemas, run-flow projection, chat projection, memory persistence and Preview progress UI."
  - "Emitted typed recovery decisions when artifact candidate evidence fails required gates, plus fallback_executed events for non-retryable safety gates and blocked tool loops."
  - "Added focused shared/server tests for recovery contracts, projection, policy decisions and candidate evidence events."
validation_evidence:
  - "pnpm --filter @u-build/shared build"
  - "node --test packages/shared/test/horusError.test.mjs packages/shared/test/workflowEventProjection.test.mjs"
  - "pnpm --filter @u-build/server build"
  - "node --test apps/server/test/recoveryPolicyEngine.test.mjs apps/server/test/artifactCandidateService.test.mjs apps/server/test/agentToolLoop.test.mjs apps/server/test/workflowToolEvents.test.mjs"
  - "pnpm --filter @u-build/web test:guards"
  - "pnpm type-check"
```
