---
format_version: "agentic_sdd.v1"
task_id: "feature-73-workflow-chat-memory-contract-spine"
title: "Workflow Chat Memory Contract Spine"
created_at_utc: "2026-05-28T14:19:19Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "in_progress"
depends_on:
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "spec/features/65-event-sourced-chat-and-progress-streaming.md"
  - "spec/features/66-agent-memory-and-runtime-skills-governance.md"
  - "spec/features/68-preview-chat-durable-workflow-recovery.md"
  - "spec/features/72-agent-tool-runtime-react-loop-and-e2e-closure.md"
---

# 73 - Workflow Chat Memory Contract Spine

## 1. Original User Request

```yaml
raw_user_request: |
  analise mais pontos que precisam ser refatorados, precisam deixar esse projeto a nível produção, sem nenhum bug, sem nenhum arquivo gigante, sem nenhum erro de contrato(memória, chat), garantir que erros sejam tratados no sistema de forma automática com fallback... quero que pense no estado da arte de boas práticas de engenharia de software para que possamos deixar esse projeto liso, nível produto final

  crie as specs então e em seguida inicie
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar e iniciar a primeira SPEC da nova fase de maturidade de produto: eliminar divergencia de contrato entre
  WorkflowEvent, HorusRunEventSnapshot, ChatMessage e AgentMemoryItem. O sistema deve ter um contract spine
  compartilhado em packages/shared, consumido pelo backend e frontend, com fixtures e testes que impeçam drift.

expected_user_visible_result: |
  O chat, o mapa operacional, o Preview e a memoria passam a representar o mesmo evento da mesma forma. O usuario
  deixa de ver progresso duplicado, atrasado, inconsistente ou contraditorio quando workflow, chat e memoria sao
  atualizados.

expected_engineering_result: |
  Um modulo compartilhado passa a mapear eventos de workflow para snapshots operacionais e metadados causais.
  Server e web removem mappers duplicados e passam a usar a mesma fonte de verdade. Testes validam eventos reais,
  sequenciamento, nodeId, phase, eventType, actor, metadata e causal IDs.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Eventos de workflow podem divergir entre UI, chat persistido e memoria, criando bugs silenciosos de produto."
  target_user: "Operador do Horus que acompanha execucoes agenticas no Preview chat e no mapa de agentes."
  expected_outcome: "Uma execucao tem uma timeline canonica e auditavel, com consumidores alinhados por contrato."
  product_surface:
    - "Preview chat"
    - "Agent Flow map"
    - "Workflow event stream"
    - "Agent memory prompt context"
    - "Execution ledger"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph StateGraph"
      - "WorkflowOrchestrator"
      - "WorkflowEventProjector"
      - "AgentMemoryService"
    frontend:
      - "React"
      - "Vite"
      - "EventSource"
    database:
      - "workflow_events"
      - "chat_messages"
      - "agent_memory"
      - "agent_workflow_runs"
    infrastructure:
      - "packages/shared Zod contracts"
      - "file-mode and Postgres persistence"
  known_entrypoints:
    - "packages/shared/src/ports/IEventStream.ts"
    - "packages/shared/src/entities/HorusRunFlow.ts"
    - "packages/shared/src/entities/ChatMemory.ts"
    - "packages/shared/src/entities/AgentMemory.ts"
    - "apps/server/src/application/services/horusRunFlowMapping.ts"
    - "apps/server/src/domain/services/WorkflowEventProjector.ts"
    - "apps/server/src/application/services/AgentMemoryService.ts"
    - "apps/web/src/features/agent-flow-map/utils/deriveHorusRunSnapshot.ts"
    - "apps/web/src/features/agent-flow-map/AgentFlowPage.tsx"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
  known_existing_patterns:
    - "Shared schemas live in packages/shared and are consumed by server and web."
    - "Runtime events must remain append-only and replayable."
    - "Workflow event changes must update shared contracts, server projection, frontend consumers and tests together."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create a shared workflow event projection module in packages/shared."
    - "Move WorkflowEvent -> HorusRunEventSnapshot mapping into the shared module."
    - "Expose canonical node labels, agent-node mapping, status metadata, titles and summaries."
    - "Update backend run-flow mapping to consume the shared module while preserving agent profile enrichment."
    - "Update frontend local snapshot derivation to consume the shared module."
    - "Add golden tests for workflow event projection and drift prevention."
    - "Prepare follow-up hooks for chat and memory projection without changing persisted schemas prematurely."
  out_of_scope:
    - "Changing database schemas in the first slice."
    - "Rewriting the entire VisualPreviewConsole."
    - "Changing public workflow event names."
    - "Replacing SSE transport."
    - "Removing legacy projection compatibility before consumers are migrated."
```

