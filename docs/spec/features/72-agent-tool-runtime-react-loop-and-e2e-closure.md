---
format_version: "agentic_sdd.v1"
task_id: "feature-72-agent-tool-runtime-react-loop-and-e2e-closure"
title: "Agent Tool Runtime ReAct Loop And E2E Closure"
created_at_utc: "2026-05-28T00:22:45Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
depends_on:
  - "spec/features/22-chat-driven-agent-code-change-loop.md"
  - "spec/features/45-structured-agent-tools-no-shell.md"
  - "spec/features/46-agent-progress-ux-evidence.md"
  - "spec/features/47-validation-gates-true-success.md"
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "spec/features/65-event-sourced-chat-and-progress-streaming.md"
  - "spec/features/68-preview-chat-durable-workflow-recovery.md"
  - "spec/features/70-code-change-set-delete-and-safe-file-mutations.md"
  - "spec/features/71-agent-tool-runtime-governed-write-access.md"
---

# 72 - Agent Tool Runtime ReAct Loop And E2E Closure

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec para tudo isso que tá faltando funcionar
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar uma SPEC executavel para fechar as lacunas restantes apos a implementacao inicial do runtime
  governado de tools. A infraestrutura de tools existe, mas ainda falta transformar o fluxo em um
  loop real de agente com chamadas iterativas a edit/save/delete/update/validation, eventos duraveis
  projetados no chat e no mapa operacional, validacao E2E no Preview e checagens de startup que
  impeçam profiles e ferramentas divergentes.

expected_user_visible_result: |
  No Preview chat, quando o usuario pedir uma alteracao em um projeto selecionado, o Horus deve
  trocar automaticamente para a conversa correta daquele projeto, executar agentes com ferramentas
  reais quando o modo estiver habilitado, editar arquivos permitidos, validar, atualizar o preview e
  mostrar status fiel de cada etapa. O usuario nunca deve receber uma mensagem de sucesso se nada
  mudou ou se o agente apenas gerou uma proposta sem aplicacao.

expected_engineering_result: |
  O backend passa a ter um Agent Tool Loop tipado e testavel, integrado ao LangGraph por dependencia
  injetada, com limites de iteracao, eventos persistidos, SSE replay, validacao de contrato no boot,
  auditoria redigida e E2E cobrindo chat -> agente -> alteracao de arquivo -> validacao -> preview.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O operador pede uma mudanca pelo Preview chat, mas o projeto pode permanecer sem alteracao visivel ou sem status confiavel."
  target_user: "Pessoa usando o Horus como console de entrega agentica para gerar e ajustar frontends."
  expected_outcome: "O chat deixa de ser apenas conversacional e passa a acionar uma execucao verificavel, com arquivos alterados, status confiavel e preview atualizado."
  product_surface:
    - "Preview chat"
    - "Visual Preview Console"
    - "Agent Flow map"
    - "Project Files"
    - "Workflow event stream"
    - "Generated project runtime"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph StateGraph"
      - "AgentToolRuntime"
      - "AgentToolRegistry"
      - "AgentProfileRegistry"
      - "WorkflowOrchestrator"
      - "ProjectExecutionService"
      - "CodeChangeSet preflight/applier"
    frontend:
      - "React"
      - "Vite"
      - "PreviewConversationPanel"
      - "VisualPreviewConsole"
      - "Agent Flow map"
    database:
      - "workflow_events"
      - "chat_messages"
      - "agent_workflow_runs"
      - "agent_workflow_attempts"
      - "agent_execution_turns"
      - "code_change_sets"
    infrastructure:
      - "file-mode persistence"
      - "Postgres persistence"
      - "SSE progress streaming"
      - "preview runtime manager"
  known_entrypoints:
    - "apps/server/src/application/services/AgentToolRuntime.ts"
    - "apps/server/src/application/services/AgentToolRegistry.ts"
    - "apps/server/src/application/services/AgentProfileRegistry.ts"
    - "apps/server/src/application/tools/registerProjectAgentTools.ts"
    - "apps/server/src/infrastructure/langgraph/dependencies.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
  known_existing_patterns:
    - "Agent profiles define allowedTools and forbiddenTools."
    - "AgentToolRuntime records redacted tool events and enforces selected project context."
    - "Project file mutations must flow through governed file operations and CodeChangeSet path policy."
    - "Workflow events are the source for user-visible progress and replay."
    - "Feature flags must preserve the stable structured fallback path until the new loop is proven."
