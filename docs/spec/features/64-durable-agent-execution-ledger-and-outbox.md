---
format_version: "agentic_sdd.v1"
task_id: "feature-64-durable-agent-execution-ledger-and-outbox"
title: "Durable Agent Execution Ledger And Outbox"
created_at_utc: "2026-05-27T17:09:18Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "spec/features/39-agentic-orchestration-integrity.md"
  - "spec/features/41-agentic-runtime-validation-observability.md"
  - "spec/features/50-preview-chat-command-streaming.md"
  - "spec/features/51-local-persistence-portability.md"
  - "spec/features/63-browser-visual-validation-and-worktree-hygiene.md"
research_catalog: "spec/notes/ai-agent-engineering-strategy-catalog.md"
---

# 64 - Durable Agent Execution Ledger And Outbox

## 1. Original User Request

```yaml
raw_user_request: |
  quero que faça uma revisão rigorosa de todos os pontos que precisam ser refatorados na parte de agentes, chat, salvamento de dados, memória dos agentes e da conversa etc. todas as boas práticas que faltam

  pesquise quais são melhores práticas de engenharia de IA(no arxiv, medium, github, fóruns, reddit) para resolver esse tipo de problema, após isso catalogue as estratégias. em seguida, use a skill de criar spec para planeja a solução desse problema, (analise quantas specs são necessárias, para que você consiga detalhar rigorosamente e ter o máximo de contexto para solucionar de forma cirúrgica)
```

## 2. System Interpretation

