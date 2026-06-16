---
format_version: "agentic_sdd.v1"
task_id: "feature-87-coding-runtime-orchestrator-state-machine"
title: "Coding Runtime Orchestrator And State Machine"
created_at_utc: "2026-05-28T18:21:43Z"
author: "agent"
target_mode: "new_project"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_1_minimal_viable_coding_agent"
depends_on:
  - "spec/features/70-code-change-set-delete-and-safe-file-mutations.md"
  - "spec/features/71-agent-tool-runtime-governed-write-access.md"
  - "spec/features/72-agent-tool-runtime-react-loop-and-e2e-closure.md"
  - "spec/features/74-error-taxonomy-and-recovery-engine.md"
  - "spec/features/79-agentic-runtime-isolation.md"
  - "spec/features/83-provider-port-decoupling.md"
  - "spec/features/85-chat-experience-product-hardening.md"
---

# 87 - Coding Runtime Orchestrator And State Machine

## 1. Original User Request

```yaml
raw_user_request: |
  crie as specs 87 até 91

source_feature_request: |
  Design a lightweight AI coding assistant inspired by Claude Code / Cursor, simpler and modular,
  supporting frontend + backend projects, multi-agent orchestration, safe code editing, AST-aware
  modifications, repository understanding, diff-based patching and project-wide retrieval.

  Core workflow:
  User Request -> Orchestrator -> Code Retrieval -> AST Analysis -> Planning -> Code Generation ->
  AST Validation -> Lint/Typecheck/Test -> Patch Apply.
```

## 2. System Interpretation

