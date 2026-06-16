---
format_version: "agentic_sdd.v1"
task_id: "73-dedicated-agent-file-telemetry"
title: "Dedicated Real-Time Agent File Telemetry Screen"
created_at_utc: "2026-05-29T20:13:26Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
status: "implemented"
implemented_at_utc: "2026-05-29T23:50:00Z"
---

## 1. Original User Request

```yaml
raw_user_request: |
  quero algo mais granular, saber exatamente quais arquivos os agentes estão criando e mexendo, tem que ser algo em tempo real, igual como acontece com você. consigo ver em tempo eral quais arquivos você tá mexendo. uma tela dedicada a telemetria. use a skill de criar spec para fazer isso bem feito
```

## 2. System Interpretation

```yaml
system_translation: |
  Build a dedicated telemetry screen that shows, in real time, exactly which files each Horus agent reads, creates, edits, deletes, validates, or fails to touch during an execution. The current run-flow surfaces aggregate filePaths and a compact RunTelemetryPanel, but the user wants Codex-like granular visibility with an explicit, auditable file activity timeline.

expected_user_visible_result: |
  The user can open a dedicated Telemetry screen for an active or historical run and see live file operations grouped by agent, tool, file, operation type, status, attempt, and timestamp. The screen updates while the agents work and clearly shows "reading", "creating", "editing", "deleting", "proposed", "applied", "validated", "blocked", or "failed" states.

expected_engineering_result: |
  The backend must expose typed file-operation telemetry derived from workflow events and operational session events. The frontend must consume replay plus SSE updates and render a dedicated route/screen without relying on loosely inferred file status from generic event.filePaths alone.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Users cannot currently audit file-level agent behavior with the same granularity they see when Codex edits their local workspace."
  target_user: "Horus operators reviewing live agent runs and debugging why an agent changed or failed to change a generated project."
  expected_outcome: "Every meaningful file touch made by an agent is visible, live, attributable, and replayable."
  product_surface:
    - "Agent run map"
    - "Dedicated telemetry screen"
    - "Workflow event stream"
    - "Operational session repository"
    - "Project file change notifications"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph workflow"
      - "Express API routes"
      - "Workflow event log"
      - "Agent operational sessions"
    frontend:
      - "React"
      - "Vite"
      - "TanStack Query"
      - "EventSource/SSE"
    database:
      - "File and Postgres repositories for workflow, operational session, and artifact state"
    infrastructure:
      - "Generated project workspaces"
      - "Project file browser and preview runtime"
  known_entrypoints:
    - "packages/shared/src/ports/IEventStream.ts"
    - "packages/shared/src/entities/HorusRunFlow.ts"
    - "packages/shared/src/entities/AgentOperationalSession.ts"
    - "apps/server/src/application/services/AgentToolLoop.ts"
    - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
    - "apps/server/src/infrastructure/http/routes/agentRunFlowRoutes.ts"
    - "apps/web/src/features/agent-flow-map/AgentFlowPage.tsx"
    - "apps/web/src/features/agent-flow-map/components/RunTelemetryPanel.tsx"
    - "apps/web/src/features/agent-flow-map/hooks/useRunFlowEvents.ts"
    - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
  known_existing_patterns:
    - "Workflow events are replayed through `/api/agent-runs/:threadId/events` and streamed through `/api/agent-runs/:threadId/events/stream`."
    - "AgentToolLoop emits `tool_call_started`, `tool_call_finished`, and `tool_call_blocked` workflow events with optional `filePaths`."
    - "AgentToolLoop records operational events such as `file_read`, `file_changed`, `command_ran`, and `diff_recorded`."
    - "AgentOperationalSession projections already separate `filesRead` from `filesChanged` and track change type metadata."
    - "RunTelemetryPanel currently infers file status from generic run events, which is insufficient for exact operation semantics."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create a typed file-operation telemetry contract that distinguishes file reads, creates, updates, deletes, validations, blocked operations, and failed operations."
    - "Expose file-operation telemetry for a run through replay and live streaming."
    - "Render a dedicated frontend telemetry route/screen for active and historical runs."
    - "Link each file operation to agent name, agent profile, workflow node, tool name, operational session, user story, attempt/run IDs when available, timestamp, and status."
    - "Show operation-level evidence such as diff preview, additions/deletions, version hash, command ID, and error message when available."
    - "Preserve existing run-flow map and compact telemetry behavior while adding the dedicated screen."
    - "Add focused backend contract tests, frontend derivation tests, and at least one SSE/replay smoke path."
  out_of_scope:
    - "Changing the LangGraph topology."
    - "Changing agent permissions or introducing new mutating tools."
    - "Replacing CodeChangeSet lifecycle or project-file storage."
    - "Building a full observability warehouse or metrics dashboard."
    - "Exposing raw file contents or full diffs without redaction/size limits."
    - "Changing generated project code behavior unrelated to telemetry."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/HorusRunFlow.ts"
      - "packages/shared/src/entities/AgentOperationalSession.ts"
      - "packages/shared/src/ports/IEventStream.ts"
      - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
      - "apps/server/src/application/services/AgentToolLoop.ts"
      - "apps/server/src/application/services/AgentRunbookService.ts"
      - "apps/server/src/infrastructure/http/routes/agentRunFlowRoutes.ts"
      - "apps/server/src/application/ports/RepositoryPorts.ts"
    services:
      - "AgentToolLoop"
      - "HorusRunFlowSnapshotBuilder"
      - "AgentOperationalSessionRepository"
      - "WorkflowEventLogRepository"
      - "WorkflowEventProjector"
    database:
      migrations_required: false
      tables:
        - "agent_operational_sessions"
        - "agent_operation_events"
        - "workflow event log storage"
  frontend:
    files:
      - "apps/web/src/features/agent-flow-map/AgentFlowPage.tsx"
      - "apps/web/src/features/agent-flow-map/components/RunTelemetryPanel.tsx"
      - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
      - "apps/web/src/features/agent-flow-map/hooks/useRunFlowEvents.ts"
      - "apps/web/src/features/agent-flow-map/styles/agent-flow-map.css"
      - "apps/web/src/App.tsx"
      - "apps/web/src/components/Shell.tsx"
    components:
      - "DedicatedAgentTelemetryPage"
      - "AgentFileOperationTimeline"
      - "AgentFileOperationTable"
      - "AgentTelemetryFilters"
      - "FileOperationInspector"
    routes:
      - "A dedicated telemetry route or navigation mode for agent runs"
  workflow:
    graph_nodes:
      - "specAgent"
      - "odinAgent"
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
    agents:
      - "Spec"
      - "Odin"
      - "Front"
      - "QA"
      - "Curator"
  tests:
    unit:
      - "packages/shared/test/horusRunFlow.test.mjs"
      - "packages/shared/test/agentOperationalSession.test.mjs"
      - "apps/server/test/agentToolLoop.test.mjs"
      - "apps/server/test/workflowToolEvents.test.mjs"
      - "apps/server/test/agentRunbookService.test.mjs"
      - "apps/web/test/frontendRegressionGuards.test.mjs"
    integration:
      - "apps/server/test/agentOperationalSessionRepository.test.mjs"
      - "apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
      - "apps/web/test/workflowProgressRunbook.test.mjs"
    e2e:
      - "Browser smoke check of the dedicated telemetry screen during an active run"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This feature connects the existing tool runtime, operational session projection, workflow event projection, run-flow API, and React agent-flow UI. The backend must stop treating file telemetry as only a string array on generic events and expose a typed, operation-level view that the frontend can replay and stream without guessing.

  depends_on:
    - name: "AgentToolLoop"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "executeCodeChangeSet emits workflow tool events and records operational events"
      required_for: "Primary live source for read_file, write_file, edit_file, save_file, delete_file, apply_code_change_set, run_command, and validation events."
      assumptions: []
      failure_modes:
        - "Tool output lacks enough metadata to determine operation type."
        - "Started event includes input path but finished event omits unchanged or failed path."
      fallback_or_recovery: "Use operational session event metadata when available; otherwise show operationType=unknown with raw toolName and file path."
      verification:
        - "apps/server/test/agentToolLoop.test.mjs includes read, create, update, delete, blocked, and failed tool cases."

    - name: "AgentOperationalSession projection"
      type: "internal_module"
      owner: "packages/shared/entities"
      direction: "this_spec_consumes_dependency"
      contract_used: "projectAgentOperationalSession(session, events) -> filesRead/filesChanged/toolsUsed/commands/errors"
      required_for: "Typed historical evidence with version hashes, change types, diff previews, and command metadata."
      assumptions: []
      failure_modes:
        - "Projection collapses repeated operations on the same file and loses timeline ordering."
      fallback_or_recovery: "Add a separate timeline-oriented projection while preserving the existing summary projection."
      verification:
        - "packages/shared/test/agentOperationalSession.test.mjs covers repeated file reads and multiple changes to the same path."

    - name: "Workflow event log"
      type: "backend_service"
      owner: "apps/server/application/ports"
      direction: "this_spec_consumes_dependency"
      contract_used: "list(threadId), listAfter(threadId, sequence), subscribe(threadId)"
      required_for: "Replay and live SSE delivery."
      assumptions: []
      failure_modes:
        - "SSE reconnect duplicates events or loses ordering."
      fallback_or_recovery: "Use stable event IDs and sequence cursors; frontend must dedupe by event ID plus sequence."
      verification:
        - "Route test or integration smoke for replay then stream with `since_sequence`."

    - name: "Existing run-flow frontend"
      type: "frontend_component"
      owner: "apps/web/features/agent-flow-map"
      direction: "this_spec_consumes_dependency"
      contract_used: "agentFlowApi, useRunFlowEvents, HorusRunSnapshot"
      required_for: "Navigation from run map to dedicated telemetry and reuse of run selection/live stream primitives."
      assumptions: []
      failure_modes:
        - "Adding another live consumer causes duplicate EventSource connections for the same run."
      fallback_or_recovery: "Centralize stream subscription per screen or share the existing hook; close streams on unmount."
      verification:
        - "Frontend test verifies EventSource setup/cleanup and deduped live rows."

  depended_on_by:
    - name: "Dedicated telemetry screen"
      type: "frontend_component"
      owner: "apps/web/features/agent-flow-map"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Run file-operation telemetry API and live stream contract"
      compatibility_obligation: "must preserve existing `/api/agent-runs` contracts; new fields are additive"
      expected_consumer_behavior: "Render exact file operations without status inference from tool names alone."
      migration_or_notification_required: false
      verification:
        - "Frontend tests with representative event fixtures."

    - name: "Preview project file refresh"
      type: "frontend_component"
      owner: "apps/web/features/visual-preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "file operation events for changed files"
      compatibility_obligation: "must preserve current `emitProjectFilesChanged` behavior for applied or succeeded changes"
      expected_consumer_behavior: "Continue refreshing file tree when agents apply or finish successful mutations."
      migration_or_notification_required: false
      verification:
        - "Existing workflow progress tests remain green."

    - name: "Future audit/export tools"
      type: "workflow"
      owner: "Horus operations"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Auditable file-operation timeline"
      compatibility_obligation: "may extend with new optional evidence fields"
      expected_consumer_behavior: "Use telemetry as evidence of what agents touched during a run."
      migration_or_notification_required: false
      verification:
        - "Contract snapshot test for operation timeline shape."

  bidirectional_integrations:
    - name: "Tool runtime to UI live telemetry"
      participants:
        - "AgentToolLoop"
        - "DedicatedAgentTelemetryPage"
      shared_contract: "AgentFileOperationTelemetry event/projection"
      consistency_rule: "Every mutating file tool that succeeds, fails, or is blocked must produce a visible telemetry row with operation type, status, path, agent, tool, and timestamp."
      verification:
        - "Backend event projection test plus frontend fixture rendering test."

    - name: "Operational session timeline and workflow run snapshot"
      participants:
        - "AgentOperationalSessionRepository"
        - "HorusRunFlowSnapshotBuilder"
      shared_contract: "operation session ID and workflow thread ID"
      consistency_rule: "Operations from the same operationalSessionId must be joinable to the workflow run and agent profile."
      verification:
        - "Repository integration test listing operation timeline by thread ID."

  data_flow:
    inbound:
      - source: "Agent tool execution"
        payload_or_state: "tool_call_started/tool_call_finished/tool_call_blocked events plus operational `file_read` and `file_changed` events"
        validation: "WorkflowEventSchema, AgentOperationEventSchema, and new file telemetry schema"
      - source: "CodeChangeSet lifecycle"
        payload_or_state: "patch_proposed/patch_applied with CodeChangeSet operation paths"
        validation: "CodeChangeSetSchema and workflow event projection"
    outbound:
      - target: "Dedicated frontend telemetry screen"
        payload_or_state: "ordered file operation telemetry rows"
        compatibility: "Additive API shape; existing run-flow endpoints continue to work"
      - target: "Compact run-flow telemetry panel"
        payload_or_state: "existing HorusRunSnapshot plus optional richer fields"
        compatibility: "Existing fields remain valid"

  sequencing_dependencies:
    - dependency: "Shared schema must be added before backend route projection."
      reason: "Both server and frontend need the same typed operation shape."
      validation: "pnpm --filter @u-build/shared test or targeted shared tests."
    - dependency: "Backend projection must be implemented before the dedicated frontend uses it."
      reason: "The UI must not infer granular truth from insufficient generic events."
      validation: "API fixture or route test proves operation type/status before UI wiring."
    - dependency: "Navigation route must be wired after the component exists."
      reason: "Avoid empty route state or broken shell navigation."
      validation: "Frontend smoke or test for visible screen entry point."

  integration_risks:
    - risk: "Telemetry becomes noisy and unreadable for large runs."
      severity: "medium"
      mitigation: "Add filters by agent, operation type, status, and file path; default to latest active operations."
    - risk: "Sensitive file contents leak through diff preview or raw metadata."
      severity: "high"
      mitigation: "Never expose full file contents; keep diff previews bounded and redact configured sensitive paths."
    - risk: "Historical projections disagree with live SSE events."
      severity: "high"
      mitigation: "Use one shared mapping function for replay and live stream payloads."
    - risk: "Existing run-flow UI regresses because shared schemas change."
      severity: "medium"
      mitigation: "Additive schema extension only; keep old fields and tests."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Separate application, domain, infrastructure, and presentation concerns."
    - "Prefer dependency injection over direct construction of concrete services."
    - "Do not introduce circular dependencies."
    - "Do not duplicate business rules across layers."
  project_specific:
    - "Keep shared telemetry contracts in `packages/shared` before backend/frontend consumption."
    - "Do not make the frontend infer operation semantics from labels or Portuguese UI strings."
    - "Use operational session events as the source of truth for read/change details when available."
    - "Use workflow events as the source of truth for run ordering, SSE delivery, and user-visible progress."
    - "Keep existing `/api/agent-runs` behavior backward compatible."
    - "Do not expose unbounded diffs, raw file contents, secrets, absolute host paths, or hidden local operator files."
    - "Maintain the existing max-step/max-retry safeguards in agent loops; telemetry must observe loops, not create unbounded work."
```

