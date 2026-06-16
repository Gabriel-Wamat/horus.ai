---
format_version: "agentic_sdd.v1"
task_id: "feature-42-agentic-execution-loop"
title: "Agentic Execution Loop"
created_at_utc: "2026-05-26T23:45:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented"
depends_on:
  - "spec/features/22-chat-driven-agent-code-change-loop.md"
  - "spec/features/31-agentic-system-hardening-roadmap.md"
  - "spec/features/39-agentic-orchestration-integrity.md"
  - "spec/features/41-agentic-runtime-validation-observability.md"
---

# 42 - Agentic Execution Loop

## 1. Original User Request

```yaml
raw_user_request: |
  minha preocupação é no 4, 5, 6, 8, 9 e 10. destrinche como podemos corrigir o projeto com base o que foi listar. e crie uma spec para cada cenário que expressei preocupação
concern_mapped_from_previous_answer: "4. Loop real de execução"
```

## 2. System Interpretation

```yaml
system_translation: |
  Implementar um loop de execução real para runs agenticas: entender, planejar, ler contexto, propor alterações,
  aplicar em área controlada, validar, corrigir com base em erros e só então finalizar. O loop deve ser persistido
  como eventos e estados auditáveis, não apenas como resposta textual do chat.

expected_user_visible_result: |
  Quando o usuário pedir uma alteração, Horus mostra uma run com fases claras: entendimento, plano,
  leitura de arquivos, patch proposto, aplicação, validação, retry se necessário, conclusão ou falha.

expected_engineering_result: |
  O backend passa a ter uma máquina de estados explícita para execução agentica, com persistência de eventos,
  tentativas, inputs/outputs por etapa e transições válidas. A UI consome essa linha do tempo e não inventa estado.
```

## 3. Current Project Fit

```yaml
verified_existing_surfaces:
  - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
  - "apps/server/src/infrastructure/langgraph/graph.ts"
  - "apps/server/src/infrastructure/langgraph/state.ts"
  - "apps/server/src/infrastructure/repositories/contracts.ts"
  - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
  - "packages/shared/src/entities/HorusRunFlow.ts"
  - "apps/web/src/features/agents-flow/"

good_existing_parts:
  - "LangGraph-based workflow already exists."
  - "CodeChangeSet lifecycle and repository already exist."
  - "Run flow visualization already has event/snapshot concepts."
  - "Preview/runtime validation specs exist."

gaps_to_fix:
  - "Execution phases are not represented as a strict state machine with allowed transitions."
  - "Retries are not uniformly tied to the failed validation evidence that caused them."
  - "Agent reasoning, tool calls, patches and validations are not one normalized event stream."
  - "Final success can be inferred from agent text rather than explicit validation state."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create an AgentRun state machine contract."
    - "Normalize event types for planning, context_read, patch_proposed, patch_applied, validation_started, validation_failed, validation_passed, retry_started, completed and failed."
    - "Persist attempt number, phase, actor, timestamps, evidence ids and failure reason."
    - "Tie every retry to a previous failed gate or rejected curator verdict."
    - "Expose snapshots through existing run flow endpoint builders."
    - "Update chat-driven code change and project construction flows to emit these events."
  out_of_scope:
    - "Changing model provider logic."
    - "Changing the visual graph layout."
    - "Adding arbitrary shell access."
    - "Replacing LangGraph."
```

## 5. Backend Design

```yaml
new_shared_contracts:
  AgentRunPhase:
    values:
      - "received"
      - "understanding"
      - "planning"
      - "context_reading"
      - "patching"
      - "applying"
      - "validating"
      - "reviewing"
      - "retrying"
      - "completed"
      - "failed"
      - "cancelled"
  AgentRunEvent:
    required_fields:
      - "id"
      - "runId"
      - "sequence"
      - "phase"
      - "eventType"
      - "actorKind"
      - "actorName"
      - "createdAt"
    optional_fields:
      - "attempt"
      - "summary"
      - "evidence"
      - "filePaths"
      - "commandIds"
      - "validationGateId"
      - "causedByEventId"
      - "errorMessage"

state_machine_rules:
  - "received can move to understanding or failed."
  - "understanding can move to planning or failed."
  - "planning can move to context_reading, patching, clarification_required or failed."
  - "patching can move to applying or failed."
  - "applying can move to validating or failed."
  - "validating can move to reviewing, retrying or failed."
  - "reviewing can move to completed, retrying or failed."
  - "retrying must reference a failed validation/review event and then move to context_reading or patching."
  - "completed requires at least one passed validation event or an explicit no_validation_required evidence record."
```

