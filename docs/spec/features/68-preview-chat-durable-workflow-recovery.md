---
format_version: "agentic_sdd.v1"
task_id: "feature-68-preview-chat-durable-workflow-recovery"
title: "Preview Chat Durable Workflow Recovery"
created_at_utc: "2026-05-27T21:45:24Z"
author: "agent"
target_mode: "bugfix"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
depends_on:
  - "spec/features/50-preview-chat-command-streaming.md"
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "spec/features/65-event-sourced-chat-and-progress-streaming.md"
  - "spec/features/67-artifact-validation-self-healing-and-observability-control-plane.md"
---

# 68 - Preview Chat Durable Workflow Recovery

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec para resolver isso
```

## 2. System Interpretation

```yaml
system_translation: |
  Create an executable SDD to fix the Preview chat failure where a user request is accepted,
  the UI keeps showing a stale "Validating" state, no terminal status appears, and the right-side
  preview/status surface does not reflect the actual workflow outcome. The fix must address backend
  durability, workflow recovery, event projection, SSE robustness, stale-run detection, and project
  context consistency.

expected_user_visible_result: |
  After the user submits a Preview chat request, the interface must show a trustworthy lifecycle:
  accepted, queued/running, agent progress, validation/apply progress, terminal success, terminal
  failure, cancellation, or stalled recovery state. It must never remain indefinitely in "Validating"
  without an actionable reason. Reloading the page or restarting the backend must not orphan the run.

expected_engineering_result: |
  Chat-triggered code-change workflows must be registered in the durable execution ledger/outbox,
  recoverable after process restart, projected into persisted chat/progress events, parsed safely by
  the frontend, and guarded by a stale-run watchdog. Project, preview session, chat session and
  workflow thread context must stay consistent or produce an explicit user-visible mismatch error.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "The user asks Horus to change or inspect a generated project, receives an acknowledgement, and then sees no real progress or terminal outcome."
  target_user: "Horus operator using the Preview chat to ask for code changes, project inspection, or runtime actions."
  expected_outcome: "Every accepted Preview chat action has a recoverable run, visible progress, and a terminal or stalled state with evidence."
  product_surface:
    - "Preview chat"
    - "Preview live activity pill"
    - "Preview project selector"
    - "Preview runtime panel"
    - "Workflow run-flow API"
    - "Workflow SSE stream"
    - "Agent flow map SSE stream"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph StateGraph"
      - "WorkflowOrchestrator"
      - "SubmitHorusChatTurnUseCase"
      - "Postgres and file-mode repositories"
    frontend:
      - "React"
      - "Vite"
      - "VisualPreviewConsole"
      - "PreviewConversationPanel"
      - "EventSource"
    database:
      - "workflow_states"
      - "workflow_events"
      - "agent_execution_turns"
      - "agent_workflow_runs"
      - "agent_workflow_attempts"
      - "agent_execution_outbox"
      - "chat_sessions"
      - "chat_messages"
    infrastructure:
      - "pnpm monorepo"
      - "local dev server"
      - "Postgres or file-mode persistence"
  known_entrypoints:
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
    - "apps/server/src/infrastructure/http/routes/chatRoutes.ts"
    - "apps/server/src/infrastructure/repositories/contracts.ts"
    - "apps/server/src/infrastructure/repositories/createRepositories.ts"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/api/horusChatApi.ts"
    - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
  known_existing_patterns:
    - "Workflow events are persisted with per-thread sequence."
    - "Workflow state is persisted separately from events."
    - "Execution ledger/outbox entities exist or are being introduced by spec 64."
    - "Chat progress projection exists or is being introduced by spec 65."
    - "Validation evidence and artifact lineage exist or are being introduced by spec 67."
    - "The repo supports both Postgres and file-mode persistence."