## 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Prefer typed schemas and deterministic mapping helpers over regex or string matching."
    - "Avoid regex-based parsing/routing/text normalization unless no structured source exists."
    - "Keep public API compatibility unless a migration is explicitly documented."
    - "Handle malformed or partial events explicitly."
  backend:
    - "Extend Zod schemas additively."
    - "Reuse `WorkflowEventSchema`, `AgentOperationEventSchema`, and `HorusRunSnapshotSchema` instead of creating parallel untyped payloads."
    - "Create one mapping function from workflow/operational evidence to file-operation telemetry and reuse it for replay and streaming."
    - "Bound diff preview, stdout, stderr, and metadata payload sizes."
    - "Normalize paths through existing project path safety helpers where file-system access is involved."
  frontend:
    - "Build the dedicated screen as a real operational surface, not a marketing/empty explainer page."
    - "Use stable table/list dimensions so live rows do not shift the layout aggressively."
    - "Provide filters and search without hiding active failures by default."
    - "Use accessible labels for icon-only controls."
    - "Do not let long file paths overflow containers; use truncation with full path available in inspector/details."
  tests:
    - "Cover replay and live updates."
    - "Cover read, create, update, delete, blocked, failed, proposed, applied, and validation events."
    - "Do not mark complete without targeted backend and frontend validation."