```

## 4. Current Gap Map

```yaml
current_gaps:
  react_tool_loop:
    status: "missing"
    description: "The direct tools exist, but the primary agent node does not yet run an iterative tool-use loop that can call edit_file, save_file, delete_file, get_git_diff and run_validation_command based on model/tool decisions."
    must_fix: true
  default_runtime_path:
    status: "partial"
    description: "Tool mode is feature-flagged and the fallback remains the active safe path. This is acceptable during rollout, but the enabled path must be complete and validated before promotion."
    must_fix: true
  durable_tool_events:
    status: "missing"
    description: "Tool events are captured in runtime output, but not persisted as first-class workflow events with SSE replay and frontend projection."
    must_fix: true
  browser_e2e_proof:
    status: "missing"
    description: "Unit/integration tests prove the lower layers, but no browser smoke currently proves a chat request modifies files and updates the preview."
    must_fix: true
  startup_contract_validation:
    status: "partial"
    description: "The registry can list tools, but app startup does not fail fast when an agent profile references tools that are not registered."
    must_fix: true
  qa_curator_runtime_boundary:
    status: "partial"
    description: "QA and Curator boundaries exist, but the spec must define exactly which runtime actions they may execute and how their results affect final success."
    must_fix: true
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Implement a bounded Agent Tool Loop service for tool-mode agent execution."
    - "Wire Front Agent to the loop so it can actually edit, save, delete, inspect diff and validate when HORUS_ENABLE_TOOL_MODE is enabled."
    - "Keep structured CodeChangeSet generation as a fallback and as an audit artifact."
    - "Persist tool lifecycle events into workflow events and project them through SSE."
    - "Expose compact, truthful tool progress in Preview chat and Agent Flow map."
    - "Fail startup validation if any profile declares an unknown allowed or forbidden tool."
    - "Add QA/Curator integration rules that prevent final success without validation evidence or explicit skipped-gate disclosure."
    - "Add E2E/browser smoke proving a chat request changes selected project files and refreshes or invalidates preview state."
    - "Add regression tests for project chat context switching when the selected project changes."
  out_of_scope:
    - "Removing feature flags before E2E evidence exists."
    - "Allowing arbitrary shell commands."
    - "Letting QA or chat agents mutate project files."
    - "Bypassing Curator approval for final success."
    - "Changing the visual design of the console except for necessary status/event rendering."
    - "Introducing machine-specific paths, ports or hardcoded project IDs."