```

## 4. Observed Failure Summary

```yaml
observed_failure:
  symptom:
    - "Preview chat accepted the user request and displayed an assistant acknowledgement."
    - "The activity pill remained stuck at a validation-like state."
    - "The workflow had no terminal success or failure event."
    - "The SSE stream had no events after the last persisted sequence."
    - "The browser console showed unsafe JSON parsing from EventSource payloads."
    - "The selected Preview project did not necessarily match the project context stored on the accepted chat action."
  likely_root_causes:
    - "Chat code-change workflows can still run in process without a durable ledger/outbox owner."
    - "If the backend restarts, crashes, or loses the in-memory runner, the persisted workflow state can remain running forever."
    - "The frontend maps only a subset of workflow event types to user-visible activity, so the last visible milestone can remain stale."
    - "EventSource handlers parse event data without defensive validation."
    - "Project/preview/session context is not enforced tightly enough across chat session, selected project, workflow run and preview runtime."
  non_goals_for_this_spec:
    - "Do not hardcode the observed local thread id, project id, preview port, timestamps, or machine paths into product logic."
    - "Do not paper over the issue by forcing a frontend-only timeout message without backend state repair."
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Make Preview chat code-change workflows use the durable execution ledger/outbox path."
    - "Guarantee every accepted mutable chat turn has turnId, runId, attemptId, threadId and idempotency key."
    - "Add recovery for pending, processing, leased and running chat workflow runs after server restart."
    - "Add stale-run detection for workflow runs with no new persisted event after a configured timeout."
    - "Persist explicit stalled/failed terminal states instead of leaving orphaned running states."
    - "Project stale, failed, recovered and terminal states into chat and preview activity."
    - "Make EventSource parsing schema-safe and tolerant of heartbeat, empty, malformed or legacy events."
    - "Make Preview UI render node-level progress or a precise waiting/stalled state instead of indefinite stale validation."
    - "Validate that chat project context matches selected project and preview session before starting mutable work."
    - "Add focused tests for Postgres and file-mode behavior where repository support exists."
  out_of_scope:
    - "Changing the full visual identity of Preview."
    - "Replacing LangGraph."
    - "Replacing the whole chat UI."
    - "Adding an external queue vendor."
    - "Adding a new paid observability vendor."
    - "Making agents execute arbitrary shell commands."
    - "Committing, pushing, deploying, or changing public documentation as part of this spec."