```

## 9. Contracts And Invariants

```yaml
contracts:
  api_contracts:
    - name: "Agent file operation telemetry"
      producer: "HorusRunFlowSnapshotBuilder or dedicated telemetry projection service"
      consumers:
        - "DedicatedAgentTelemetryPage"
        - "RunTelemetryPanel"
      request_shape: "GET /api/agent-runs/:threadId/file-operations?since_sequence=<number optional>"
      response_shape: |
        {
          threadId: string;
          operations: AgentFileOperationTelemetry[];
        }
      compatibility: "additive; existing `/api/agent-runs/:threadId` remains unchanged"

    - name: "Agent file operation live stream"
      producer: "agentRunFlowRoutes"
      consumers:
        - "DedicatedAgentTelemetryPage"
      request_shape: "EventSource /api/agent-runs/:threadId/file-operations/stream?since_sequence=<number>"
      response_shape: "SSE events using event: file_operation and data: AgentFileOperationTelemetry"
      compatibility: "new endpoint; does not replace current workflow event stream"

  domain_contracts:
    - name: "AgentFileOperationTelemetry"
      producer: "packages/shared"
      consumers:
        - "apps/server"
        - "apps/web"
      invariant: |
        Each operation has id, threadId, sequence, sourceEventId or sourceOperationEventId, path, operationType, status, agentName, toolName, timestamp, and provenance. Mutating operations must include changeType when known.

    - name: "Operation type semantics"
      producer: "Tool/runtime projection"
      consumers:
        - "Telemetry UI"
      invariant: |
        `read_file` maps to operationType=read. `write_file` maps to create unless overwrite/update is explicitly reported. `edit_file` and `save_file` map to update. `delete_file` maps to delete. `apply_code_change_set` maps to apply with per-operation changeType when available.

    - name: "Status semantics"
      producer: "Tool/runtime projection"
      consumers:
        - "Telemetry UI"
      invariant: |
        Started operations show running. Succeeded read operations show read. Succeeded mutations show changed/proposed/applied depending on lifecycle source. Failed and blocked operations must remain visible with errorMessage.

  ui_contracts:
    - name: "Dedicated telemetry screen"
      producer: "apps/web"
      consumers:
        - "Horus operator"
      requirement: "Displays active file operations in real time, filterable by agent, operation type, status, and file path."

    - name: "File operation inspector"
      producer: "apps/web"
      consumers:
        - "Horus operator"
      requirement: "Selecting a row reveals operation provenance, tool input/output summary, diff preview, command evidence, errors, and related workflow event JSON."

  data_contracts:
    - name: "Operational session timeline"
      producer: "AgentOperationalSessionRepository"
      consumers:
        - "Telemetry projection service"
      migration_required: false
      compatibility_notes: "Use existing event rows when possible. Add fields only if current metadata cannot represent operation status/provenance."
