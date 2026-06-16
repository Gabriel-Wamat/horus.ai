---
format_version: "agentic_sdd.v1"
task_id: "feature-81-agentic-llm-tool-abort-and-distributed-breaker"
title: "Agentic LLM Tool Abort And Distributed Breaker"
created_at_utc: "2026-05-28T16:10:00Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "in_progress"
depends_on:
  - "spec/features/79-agentic-runtime-isolation.md"
  - "spec/features/80-agentic-isolation-cancellation-and-breaker-store.md"
---

# 81 - Agentic LLM Tool Abort And Distributed Breaker

## 1. Original User Request

```yaml
raw_user_request: |
  você precisa criar uma spec dedicada para resolver isso(Limite honesto: o timeout agora isola o node no nível da graph, mas ainda não cancela fisicamente toda chamada LLM/tool em andamento via AbortSignal. Também deixei circuit breaker em memória; para múltiplas réplicas, a próxima fatia precisa persistir/distribuir esse estado.). logo em seguida implemente
```

## 2. System Interpretation

```yaml
system_translation: |
  Fechar os dois limites residuais das SPECs 79 e 80:
  1. O AbortSignal criado pelo isolamento de node precisa chegar às chamadas LLM e ao runtime de tools.
  2. O circuit breaker não pode depender apenas de memória de processo quando o backend roda com mais de uma réplica.

expected_user_visible_result: |
  Nenhuma alteração visual direta. Workflows agênticos passam a cancelar chamadas cooperativas de LLM/tools
  e passam a compartilhar o estado do circuit breaker quando o driver persistente for Postgres.

expected_engineering_result: |
  Um gateway de invoke LLM usa o AbortSignal do AgentRuntimeIsolationContext; AgentToolRegistry/Runtime
  tornam tools abort-aware; a graph recebe um AgentCircuitBreakerStore do composition root; Postgres
  persiste o breaker por agentProfileId; o driver file mantém fallback persistente local explícito.
```

## 3. Findings To Fix

```yaml
findings:
  - name: "AbortSignal não consumido por LLM providers"
    location:
      - "apps/server/src/infrastructure/agents/*AgentImpl.ts"
      - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
      - "apps/server/src/infrastructure/http/routes/llmSettingsRoutes.ts"
    severity: "critical"
    impact: "Timeout no wrapper encerra o fluxo lógico, mas a requisição remota pode continuar consumindo latência, custo e sockets."
    fix: "Centralizar chamadas em invokeChatModel(), anexando getCurrentAgentAbortSignal() ao RunnableConfig."

  - name: "Tools sem contexto de cancelamento"
    location:
      - "apps/server/src/application/services/AgentToolRegistry.ts"
      - "apps/server/src/application/services/AgentToolRuntime.ts"
    severity: "high"
    impact: "Tools long-running ou mutantes podem continuar depois do timeout do node, criando efeitos tardios."
    fix: "Adicionar AgentToolExecutionContext com signal, checar signal antes/depois do handler e expor o signal ao handler."

  - name: "Circuit breaker não distribuído"
    location:
      - "apps/server/src/infrastructure/langgraph/AgentNodeIsolation.ts"
      - "apps/server/src/infrastructure/langgraph/graph.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/repositories/createRepositories.ts"
    severity: "critical"
    impact: "Em múltiplas réplicas, uma instância pode abrir breaker enquanto outra continua chamando o mesmo agente falho."
    fix: "Persistir AgentCircuitBreakerStore no driver Postgres e injetar o store no graph pelo composition root."

  - name: "Porta de breaker em camada incorreta"
    location: "apps/server/src/infrastructure/langgraph/AgentCircuitBreakerStore.ts"
    severity: "medium"
    impact: "Repositórios persistentes dependeriam de detalhe LangGraph, invertendo a direção arquitetural."
    fix: "Mover o contrato para application/services e deixar langgraph consumir a porta."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create invokeChatModel() gateway for BaseChatModel.invoke with the current agent AbortSignal."
    - "Replace direct model.invoke() calls in production LLM surfaces touched by agent workflows."
    - "Add abort-aware AgentToolExecutionContext and AgentToolAbortedError."
    - "Move AgentCircuitBreakerStore port to the application layer."
    - "Add FileAgentCircuitBreakerStore for local persistence."
    - "Add PostgresAgentCircuitBreakerStore and migration 013."
    - "Inject repositories.agentCircuitBreakers into createWorkflowGraph()."
    - "Add focused regression tests and keep full suite green."
  out_of_scope:
    - "Hard-killing provider SDK internals that do not honor AbortSignal."
    - "Tenant-scoped breaker keys; this slice keeps existing agentProfileId granularity."
    - "Admin UI for breaker state."
    - "External Redis/queue based breaker backend."
```