```

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/application/services/AgentToolRuntime.ts"
      - "apps/server/src/application/services/AgentToolRegistry.ts"
      - "apps/server/src/application/services/AgentProfileRegistry.ts"
      - "apps/server/src/application/services/AgentToolLoop.ts"
      - "apps/server/src/application/tools/registerProjectAgentTools.ts"
      - "apps/server/src/infrastructure/langgraph/dependencies.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      - "apps/server/src/infrastructure/http/server.ts"
    services:
      - "AgentToolLoop"
      - "AgentToolRuntime"
      - "AgentToolRegistry"
      - "AgentProfileRegistry"
      - "WorkflowOrchestrator"
      - "ProjectExecutionService"
    database:
      migrations_required: false
      tables:
        - "workflow_events"
        - "chat_messages"
        - "agent_workflow_runs"
        - "agent_workflow_attempts"
  frontend:
    files:
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
      - "apps/web/src/api/horusChatApi.ts"
    components:
      - "Preview chat status timeline"
      - "Preview project selector"
      - "Agent Flow activity projection"
    routes:
      - "Preview mode"
      - "Agent flow mode"
  workflow:
    graph_nodes:
      - "frontAgentNode"
      - "qaAgentNode"
      - "curatorAgentNode"
      - "odinAgentNode"
    agents:
      - "front_agent"
      - "qa_agent"
      - "curator_agent"
      - "odin_agent"
  tests:
    unit:
      - "AgentToolLoop bounded iteration and stop conditions"
      - "AgentProfileRegistry startup validation"
      - "Workflow event serialization for tool events"
    integration:
      - "Front Agent tool-mode edits selected project files"
      - "Tool events persist and replay through chat stream"
      - "Wrong project context is rejected and starts a separate chat context"
    e2e:
      - "Preview chat request produces file diff and updated preview"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    The change connects the LangGraph agent nodes to governed project-mutation tools through an
    injected loop service. Tool calls must remain bounded by agent profile policy, selected project
    context, path safety rules and workflow event persistence. The frontend consumes the resulting
    events through existing chat/progress streams and must render truthful status without inventing
    success.

  depends_on:
    - name: "AgentToolRuntime"
      type: "backend_service"
      owner: "application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "execute(agentName, toolName, input, context) -> typed output plus redacted events"
      required_for: "All tool-loop calls must pass through existing permission, call-count, size and context guards."
      assumptions:
        - "Existing runtime already enforces selectedProjectId and selectedProjectRoot."
      failure_modes:
        - "Unauthorized writes or silent no-op tool calls."
      fallback_or_recovery: "Abort loop and emit blocked_tool or tool_failed workflow event."
      verification:
        - "AgentToolRuntime tests"
        - "Front Agent tool-mode integration test"
    - name: "AgentProfileRegistry"
      type: "backend_service"
      owner: "application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "profile allowedTools and forbiddenTools"
      required_for: "Determine which agents may mutate project files."
      assumptions: []
      failure_modes:
        - "Profile references an unregistered tool and runtime fails only after user action."
      fallback_or_recovery: "Startup validation must fail fast in development/test."
      verification:
        - "Startup contract validation test"
    - name: "Workflow event repository"
      type: "database"
      owner: "infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "append/replay ordered workflow events"
      required_for: "Persist tool_started/tool_finished/file_change/validation/rollback evidence."
      assumptions:
        - "Existing event payload schema can be extended without a migration."
      failure_modes:
        - "Chat reload loses progress evidence."
      fallback_or_recovery: "Persist compact error event and keep run non-successful."
      verification:
        - "Event persistence and SSE replay tests"
    - name: "ProjectExecutionService"
      type: "backend_service"
      owner: "infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "safe file operations, path policy and validation command catalog"
      required_for: "Apply write/delete operations without bypassing project-root safety."
      assumptions: []
      failure_modes:
        - "Tool loop writes outside project root or skips validation."
      fallback_or_recovery: "Reject operation and emit user-visible blocked status."
      verification:
        - "Path boundary tests"
        - "Delete/update/create regression tests"

  depended_on_by:
    - name: "frontAgentNode"
      type: "agent"
      owner: "infrastructure/langgraph"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "run front agent through structured fallback or tool loop depending on feature flag"
      compatibility_obligation: "must preserve existing structured path"
      expected_consumer_behavior: "When tool mode is enabled, the node delegates iterative tool execution to AgentToolLoop and returns operations/evidence generated from real tool calls."
      migration_or_notification_required: false
      verification:
        - "frontAgentNode tool-mode integration test"
    - name: "PreviewConversationPanel"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "chat/progress events with compact tool lifecycle summaries"
      compatibility_obligation: "may extend event metadata; must not break existing messages"
      expected_consumer_behavior: "Render running, blocked, validation, applied and failed states based on persisted backend events."
      migration_or_notification_required: false
      verification:
        - "frontend regression guard"
        - "browser smoke"
    - name: "Agent Flow map"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "agent activity events and node statuses"
      compatibility_obligation: "may extend status mapping"
      expected_consumer_behavior: "Show actual tool activity and validation state without implying completion."
      migration_or_notification_required: false
      verification:
        - "agent flow API mapping test"

  bidirectional_integrations:
    - name: "Preview chat request to generated project mutation"
      participants:
        - "SubmitHorusChatTurnUseCase"
        - "WorkflowOrchestrator"
        - "frontAgentNode"
        - "AgentToolLoop"
        - "ProjectExecutionService"
        - "PreviewConversationPanel"
      shared_contract: "projectId, selected project root, workflow run id, ordered workflow/chat events"
      consistency_rule: "Every user-visible status must correspond to a persisted workflow or chat event for the same project context."
      verification:
        - "E2E browser smoke with selected project"

  data_flow:
    inbound:
      - source: "Preview chat"
        payload_or_state: "projectId, runId, route, user message, selected project context"
        validation: "Reject missing or changed project context before mutable execution."
      - source: "Agent model/tool planner"
        payload_or_state: "tool call name and JSON input"
        validation: "Schema validation, profile permission, project context, max iterations, max write bytes."
    outbound:
      - target: "Project files"
        payload_or_state: "create/update/delete file operations"
        compatibility: "Must use existing safe file operation policy."
      - target: "Workflow events and chat messages"
        payload_or_state: "tool lifecycle, validation evidence, applied/blocked/failure summaries"
        compatibility: "Must replay deterministically after reload."
      - target: "Preview UI"
        payload_or_state: "updated app source and preview status"
        compatibility: "Must not show success until mutation plus validation condition is satisfied."

  sequencing_dependencies:
    - dependency: "Startup profile/tool validation"
      reason: "The loop should never start with a broken capability matrix."
      validation: "App/server construction test with missing tool fails predictably."
    - dependency: "Durable event types"
      reason: "Frontend status must consume real persisted evidence."
      validation: "Workflow event repository roundtrip test."
    - dependency: "AgentToolLoop"
      reason: "Agent nodes should not hand-roll loop logic."
      validation: "Unit tests for max steps, blocked tool, validation failure and success."

  integration_risks:
    - risk: "The model repeatedly calls tools without converging."
      severity: "high"
      mitigation: "Hard maxToolSteps, repeated-call detection and terminal failed status with evidence."
    - risk: "Tool loop mutates files but validation fails and preview appears successful."
      severity: "critical"
      mitigation: "Final success requires validation evidence or explicit skipped-gate state; failed validation blocks completed status."
    - risk: "Chat history from one selected project leaks into another."
      severity: "high"
      mitigation: "Project-scoped chat context keys and regression test for project switching."
```