```

### Proposed Shared Schema

```ts
export const AgentFileOperationTypeSchema = z.enum([
  "read",
  "create",
  "update",
  "delete",
  "apply",
  "validate",
  "diff",
  "unknown",
]);

export const AgentFileOperationStatusSchema = z.enum([
  "running",
  "read",
  "changed",
  "proposed",
  "applied",
  "validated",
  "blocked",
  "failed",
  "skipped",
  "unknown",
]);

export const AgentFileOperationTelemetrySchema = z.object({
  id: z.string().min(1),
  threadId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  workflowSequence: z.number().int().nonnegative().nullable().default(null),
  operationalSequence: z.number().int().nonnegative().nullable().default(null),
  sourceEventId: z.string().min(1).nullable().default(null),
  sourceOperationEventId: z.string().uuid().nullable().default(null),
  operationalSessionId: z.string().uuid().nullable().default(null),
  runId: z.string().uuid().nullable().default(null),
  attemptId: z.string().uuid().nullable().default(null),
  userStoryId: z.string().uuid().nullable().default(null),
  nodeId: HorusWorkflowNodeIdSchema.nullable().default(null),
  agentName: AgentNameSchema.nullable().default(null),
  agentProfileId: AgentProfileIdSchema.nullable().default(null),
  toolName: AgentToolNameSchema.nullable().default(null),
  path: z.string().trim().min(1),
  operationType: AgentFileOperationTypeSchema,
  status: AgentFileOperationStatusSchema,
  changeType: z.enum(["create", "update", "delete", "unknown"]).nullable().default(null),
  versionHash: z.string().trim().min(16).nullable().default(null),
  newVersionHash: z.string().trim().min(16).nullable().default(null),
  additions: z.number().int().nonnegative().nullable().default(null),
  deletions: z.number().int().nonnegative().nullable().default(null),
  replacementCount: z.number().int().nonnegative().nullable().default(null),
  diffPreview: z.string().default(""),
  commandIds: z.array(z.string().trim().min(1)).default([]),
  errorMessage: z.string().trim().min(1).nullable().default(null),
  summary: z.string().trim().min(1).nullable().default(null),
  timestamp: z.string().datetime(),
});
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current telemetry and file-operation producers"
    agent: "repo_explorer"
    action: "Read shared schemas, AgentToolLoop, operational session repositories, run-flow routes, and current frontend telemetry components."
    expected_output: "Confirmed producer/consumer map and exact files to edit."

  - step: 2
    name: "Add shared telemetry contract"
    agent: "backend_specialist"
    action: "Add AgentFileOperationTelemetry schema/types to `packages/shared`, export them, and test valid/invalid examples."
    expected_output: "Typed shared contract with tests."

  - step: 3
    name: "Build projection from workflow and operational events"
    agent: "backend_specialist"
    action: "Create deterministic mapper that joins workflow events, operational session events, and CodeChangeSet lifecycle events into ordered file-operation rows."
    expected_output: "Projection function with unit tests for read/create/update/delete/apply/blocked/failed cases."

  - step: 4
    name: "Expose replay and live endpoints"
    agent: "backend_specialist"
    action: "Add `/api/agent-runs/:threadId/file-operations` and `/api/agent-runs/:threadId/file-operations/stream`, or extend existing run endpoint only if cleaner and still backward compatible."
    expected_output: "Replay and SSE route tests passing with sequence cursor behavior."

  - step: 5
    name: "Implement dedicated telemetry screen"
    agent: "frontend_specialist"
    action: "Create a dedicated telemetry page with run selector, live status, operation table/timeline, filters, and inspector panel."
    expected_output: "React UI consuming typed telemetry with no string-inferred operation semantics."

  - step: 6
    name: "Wire navigation from run-flow"
    agent: "frontend_specialist"
    action: "Add a clear entry point from Agent Flow to the dedicated telemetry route and preserve current compact panel."
    expected_output: "Users can move from the run map to the full telemetry screen for the same threadId."

  - step: 7
    name: "Validate end to end"
    agent: "qa_specialist"
    action: "Run targeted shared/server/web tests, start the app if needed, and smoke an active run where a file is read then edited."
    expected_output: "Validation evidence with commands, exit codes, route responses, and browser screenshot/manual notes."
