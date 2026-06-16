---
format_version: "agentic_sdd.v1"
task_id: "feature-79-agentic-runtime-isolation"
title: "Agentic Runtime Isolation"
created_at_utc: "2026-05-28T15:08:52Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "in_progress"
depends_on:
  - "spec/features/72-agent-tool-runtime-react-loop-and-e2e-closure.md"
  - "spec/features/74-error-taxonomy-and-recovery-engine.md"
  - "spec/features/76-durable-restart-and-chaos-validation.md"
  - "spec/features/78-production-readiness-p0-remediation.md"
---

# 79 - Agentic Runtime Isolation

## 1. Original User Request

```yaml
raw_user_request: |
  em seguida, quero que analise isso rigorosamente, encontre todas as falhas e crie uma spec de refatoração e ajuste, em seguida a implemente:

  quero isolamento do sistema agêntico

  * single responsibility agents
  * workflows determinísticos
  * orchestration centralizada
  * state machine
  * graph orchestration
  * tool isolation
  * timeout isolation
  * retry policies
  * circuit breaker
  * dead-letter queue
```

## 2. System Interpretation

```yaml
system_translation: |
  Auditar o runtime agêntico existente e iniciar uma refatoração de isolamento: perfis de agente
  devem declarar responsabilidades e políticas runtime, a LangGraph deve aplicar isolamento de
  timeout/retry/circuit breaker de forma centralizada, e o outbox/DLQ deve impedir reprocessamento
  concorrente imediato de eventos já em processing.

expected_user_visible_result: |
  O sistema passa a ter uma SPEC local para isolamento agêntico e uma primeira fatia implementada
  com contratos, testes e validação.

expected_engineering_result: |
  AgentProfile inclui política explícita de runtime isolation; a graph aplica um wrapper central
  em nodes de agente; retries/timeouts/circuit breaker são determinísticos e testáveis; outbox
  só re-clama processing após lease TTL, preservando a DLQ.
```

## 3. Rigorous Findings

```yaml
findings:
  - name: "Agent runtime policy is implicit"
    locations:
      - "packages/shared/src/entities/AgentResult.ts"
      - "apps/server/src/application/services/AgentProfileRegistry.ts"
    severity: "high"
    priority: "p1"
    impact: "Perfis definem propósito/tools, mas não declaram timeout, retries ou circuit breaker."
    fix: "Adicionar isolationPolicy ao contrato AgentProfile e preencher por agente."

  - name: "LangGraph nodes execute without centralized isolation"
    locations:
      - "apps/server/src/infrastructure/langgraph/graph.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/*.ts"
    severity: "critical"
    priority: "p0"
    impact: "Cada node pode travar/falhar sem política runtime uniforme; comportamento fica espalhado."
    fix: "Envolver nodes de agente com AgentNodeIsolationController no composition point da graph."

  - name: "Outbox can reclaim processing rows immediately"
    locations:
      - "apps/server/src/infrastructure/repositories/FileAgentExecutionLedgerRepository.ts"
      - "apps/server/src/infrastructure/repositories/PostgresAgentExecutionLedgerRepository.ts"
    severity: "critical"
    priority: "p0"
    impact: "Dois workers podem executar o mesmo evento se um processing for re-clamado sem lease TTL."
    fix: "Permitir reclaim de processing apenas quando lockedAt expirou."

  - name: "Retry policy exists mainly in curator loop, not node runtime"
    locations:
      - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
      - "apps/server/src/application/services/RecoveryPolicyEngine.ts"
    severity: "high"
    priority: "p1"
    impact: "Retries de validação existem, mas falhas transitórias de node/LLM/tool não têm política central."
    fix: "Adicionar retry bounded no wrapper de node, respeitando isolationPolicy."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add AgentRuntimeIsolationPolicy shared contract."
    - "Add per-agent isolation policies to AgentProfileRegistry."
    - "Apply centralized timeout/retry/circuit breaker wrapper in LangGraph node registration."
    - "Add focused tests for timeout, retry and circuit-open behavior."
    - "Harden file and Postgres outbox claim so processing events require stale lease before reclaim."
    - "Update focused tests for stale processing reclaim and dead-letter behavior."
    - "Update local spec README/CHANGELOG."
  out_of_scope:
    - "Replacing LangGraph."
    - "Full distributed circuit breaker storage."
    - "Full auth/tenant isolation."
    - "AbortSignal propagation into every LLM/tool provider."
    - "Replacing every console log with structured telemetry."
```

## 5. Integration Context Map