## 8. Architecture Rules

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
    - "LangGraph nodes must remain thin orchestration adapters."
    - "Agent tool execution must live in an application service, not directly in HTTP routes or React components."
    - "Project file mutation must pass through existing safe file operation and CodeChangeSet policies."
    - "Tool events must be durable before they are rendered as user-visible progress."
    - "Feature flags must preserve the current stable path until the new path has E2E evidence."
    - "No agent may receive broader tool permissions than its profile declares."
```

## 9. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Prefer small cohesive services over expanding node files."
    - "Use Zod/shared schemas for tool and event payloads."
    - "Handle errors explicitly with actionable messages."
    - "Never claim success when no file changed or validation did not run/skip explicitly."
  backend:
    - "Do not allow arbitrary shell commands."
    - "Use existing command catalog validation for runtime commands."
    - "Persist workflow events in order and include runId, projectId, agentName and toolName where relevant."
    - "Keep redaction at the runtime/event boundary."
  frontend:
    - "Render compact status from backend events; do not synthesize hidden success."
    - "Keep project-scoped chat history separated by selected project id."
    - "Preserve loading, empty, blocked, failed and applied states."
  tests:
    - "Cover success, denied tool, validation failure, stale project context and browser smoke."
    - "Do not mark complete without running build and focused tests."
```

## 10. Contracts And Invariants

```yaml
contracts:
  api_contracts:
    - name: "Preview chat submit"
      producer: "apps/web PreviewConversationPanel"
      consumers:
        - "SubmitHorusChatTurnUseCase"
      request_shape: "message, projectId, optional route/runtime context"
      response_shape: "accepted/rejected chat turn with run/workflow identifiers"
      compatibility: "must preserve existing accepted response while extending metadata if needed"
    - name: "Workflow event stream"
      producer: "WorkflowOrchestrator/event repository"
      consumers:
        - "PreviewConversationPanel"
        - "Agent Flow map"
      request_shape: "workflow run/project stream subscription"
      response_shape: "ordered events including tool lifecycle and terminal state"
      compatibility: "can extend event types without breaking existing event consumers"
  domain_contracts:
    - name: "Tool permission matrix"
      producer: "AgentProfileRegistry"
      consumers:
        - "AgentToolRuntime"
        - "AgentToolLoop"
      invariant: "An agent can execute only tools allowed by its profile and not listed as forbidden."
    - name: "Project mutation safety"
      producer: "ProjectExecutionService and CodeChangeSet path policy"
      consumers:
        - "edit_file"
        - "save_file"
        - "delete_file"
        - "apply_code_change_set"
      invariant: "No mutation may escape the selected project root or touch denied/sensitive paths."
    - name: "Truthful completion"
      producer: "WorkflowOrchestrator"
      consumers:
        - "Preview chat"
        - "Agent Flow map"
      invariant: "Completed status requires applied changes plus passing or explicitly skipped validation gates."
  ui_contracts:
    - name: "Project-scoped chat"
      producer: "PreviewConversationPanel"
      consumers:
        - "Preview operator"
      requirement: "Switching selected project must switch chat history and progress state to the selected project context."
    - name: "Tool progress rendering"
      producer: "Workflow event stream"
      consumers:
        - "PreviewConversationPanel"
      requirement: "Display reading/editing/saving/deleting/validating/applied/blocked/failed based on backend events."
  data_contracts:
    - name: "Tool workflow event payload"
      producer: "AgentToolLoop"
      consumers:
        - "workflow event persistence"
        - "SSE clients"
        - "frontend status mapping"
      migration_required: false
      compatibility_notes: "Prefer additive event payload fields; preserve existing event readers."
```

