---
format_version: "agentic_sdd.v1"
task_id: "feature-80-agentic-isolation-cancellation-and-breaker-store"
title: "Agentic Isolation Cancellation And Breaker Store"
created_at_utc: "2026-05-28T15:22:00Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "in_progress"
depends_on:
  - "spec/features/79-agentic-runtime-isolation.md"
---

# 80 - Agentic Isolation Cancellation And Breaker Store

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec para ajustar todos esses pontos encontrados, em seguida implente
```

## 2. System Interpretation

```yaml
system_translation: |
  Ajustar os riscos residuais explicitados após a SPEC 79: o timeout do node ainda não fornece
  cancelamento cooperativo para LLM/tools, e o circuit breaker ainda está acoplado a estado em
  memória dentro do controller. Esta SPEC cria o contrato estrutural correto: contexto runtime
  com AbortSignal propagável e store de circuit breaker plugável, mantendo a graph centralizada.

expected_user_visible_result: |
  Nenhuma mudança visual direta. O runtime agêntico fica mais seguro para evolução production-grade.

expected_engineering_result: |
  Nodes executados pelo isolation controller passam a ter um contexto runtime consultável com
  AbortSignal; timeout aborta esse signal; circuit breaker deixa de ser um Map interno rígido e
  passa a depender de uma porta substituível por storage persistente/distribuído.
```

## 3. Findings To Fix

```yaml
findings:
  - name: "Timeout sem cancelamento cooperativo"
    location: "apps/server/src/infrastructure/langgraph/AgentNodeIsolation.ts"
    severity: "high"
    impact: "O wrapper retorna timeout, mas chamadas LLM/tool que suportem cancelamento ainda não têm um signal padrão para obedecer."
    fix: "Criar AgentRuntimeIsolationContext via AsyncLocalStorage e abortar o signal no timeout."

  - name: "Circuit breaker preso a estado em memória"
    location: "apps/server/src/infrastructure/langgraph/AgentNodeIsolation.ts"
    severity: "high"
    impact: "Não há porta clara para persistir/distribuir breaker em múltiplas instâncias."
    fix: "Extrair AgentCircuitBreakerStore com implementação in-memory default."

  - name: "Sem evidência testável de propagação do contexto"
    location: "apps/server/test/agentNodeIsolation.test.mjs"
    severity: "medium"
    impact: "Futuras integrações podem ignorar abort/context sem perceber."
    fix: "Adicionar regressões provando contexto, attempt e AbortSignal."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add AgentRuntimeIsolationContext with AsyncLocalStorage."
    - "Expose helpers to read current agent profile, attempt and AbortSignal."
    - "Abort the current signal on node timeout."
    - "Extract AgentCircuitBreakerStore and InMemoryAgentCircuitBreakerStore."
    - "Make AgentNodeIsolationController depend on the store port."
    - "Add focused tests for context propagation, timeout abort and store-backed circuit breaker."
    - "Update local spec README/CHANGELOG and implementation log."
  out_of_scope:
    - "Threading AbortSignal through every LLM provider and tool implementation."
    - "Adding a Postgres circuit breaker store in this same slice."
    - "Changing frontend UI."
    - "Changing auth/tenant boundaries."
```

## 5. Integration Context Map

```yaml
integration_context:
  summary: |
    This work is an architectural bridge between graph isolation and future LLM/tool cancellation.
    It preserves existing node signatures while making runtime context available to downstream
    services without passing a new parameter through every call immediately.

  depends_on:
    - name: "AgentNodeIsolationController"
      type: "backend_service"
      owner: "apps/server/infrastructure/langgraph"
      direction: "this_spec_consumes_dependency"
      contract_used: "wrap(agentProfileId, node)"
      required_for: "Central graph isolation point."
      assumptions: []
      failure_modes:
        - "If wrapping changes node behavior, workflows can fail."
      fallback_or_recovery: "Focused graph isolation tests and full pnpm test."
      verification:
        - "node --test apps/server/test/agentNodeIsolation.test.mjs"

  depended_on_by:
    - name: "Future LLM/tool gateways"
      type: "backend_service"
      owner: "apps/server/infrastructure"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "getCurrentAgentAbortSignal()"
      compatibility_obligation: "Must return undefined outside isolated node execution."
      expected_consumer_behavior: "Provider adapters can opt into cooperative cancellation."
      migration_or_notification_required: false
      verification:
        - "Focused context propagation tests."

  bidirectional_integrations:
    - name: "Circuit breaker store"
      participants:
        - "AgentNodeIsolationController"
        - "AgentCircuitBreakerStore"
      shared_contract: "get/set/clear CircuitState by AgentProfileId"
      consistency_rule: "Breaker opens only after final failed attempts, clears after cooldown or success."
      verification:
        - "Store-backed circuit breaker tests."

  data_flow:
    inbound:
      - source: "LangGraph node execution"
        payload_or_state: "UBuildState"
        validation: "Existing state contracts."
    outbound:
      - target: "Downstream agent services"
        payload_or_state: "AgentRuntimeIsolationContext"
        persistence: "AsyncLocalStorage scope only."
```

## 6. Architecture Rules

```yaml
architecture_rules:
  - "Do not add a fake distributed circuit breaker; add the correct port first."
  - "Do not change every agent dependency signature in one broad refactor."
  - "AbortSignal propagation must be cooperative and optional."
  - "Context helper must return undefined outside isolated execution."
  - "Existing graph and node contracts must remain compatible."
```

## 7. Validation

```yaml
validation:
  required_commands:
    - "pnpm --filter @u-build/server build"
    - "node --test apps/server/test/agentNodeIsolation.test.mjs"
    - "pnpm test"
  acceptance_criteria:
    - "Timeout aborts the isolated node AbortSignal."
    - "Runtime context exposes profileId and attempt."
    - "Circuit breaker behavior uses an injectable store."
    - "Full test suite remains green."
```

## Implementation Log

- 2026-05-28: Created SPEC 80 to close SPEC 79 residual risks around cooperative cancellation and circuit breaker persistence seams.
- 2026-05-28: Added AgentRuntimeIsolationContext with AsyncLocalStorage, AbortSignal propagation on isolated node execution, timeout-triggered aborts, AgentCircuitBreakerStore port with in-memory default, and focused tests for context, timeout cancellation and store-backed breaker state.