```

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
      - "apps/server/src/infrastructure/http/routes/chatRoutes.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/repositories/contracts.ts"
      - "apps/server/src/infrastructure/repositories/createRepositories.ts"
      - "apps/server/src/infrastructure/repositories/PostgresAgentExecutionLedgerRepository.ts"
      - "apps/server/src/infrastructure/repositories/FileAgentExecutionLedgerRepository.ts"
      - "apps/server/src/infrastructure/chat/FileChatMemoryStore.ts"
      - "apps/server/src/infrastructure/repositories/PostgresChatMemoryRepository.ts"
      - "packages/shared/src/entities/AgentExecutionLedger.ts"
      - "packages/shared/src/entities/HorusChat.ts"
      - "packages/shared/src/entities/ChatMemory.ts"
    services:
      - "SubmitHorusChatTurnUseCase"
      - "WorkflowOrchestrator"
      - "execution ledger repository"
      - "outbox runner"
      - "workflow event stream"
      - "chat memory repository"
      - "preview runtime manager"
    database:
      migrations_required: false
      tables:
        - "agent_execution_turns"
        - "agent_workflow_runs"
        - "agent_workflow_attempts"
        - "agent_execution_outbox"
        - "workflow_states"
        - "workflow_events"
        - "chat_messages"
  frontend:
    files:
      - "apps/web/src/api/horusChatApi.ts"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
    components:
      - "VisualPreviewConsole"
      - "PreviewConversationPanel"
      - "Workflow live activity"
      - "Agent flow map event client"
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
      - "retryCheckpoint"
    agents:
      - "Spec"
      - "Odin"
      - "Front"
      - "QA"
      - "Curator"
  tests:
    unit:
      - "ledger repository stale-run tests"
      - "workflow event projection tests"
      - "EventSource parser tests"
      - "project context guard tests"
    integration:
      - "chat mutable turn creates durable run"
      - "running run without events becomes stalled"
      - "server startup recovers pending outbox"
      - "frontend replay renders stalled state"
    e2e:
      - "Preview chat request can be followed through success or explicit failure"
      - "reload preserves progress and terminal status"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec stitches together the mutable Preview chat path, the durable execution ledger,
    the workflow event store, the chat projection and the React status UI. Its main obligation is
    to make accepted chat actions impossible to lose silently.

  depends_on:
    - name: "Execution ledger and outbox"
      type: "database"
      owner: "server/infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "turnId, runId, attemptId, outbox event, lease status, terminal status"
      required_for: "Ensure chat code-change workflows have durable ownership and recovery."
      assumptions:
        - "Spec 64 ledger repositories are available in both Postgres and file mode, or this spec must finish their missing chat-code-change integration."
      failure_modes:
        - "User message is saved but mutable workflow is not recoverable."
        - "Workflow starts twice after retry."
        - "Run remains running after process restart."
      fallback_or_recovery: "Idempotency key returns existing run; stale watchdog marks unrecoverable run stalled/failed."
      verification:
        - "Integration test for duplicate submit returning one run."
        - "Startup recovery test for pending outbox."
        - "Stale running run test."

    - name: "Workflow event store"
      type: "event_stream"
      owner: "server/domain/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "threadId, runId if available, sequence, event type, status, agentName, timestamp"
      required_for: "Replay progress and detect gaps or stalls."
      assumptions: []
      failure_modes:
        - "Event sequence stops before terminal state."
        - "UI replays a stale milestone as if work is still active."
      fallback_or_recovery: "Run status derives from ledger and watchdog, not from frontend inference."
      verification:
        - "Replay test from last sequence."
        - "No-new-events stream test with visible waiting/stalled outcome."

    - name: "Chat memory projection"
      type: "backend_service"
      owner: "server/application"
      direction: "this_spec_consumes_dependency"
      contract_used: "chatSessionId, messageId, workflowThreadId, workflow events projected as visible or trace messages"
      required_for: "Render the same progress after reload."
      assumptions: []
      failure_modes:
        - "Chat history shows acknowledgement but not final failure."
        - "Progress duplicates after reconnect."
      fallback_or_recovery: "Dedupe projection by runId + workflow sequence + event type."
      verification:
        - "Chat messages contain terminal/stalled projection exactly once."

    - name: "Preview runtime context"
      type: "backend_service"
      owner: "server/preview"
      direction: "this_spec_consumes_dependency"
      contract_used: "projectId, projectWorkspaceId, previewSessionId, preview status, preview URL"
      required_for: "Validate that mutable chat actions target the project the user expects."
      assumptions: []
      failure_modes:
        - "Chat action changes or validates a different project than the selected Preview project."
        - "Right-side preview status appears unrelated to chat progress."
      fallback_or_recovery: "Block mutable action with project_context_mismatch before starting workflow."
      verification:
        - "Context mismatch request returns actionable error and no workflow run."

  depended_on_by:
    - name: "VisualPreviewConsole"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "stable workflow progress snapshot and safe SSE event stream"
      compatibility_obligation: "must preserve legacy chat history rendering while adding stalled/recovered states"
      expected_consumer_behavior: "Render accepted, queued, running, node progress, validation, applied, failed, stalled and recovered states from backend truth."
      migration_or_notification_required: false
      verification:
        - "Frontend guard for stalled state rendering."
        - "Browser smoke check for no indefinite validating state."

    - name: "Agent flow map"
      type: "frontend_component"
      owner: "apps/web/features/agent-flow-map"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "schema-safe EventSource payloads and terminal/stalled status events"
      compatibility_obligation: "must tolerate heartbeat and legacy event payloads"
      expected_consumer_behavior: "Keep visual graph in sync without console JSON parse errors."
      migration_or_notification_required: false
      verification:
        - "Event parser unit test for undefined, empty, heartbeat and valid JSON payloads."

    - name: "Operator/debug workflow APIs"
      type: "api_client"
      owner: "server/http"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "run status, stale reason, last event sequence, recovery attempt metadata"
      compatibility_obligation: "may extend response; must not remove current fields"
      expected_consumer_behavior: "Allow diagnosis of stuck runs without database access."
      migration_or_notification_required: false
      verification:
        - "API smoke check for stuck/recovered run metadata."

  bidirectional_integrations:
    - name: "Preview chat turn and workflow run"
      participants:
        - "SubmitHorusChatTurnUseCase"
        - "WorkflowOrchestrator"
      shared_contract: "turnId, runId, threadId, projectId, previewSessionId, userStoryId, idempotencyKey"
      consistency_rule: "An accepted mutable chat turn must have exactly one workflow run and that run must point back to the originating turn."
      verification:
        - "Repository integration test checks turn/run linkage."

    - name: "Workflow events and chat projection"
      participants:
        - "WorkflowOrchestrator"
        - "ChatMemoryRepository"
      shared_contract: "runId/threadId + sequence + visibility policy"
      consistency_rule: "Each visible workflow event is projected at most once and can be replayed after page reload."
      verification:
        - "Projection dedupe test."

  data_flow:
    inbound:
      - source: "Preview chat submit"
        payload_or_state: "chatSessionId, selected projectId, previewSessionId, userStoryId, user message, action mode"
        validation: "shared schema, session ownership check, project context match, idempotency key"
      - source: "Workflow runner"
        payload_or_state: "node events, patch events, validation events, terminal events, errors"
        validation: "workflow event schema and monotonic sequence"
    outbound:
      - target: "Workflow event SSE"
        payload_or_state: "typed progress event or heartbeat"
        compatibility: "must never require frontend JSON.parse on undefined data"
      - target: "Chat history"
        payload_or_state: "compact user-visible progress, terminal or stalled message"
        compatibility: "legacy chat messages continue to render"
      - target: "Preview activity UI"
        payload_or_state: "status label, last event summary, stalled/recovered reason"
        compatibility: "existing status labels may be extended, not removed without migration"
  sequencing_dependencies:
    - dependency: "Ledger/outbox integration must be completed before UI-only stale indicators are trusted."
      reason: "The UI cannot repair a lost in-memory workflow by itself."
      validation: "Server test proves accepted chat run is durable before frontend replay test."
    - dependency: "Project context validation must run before workflow enqueue."
      reason: "After enqueue, agents may mutate a project the user did not intend."
      validation: "Context mismatch test creates no outbox item."
  integration_risks:
    - risk: "Existing in-flight legacy workflow_states without ledger rows remain running forever."
      severity: "high"
      mitigation: "Add legacy adoption or terminal-stall migration logic on startup."
    - risk: "Frontend becomes noisy if every node_completed event becomes a chat message."
      severity: "medium"
      mitigation: "Use compact activity state for node events; only project major milestones to chat."
    - risk: "Watchdog marks long but valid LLM runs stalled too early."
      severity: "medium"
      mitigation: "Use configurable timeout, heartbeat events, and lease renewal before terminal stall."
```