## 11. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current runtime and event contracts"
    agent: "repo_explorer"
    action: "Read AgentToolRuntime, AgentToolRegistry, AgentProfileRegistry, LangGraph nodes, WorkflowOrchestrator, chat use case, event schemas and frontend stream consumers."
    expected_output: "Precise map of current producers, consumers, missing event variants and test targets."
  - step: 2
    name: "Add startup capability validation"
    agent: "backend_specialist"
    action: "Add a registry/profile validation routine that fails when profiles reference unregistered allowed or forbidden tools; call it during app/service construction in test/dev-safe path."
    expected_output: "Fail-fast validation and tests for missing registered tool."
  - step: 3
    name: "Define durable tool event contract"
    agent: "backend_specialist"
    action: "Extend shared/backend event schemas with compact tool_started, tool_finished, tool_failed, file_changed, validation_started, validation_finished and rollback events where required by existing event architecture."
    expected_output: "Typed additive event contract with repository roundtrip tests."
  - step: 4
    name: "Implement AgentToolLoop"
    agent: "backend_specialist"
    action: "Create an application service that runs bounded iterative tool calls, enforces max steps, repeated-call guards, validation requirements, redaction and event emission."
    expected_output: "Tool loop service with unit tests for success, denied tool, validation failure, non-convergence and no-change failure."
  - step: 5
    name: "Wire Front Agent tool mode"
    agent: "backend_specialist"
    action: "Integrate AgentToolLoop into frontAgentNode when HORUS_ENABLE_TOOL_MODE=true while preserving structured fallback when disabled or when loop exits with unsupported mode."
    expected_output: "Front Agent can perform real edit/save/delete/update through tools in integration tests."
  - step: 6
    name: "Lock QA and Curator boundaries"
    agent: "backend_specialist"
    action: "Ensure QA cannot mutate files, can run/read validation only, and Curator cannot mark pass unless tool/CodeChangeSet evidence satisfies validation contracts."
    expected_output: "Tests proving QA write denial and Curator truthful success semantics."
  - step: 7
    name: "Project-scoped chat switching"
    agent: "frontend_specialist"
    action: "Verify and fix chat state keys so changing selected project changes the visible history, pending status and stream subscription."
    expected_output: "Frontend/API regression test for project-switch isolation."
  - step: 8
    name: "Render tool progress"
    agent: "frontend_specialist"
    action: "Map new backend event types into compact Preview chat and Agent Flow statuses without adding noisy developer-only details."
    expected_output: "Readable user progress for editing, saving, deleting, validating, blocked and failed states."
  - step: 9
    name: "Browser E2E smoke"
    agent: "qa_specialist"
    action: "Run the local stack with tool mode enabled, submit a small project edit request, verify file diff, event stream, preview refresh and terminal status."
    expected_output: "E2E evidence with commands, browser URL, screenshot or DOM assertion, and changed file path."
  - step: 10
    name: "Validate"
    agent: "qa_specialist"
    action: "Run shared/server/web builds, focused backend tests, frontend guards and browser smoke."
    expected_output: "Validation evidence with commands, cwd, exit codes and remaining risks."
```

## 12. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm loop boundaries, event contract, feature flag rollout and no-bypass safety rules."
    inputs:
      - "This SDD"
      - "Spec 70"
      - "Spec 71"
      - "Current repository implementation"
    outputs:
      - "Architecture notes and final file map"
  - agent_name: "backend_specialist"
    responsibility: "Implement AgentToolLoop, startup validation, event persistence, LangGraph wiring and backend tests."
    inputs:
      - "Backend affected files"
      - "Contracts and invariants"
    outputs:
      - "Backend diff"
      - "Backend test evidence"
  - agent_name: "frontend_specialist"
    responsibility: "Render project-scoped progress and ensure selected project chat isolation."
    inputs:
      - "Frontend affected files"
      - "Event mapping contract"
    outputs:
      - "Frontend diff"
      - "Frontend guard evidence"
  - agent_name: "qa_specialist"
    responsibility: "Validate runtime behavior end to end."
    inputs:
      - "Diff"
      - "Acceptance criteria"
      - "Local runnable stack"
    outputs:
      - "Build/test/browser validation report"
      - "Remaining risks"
```