```

## 11. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Keep telemetry contracts additive and connected to current workflow/operational-session boundaries."
    inputs:
      - "This SDD"
      - "Current shared schemas"
      - "Run-flow API routes"
    outputs:
      - "Final contract map"
      - "Any required sequencing adjustments"

  - agent_name: "backend_specialist"
    responsibility: "Implement shared schemas, projection services, routes, and SSE behavior."
    inputs:
      - "packages/shared contracts"
      - "AgentToolLoop"
      - "AgentOperationalSession repository"
      - "WorkflowEventLogRepository"
    outputs:
      - "Backend diff"
      - "Shared/server tests"

  - agent_name: "frontend_specialist"
    responsibility: "Implement dedicated telemetry UI and route integration."
    inputs:
      - "Telemetry API contract"
      - "Existing Agent Flow UI patterns"
      - "Existing visual styles"
    outputs:
      - "Frontend diff"
      - "Frontend tests"
      - "Browser validation"

  - agent_name: "qa_specialist"
    responsibility: "Prove live and replay behavior across representative file operations."
    inputs:
      - "Backend/frontend diffs"
      - "Acceptance criteria"
    outputs:
      - "Test report"
      - "Runtime smoke evidence"
      - "Remaining risks"
```

## 12. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "A dedicated telemetry screen exists and can be opened for a selected run/thread."
    - "The screen updates in real time while a run is active."
    - "The screen shows exact file paths with operation type and status for reads, creates, updates, deletes, proposed patches, applied patches, validations, blocked operations, and failed operations."
    - "Each row identifies the responsible agent, profile/tool when available, user story, workflow node, timestamp, and related event/provenance."
    - "Selecting a file operation shows bounded evidence and raw structured metadata useful for debugging."
  integration:
    - "Existing `/api/agent-runs` snapshot and event stream consumers keep working."
    - "Replay and live stream use compatible payloads and dedupe keys."
    - "Operational session evidence is joined to workflow run identity."
    - "Project file browser refresh continues to trigger on successful applied/mutating events."
  architectural:
    - "Telemetry truth is produced by typed shared/backend contracts, not by UI string parsing."
    - "No new circular dependencies are introduced between shared, server, and web packages."
    - "The feature is additive and does not change LangGraph routing."
  quality:
    - "Shared schema tests pass."
    - "Server projection/route/SSE tests pass."
    - "Frontend regression tests for telemetry UI pass."
    - "Typecheck/build passes for touched packages or a blocker is reported with evidence."
  observability:
    - "Failed/blocked file operations remain visible and are not overwritten by later success rows."
    - "Telemetry stream failures show a user-visible offline/replay fallback state."
    - "Diff previews and metadata are bounded and safe for UI rendering."