```yaml
system_translation: |
  Create the first executable SPEC for Phase 1 of the Horus coding assistant: a deterministic runtime
  orchestrator with an explicit state machine. This SPEC must define the lifecycle, contracts, state
  transitions, cancellation, ownership boundaries and integration points without implementing retrieval,
  AST editing or validation internals directly.

expected_user_visible_result: |
  The user can submit a coding task and see a predictable execution lifecycle with clear states,
  terminal outcomes, cancellation and failure messages instead of an opaque agent response.

expected_engineering_result: |
  Horus gains a CodingRuntimeOrchestrator and typed state machine that coordinates existing and future
  retrieval, AST analysis, patch planning, validation and patch-apply services through ports.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "Horus needs a professional local-first coding assistant instead of ad hoc chat-driven code mutation."
  target_user: "Developer/operator using Horus to inspect and safely modify generated or local frontend/backend projects."
  expected_outcome: "Coding work executes through deterministic lifecycle stages with auditable state and no god-agent behavior."
  product_surface:
    - "Preview chat coding actions"
    - "Future coding assistant task API"
    - "Agent Flow execution timeline"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph"
      - "Zod"
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
    database:
      - "File repositories"
      - "Postgres repositories"
    infrastructure:
      - "pnpm"
      - "Turborepo"
  known_entrypoints:
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/application/services/AgentToolRuntime.ts"
    - "apps/server/src/application/services/AgentToolLoop.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/langgraph/AgentNodeIsolation.ts"
    - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
    - "packages/shared/src/entities/CodeChangeSet.ts"
  known_existing_patterns:
    - "Shared runtime contracts live in packages/shared/src/entities and are validated by Zod."
    - "Application layer owns use cases and ports; infrastructure implements concrete adapters."
    - "Runtime failures should flow through the Horus error/recovery taxonomy."
    - "Specs are local-only under spec/features and tracked in spec/README.md plus spec/CHANGELOG.md."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Define CodingTask, CodingRuntimeState, CodingRuntimeEvent and CodingRuntimeResult shared contracts."
    - "Create a deterministic CodingRuntimeOrchestrator in the application layer."
    - "Create a CodingWorkflowStateMachine with explicit transitions and terminal states."
    - "Add cancellation, timeout, retry boundary and idempotency requirements for task execution."
    - "Route frontend/backend/full-stack tasks by deterministic project evidence, not only LLM preference."
    - "Expose orchestration as a port/use-case boundary consumable by chat and future HTTP routes."
    - "Persist enough task state to resume, display and debug local executions."
  out_of_scope:
    - "Implement vector search, semantic retrieval or repository intelligence."
    - "Implement Tree-sitter parsing or AST edits."
    - "Implement LSP integration."
    - "Rewrite the current LangGraph user-story construction flow."
    - "Execute dangerous commands or arbitrary shell instructions."
    - "Replace existing CodeChangeSet contracts in this slice."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/CodingRuntime.ts"
      - "apps/server/src/application/coding/CodingRuntimeOrchestrator.ts"
      - "apps/server/src/application/coding/CodingWorkflowStateMachine.ts"
      - "apps/server/src/application/coding/CodingTaskRouter.ts"
      - "apps/server/src/application/ports/CodingRuntimePorts.ts"
      - "apps/server/src/infrastructure/http/routes/codingRoutes.ts"
    services:
      - "CodingRuntimeOrchestrator"
      - "CodingWorkflowStateMachine"
      - "CodingTaskRouter"
    database:
      migrations_required: true
      tables:
        - "coding_tasks"
        - "coding_task_events"
  frontend:
    files:
      - "apps/web/src/api/codingApi.ts"
      - "apps/web/src/features/visual-preview/usePreviewChatRuntime.ts"
    components:
      - "PreviewConversationPanel"
    routes:
      - "Preview mode chat surface"
  workflow:
    graph_nodes:
      - "No direct LangGraph node change required in this SPEC."
    agents:
      - "Planner agent as future consumer only."
  tests:
    unit:
      - "packages/shared/test/codingRuntime.test.mjs"
      - "apps/server/test/codingStateMachine.test.mjs"
      - "apps/server/test/codingRuntimeOrchestrator.test.mjs"
    integration:
      - "apps/server/test/codingRoutes.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This SPEC introduces the deterministic owner of coding-agent execution. It must consume retrieval,
    AST, patch and validation ports but not implement them. Downstream chat/UI code should observe
    task state through durable task events rather than infer progress from logs.

  depends_on:
    - name: "Horus chat turn use case"
      type: "backend_service"
      owner: "apps/server/application"
      direction: "this_spec_consumes_dependency"
      contract_used: "SubmitHorusChatTurnUseCase action routing"
      required_for: "Allow chat to start a coding task when user intent requires code changes."
      assumptions:
        - "Chat remains the first user-facing entrypoint until a dedicated coding page exists."
      failure_modes:
        - "Chat may continue bypassing the deterministic runtime and mutate code through legacy paths."
      fallback_or_recovery: "Feature flag coding runtime integration until routes are validated."
      verification:
        - "node --test apps/server/test/horusChatTurn.test.mjs"

    - name: "CodeChangeSet domain contract"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "CodeChangeSetSchema"
      required_for: "Represent final patch application through the current mutation pipeline."
      assumptions: []
      failure_modes:
        - "Patch lifecycle produces changes that current appliers cannot persist or validate."
      fallback_or_recovery: "Compile new structural patch plans into compatible CodeChangeSet operations."
      verification:
        - "node --test packages/shared/test/*.test.mjs"

    - name: "Agent runtime isolation"
      type: "workflow"
      owner: "apps/server/infrastructure/langgraph"
      direction: "this_spec_consumes_dependency"
      contract_used: "AbortSignal, timeout and retry policy semantics"
      required_for: "Keep coding tasks cancellable and bounded."
      assumptions: []
      failure_modes:
        - "Long-running retrieval, generation or validation tasks leak after cancellation."
      fallback_or_recovery: "Task state transitions to cancelled while late events are ignored by task version."
      verification:
        - "node --test apps/server/test/agentNodeIsolation.test.mjs"

  depended_on_by:
    - name: "Repository scanner and retrieval"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "CodingRuntimeStepContext"
      compatibility_obligation: "Must preserve step input/output envelopes and cancellation signal."
      expected_consumer_behavior: "Retrieval runs only when state machine enters retrieving."
      migration_or_notification_required: false
      verification:
        - "node --test apps/server/test/codingRuntimeOrchestrator.test.mjs"

    - name: "AST analysis and patch planner"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "CodingRuntimeState, CodingRuntimeArtifactRef"
      compatibility_obligation: "May extend artifacts, must not bypass state transitions."
      expected_consumer_behavior: "AST/patch services return typed artifacts and do not mutate task state directly."
      migration_or_notification_required: false
      verification:
        - "State machine transition tests."

    - name: "Preview chat UI"
      type: "frontend_component"
      owner: "apps/web/features/visual-preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "CodingRuntimeEvent stream or task snapshot response"
      compatibility_obligation: "Additive event contract; existing chat messages must still render."
      expected_consumer_behavior: "Display coding task progress, cancel, failure and completion clearly."
      migration_or_notification_required: false
      verification:
        - "pnpm --filter @u-build/web test:guards"

  bidirectional_integrations:
    - name: "Coding task lifecycle and persistence"
      participants:
        - "CodingRuntimeOrchestrator"
        - "CodingTaskRepository"
      shared_contract: "CodingRuntimeState and event sequence"
      consistency_rule: "Every state transition must append exactly one ordered event and persist the latest snapshot."
      verification:
        - "Repository contract tests for file and Postgres drivers."

  data_flow:
    inbound:
      - source: "User chat/API request"
        payload_or_state: "task prompt, project scope, optional selected files"
        validation: "Zod request schema plus project ownership/path safety."
    outbound:
      - target: "Retrieval/AST/patch/validation ports"
        payload_or_state: "CodingRuntimeStepContext with task id, project root, signal, budgets and artifacts"
        compatibility: "Ports may add metadata but must not mutate state directly."
      - target: "Frontend timeline"
        payload_or_state: "CodingRuntimeEvent"
        compatibility: "Events are append-only and safe to replay."

  sequencing_dependencies:
    - dependency: "Create shared contracts before application services"
      reason: "Frontend, persistence and orchestration must share one state vocabulary."
      validation: "Shared build and contract tests."
    - dependency: "State machine before HTTP/chat integration"
      reason: "Entrypoints must not invent custom lifecycle states."
      validation: "Integration tests assert legal transitions."

  integration_risks:
    - risk: "Orchestrator becomes a god agent by making subjective coding decisions."
      severity: "critical"
      mitigation: "Keep orchestrator deterministic; delegate retrieval, analysis, planning and validation to ports."
    - risk: "Task state duplicates workflow state and confuses UI."
      severity: "high"
      mitigation: "Expose coding task events as child events linked to chat/workflow ids."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "The orchestrator owns sequencing, not reasoning."
    - "Every runtime step must be represented as a state transition."
    - "All step services are consumed through ports."
    - "No step may read or write global mutable state directly."
    - "Cancellation must be cooperative through AbortSignal and task version checks."
    - "Retries must be bounded and state-visible."
  project_specific:
    - "Shared contracts must use Zod and live in packages/shared."
    - "Application layer must not import infrastructure implementations."
    - "Runtime events must be replayable by the frontend."
    - "No mock ids or synthetic chat/project data may be introduced for production flows."
```