## 8. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve application, domain, infrastructure and presentation boundaries."
    - "Prefer dependency injection through existing dependency assembly."
    - "Do not introduce circular dependencies between chat, workflow, preview and repositories."
    - "Do not duplicate state derivation rules across backend and frontend."
  project_specific:
    - "LangGraph remains the workflow engine; durability must wrap it, not replace it."
    - "Backend persisted state is the source of truth for workflow progress."
    - "Frontend may optimistically render submission but must reconcile to persisted run status."
    - "Every mutable chat action must carry explicit project and preview context."
    - "Event stream clients must tolerate heartbeats, reconnects, duplicate events and malformed payloads."
    - "Terminal success is allowed only after required validation/apply gates pass."
    - "File mode and Postgres mode must keep equivalent behavior for run recovery and stale detection."
```

## 9. Coding Rules

```yaml
coding_rules:
  general:
    - "Read current implementations and tests before editing."
    - "Keep public API compatibility unless this spec explicitly extends a contract."
    - "Use typed shared schemas for new statuses, events and metadata."
    - "Avoid hardcoded local ids, local ports, absolute user paths or machine-specific assumptions."
    - "Do not silently swallow workflow errors."
  backend:
    - "Create or update run/turn/outbox records in a single logical transaction where repository support allows it."
    - "Use idempotency keys for mutable chat turn submission."
    - "Persist terminal states explicitly."
    - "When recovery cannot continue safely, mark the run stalled or failed with a specific reason."
    - "Add bounded, redacted logs for recovery, stale detection, parse failure and context mismatch."
  frontend:
    - "Never call JSON.parse directly on unchecked EventSource payloads."
    - "Represent waiting, running, stalled, failed, recovered and terminal states distinctly."
    - "Do not keep a stale milestone label if backend status is stalled, failed or cancelled."
    - "Keep text compact and avoid noisy progress spam."
    - "Show context mismatch as an actionable failure, not as a silent no-op."
  tests:
    - "Add focused regression tests for the exact stuck-running failure class."
    - "Cover both backend state repair and frontend rendering."
    - "Do not claim success from manual browser appearance alone."