```

## 13. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate shared schemas and projections."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test -- agentToolLoop workflowToolEvents agentOperationalSessionRepository"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate backend telemetry producers and route/projection behavior."
      success_condition: "Exit code 0 or document exact test runner limitation and run equivalent targeted tests."
    - command: "pnpm --filter @u-build/web test -- frontendRegressionGuards workflowProgressRunbook"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend telemetry wiring and regression guards."
      success_condition: "Exit code 0."
    - command: "pnpm typecheck"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Catch cross-package TypeScript contract drift."
      success_condition: "Exit code 0 or exact unrelated blockers documented."
  runtime_checks:
    - name: "Replay endpoint"
      method: "curl"
      expected: "GET `/api/agent-runs/:threadId/file-operations` returns ordered operations with read and change rows for a known run."
    - name: "Live stream"
      method: "browser or curl SSE"
      expected: "A running agent read/edit emits visible rows before the run completes."
    - name: "Telemetry screen"
      method: "browser"
      expected: "Dedicated screen shows live rows, filters, inspector, and failure/block states without layout overlap."
  integration_checks:
    - name: "Workflow event compatibility"
      surfaces:
        - "RunFlowPage"
        - "VisualPreview workflow progress"
      method: "Existing tests plus manual run-flow smoke."
      expected: "Existing progress UI keeps showing run status and project-file refreshes."
    - name: "Operational session compatibility"
      surfaces:
        - "File/Postgres operational session repositories"
      method: "Repository tests."
      expected: "Telemetry can be reconstructed after process restart."
  manual_checks:
    - "Start a run that causes the Front agent to read and edit a file; verify the telemetry screen shows the file while the agent is still running."
    - "Trigger or fixture a blocked edit without read evidence; verify blocked row includes the target path and error."
    - "Verify long paths truncate cleanly and the inspector exposes the full path."
```