```yaml
system_translation: |
  Planejar a fundação de execução durável para agentes no Horus. O fluxo atual dispara LangGraph em fire-and-forget,
  mistura estado JSON/checkpoints/eventos, e não possui um ledger transacional para turns, runs, attempts e handoff
  de worker. Esta spec cria o contrato de persistência e orquestração que as próximas specs de chat, memória e
  validação irão consumir.

expected_user_visible_result: |
  Quando o usuário pede uma alteração no chat, a interface deve mostrar que o pedido foi aceito e deve continuar
  recuperável mesmo se a aba recarregar, o SSE cair ou o servidor reiniciar. Uma corrida nunca deve sumir, duplicar
  ou terminar como sucesso por inferência fraca.

expected_engineering_result: |
  Introduzir tabelas/contratos para chat turns, workflow runs, attempts, outbox events, execution leases e idempotency.
  Substituir início fire-and-forget por gravação transacional e worker/runner recuperável. Preservar LangGraph, mas
  colocar checkpoint, workflow state e eventos sob um ledger claro.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O usuário não consegue confiar que o Horus realmente executou, recuperou, validou e concluiu uma solicitação de agente."
  target_user: "Operador do Horus que pede mudanças no front, acompanha execução e espera que o sistema nunca entregue estado falso."
  expected_outcome: "Toda execução tem identidade, estado, tentativas, eventos e recuperação auditáveis."
  product_surface:
    - "Preview chat command executor"
    - "Agent flow map"
    - "Workflow events"
    - "Preview project construction"
    - "Database/file-mode persistence"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph StateGraph"
      - "Postgres/file repositories"
    frontend:
      - "React/Vite consumers of workflow status"
    database:
      - "Postgres migrations in apps/server/src/infrastructure/database/migrations"
      - "File-mode fallback under HORUS_DATA_DIR"
    infrastructure:
      - "pnpm monorepo"
      - "LangGraph checkpointer"
  known_entrypoints:
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/infrastructure/langgraph/checkpointer.ts"
    - "apps/server/src/infrastructure/langgraph/FileMemorySaver.ts"
    - "apps/server/src/infrastructure/repositories/createRepositories.ts"
    - "apps/server/src/infrastructure/database/migrations"
  known_existing_patterns:
    - "WorkflowState is a shared schema in packages/shared."
    - "Workflow events already have thread sequence storage."
    - "Postgres mode and file mode both exist and must remain supported."
    - "The repo may have unrelated dirty worktree changes; implementation must be path-scoped."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create durable execution ledger schema/contracts for turns, workflow runs, attempts, outbox and leases."
    - "Replace fire-and-forget workflow start with persisted outbox handoff."
    - "Make workflow start/resume/retry idempotent by external key."
    - "Persist terminal states explicitly; forbid fallback completed status when graph state is absent/ambiguous."
    - "Define file-mode equivalents for the new ledger, with atomic writes and recovery tests."
    - "Add startup recovery for running/leased executions."
    - "Expose run status and recovery metadata to existing UI consumers without breaking current endpoints."
  out_of_scope:
    - "Full chat UI rewrite; handled by spec 65."
    - "Long-term memory and dynamic skills; handled by spec 66."
    - "Artifact validation control plane; handled by spec 67."
    - "Replacing LangGraph with Temporal/Inngest; this spec keeps LangGraph and adopts their durable patterns locally."
    - "Committing or pushing changes."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      - "apps/server/src/infrastructure/langgraph/checkpointer.ts"
      - "apps/server/src/infrastructure/langgraph/FileMemorySaver.ts"
      - "apps/server/src/infrastructure/repositories/contracts.ts"
      - "apps/server/src/infrastructure/repositories/createRepositories.ts"
      - "apps/server/src/infrastructure/http/server.ts"
    services:
      - "WorkflowOrchestrator"
      - "SubmitHorusChatTurnUseCase"
      - "PersistentWorkflowEventStream"
      - "Workflow storage repositories"
    database:
      migrations_required: true
      tables:
        - "agent_execution_turns"
        - "agent_workflow_runs"
        - "agent_workflow_attempts"
        - "agent_execution_outbox"
        - "agent_execution_leases"
        - "workflow_states"
        - "workflow_events"
  frontend:
    files:
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
    components:
      - "VisualPreviewConsole"
      - "AgentFlowMap"
    routes:
      - "?mode=preview"
      - "?mode=agents"
  workflow:
    graph_nodes:
      - "specAgent"
      - "odinAgent"
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
      - "hitlCheckpoint"
      - "retryCheckpoint"
    agents:
      - "Spec"
      - "Odin"
      - "Front"
      - "QA"
      - "Curator"
  tests:
    unit:
      - "server ledger repository tests"
      - "workflow orchestrator idempotency tests"
    integration:
      - "chat turn starts workflow exactly once"
      - "startup recovers running outbox item"
    e2e:
      - "browser preview request remains visible after reload"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec becomes the execution foundation below chat, agents, preview and workflow maps. It must be implemented first
    because later specs will depend on stable turn/run/attempt IDs and replayable state.

  depends_on:
    - name: "LangGraph compiled graph"
      type: "internal_module"
      owner: "server/langgraph"
      direction: "this_spec_consumes_dependency"
      contract_used: "workflowGraph.stream(input, config), getState({ configurable.thread_id })"
      required_for: "Execute and checkpoint the existing StateGraph without changing agent semantics."
      assumptions:
        - "Graph can continue using thread_id as the primary LangGraph checkpoint key."
      failure_modes:
        - "Graph stream throws mid-run."
        - "Checkpoint store loses state."
      fallback_or_recovery: "Mark run as error or retryable_from_checkpoint; never infer success."
      verification:
        - "Focused tests for failed graph stream and persisted error state."

    - name: "Chat turn use case"
      type: "backend_service"
      owner: "server/application"
      direction: "this_spec_consumes_dependency"
      contract_used: "SubmitHorusChatTurnUseCase invokes mutable workflow actions."
      required_for: "Persist a user turn and enqueue mutable work transactionally."
      assumptions: []
      failure_modes:
        - "User message saved but workflow not started."
        - "Workflow started twice after retry."
      fallback_or_recovery: "Idempotency key returns existing run/turn."
      verification:
        - "Integration test retries same turn id and observes one workflow run."

  depended_on_by:
    - name: "Spec 65 Event-Sourced Chat"
      type: "workflow"
      owner: "preview/chat"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "turnId, runId, attemptId, outbox event IDs and durable status transitions."
      compatibility_obligation: "must preserve existing chat endpoints while adding new identifiers"
      expected_consumer_behavior: "Project chat messages from durable execution events."
      migration_or_notification_required: false
      verification:
        - "Spec 65 tests consume ledger IDs without guessing thread IDs."

    - name: "Spec 67 Validation Control Plane"
      type: "workflow"
      owner: "agents/validation"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "attemptId and terminal state rules."
      compatibility_obligation: "must expose attempt lineage for candidate artifacts"
      expected_consumer_behavior: "Attach validation evidence to exact attempt."
      migration_or_notification_required: false
      verification:
        - "Artifact candidate selected by attemptId."

  bidirectional_integrations:
    - name: "Workflow state and workflow events"
      participants:
        - "agent_workflow_runs"
        - "workflow_states/workflow_events"
      shared_contract: "threadId/runId/status/sequence"
      consistency_rule: "Every workflow event belongs to a known run or an explicitly imported legacy thread."
      verification:
        - "Database integrity and replay tests."

  data_flow:
    inbound:
      - source: "Horus chat turn"
        payload_or_state: "chatSessionId, message, project context, userStoryId, llmSettingsRef"
        validation: "Zod input schema plus session scope check"
    outbound:
      - target: "Workflow worker"
        payload_or_state: "outbox event with turnId/runId/threadId/action payload"
        validation: "database constraints plus typed repository parser"
      - target: "UI/API consumers"
        payload_or_state: "durable run status with terminal/error/retry metadata"
        validation: "shared schema"
```

## 7. Required Data Model