```

## 10. Contracts And Invariants

```yaml
contracts:
  api_contracts:
    - name: "Submit mutable Preview chat turn"
      producer: "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      consumers:
        - "apps/web/src/api/horusChatApi.ts"
        - "apps/web/src/components/VisualPreviewConsole.tsx"
      request_shape: "chatSessionId, message, projectId, previewSessionId, userStoryId, workspaceFolderId, action mode, idempotency key"
      response_shape: "assistant message plus workflowThreadId, turnId, runId, status, project context, previewSessionId"
      compatibility: "can extend; must preserve existing successful chat message fields"

    - name: "Workflow progress stream"
      producer: "workflow event SSE route"
      consumers:
        - "VisualPreviewConsole"
        - "Agent flow map"
      request_shape: "threadId plus optional since_sequence or Last-Event-ID"
      response_shape: "SSE events with typed JSON data or documented heartbeat event"
      compatibility: "must preserve existing event types and add stalled/recovered safely"

    - name: "Workflow run detail"
      producer: "agent-runs API"
      consumers:
        - "Preview status UI"
        - "Agent flow map"
        - "operator/debug consumers"
      request_shape: "run id or thread id"
      response_shape: "status, current node/phase, last event sequence, stale metadata, terminal reason, recovery metadata"
      compatibility: "can extend; must not remove current fields"

  domain_contracts:
    - name: "Accepted mutable chat turns are durable"
      producer: "SubmitHorusChatTurnUseCase"
      consumers:
        - "WorkflowOrchestrator"
        - "outbox runner"
        - "Preview UI"
      invariant: "If a user-visible assistant acknowledgement says work will start, a durable turn and run must already exist or the acknowledgement must be an explicit failure."

    - name: "Running workflow must either progress, heartbeat, recover or terminate"
      producer: "WorkflowOrchestrator and watchdog"
      consumers:
        - "Workflow state readers"
        - "Preview UI"
      invariant: "A run cannot remain running indefinitely after its lease expires and no new event is persisted past the configured stale threshold."

    - name: "Project context consistency"
      producer: "Preview chat submit path"
      consumers:
        - "agents"
        - "preview runtime"
        - "generated project files"
      invariant: "A mutable workflow operates only on the project and preview session accepted in the turn context."

  ui_contracts:
    - name: "Preview activity reflects backend truth"
      producer: "VisualPreviewConsole"
      consumers:
        - "user"
      requirement: "Activity label must change when backend status becomes failed, stalled, cancelled, completed or recovered."

    - name: "SSE parser does not crash status updates"
      producer: "frontend event stream client"
      consumers:
        - "Preview UI"
        - "Agent flow map"
      requirement: "Malformed or heartbeat payloads produce a controlled diagnostic state, not an uncaught console exception."

  data_contracts:
    - name: "Workflow event projection"
      producer: "WorkflowOrchestrator"
      consumers:
        - "chat repository"
        - "run-flow APIs"
        - "frontend replay"
      migration_required: false
      compatibility_notes: "New event types must be additive and schema-validated."
```

## 11. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current Preview chat workflow integration"
    agent: "repo_explorer"
    action: "Read chat use case, WorkflowOrchestrator, ledger repositories, SSE routes, VisualPreviewConsole and AgentFlow event client."
    expected_output: "Precise map of where chat_code_change currently creates turn/run/outbox/state/events and where it can fall back to in-process execution."

  - step: 2
    name: "Close durable ledger gap for chat code-change workflows"
    agent: "backend_specialist"
    action: "Ensure mutable Preview chat paths always create durable turn/run/attempt/outbox records before acknowledgement, including idempotency."
    expected_output: "No accepted mutable Preview chat action can execute only as fire-and-forget in memory."

  - step: 3
    name: "Implement recovery and stale-run watchdog"
    agent: "backend_specialist"
    action: "Add startup recovery for pending/processing/expired leased runs and a stale detector for running runs with no recent events or heartbeat."
    expected_output: "Stale runs become recovered, retryable, stalled or failed with explicit persisted reason."

  - step: 4
    name: "Project terminal/stalled/recovered states into chat and run-flow APIs"
    agent: "backend_specialist"
    action: "Persist compact user-visible messages and expose stale/recovery metadata in existing run/event endpoints."
    expected_output: "Reloaded Preview chat shows the same terminal or stalled state without requiring live SSE."

  - step: 5
    name: "Enforce project and preview context consistency"
    agent: "backend_specialist"
    action: "Validate selected project, chat session, preview session and workflow target before enqueuing mutable work."
    expected_output: "Mismatched project context creates an explicit assistant error and no workflow run."

  - step: 6
    name: "Harden SSE parsing and frontend activity derivation"
    agent: "frontend_specialist"
    action: "Replace direct JSON.parse calls with a shared safe parser and expand activity mapping for node progress, stalled, failed, recovered and no-event waiting states."
    expected_output: "No uncaught EventSource parse errors and no indefinite stale 'Validating' label."

  - step: 7
    name: "Add focused regression tests"
    agent: "qa_specialist"
    action: "Add backend and frontend tests for durable chat run creation, stale detection, context mismatch, SSE parsing and replay rendering."
    expected_output: "Focused tests fail before the fix and pass after it."

  - step: 8
    name: "Runtime validation"
    agent: "qa_specialist"
    action: "Run focused tests, builds, API smoke checks and browser smoke against Preview chat."
    expected_output: "Validation evidence with commands, endpoints, screenshots or DOM assertions, and remaining risks."
```