## 6. Integration Context Map

```yaml
integration_context:
  depends_on:
    - name: "WorkflowOrchestrator"
      type: "workflow"
      contract_used: "graph stream updates and persisted workflow state"
      required_for: "Emit normalized run events around existing graph nodes."
      failure_modes:
        - "Events get out of order or duplicate after resume."
      verification:
        - "Test event sequence monotonicity across normal run and retry run."
    - name: "CodeChangeSetRepository"
      type: "backend_service"
      contract_used: "save/listByWorkflow"
      required_for: "Attach patch_proposed/applied events to code change sets."
      failure_modes:
        - "UI shows patch event but no persisted patch details."
      verification:
        - "Integration test links event.evidence.changeSetId to stored change set."
    - name: "Validation services"
      type: "backend_service"
      contract_used: "command run evidence and quality gate results"
      required_for: "Decide completed vs retrying vs failed."
      failure_modes:
        - "Run completes despite failed validation."
      verification:
        - "Test failed validation blocks completed phase."

  depended_on_by:
    - name: "Agent flow UI"
      type: "frontend_component"
      contract_exposed: "AgentRunSnapshot with phases and events"
      compatibility_obligation: "Additive schema changes only."
      expected_consumer_behavior: "Render run progress from event stream, not local guesses."
    - name: "Chat progress"
      type: "frontend_component"
      contract_exposed: "latest run phase summary"
      compatibility_obligation: "Preserve existing chat messages."
      expected_consumer_behavior: "Show concise live status while execution continues."
```

## 7. Execution Plan

```yaml
execution_plan:
  - step: "Add shared AgentRunPhase and AgentRunEvent schemas."
    files:
      - "packages/shared/src/entities/HorusRunFlow.ts"
  - step: "Add repository/event-store append API or extend existing workflow event repository."
    files:
      - "apps/server/src/infrastructure/repositories/contracts.ts"
      - "apps/server/src/infrastructure/repositories/*WorkflowEvent*"
  - step: "Instrument WorkflowOrchestrator and chat code-change startup."
    files:
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
  - step: "Update snapshot builder to derive phase from normalized events."
    files:
      - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
  - step: "Update UI to render phase timeline without synthetic state."
    files:
      - "apps/web/src/features/agents-flow/*"
  - step: "Add regression tests for transitions, retries and completed gating."
```

## 8. Acceptance Checklist

```yaml
acceptance_checklist:
  - "Every agent run has a persisted run id and monotonic event sequence."
  - "Every retry references the event that caused the retry."
  - "A run cannot become completed if the latest required validation failed."
  - "The UI can show current phase after page reload."
  - "Chat-triggered code changes and UserStories workflow both use the same event vocabulary."
  - "All mutable operations emit before/after evidence."
  - "Tests cover success, validation failure, retry success and hard failure."

validation_commands:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "pnpm --filter @u-build/web type-check"
  - "node --test apps/server/test/*workflow* apps/server/test/*horusRunFlow*"
  - "pnpm test"
```

## 9. Implementation Log

```yaml
implemented_at_utc: "2026-05-27T00:10:00Z"
implemented_changes:
  - "Added shared AgentRunPhase, AgentRunLoopEventType and AgentRunActorKind contracts."
  - "Extended HorusRunEventSnapshot with normalized phase, eventType, actor, attempt, file paths, command ids, validation gate id, metadata and error message."
  - "Extended WorkflowEvent with patch_proposed and patch_applied lifecycle events."
  - "Mapped existing workflow events into normalized agentic loop metadata."
  - "Emitted patch_proposed when FrontAgent persists a proposed CodeChangeSet."
  - "Emitted patch_applied after Curator approval and CodeChangeSet application."
  - "Added currentPhase to HorusRunSnapshot and derived it from the latest persisted event."
  - "Updated the agent flow drawer to show phase, event type, actor and attempt in the timeline."
  - "Added regression tests for normalized run-flow schema and patch lifecycle events."
validation_record:
  completed:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "pnpm --filter @u-build/web type-check"
    - "pnpm --filter @u-build/web build"
    - "node --test packages/shared/test/horusRunFlow.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
    - "pnpm test"
notes:
  - "This implementation is additive and keeps old event types compatible by adding defaults to new snapshot fields."
  - "Spec 47 remains responsible for hard validation gate semantics that block completed status after failed required gates."
```