## 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent routes, repositories, event types, or UI files; inspect current code first."
    - "Never claim real-time behavior without proving SSE or a live browser/runtime check."
    - "Do not mark telemetry complete if it only works after run completion."
  read_before_write:
    - "Read shared schemas before adding fields."
    - "Find all consumers of `WorkflowEvent`, `HorusRunSnapshot`, and `AgentOperationEvent` before changing contracts."
    - "Read existing CSS/layout before adding the dedicated screen."
  failure_handling:
    - "If SSE fails, verify replay endpoint before debugging frontend state."
    - "If projection loses ordering, inspect sequence sources instead of sorting by timestamp only."
    - "If tests fail due to dirty unrelated worktree state, report exact blockers and run narrower tests for touched surfaces."
  state_consistency:
    - "Do not update backend event payloads without updating shared schemas and frontend types."
    - "Do not update frontend UI to expect fields that the backend route cannot produce."
    - "Do not collapse read and write operations into one status when both happened."
    - "Do not replace failed/blocked rows with later success rows for the same path."
  scope_control:
    - "Do not redesign the whole app shell."
    - "Do not change agent retry policy or file mutation permissions."
    - "Do not format unrelated modules in the current dirty worktree."
```

## 15. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary dev server startup failure"
    - "SSE connection interruption"
    - "known flaky browser smoke"
    - "missing historical operational projection for older runs"
  non_retryable_failures:
    - "shared schema mismatch"
    - "route exposes unbounded sensitive data"
    - "frontend depends on fields not produced by backend"
    - "operation ordering cannot be reconstructed from available data"
  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only changes introduced by this feature."
    - "If rollback is unsafe in the dirty worktree, stop and report exact files touched."
  escalation_rules:
    - "Escalate if a new database migration is required after inspection, because this spec assumes existing operational event storage is enough."
    - "Escalate if sensitive-path redaction policy is missing and raw diffs would be exposed."
    - "Escalate if live proof cannot be produced due to runtime/provider credentials."
```