## 12. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm that the fix closes the durability gap without duplicating workflow state derivation in the frontend."
    inputs:
      - "This SDD"
      - "Existing specs 64, 65 and 67"
      - "Current repository code"
    outputs:
      - "Architecture notes"
      - "Compatibility risks"

  - agent_name: "backend_specialist"
    responsibility: "Implement ledger/outbox integration, recovery, watchdog, context guard and persisted projection."
    inputs:
      - "SubmitHorusChatTurnUseCase"
      - "WorkflowOrchestrator"
      - "Repository contracts"
      - "Workflow/chat schemas"
    outputs:
      - "Backend diff"
      - "Backend tests"

  - agent_name: "frontend_specialist"
    responsibility: "Implement safe SSE parsing and activity rendering that reflects backend truth."
    inputs:
      - "VisualPreviewConsole"
      - "PreviewConversationPanel"
      - "agentFlowApi"
      - "shared event schemas"
    outputs:
      - "Frontend diff"
      - "Frontend guard tests"
      - "Browser smoke evidence"

  - agent_name: "qa_specialist"
    responsibility: "Validate the stuck-running failure class and cross-layer recovery."
    inputs:
      - "Diff"
      - "Acceptance criteria"
      - "Runtime endpoints"
    outputs:
      - "Test report"
      - "Runtime smoke report"
      - "Residual risk list"
```

## 13. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Submitting a mutable Preview chat request creates a durable turn and workflow run before the assistant says work will begin."
    - "If the workflow runner stops after a non-terminal event, startup recovery or the watchdog produces a persisted recovered, stalled or failed state."
    - "Preview chat history shows a compact terminal/stalled/failure message after reload."
    - "The activity pill never remains indefinitely on the last stale milestone after backend status changes."
    - "Project context mismatch is blocked before workflow enqueue and rendered as an actionable chat error."
  integration:
    - "Workflow events, ledger rows and chat projections agree on turnId/runId/threadId."
    - "SSE reconnect from the last event sequence does not duplicate progress."
    - "Existing chat history and legacy workflow events remain renderable."
    - "Postgres and file-mode behavior remain equivalent for the affected repository operations."
  architectural:
    - "No frontend-only inference is used as the source of truth for terminal workflow state."
    - "No mutable Preview chat path uses unowned fire-and-forget execution."
    - "No hardcoded local project ids, thread ids, ports, timestamps or machine paths are introduced."
  quality:
    - "Focused backend tests cover idempotent durable chat run creation, stale detection and context mismatch."
    - "Focused frontend tests cover safe SSE parsing and stalled-state rendering."
    - "Typecheck/build/tests relevant to changed packages pass or failures are reported with exact blockers."
  observability:
    - "Run detail API exposes last event sequence, last event timestamp, stale threshold status and recovery reason."
    - "Logs include runId, threadId, turnId, projectId, status transition, stale reason and recovery action."
    - "User-visible failures explain whether the run failed, stalled, recovered or targeted a mismatched project."
```

## 14. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate shared schema/type changes."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate backend TypeScript and integration wiring."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web test:guards"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend regression guards."
      success_condition: "Exit code 0."
    - command: "node --test apps/server/test/horusChatTurn.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate chat submit behavior, context guards and workflow linkage."
      success_condition: "Exit code 0."
    - command: "node --test apps/server/test/agentExecutionLedger.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate ledger/outbox and stale recovery behavior."
      success_condition: "Exit code 0."
    - command: "git diff --check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Detect whitespace errors before handoff."
      success_condition: "Exit code 0."
  runtime_checks:
    - name: "Accepted chat turn creates durable run"
      method: "API smoke"
      expected: "POST chat action returns workflowThreadId plus runId/turnId and API run detail shows matching status."
    - name: "No-event-after-last-sequence behavior"
      method: "curl SSE with since_sequence"
      expected: "If no new workflow event exists, UI/API exposes waiting or stalled state rather than silent stale progress."
    - name: "Backend restart recovery"
      method: "manual or automated server restart around pending/running test fixture"
      expected: "Run is recovered, retried, stalled or failed explicitly."
    - name: "Browser Preview chat smoke"
      method: "browser"
      expected: "Submitting a request shows progress, and terminal/stalled outcome appears without console JSON parse errors."
  integration_checks:
    - name: "Chat/workflow/ledger consistency"
      surfaces:
        - "chat_sessions"
        - "chat_messages"
        - "agent_execution_turns"
        - "agent_workflow_runs"
        - "workflow_events"
      method: "repository integration test or SQL-backed smoke"
      expected: "Accepted mutable turn has linked records and monotonic events."
    - name: "Project context consistency"
      surfaces:
        - "Preview selected project"
        - "chat action projectId"
        - "previewSessionId"
      method: "integration test"
      expected: "Mismatch is blocked before outbox enqueue."
    - name: "EventSource parser compatibility"
      surfaces:
        - "VisualPreviewConsole"
        - "agentFlowApi"
      method: "unit test"
      expected: "undefined, empty, heartbeat, malformed and valid JSON payloads are handled deterministically."
  manual_checks:
    - "Open Preview mode and confirm activity labels are understandable across queued/running/stalled/failed/completed states."
    - "Reload Preview during a running workflow and confirm history/progress replays from persisted state."