## 5. Integration Context Map

```yaml
integration_context:
  summary: |
    The graph already owns timeout/retry/circuit decisions. This spec connects that ownership to
    downstream LLM/tool execution and to durable storage, without spreading orchestration decisions
    into individual agents.

  depends_on:
    - name: "AgentRuntimeIsolationContext"
      type: "runtime_context"
      owner: "apps/server/infrastructure/langgraph"
      direction: "this_spec_consumes_dependency"
      contract_used: "getCurrentAgentAbortSignal()"
      required_for: "LLM and tool cancellation propagation."
      failure_modes:
        - "Undefined outside graph execution; helpers must degrade safely."
      fallback_or_recovery: "Invoke helpers omit signal when no isolation context exists."
      verification:
        - "invokeChatModel abort-signal regression test"

    - name: "PersistenceRepositories"
      type: "composition_root_contract"
      owner: "apps/server/infrastructure/repositories"
      direction: "this_spec_extends_dependency"
      contract_used: "driver-specific repository creation"
      required_for: "Distributed circuit breaker state."
      failure_modes:
        - "Postgres migrations missing table."
        - "File fallback loses cross-process distribution."
      fallback_or_recovery: "Postgres is distributed; file fallback is local-persistent and explicitly not multi-replica safe."
      verification:
        - "postgresSchema migration assertion"
        - "file store roundtrip test"

  depended_on_by:
    - name: "AgentNodeIsolationController"
      type: "graph_runtime"
      owner: "apps/server/infrastructure/langgraph"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "AgentCircuitBreakerStore injected from graph options"
      compatibility_obligation: "Default in-memory store remains available for isolated tests."
      expected_consumer_behavior: "createApp passes repositories.agentCircuitBreakers for real runtime."
      verification:
        - "agentNodeIsolation injected store test"

  data_flow:
    inbound:
      - source: "LangGraph isolated node"
        payload_or_state: "AbortSignal scoped by AsyncLocalStorage"
        validation: "Signal exists only inside isolated node execution."
      - source: "AgentNodeIsolationController"
        payload_or_state: "AgentProfileId failure/success events"
        validation: "AgentProfileIdSchema"
    outbound:
      - target: "LLM provider adapter"
        payload_or_state: "RunnableConfig.signal"
        persistence: "none"
      - target: "Agent tool handler"
        payload_or_state: "AgentToolExecutionContext.signal"
        persistence: "none"
      - target: "agent_circuit_breaker_states"
        payload_or_state: "failure_count, opened_at_ms, updated_at"
        persistence: "postgres table or file document"
```

## 6. Architecture Rules

```yaml
architecture_rules:
  - "Graph remains the only place that decides timeout/retry/circuit behavior."
  - "Agents call an LLM gateway; they must not hand-roll provider-specific abort logic."
  - "Tools receive cancellation context but remain responsible for passing signal to long-running I/O."
  - "The breaker store contract belongs to application, not langgraph infrastructure."
  - "Postgres is the production multi-replica store; file persistence is a local-dev fallback only."
  - "No broad agent rewrite beyond replacing invoke boundaries."
```

## 7. Validation

```yaml
validation:
  required_commands:
    - "pnpm --filter @u-build/server build"
    - "node --test apps/server/test/invokeChatModelAbortSignal.test.mjs apps/server/test/agentToolRegistry.test.mjs apps/server/test/agentCircuitBreakerStore.test.mjs apps/server/test/postgresSchema.test.mjs apps/server/test/safeCliRunner.test.mjs apps/server/test/projectAgentTools.test.mjs"
    - "pnpm test"
  acceptance_criteria:
    - "LLM invoke helper passes the active isolated AbortSignal to model.invoke()."
    - "AgentToolRegistry passes the active AbortSignal to handlers and blocks pre-aborted execution."
    - "createApp wires repositories.agentCircuitBreakers into createWorkflowGraph()."
    - "Postgres migration defines agent_circuit_breaker_states."
    - "File store persists breaker state across instances."
    - "Validation command tools terminate spawned subprocesses when the graph AbortSignal aborts."
    - "Full test suite remains green."
```

## Implementation Log

- 2026-05-28: Created SPEC 81 dedicated to physical/cooperative LLM/tool cancellation and persistent/distributed circuit breaker state.
- 2026-05-28: Added invokeChatModel() AbortSignal propagation for LangChain invoke calls, linked the OpenAI Responses fetch timeout to the graph AbortSignal, made AgentToolRegistry/Runtime abort-aware, passed tool cancellation into validation command execution with process-group termination in SafeCliRunner, moved the breaker port to application services, added file/Postgres breaker stores with migration 013, injected the runtime store through createApp/createWorkflowGraph, and validated with focused plus full test suites.
