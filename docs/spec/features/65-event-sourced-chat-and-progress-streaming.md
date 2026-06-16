---
format_version: "agentic_sdd.v1"
task_id: "feature-65-event-sourced-chat-and-progress-streaming"
title: "Event-Sourced Chat And Progress Streaming"
created_at_utc: "2026-05-27T17:09:18Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
depends_on:
  - "spec/features/50-preview-chat-command-streaming.md"
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
research_catalog: "spec/notes/ai-agent-engineering-strategy-catalog.md"
---

# 65 - Event-Sourced Chat And Progress Streaming

## 1. Original User Request

```yaml
raw_user_request: |
  quero que faça uma revisão rigorosa de todos os pontos que precisam ser refatorados na parte de agentes, chat, salvamento de dados, memória dos agentes e da conversa etc. todas as boas práticas que faltam

  pesquise quais são melhores práticas de engenharia de IA(no arxiv, medium, github, fóruns, reddit) para resolver esse tipo de problema, após isso catalogue as estratégias. em seguida, use a skill de criar spec para planeja a solução desse problema, (analise quantas specs são necessárias, para que você consiga detalhar rigorosamente e ter o máximo de contexto para solucionar de forma cirúrgica)
```

## 2. System Interpretation

```yaml
system_translation: |
  Planejar a reconstrução do chat do Horus como uma projeção persistida de eventos: mensagens do usuário, resposta do
  Horus, progresso de agentes, erros, evidências e estados de ação devem sair de um log ordenado e replayável. O objetivo
  é eliminar mensagens sintéticas frágeis no frontend, polling como fonte primária e UX confusa com blocos despejados de
  uma vez.

expected_user_visible_result: |
  O usuário vê mensagens curtas e progressivas do Horus conforme os agentes realmente avançam. Recarregar a tela não
  perde mensagens, não duplica eventos e retoma o streaming a partir do último cursor.

expected_engineering_result: |
  Chat messages gain typed event metadata, turn/run linkage, sequence and status. SSE becomes resumable. Workflow progress
  is persisted as user-visible or developer-visible chat events according to policy.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O chat atualmente falha como experiência de acompanhamento: mensagens aparecem tarde, grandes demais, sem streaming real ou sem explicar a execução."
  target_user: "Usuário que conversa com Horus dentro da Preview enquanto pede alterações no projeto."
  expected_outcome: "Chat vira uma timeline confiável, enxuta e recuperável da execução."
  product_surface:
    - "Preview chat"
    - "Workflow progress activity"
    - "SSE endpoint"
    - "Chat history persistence"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "Express SSE"
      - "PostgresChatMemoryRepository/FileChatMemoryStore"
      - "Workflow event stream"
    frontend:
      - "VisualPreviewConsole"
      - "PreviewConversationPanel"
    database:
      - "chat_sessions"
      - "chat_messages"
      - "workflow_events"
    infrastructure:
      - "EventSource"
      - "fetch streaming"
  known_entrypoints:
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
    - "apps/server/src/infrastructure/repositories/PostgresChatMemoryRepository.ts"
    - "apps/server/src/infrastructure/chat/FileChatMemoryStore.ts"
    - "apps/web/src/api/horusChatApi.ts"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
  known_existing_patterns:
    - "Chat already has stream event schemas in packages/shared."
    - "Workflow events are persisted with per-thread sequence."
    - "Frontend currently has lightweight rendering stream animation."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add sequence/status/type/turn/run metadata to chat messages or a companion chat events table."
    - "Persist workflow progress as typed chat events through backend policy."
    - "Replace frontend synthetic progress as source of truth with replayed durable events."
    - "Make SSE support event id, sequence cursor, heartbeat and schema-safe parsing."
    - "Define message compaction policy so progress is not spammy."
    - "Separate user-visible messages from developer trace events."
    - "Preserve current chat API compatibility during migration."
  out_of_scope:
    - "Long-term memory extraction and semantic retrieval; handled by spec 66."
    - "Execution outbox foundation; handled by spec 64."
    - "Agent validation control plane; handled by spec 67."
    - "Major visual redesign beyond necessary compact status components."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/ChatMemory.ts"
      - "packages/shared/src/entities/HorusChat.ts"
      - "apps/server/src/infrastructure/repositories/PostgresChatMemoryRepository.ts"
      - "apps/server/src/infrastructure/chat/FileChatMemoryStore.ts"
      - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    services:
      - "ChatMemoryRepository"
      - "SubmitHorusChatTurnUseCase"
      - "PersistentWorkflowEventStream"
    database:
      migrations_required: true
      tables:
        - "chat_messages"
        - "chat_message_events or chat_messages new columns"
        - "workflow_events"
  frontend:
    files:
      - "apps/web/src/api/horusChatApi.ts"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/components/PreviewConversationPanel.tsx"
    components:
      - "PreviewConversationPanel"
      - "WorkflowLiveActivity"
  workflow:
    graph_nodes:
      - "odinAgent"
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
    agents:
      - "Horus"
      - "Odin"
      - "Front"
      - "QA"
      - "Curator"
  tests:
    unit:
      - "chat repository ordering tests"
      - "SSE parser tests"
    integration:
      - "workflow progress creates visible chat events"
    e2e:
      - "reload preview resumes chat progress"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec consumes the ledger/run IDs from spec 64 and turns workflow progress into a stable chat timeline.
    It should make the UI simpler: the frontend reads a durable projection instead of inventing progress messages locally.

  depends_on:
    - name: "Execution ledger"
      type: "database"
      owner: "spec 64"
      direction: "this_spec_consumes_dependency"
      contract_used: "turnId, runId, attemptId, outbox event id"
      required_for: "Attach chat events to exact execution lifecycle."
      assumptions:
        - "Spec 64 exposes IDs without requiring direct table coupling in frontend."
      failure_modes:
        - "Chat event cannot link to run; progress becomes orphaned."
      fallback_or_recovery: "Persist as developer trace with missing_link reason and show compact error."
      verification:
        - "Integration test ensures action_started has runId/turnId."

    - name: "Workflow events"
      type: "event_stream"
      owner: "server/workflow"
      direction: "this_spec_consumes_dependency"
      contract_used: "WorkflowProgressEvent with threadId, sequence, type, summary"
      required_for: "Project real agent progress into chat."
      assumptions: []
      failure_modes:
        - "Event sequence gap."
        - "Duplicate replay."
      fallback_or_recovery: "Cursor replay with de-duplication by event id."
      verification:
        - "Replay test across browser reload."

  depended_on_by:
    - name: "PreviewConversationPanel"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "ordered chat messages/events with status and visibility"
      compatibility_obligation: "must render legacy ChatMessage during migration"
      expected_consumer_behavior: "Render compact messages and activity chips from backend data."
      migration_or_notification_required: false
      verification:
        - "Frontend guard for no frontend-only workflow-progress source of truth."

  bidirectional_integrations:
    - name: "Horus stream and chat persistence"
      participants:
        - "POST /api/horus/chat/turn/stream"
        - "GET /api/chat/sessions/:id/messages"
      shared_contract: "message ids, sequence, stream cursor"
      consistency_rule: "A streamed assistant message must reconcile to exactly one persisted message/event."
      verification:
        - "Stream disconnect integration test."

  data_flow:
    inbound:
      - source: "User message submit"
        payload_or_state: "HorusChatTurnInput"
        validation: "Zod schema plus session scope"
      - source: "Workflow progress"
        payload_or_state: "WorkflowProgressEvent"
        validation: "shared event parser"
    outbound:
      - target: "Chat UI"
        payload_or_state: "Chat timeline event with sequence and visibility"
        validation: "frontend parser and snapshot tests"
```