```

## 15. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent files, APIs, routes, tables or statuses."
    - "Inspect current implementation before deciding whether a migration is required."
    - "Never claim runtime recovery works unless it was validated with a test or smoke check."
  read_before_write:
    - "Read all affected contracts before changing frontend or backend consumers."
    - "Search for all direct EventSource JSON.parse call sites before editing one client."
    - "Find all chat_code_change start paths before declaring fire-and-forget removed."
  failure_handling:
    - "If a workflow cannot be recovered safely, mark it stalled or failed with a reason instead of retrying blindly."
    - "If repository transaction support is missing, implement the narrow required repository method or document the exact blocker."
    - "If browser smoke is blocked by tooling, run API and frontend guard tests and report the missing browser evidence."
  state_consistency:
    - "Do not update workflow status without considering chat projection and run detail API."
    - "Do not update frontend labels without backend statuses/events."
    - "Do not add a new event type without parser, replay and display policy."
  scope_control:
    - "Do not redesign the whole Preview UI."
    - "Do not touch unrelated documentation or docs app content."
    - "Do not perform broad formatting."
```

## 16. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary SSE disconnect"
    - "temporary preview server startup delay"
    - "expired lease where checkpoint and outbox payload are still valid"
    - "LLM/tool transient failure inside configured retry budget"
  non_retryable_failures:
    - "project context mismatch"
    - "missing generated project root"
    - "missing or corrupt workflow checkpoint with no safe recovery path"
    - "schema mismatch in persisted run/outbox payload"
    - "validation gate failure that requires agent correction rather than infrastructure retry"
  rollback_rules:
    - "Do not rollback user changes or unrelated dirty worktree changes."
    - "Rollback only changes introduced by this task when they are clearly isolated."
    - "If rollback would risk data loss, stop and report exact state."
  escalation_rules:
    - "Escalate if a migration is required but the current schema is inconsistent with repository tests."
    - "Escalate if credentials or local database access are missing for Postgres validation."
    - "Escalate before destructive cleanup of old workflow rows."
```

## 17. Observability Requirements

```yaml
observability:
  logs:
    - event: "chat_turn_accepted"
      fields:
        - "turn_id"
        - "run_id"
        - "thread_id"
        - "chat_session_id"
        - "project_id"
        - "preview_session_id"
    - event: "workflow_recovery_started"
      fields:
        - "run_id"
        - "thread_id"
        - "previous_status"
        - "last_event_sequence"
        - "lease_owner"
        - "recovery_reason"
    - event: "workflow_marked_stalled"
      fields:
        - "run_id"
        - "thread_id"
        - "last_event_sequence"
        - "last_event_at"
        - "stale_threshold_ms"
        - "stale_reason"
    - event: "project_context_mismatch"
      fields:
        - "chat_session_id"
        - "requested_project_id"
        - "selected_project_id"
        - "preview_session_id"
        - "reason"
    - event: "sse_payload_parse_failed"
      fields:
        - "stream_name"
        - "event_type"
        - "payload_kind"
        - "message"
  audit_trail:
    required: true
    must_capture:
      - "files read"
      - "files changed"
      - "commands executed"
      - "test results"
      - "runtime smoke endpoints"
      - "workflow status transitions"
      - "recovery decisions"
  user_visible_failures:
    - "Show when work is stalled."
    - "Show whether Horus will retry, recovered, failed, or needs a new request."
    - "Show project context mismatch before any code change starts."
    - "Show validation/apply failure as a terminal or retryable event, not an endless loading state."