```yaml
integration_context:
  summary: |
    This work sits between shared agent contracts, LangGraph node execution and durable outbox
    recovery. It must preserve existing tool contracts and workflow state while adding runtime
    isolation at the graph boundary.

  depends_on:
    - name: "AgentProfile contract"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "AgentProfileSchema"
      required_for: "Single responsibility agents and runtime policy declarations."
      assumptions: []
      failure_modes:
        - "Profiles parse without policy and runtime behavior remains implicit."
      fallback_or_recovery: "Default isolation policy in schema."
      verification:
        - "node --test packages/shared/test/agentProfileIsolationPolicy.test.mjs"

    - name: "LangGraph workflow graph"
      type: "workflow"
      owner: "apps/server/infrastructure/langgraph"
      direction: "this_spec_consumes_dependency"
      contract_used: "StateGraph node registration"
      required_for: "Central orchestration of timeout/retry/circuit breaker."
      assumptions: []
      failure_modes:
        - "Node wrappers break graph update types."
      fallback_or_recovery: "Focused build and node isolation tests."
      verification:
        - "pnpm --filter @u-build/server build"
        - "node --test apps/server/test/agentNodeIsolation.test.mjs"

    - name: "Agent execution ledger outbox"
      type: "database"
      owner: "apps/server/infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "claimNextOutbox / failOutbox / dead_letter"
      required_for: "Dead-letter queue and retry isolation."
      assumptions: []
      failure_modes:
        - "Processing outbox events are duplicated before a worker lease expires."
      fallback_or_recovery: "Stale lease TTL gate."
      verification:
        - "node --test apps/server/test/agentExecutionLedger.test.mjs apps/server/test/durable-restart-recovery.test.mjs"

  depended_on_by:
    - name: "WorkflowOrchestrator"
      type: "backend_service"
      owner: "apps/server/domain"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Graph nodes fail/retry/timeout deterministically."
      compatibility_obligation: "Must preserve existing workflow event and state contracts."
      expected_consumer_behavior: "Runtime failures surface as graph errors after bounded isolation policy."
      migration_or_notification_required: false
      verification:
        - "pnpm test"

  bidirectional_integrations:
    - name: "Agent profile to graph node mapping"
      participants:
        - "AgentProfileRegistry"
        - "createWorkflowGraph"
      shared_contract: "AgentProfileId"
      consistency_rule: "Every executable graph agent node must map to one profile and isolation policy."
      verification:
        - "Focused AgentNodeIsolation tests and server build."

  data_flow:
    inbound:
      - source: "LangGraph state"
        payload_or_state: "UBuildState"
        validation: "Existing node preconditions plus isolation wrapper."
    outbound:
      - target: "LangGraph update"
        payload_or_state: "UBuildUpdate or thrown isolated runtime error"
        persistence: "WorkflowOrchestrator persists final state/error."
```

## 6. Architecture Rules

```yaml
architecture_rules:
  - "Agents remain single-purpose: Spec creates specs, Odin routes, Front proposes code, QA validates, Curator decides."
  - "The graph composition point owns node isolation; individual nodes should not implement bespoke timeout/retry loops."
  - "Tools remain deny-by-default and profile-gated."
  - "Retries must be bounded and deterministic."
  - "Circuit breaker must fail closed while open."
  - "DLQ must represent exhausted delivery, not active processing."
  - "Processing outbox rows can be reclaimed only after a stale lease threshold."
```

## 7. Execution Plan

```yaml
execution_plan:
  phase_1_runtime_isolation_contracts:
    status: "in_progress"
    tasks:
      - "Add shared AgentRuntimeIsolationPolicy schema."
      - "Attach policy to each AgentProfile."
      - "Add graph node isolation wrapper with timeout, retry and in-memory circuit breaker."
      - "Wrap graph agent nodes centrally."
      - "Add focused tests."

  phase_2_durable_dlq_hardening:
    status: "in_progress"
    tasks:
      - "Add stale processing lease semantics to file outbox claim."
      - "Add stale processing lease semantics to Postgres outbox claim."
      - "Update tests so immediate processing reclaim is rejected but stale reclaim succeeds."

  phase_3_future_distributed_isolation:
    status: "planned"
    tasks:
      - "Persist circuit breaker state for multi-instance deployments."
      - "Propagate AbortSignal into LLM/tool providers."
      - "Expose isolation policy and breaker state through observability/control-plane UI."
```

## 8. Validation

```yaml
validation:
  required_commands:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/agentProfileIsolationPolicy.test.mjs"
    - "node --test apps/server/test/agentNodeIsolation.test.mjs"
    - "node --test apps/server/test/agentExecutionLedger.test.mjs apps/server/test/durable-restart-recovery.test.mjs"
    - "pnpm test"
  acceptance_criteria:
    - "Every AgentProfile has an isolationPolicy."
    - "Graph node execution is wrapped centrally by profile."
    - "Timeout failures are bounded and named."
    - "Retry succeeds for transient failures within maxAttempts."
    - "Circuit opens after configured failures and blocks subsequent calls until cooldown."
    - "Processing outbox events are not reclaimed before lease TTL."
    - "Stale processing outbox events can be reclaimed and later dead-lettered."
```

## Implementation Log

- 2026-05-28: Created SPEC 79 after auditing agentic runtime isolation gaps; implementation started.
- 2026-05-28: Implemented shared agent runtime isolation policies, centralized LangGraph node timeout/retry/circuit-breaker wrapper, stale processing lease semantics for file/Postgres outbox claims, and focused/full validation coverage.