## 13. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "With HORUS_ENABLE_TOOL_MODE=true, a Preview chat edit request causes front_agent to call governed tools and modify at least one allowed project file."
    - "The same request emits visible progress for tool execution, validation and final applied/failed state."
    - "Switching selected project changes chat history and pending workflow state to the selected project context."
    - "If no file changed, Horus must report no-change/failed status instead of success."
    - "If validation fails, Horus must not report completed success."
  integration:
    - "Agent profiles and registered tools are validated at startup."
    - "Tool lifecycle events are persisted and replayed through the existing stream path."
    - "Front Agent tool mode preserves structured fallback when disabled."
    - "QA remains read/validate-only and cannot save/edit/delete/apply."
    - "Curator consumes tool/validation evidence before approving final success."
  architectural:
    - "LangGraph nodes delegate tool-loop mechanics to an application service."
    - "All file mutations pass through governed project file operation services."
    - "No arbitrary shell execution is introduced."
    - "No local-machine paths, user-specific directories or hardcoded project IDs are introduced."
  quality:
    - "Server TypeScript build passes."
    - "Shared package build passes."
    - "Web build and frontend guard tests pass."
    - "Focused backend tests cover success, denied tools, startup validation, no-change, validation failure and event replay."
  observability:
    - "Workflow events include runId, projectId, agentName, toolName, status, durationMs and redacted error where applicable."
    - "User-visible failures show the failed step and reason."
    - "Developer-only raw details remain redacted from public UI."
```

## 14. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate shared schemas and exported contracts."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate backend TypeScript integration."
      success_condition: "Exit code 0."
    - command: "node --test apps/server/test/agentToolRegistry.test.mjs apps/server/test/agentToolRuntime.test.mjs apps/server/test/frontAgentNodeToolRuntime.test.mjs apps/server/test/projectAgentTools.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Preserve current tool runtime guarantees."
      success_condition: "Exit code 0."
    - command: "node --test apps/server/test/agentToolLoop.test.mjs apps/server/test/workflowToolEvents.test.mjs apps/server/test/previewChatProjectContext.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate new loop, event replay and project chat isolation."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate frontend build after event/status UI changes."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web test:guards"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate frontend regression guards."
      success_condition: "Exit code 0."
    - command: "git diff --check"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Reject whitespace and patch hygiene issues."
      success_condition: "Exit code 0."
  runtime_checks:
    - name: "Tool-mode Preview edit smoke"
      method: "browser"
      expected: "Submitting a small edit request changes a selected project file, updates chat progress, and refreshes or invalidates preview state with terminal evidence."
    - name: "Project switching isolation"
      method: "browser or integration test"
      expected: "Changing selected project changes the visible chat history and active stream context."
    - name: "Validation failure truthfulness"
      method: "test"
      expected: "A failing validation command produces failed/blocked terminal state, not completed success."
  integration_checks:
    - name: "Profile/tool startup validation"
      surfaces:
        - "AgentProfileRegistry"
        - "AgentToolRegistry"
      method: "unit test"
      expected: "Unknown allowed/forbidden tool references fail fast."
    - name: "Workflow event replay"
      surfaces:
        - "WorkflowOrchestrator"
        - "workflow event repository"
        - "SSE client mapping"
      method: "integration test"
      expected: "Tool events persist and replay in order after reload."
    - name: "File mutation boundaries"
      surfaces:
        - "AgentToolLoop"
        - "AgentToolRuntime"
        - "ProjectExecutionService"
      method: "integration test"
      expected: "Allowed writes pass; forbidden paths, symlinks and sensitive paths fail with explicit errors."
  manual_checks:
    - "Open Preview mode, select two different projects and confirm each shows its own chat history."
    - "Run one successful edit request and one intentionally invalid request; compare visible statuses."
```