## 8. Contracts and Invariants

```yaml
contracts:
  domain_contracts:
    - name: "Coding task state lifecycle"
      producer: "CodingWorkflowStateMachine"
      consumers:
        - "CodingRuntimeOrchestrator"
        - "CodingTaskRepository"
        - "Preview chat UI"
      invariant: "A task has one active state, ordered events and exactly one terminal state."
    - name: "Deterministic step ownership"
      producer: "CodingRuntimeOrchestrator"
      consumers:
        - "RepositoryRetriever"
        - "AstAnalyzer"
        - "PatchPlanner"
        - "ValidationRunner"
      invariant: "Only the orchestrator transitions state; step services return results or typed errors."
  api_contracts:
    - name: "Create coding task"
      producer: "codingRoutes"
      consumers:
        - "Preview chat frontend"
      request_shape: "prompt, projectId, optional runId, optional selectedPaths, idempotencyKey"
      response_shape: "task snapshot with current state and events cursor"
      compatibility: "Additive; must not break existing Horus chat route."
  data_contracts:
    - name: "Coding task persistence"
      producer: "CodingTaskRepository"
      consumers:
        - "Recovery coordinator"
        - "Frontend replay"
      migration_required: true
      compatibility_notes: "File driver is allowed for local dev; Postgres driver must be production-ready."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect chat, tool runtime and CodeChangeSet integration"
    agent: "repo_explorer"
    action: "Read current chat action routing, AgentToolRuntime, CodeChangeSet appliers and runtime isolation code."
    expected_output: "Confirmed integration map and exact files to edit."
  - step: 2
    name: "Add shared coding runtime contracts"
    agent: "backend_specialist"
    action: "Create CodingRuntime schemas for task, state, event, artifact refs, errors and snapshots."
    expected_output: "Typed contracts exported from @u-build/shared with unit tests."
  - step: 3
    name: "Implement deterministic state machine"
    agent: "backend_specialist"
    action: "Create transition table, guards and terminal-state rules."
    expected_output: "State machine tests covering legal, illegal, cancelled and failed transitions."
  - step: 4
    name: "Create orchestrator shell and ports"
    agent: "architect"
    action: "Wire step ports for retrieval, AST analysis, patch planning, validation and apply without concrete internals."
    expected_output: "Application service that can run with real no-op blocked ports in tests only, not production mocks."
  - step: 5
    name: "Persist and expose lifecycle"
    agent: "backend_specialist"
    action: "Add repository contracts and route/use-case boundaries for task snapshots and events."
    expected_output: "File/Postgres repository plan or first implementation, route tests and replay behavior."
  - step: 6
    name: "Validate"
    agent: "qa_specialist"
    action: "Run shared/server build and focused tests."
    expected_output: "Validation evidence with commands, cwd, exit codes and remaining risks."
```