## 7. Message/Event Model

```yaml
chat_event_fields:
  id: "uuid"
  sessionId: "uuid"
  turnId: "uuid optional"
  runId: "uuid optional"
  attemptId: "uuid optional"
  workflowThreadId: "uuid optional legacy bridge"
  sequence: "integer monotonic per session"
  role: "user | agent | system"
  eventType: "message | progress | evidence | warning | error | action_state | trace"
  visibility: "user | developer | hidden"
  status: "pending | streaming | persisted | failed | superseded"
  body: "string"
  compactBody: "string optional"
  metadata: "json object"
  createdAt: "datetime"
```

## 8. UX Policy

| Event Class | User-Visible Rendering | Persistence |
| --- | --- | --- |
| User message | Normal right-aligned bubble | Required |
| Horus acknowledgement | One short bubble, no raw thread id | Required |
| Agent progress | Compact streaming message or activity chip | Required as progress event |
| Tool trace | Hidden by default, visible in developer details | Required as trace/evidence |
| Retry | Compact "ajustando X" message, not full stack | Required |
| Validation evidence | Summary plus expandable details | Required |
| Error | Friendly message plus developer detail ID | Required |
| Terminal success | One final concise summary | Required |

## 9. Execution Plan

1. Add shared schemas for chat event metadata, status, visibility and sequence.
2. Add DB migration or companion table for event-sourced chat records.
3. Update Postgres/file chat repositories to append with per-session sequence transactionally.
4. Add backend projector from workflow events to chat events.
5. Update `SubmitHorusChatTurnUseCase` to use one event-producing path for stream and non-stream.
6. Update SSE endpoint to include `id`, `event`, `data`, heartbeat and cursor support.
7. Harden frontend parser with schema validation, multiline `data:` handling, retry and last seen cursor.
8. Replace frontend synthetic `workflow-progress-${threadId}` as source of truth with backend chat progress projection.
9. Keep animation small: reveal compact messages progressively, not large dumps.
10. Add browser validation for reload/resume and no duplicated progress messages.