```

## 18. Risks And Unknowns

```yaml
risks:
  - risk: "Current dirty worktree may already contain partial ledger/outbox changes."
    severity: "high"
    mitigation: "Implementation agent must inspect current diff and work with existing changes instead of overwriting them."
  - risk: "Some legacy runs may not have ledger rows."
    severity: "high"
    mitigation: "Add legacy adoption or explicit stale terminalization path."
  - risk: "Watchdog timeout may conflict with legitimate long LLM calls."
    severity: "medium"
    mitigation: "Use heartbeat/lease renewal and configurable thresholds."
  - risk: "Frontend activity labels become noisy."
    severity: "medium"
    mitigation: "Keep detailed node events in activity state, project only major milestones to chat."
  - risk: "File-mode and Postgres-mode transaction semantics diverge."
    severity: "medium"
    mitigation: "Add equivalent repository tests and atomic file writes."

unknowns:
  - "Whether current ledger implementation already has a repository method that can atomically create turn, run, attempt and outbox for chat_code_change."
  - "Whether startup recovery currently runs for all workflow modes or only project construction."
  - "Whether existing chat projection code dedupes workflow events by sequence."
  - "Whether a schema migration is needed or existing migration 008/009 already supports all required fields."
```

## 19. Completion Checklist

```yaml
completion_checklist:
  before_implementation:
    - "Read this spec and the dependent specs 64, 65 and 67."
    - "Inspect current dirty worktree and avoid overwriting unrelated edits."
    - "Identify all mutable Preview chat start paths."
    - "Identify all EventSource JSON.parse call sites."
  backend_complete:
    - "Accepted mutable chat turns are durable and idempotent."
    - "No chat_code_change path starts only through in-memory fire-and-forget."
    - "Stale running workflows are recovered, stalled or failed explicitly."
    - "Project context mismatch blocks workflow enqueue."
    - "Run detail and chat projection expose terminal/stalled/recovered state."
  frontend_complete:
    - "SSE parser is defensive."
    - "Activity pill handles node progress and stalled/failure states."
    - "Reloaded chat reflects persisted progress."
    - "No uncaught JSON parse error appears for heartbeat or malformed events."
  validation_complete:
    - "Focused server tests pass."
    - "Focused web tests pass."
    - "Shared/server/web builds or typechecks relevant to changed files pass."
    - "Runtime smoke verifies Preview chat no longer stalls silently."
```

## 20. Minimal Output Contract For Implementing Agent

```yaml
implementation_output:
  changed_files:
    - "<exact paths>"
  migrations:
    - "<migration id or 'none'>"
  validation:
    commands_run:
      - "<command, cwd, exit code>"
    failed_commands:
      - "<command, cwd, exit code, reason>"
  runtime_evidence:
    - "chat turn idempotency evidence"
    - "stale run recovery evidence"
    - "SSE parser evidence"
    - "Preview browser/API smoke evidence"
  remaining_risks:
    - "<specific unresolved risk or 'none'>"
```

## 21. Implementation Log

```yaml
implemented_at_utc: "2026-05-27T21:45:24Z"
status: "implemented"
summary:
  - "Added stale running workflow reconciliation during pending execution recovery."
  - "Marked orphaned running runs as explicit error states with persisted workflow state, ledger status, error event and status_changed event."
  - "Added a legacy repair path for stale workflow_states that predate agent_workflow_runs ledger rows."
  - "Connected WorkflowOrchestrator to persisted workflow event history so recovery can report last known event evidence."
  - "Hardened Preview chat context validation so a project from another workspace is rejected before mutable work starts."
  - "Hardened Preview and Agent Flow SSE clients against undefined, empty, malformed and non-event payloads."
  - "Expanded Preview activity replay to include node_completed and error events so the UI does not stay stuck on the last patch_proposed milestone."
  - "Added focused regression coverage for stale workflow recovery and project workspace mismatch."
validation:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "pnpm --filter @u-build/web build"
  - "node --test apps/server/test/agentExecutionLedger.test.mjs"
  - "node --test apps/server/test/horusChatTurn.test.mjs"
  - "node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
  - "pnpm --filter @u-build/web test:guards"
  - "git diff --check"
  - "Browser smoke: Preview page reloaded without workflow SSE JSON parse console errors."
remaining_risks:
  - "Existing legacy workflow_states without agent_workflow_runs rows still require a migration/adoption pass if they must be repaired retroactively."
```