## 10. Pseudo-Code

```ts
type CodingRuntimeState =
  | "accepted"
  | "scanning"
  | "retrieving"
  | "ast_analyzing"
  | "planning_patch"
  | "validating_ast"
  | "validating_runtime"
  | "applying_patch"
  | "completed"
  | "failed"
  | "cancelled";

interface CodingRuntimeStep<TOutput> {
  execute(context: CodingRuntimeStepContext): Promise<TOutput>;
}

class CodingWorkflowStateMachine {
  transition(current: CodingRuntimeState, event: CodingRuntimeSignal): CodingRuntimeState {
    // table-driven, no LLM decision here
  }
}

class CodingRuntimeOrchestrator {
  async run(taskId: string, signal: AbortSignal): Promise<CodingRuntimeSnapshot> {
    await this.transition(taskId, "scan_requested");
    const scan = await this.scanner.execute(this.context(taskId, signal));
    await this.transition(taskId, "retrieval_requested", scan);
    const context = await this.retriever.execute(this.context(taskId, signal));
    // AST, planning, validation, apply follow the same explicit lifecycle.
  }
}
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "A coding task can be created, inspected, cancelled and replayed through typed task snapshots."
    - "Task lifecycle advances through only legal state transitions."
    - "Runtime step failures become typed failed states with user-visible explanation."
  integration:
    - "Chat integration can start a coding task without bypassing the orchestrator."
    - "CodeChangeSet remains the compatible final mutation contract until SPEC 90 extends patch semantics."
    - "Frontend can consume task events without synthetic/mock ids."
  architectural:
    - "Orchestrator contains sequencing only; no retrieval, AST editing or command execution logic."
    - "Application code depends on ports, not infrastructure implementations."
  quality:
    - "Shared contract tests pass."
    - "State machine transition tests cover success, failure, cancellation and illegal transitions."
    - "Server build passes."
  observability:
    - "Every transition emits task id, state, duration and typed reason when failed."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate shared coding runtime contract compilation."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate server orchestration compilation."
      success_condition: "Exit code 0."
    - command: "node --test packages/shared/test/codingRuntime.test.mjs apps/server/test/codingStateMachine.test.mjs apps/server/test/codingRuntimeOrchestrator.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate lifecycle contracts."
      success_condition: "All tests pass."
  runtime_checks:
    - name: "No god-orchestrator check"
      procedure: "Inspect CodingRuntimeOrchestrator for filesystem, LLM provider or command-runner imports."
      expected_result: "Only ports and shared contracts are imported."
```