## 15. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent event types without checking existing shared/backend schemas."
    - "Do not invent API routes when an existing stream/use case already carries workflow progress."
    - "Never claim browser E2E passed unless the browser check actually ran."
  read_before_write:
    - "Read all affected LangGraph nodes before changing any node."
    - "Read existing workflow event schemas and frontend consumers before adding event payloads."
    - "Search references before renaming tools or event fields."
  failure_handling:
    - "If the tool loop can not determine a safe next action, stop and emit a failed status."
    - "If validation fails, preserve changed files for inspection unless rollback is explicitly implemented and evidenced."
    - "If SSE replay fails, fix event persistence before changing frontend rendering."
  state_consistency:
    - "Do not update backend event types without updating frontend event mapping and tests."
    - "Do not update agent profile permissions without registry validation tests."
    - "Do not update file mutation behavior without CodeChangeSet/path policy tests."
  scope_control:
    - "Do not redesign the UI beyond status rendering required by this SDD."
    - "Do not refactor unrelated documentation, styling or generated project templates."
```

## 16. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary dev server startup failure"
    - "preview runtime reload timeout"
    - "transient model/tool planning failure within maxToolSteps"
  non_retryable_failures:
    - "unknown registered tool at startup"
    - "forbidden file path"
    - "forbidden tool for agent profile"
    - "validation command outside catalog"
    - "changed selected project context during mutation"
  rollback_rules:
    - "Do not rollback user changes outside this task."
    - "Rollback only files changed by the current tool-loop run when rollback is implemented and verified."
    - "If rollback is not safe, stop with failed status and show changed files."
  escalation_rules:
    - "Escalate if the desired behavior conflicts with Curator approval or validation gate requirements."
    - "Escalate if an E2E check needs credentials/secrets unavailable locally."
    - "Escalate before deleting generated project files outside allowed roots."
```

## 17. Observability Requirements

```yaml
observability:
  logs:
    - event: "tool_started"
      fields:
        - "run_id"
        - "project_id"
        - "agent_name"
        - "tool_name"
        - "step_index"
        - "status"
    - event: "tool_finished"
      fields:
        - "run_id"
        - "project_id"
        - "agent_name"
        - "tool_name"
        - "duration_ms"
        - "redacted_summary"
    - event: "tool_failed"
      fields:
        - "run_id"
        - "project_id"
        - "agent_name"
        - "tool_name"
        - "error_type"
        - "redacted_message"
    - event: "file_changed"
      fields:
        - "run_id"
        - "project_id"
        - "agent_name"
        - "operation"
        - "relative_path"
    - event: "validation_finished"
      fields:
        - "run_id"
        - "project_id"
        - "status"
        - "command_id"
        - "duration_ms"
  audit_trail:
    required: true
    must_capture:
      - "agent tool calls"
      - "files read"
      - "files changed"
      - "validation commands executed"
      - "workflow decisions"
      - "test results"
  user_visible_failures:
    - "Show failed step."
    - "Show whether failure was permission, validation, no-change, project-context mismatch or runtime error."
    - "Show suggested next action when safe."
```

## 18. Risks And Unknowns

```yaml
risks:
  - risk: "The tool-loop implementation grows too much inside frontAgentNode."
    severity: "high"
    mitigation: "Keep AgentToolLoop as an application service and node code as adapter only."
  - risk: "Events become too noisy for the chat UI."
    severity: "medium"
    mitigation: "Persist detailed events but render compact grouped summaries."
  - risk: "Tool mode accidentally bypasses Curator approval."
    severity: "critical"
    mitigation: "Keep final success gated by Curator/validation contracts and tests."
  - risk: "Project switching leaves stale pending state visible."
    severity: "high"
    mitigation: "Use project-scoped chat/store keys and test switching behavior."
unknowns:
  - question: "Whether existing workflow event schema already has a generic metadata envelope sufficient for tool events."
    resolution_strategy: "inspect"
  - question: "Whether browser E2E should use an existing repo-local Playwright helper or direct in-app browser checks."
    resolution_strategy: "inspect"
  - question: "Whether rollback should be implemented in this spec or explicitly reported as non-rollback failure."
    resolution_strategy: "inspect and infer conservatively"
```