## 10. Validation Commands

```bash
pnpm --filter @u-build/shared build
pnpm --filter @u-build/server build
pnpm --filter @u-build/web build
node --test apps/server/test/horusChatTurn.test.mjs
pnpm --filter @u-build/web test:guards
pnpm test
pnpm preview:browser-smoke
git diff --check
```

## 11. Acceptance Criteria

- Every chat message/progress item has stable session sequence.
- Refreshing Preview replays the same timeline without duplicate progress items.
- SSE can resume from a cursor after disconnect.
- Agent progress is persisted server-side before being rendered.
- User-visible messages do not expose raw thread IDs by default.
- Technical trace remains available for debugging without polluting the main chat.

## 12. Minimal Output Contract For Implementing Agent

```yaml
implementation_output:
  changed_files:
    - "<exact paths>"
  migrations:
    - "<migration or none>"
  validation:
    commands_run:
      - "<command>"
  browser_evidence:
    - "screenshot showing streamed progress"
    - "reload replay screenshot"
  compatibility_notes:
    - "legacy message handling status"
```

## 13. Implementation Log

### 2026-05-27 - v0.2.0

- Added event-sourced chat message metadata in shared contracts: per-session `sequence`, `eventType`, `visibility`, `deliveryStatus`, compact body, turn/run/attempt IDs and metadata.
- Added Postgres migration `009_event_sourced_chat_messages.sql` and file/Postgres repository support for ordered appends and `afterSequence` reads.
- Added server-side workflow event projection in `WorkflowOrchestrator`: workflow milestones are persisted into chat memory with compact user-visible prose, trace/developer visibility for noisy internals and metadata-based dedupe.
- Updated chat routes/API streaming to support SSE `id`, heartbeat comments, multiline `data:` parsing and cursor-friendly message sync.
- Replaced frontend synthetic `workflow-progress-${threadId}` messages as source of truth with backend-persisted chat messages, filtering `developer/hidden` traces out of the main chat.
- Added regression coverage for migration metadata, message sequencing/cursor reads and persisted compact workflow progress.
- Validation run: `pnpm test` passed 208 tests after the implementation.