## 13. Error Mitigation And Handoff Rules

```yaml
error_mitigation:
  - "If a downstream port is missing, leave the task in blocked/failed with explicit missing capability instead of fake success."
  - "Do not add placeholder mock projects, ids, chat records or generated code to make tests pass."
  - "If persistence cannot atomically append events and update snapshots, fail the implementation slice before UI integration."
  - "If the runtime needs a migration, include file and Postgres parity or mark file driver dev-only."

handoff_output_contract:
  - "List created/changed files."
  - "State which runtime states and transitions are implemented."
  - "Report validation commands and exact results."
  - "Report any intentionally deferred ports for SPECS 88-91."
```

## 14. Implementation Log

```yaml
implementation_log:
  - version: "0.2.0"
    implemented_at_utc: "2026-05-28T18:58:00Z"
    summary: |
      Implemented the Phase 1 coding runtime foundation: shared CodingRuntime contracts,
      deterministic CodingWorkflowStateMachine, CodingTaskRouter, CodingRuntimeOrchestrator,
      file/Postgres task persistence, /api/coding routes, runtime config wiring and chat fallback
      integration that can create deterministic coding tasks without bypassing the orchestrator.
    files_changed:
      shared:
        - "packages/shared/src/entities/CodingRuntime.ts"
        - "packages/shared/src/entities/HorusChat.ts"
        - "packages/shared/src/index.ts"
        - "packages/shared/test/codingRuntime.test.mjs"
        - "packages/shared/test/horusChat.test.mjs"
      server_application:
        - "apps/server/src/application/coding/CodingRuntimeOrchestrator.ts"
        - "apps/server/src/application/coding/CodingTaskRouter.ts"
        - "apps/server/src/application/coding/CodingWorkflowStateMachine.ts"
        - "apps/server/src/application/ports/CodingRuntimePorts.ts"
        - "apps/server/src/application/ports/index.ts"
        - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      server_infrastructure:
        - "apps/server/src/infrastructure/config/runtimeConfig.ts"
        - "apps/server/src/infrastructure/database/migrations/015_coding_runtime_tasks.sql"
        - "apps/server/src/infrastructure/http/routes/codingRoutes.ts"
        - "apps/server/src/infrastructure/http/server.ts"
        - "apps/server/src/infrastructure/repositories/FileCodingTaskRepository.ts"
        - "apps/server/src/infrastructure/repositories/PostgresCodingTaskRepository.ts"
        - "apps/server/src/infrastructure/repositories/createRepositories.ts"
      tests:
        - "apps/server/test/codingStateMachine.test.mjs"
        - "apps/server/test/codingRuntimeOrchestrator.test.mjs"
        - "apps/server/test/codingRoutes.test.mjs"
        - "apps/server/test/horusChatTurn.test.mjs"
        - "apps/server/test/postgresSchema.test.mjs"
        - "apps/server/test/runtimeConfig.test.mjs"
    validation:
      - command: "pnpm --filter @u-build/shared build"
        result: "passed"
      - command: "pnpm --filter @u-build/server build"
        result: "passed"
      - command: "node --test packages/shared/test/codingRuntime.test.mjs packages/shared/test/horusChat.test.mjs apps/server/test/codingStateMachine.test.mjs apps/server/test/codingRuntimeOrchestrator.test.mjs apps/server/test/codingRoutes.test.mjs apps/server/test/horusChatTurn.test.mjs apps/server/test/postgresSchema.test.mjs apps/server/test/runtimeConfig.test.mjs"
        result: "passed: 53 tests"
      - command: "git diff --check -- <SPEC 87 touched files>"
        result: "passed"
      - command: "rg no-god-orchestrator import check"
        result: "passed: no filesystem, command-runner, LLM or infrastructure imports in application/coding orchestrator/state/router/ports"
    deferred_to_following_specs:
      - "SPEC 88 implements real repository scanning and text retrieval ports."
      - "SPEC 89 implements Tree-sitter AST analysis ports."
      - "SPEC 90 implements structural patch planning, diff and safe apply."
      - "SPEC 91 implements validation runner and command policy for real patch execution."
```