## 19. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Build the missing layer as a narrow AgentToolLoop service. The loop receives an agent name,
    selected project context, model/tool planning input and a runtime instance. It executes a bounded
    sequence of typed tool calls, emits durable events through an injected event sink, and returns a
    structured result that frontAgentNode can convert into existing operations/evidence contracts.

    Keep the existing structured CodeChangeSet path as fallback. Promote tool mode only after focused
    tests and browser smoke demonstrate a real file mutation from Preview chat.
  alternatives_considered:
    - option: "Put tool loop directly inside frontAgentNode"
      tradeoff: "Rejected because it mixes graph orchestration, model/tool planning, file mutation and event persistence in one file."
    - option: "Make tool mode default immediately"
      tradeoff: "Rejected until browser E2E proves the enabled path updates files and preview state reliably."
    - option: "Render optimistic frontend statuses without backend events"
      tradeoff: "Rejected because it can reintroduce false success/no-change status."
  migration_notes:
    - "Prefer additive event schema changes."
    - "No database migration should be necessary unless the existing event persistence rejects new event types."
    - "Feature flag must remain available during rollout."
  backward_compatibility:
    required: true
    notes:
      - "Existing non-tool structured workflow must continue working."
      - "Existing chat history and workflow event replay must remain readable."
      - "Existing tests for CodeChangeSet apply/preflight must remain valid."
```

## 20. Deliverables

```yaml
deliverables:
  code:
    - "AgentToolLoop service"
    - "Startup profile/tool validation"
    - "Durable tool event contract and persistence integration"
    - "Front Agent tool-mode integration"
    - "Preview chat and Agent Flow status mapping"
    - "Project-scoped chat switching fix if current behavior is stale"
  tests:
    - "apps/server/test/agentToolLoop.test.mjs"
    - "apps/server/test/workflowToolEvents.test.mjs"
    - "apps/server/test/previewChatProjectContext.test.mjs"
    - "updated AgentToolRegistry/Runtime/FrontAgent tests"
    - "updated frontend regression guards"
    - "browser smoke evidence"
  docs:
    - "This spec implementation log"
    - "spec/README.md"
    - "spec/CHANGELOG.md"
  validation_evidence:
    - "Shared build"
    - "Server build"
    - "Focused backend tests"
    - "Web build"
    - "Frontend guard tests"
    - "Browser smoke result"
```

## 21. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Relevant files were read."
    - "Existing event, chat and workflow contracts were mapped."
    - "Upstream dependencies and downstream consumers were mapped."
  implementation:
    - "AgentToolLoop exists and is injected into LangGraph dependencies."
    - "Front Agent can mutate files through governed tools in tool mode."
    - "QA cannot mutate files."
    - "Curator/final success does not bypass validation evidence."
    - "Tool events are persisted and rendered."
    - "Project switching uses project-scoped chat/progress state."
    - "No unrelated refactor was introduced."
  validation:
    - "Relevant tests were run."
    - "Integration checks for event replay and tool permissions were run."
    - "Build/typecheck commands passed."
    - "Browser runtime behavior was checked."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

## 22. Minimal Output Contract For Implementing Agent

```yaml
agent_result:
  status: "<completed | failed | blocked>"
  summary: "<short factual summary>"
  files_read:
    - "<path>"
  files_changed:
    - "<path>"
  commands_run:
    - command: "<command>"
      cwd: "<cwd>"
      exit_code: "<exit code>"
      result: "<short result>"
  validation:
    passed:
      - "<check>"
    failed:
      - "<check>"
  browser_evidence:
    url: "<url or none>"
    result: "<what was observed>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```

## 23. Implementation Log

```yaml
implementation_log:
  - version: "0.1.0"
    date: "2026-05-28"
    status: "planned"
    notes:
      - "Created the closure spec for remaining Agent Tool Runtime gaps: ReAct/tool loop, durable events, startup validation, project-scoped chat switching and browser E2E proof."
  - version: "0.2.0"
    date: "2026-05-28"
    status: "implemented"
    notes:
      - "Added typed workflow tool events for started, finished and blocked tool calls."
      - "Added AgentToolLoop to execute Front Agent CodeChangeSet operations through governed edit/delete/diff tools when tool mode is enabled."
      - "Wired Front Agent tool mode to the loop while preserving structured proposal fallback."
      - "Added startup validation for registered project-agent tool references."
      - "Projected tool activity into run-flow snapshots, Preview chat progress and Agent Flow consumers."
      - "Separated visible Preview chat messages by selected project id so switching selected projects switches the visible conversation context."
      - "Added focused backend and frontend regression coverage for tool loop, tool event mapping, profile validation and project-scoped chat filtering."
```