## 16. Observability Requirements

```yaml
observability:
  logs:
    - event: "file_operation_projected"
      fields:
        - "thread_id"
        - "sequence"
        - "agent_name"
        - "agent_profile_id"
        - "tool_name"
        - "path"
        - "operation_type"
        - "status"
        - "operational_session_id"
        - "error_type"
        - "duration_ms"
    - event: "file_operation_stream_error"
      fields:
        - "thread_id"
        - "since_sequence"
        - "error_type"
        - "message"
  audit_trail:
    required: true
    must_capture:
      - "files read"
      - "files created"
      - "files updated"
      - "files deleted"
      - "blocked file operations"
      - "failed file operations"
      - "commands executed"
      - "validation results"
      - "workflow decisions"
  user_visible_failures:
    - "Show stream offline state and replay fallback."
    - "Show failed operation reason."
    - "Show blocked operation reason."
    - "Show when operation type is unknown because evidence is incomplete."
```

## 17. Risks And Unknowns

```yaml
risks:
  - risk: "The current operational session projection dedupes per file and may hide repeated reads/edits."
    severity: "high"
    mitigation: "Add a timeline projection that preserves every event row and keep summary projection separate."
  - risk: "Some workflow events currently include only `filePaths`, without operation type."
    severity: "medium"
    mitigation: "Join to operational events by operationalSessionId when possible; otherwise report operationType=unknown instead of guessing."
  - risk: "Large diffs or metadata can make the UI heavy."
    severity: "medium"
    mitigation: "Bound previews and paginate or virtualize rows if needed."
  - risk: "Dirty worktree can make validation noisy."
    severity: "medium"
    mitigation: "Run targeted tests first and document unrelated blockers."

unknowns:
  - "Whether a new route is preferable to embedding `fileOperations` in `HorusRunSnapshot`; decide after checking current frontend route/navigation constraints."
  - "Whether Postgres/file operational repositories already expose enough query APIs to list operation events by workflow thread without loading each session one by one."
  - "Whether all generated-project tool calls include a reliable projectId/workspace identity for path redaction and navigation."
```

## 18. Completion Output Contract

```yaml
completion_output_contract:
  required_summary:
    - "Files changed by the implementation."
    - "New telemetry contracts and endpoints."
    - "How to open the dedicated telemetry screen."
    - "Validation commands run with results."
    - "Known limitations or follow-up risks."
  required_evidence:
    - "At least one example operation row for read."
    - "At least one example operation row for create/update/delete or applied patch."
    - "SSE or live browser proof that rows appear before run completion."
    - "Targeted test output."
```