## 5. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec makes packages/shared the canonical contract owner for workflow event projection. Backend and frontend
    consumers may enrich the shared output, but they must not duplicate node/phase/title/summary business rules.

  depends_on:
    - name: "WorkflowEventSchema"
      type: "shared_schema"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "WorkflowEvent discriminated union"
      required_for: "Canonical event projection input."
      failure_modes:
        - "New event type is emitted without projection."
      fallback_or_recovery: "Compile-time exhaustiveness and golden fixture failure."
      verification:
        - "pnpm --filter @u-build/shared build"
        - "node --test packages/shared/test/workflowEventProjection.test.mjs"

  depended_on_by:
    - name: "HorusRunFlowSnapshotBuilder"
      type: "backend_service"
      owner: "apps/server/application"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "mapWorkflowEventToHorusRunEvent(event, sequence, options)"
      compatibility_obligation: "Must preserve HorusRunEventSnapshot shape."
      expected_consumer_behavior: "Use shared mapping and add backend-only profile enrichment through options."
      migration_or_notification_required: false
      verification:
        - "server focused run-flow tests"
    - name: "Agent Flow frontend"
      type: "frontend_component"
      owner: "apps/web/features/agent-flow-map"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Canonical nodeId/phase/eventType/title/summary mapping"
      compatibility_obligation: "Must render old and live events consistently."
      expected_consumer_behavior: "Use shared mapper for local snapshots and reduce local inference."
      migration_or_notification_required: false
      verification:
        - "pnpm --filter @u-build/web test:guards"
    - name: "Workflow chat and memory projection"
      type: "backend_service"
      owner: "apps/server/domain and application services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Stable projected metadata and causal IDs"
      compatibility_obligation: "May extend metadata only; must not break persisted messages."
      expected_consumer_behavior: "Use canonical event IDs/source refs in a follow-up slice."
      migration_or_notification_required: false
      verification:
        - "chat/memory projection tests"

  data_flow:
    inbound:
      - source: "WorkflowOrchestrator / LangGraph nodes"
        payload_or_state: "WorkflowEvent"
        validation: "WorkflowEventSchema"
    outbound:
      - target: "Run-flow snapshots, chat projection, memory source refs, frontend local snapshots"
        payload_or_state: "HorusRunEventSnapshot plus causal metadata"
        compatibility: "No breaking field rename; additions only."

  integration_risks:
    - risk: "Server profile metadata disappears from run snapshots."
      severity: "high"
      mitigation: "Projection options allow server profile enrichment."
    - risk: "Frontend and backend import paths create circular dependencies."
      severity: "high"
      mitigation: "Keep shared module pure and dependency-free from server/web."
```

## 6. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Keep shared contracts framework-independent."
    - "Do not duplicate business rules across layers."
    - "Use discriminated unions and exhaustive handling for workflow events."
    - "Prefer additive compatibility for persisted/evented contracts."
  project_specific:
    - "Shared contract changes must update packages/shared exports."
    - "Server may enrich shared projection; web may render it; neither should fork projection rules."
    - "New workflow event kinds require shared tests before server/web consumption."
```

## 7. Execution Plan

```yaml
execution_plan:
  - step: 1
    title: "Create shared projection module"
    agent: "implementation"
    actions:
      - "Add packages/shared/src/entities/HorusWorkflowProjection.ts."
      - "Move canonical node/phase/title/summary/tool label mapping into shared."
      - "Export from packages/shared/src/index.ts."
  - step: 2
    title: "Migrate backend run-flow mapping"
    agent: "implementation"
    actions:
      - "Replace duplicated mapWorkflowEvent logic with shared mapper."
      - "Preserve AgentProfile enrichment through resolver option."
  - step: 3
    title: "Migrate frontend local derivation"
    agent: "implementation"
    actions:
      - "Replace duplicated local event mapping with shared mapper."
      - "Keep deriveSteps and resolveCurrentNode local until later decomposition."
  - step: 4
    title: "Add drift tests"
    agent: "qa"
    actions:
      - "Add shared golden tests for representative events."
      - "Run shared build and focused server/web tests."
  - step: 5
    title: "Prepare chat/memory causal follow-up"
    agent: "implementation"
    actions:
      - "Document remaining migration points in implementation log."
```

## 8. Validation

```yaml
validation:
  required_commands:
    - "pnpm --filter @u-build/shared build"
    - "node --test packages/shared/test/workflowEventProjection.test.mjs"
    - "pnpm --filter @u-build/server build"
    - "pnpm --filter @u-build/web test:guards"
  acceptance_criteria:
    - "Workflow projection logic has one canonical implementation in packages/shared."
    - "Backend and frontend compile against the shared projection."
    - "Golden tests cover status_changed, node_completed, validation_evidence, tool_call_finished, awaiting_retry_approval and error."
    - "No persisted schema is broken."
```

## 9. Error Mitigation

```yaml
error_mitigation:
  - "If a consumer needs local UI-only behavior, add presentation metadata after canonical projection rather than changing the shared contract."
  - "If exactOptionalPropertyTypes fails, omit undefined fields instead of setting them explicitly."
  - "If a new event type appears, make shared projection fail compile/test before runtime."
  - "If web bundle imports server-only code accidentally, move logic back into pure shared code."
```

## 10. Implementation Log

```yaml
implementation_log:
  - timestamp_utc: "2026-05-28T14:19:19Z"
    actor: "agent"
    status: "started"
    notes:
      - "Created as the first product-hardening spec after release hardening."
      - "Implementation will begin with shared WorkflowEvent -> HorusRunEventSnapshot projection."
  - timestamp_utc: "2026-05-28T14:19:19Z"
    actor: "agent"
    status: "partial_implementation_complete"
    notes:
      - "Added packages/shared/src/entities/HorusWorkflowProjection.ts as the canonical WorkflowEvent -> HorusRunEventSnapshot mapper."
      - "Updated server run-flow mapping and frontend local run derivation to consume the shared mapper, shared node labels and shared agent-node mapping."
      - "Removed dead local projection helpers from the migrated server/web consumers."
      - "Added packages/shared/test/workflowEventProjection.test.mjs golden coverage for representative workflow events and optional profile enrichment."
      - "Validated shared build, shared golden test, server build, web guard tests and workflow tool event regression."
      - "Remaining slices: migrate chat projection and memory source refs to canonical causal metadata, then add end-to-end replay drift tests."
```