```yaml
tables:
  agent_execution_turns:
    purpose: "One user initiated chat/action turn."
    required_columns:
      - "id uuid primary key"
      - "chat_session_id uuid not null"
      - "source_message_id uuid null"
      - "idempotency_key text not null unique"
      - "intent jsonb not null"
      - "status text check pending|accepted|running|completed|blocked|failed|cancelled"
      - "created_at/updated_at timestamptz"
  agent_workflow_runs:
    purpose: "One durable workflow run mapped to LangGraph thread."
    required_columns:
      - "id uuid primary key"
      - "turn_id uuid null references agent_execution_turns(id)"
      - "thread_id uuid not null unique"
      - "workflow_mode text not null"
      - "status text not null"
      - "lease_owner text null"
      - "started_at/completed_at/updated_at"
      - "last_error text null"
  agent_workflow_attempts:
    purpose: "Retry/attempt lineage within a run."
    required_columns:
      - "id uuid primary key"
      - "run_id uuid not null"
      - "attempt_number integer not null"
      - "started_at/completed_at"
      - "status text not null"
      - "failure_class text null"
  agent_execution_outbox:
    purpose: "Transactional handoff from API to workflow runner."
    required_columns:
      - "id uuid primary key"
      - "event_type text not null"
      - "dedupe_key text not null unique"
      - "payload jsonb not null"
      - "status text check pending|processing|processed|failed|dead_letter"
      - "available_at/locked_at/processed_at"
      - "attempt_count integer"
  agent_execution_leases:
    purpose: "Worker ownership/recovery."
    required_columns:
      - "run_id uuid primary key"
      - "owner_id text not null"
      - "expires_at timestamptz not null"
      - "heartbeat_at timestamptz not null"
```

## 8. Execution Plan

1. Inspect current `WorkflowOrchestrator`, repositories and migrations.
2. Add shared schemas for `AgentExecutionTurn`, `AgentWorkflowRun`, `AgentWorkflowAttempt`, `AgentExecutionOutboxEvent`.
3. Add Postgres migration for ledger/outbox/leases.
4. Add file-mode repository implementations with atomic JSON writes.
5. Add repository contracts to `createRepositories`.
6. Refactor `SubmitHorusChatTurnUseCase` mutable action path to create a turn and outbox record transactionally.
7. Add a server-side outbox runner/worker that calls `WorkflowOrchestrator.runGraphStream` with explicit run ownership.
8. Replace fire-and-forget public methods with enqueue/start semantics; internal worker may still stream but must own lease and terminal status.
9. Refactor `persistState` so ambiguous missing status does not default to `completed`.
10. Add startup recovery for runs with expired leases or pending outbox records.
11. Preserve existing endpoints; include new IDs in response where possible.
12. Add tests for idempotent start, duplicate HTTP retry, graph failure, restart recovery, file-mode durability.

## 9. Failure Modes And Required Mitigations

| Failure | Required Behavior |
| --- | --- |
| HTTP stream disconnects after user message | Turn remains persisted; outbox worker continues; UI can replay status later. |
| Same request retried by client | Existing turn/run returned by idempotency key; no duplicate workflow. |
| Process dies after outbox insert | Startup recovery picks pending event. |
| Process dies during run | Lease expires; run becomes recoverable or failed with explicit reason; never silent success. |
| LangGraph checkpoint missing | Run status becomes `error` or `blocked_checkpoint_missing`; operator sees recovery action. |
| Node throws after parallel branch succeeds | Pending writes/evidence remain queryable; failed attempt references completed branch outputs. |
| File-mode write interrupted | Atomic write either preserves previous valid file or writes complete new file. |

## 10. Validation Commands

```bash
pnpm --filter @u-build/shared build
pnpm --filter @u-build/server build
node --test apps/server/test/horusChatTurn.test.mjs
node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs
node --test apps/server/test/fileMemorySaver.test.mjs
pnpm test
git diff --check
```

## 11. Acceptance Criteria

- A mutable chat request creates exactly one durable turn and one durable workflow run.
- Re-submitting the same idempotency key does not create a duplicate run.
- Workflow status can be reconstructed from ledger + workflow events.
- `persistState` never invents `completed` when graph state is missing or inconclusive.
- Outbox pending events recover after server restart.
- File mode and Postgres mode both pass equivalent repository tests.
- Existing preview/chat UI continues to work during migration.

## 12. Minimal Output Contract For Implementing Agent

```yaml
implementation_output:
  changed_files:
    - "<exact paths>"
  migrations:
    - "<migration id and tables>"
  validation:
    commands_run:
      - "<command>"
    failed_commands:
      - "<command and reason>"
  evidence:
    - "idempotency test result"
    - "outbox recovery test result"
    - "workflow failure persistence test result"
  notes:
    - "Any backward compatibility caveat"
```

