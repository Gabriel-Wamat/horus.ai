---
format_version: "agentic_sdd.v1"
task_id: "feature-110-live-preview-file-tree-execution-spine"
title: "Live Preview And File Tree Execution Spine"
created_at_utc: "2026-06-08T18:29:35Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "docs/spec/features/16-visual-preview-backend-runtime.md"
  - "docs/spec/features/17-visual-preview-frontend-console.md"
  - "docs/spec/features/32-zup-style-project-construction-workspace.md"
  - "docs/spec/features/33-project-file-browser-backend.md"
  - "docs/spec/features/34-project-file-browser-frontend.md"
  - "docs/spec/features/41-agentic-runtime-validation-observability.md"
  - "docs/spec/features/103-agent-runbook-progress-projection.md"
---

# 110 - Live Preview And File Tree Execution Spine

## 1. Original User Request

```yaml
raw_user_request: |
  a ferramenta não funciona direito, o projeto não aparece na tela de preview, ele não aparece na tela de arquivos. assim que boto pra rodar as specs, já deveria aparecer em execução em tempo real na tela de preview também.
```

## 2. System Interpretation

```yaml
system_translation: |
  Implementar a espinha de execução que liga geração de SPEC/agentes, workspace de projeto, árvore de arquivos,
  processo de preview e UI de progresso em tempo real. O usuário não deve precisar iniciar manualmente um projeto
  depois que a execução agentic começa.

expected_user_visible_result: |
  Ao iniciar uma execução, a tela de arquivos mostra o projeto/workspace imediatamente com status de criação/hidratação.
  A tela de preview mostra o mesmo projeto em estado running/installing/starting/ready/error e atualiza em tempo real.

expected_engineering_result: |
  Workflow, project registry, preview sessions, file browser backend, SSE/event projection and frontend state use a
  shared execution link: runId/threadId/storyId/specId/projectId/previewSessionId.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O usuário dispara specs/agentes e não vê o projeto materializado no preview ou arquivos."
  target_user: "Operador do Horus usando Preview como console principal de entrega."
  expected_outcome: "Execução em tempo real com projeto visível, arquivos navegáveis e preview acionável."
  product_surface:
    - "Preview canvas"
    - "Project file browser"
    - "Execution console"
    - "Workflow/event timeline"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "Express routes"
      - "ProjectWorkspaceService"
      - "Preview runtime/session stores"
      - "WorkflowEventProjector"
    frontend:
      - "VisualPreviewConsole"
      - "previewApi"
      - "usePreviewEvents"
      - "file browser components"
    database:
      - "File mode stores"
      - "Postgres preview/project repositories if enabled"
    infrastructure:
      - "Vite generated project runtime"
      - "npm/pnpm dependency hydration"
  known_entrypoints:
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/domain/services/WorkflowEventProjector.ts"
    - "apps/server/src/infrastructure/workspace/*"
    - "apps/server/src/infrastructure/preview/*"
    - "apps/server/src/infrastructure/http/routes/previewRoutes.ts"
    - "apps/web/src/api/previewApi.ts"
    - "apps/web/src/hooks/usePreviewEvents.ts"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create or resolve a generated project workspace as soon as execution enters project construction."
    - "Persist a project registry entry before FrontAgent writes final files."
    - "Emit typed lifecycle events for project_created, files_changed, dependencies_installing, preview_starting, preview_ready and preview_error."
    - "Bind workflow run/thread/story/spec to projectId and previewSessionId."
    - "Make file browser list active generated project during execution, not only after completion."
    - "Start preview automatically when enough project files exist and the preview command is known."
    - "Hydrate dependencies when needed and expose install/start logs in execution console."
    - "Add recovery for preview process dead/stale pid."
  out_of_scope:
    - "Rewriting the full preview UI."
    - "Supporting remote cloud sandboxes."
    - "Adding multi-user collaboration."
    - "Changing generated app business behavior."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/Preview.ts"
      - "packages/shared/src/entities/HorusRunFlow.ts"
      - "packages/shared/src/entities/ProjectConstruction.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/domain/services/WorkflowEventProjector.ts"
      - "apps/server/src/application/services/ProjectWorkspaceService.ts"
      - "apps/server/src/infrastructure/http/routes/previewRoutes.ts"
      - "apps/server/src/infrastructure/preview/*"
      - "apps/server/src/infrastructure/repositories/*Preview*"
    services:
      - "ProjectWorkspaceService"
      - "PreviewSessionService"
      - "WorkflowEventProjector"
      - "Project file browser service"
    database:
      migrations_required: "conditional"
      tables:
        - "preview_sessions"
        - "project_workspaces"
        - "workflow_events"
  frontend:
    files:
      - "apps/web/src/api/previewApi.ts"
      - "apps/web/src/hooks/usePreviewEvents.ts"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/features/visual-preview/*"
      - "apps/web/src/components/project-files/*"
    components:
      - "Preview canvas"
      - "File tree"
      - "Execution console"
    routes:
      - "/?mode=preview"
  workflow:
    graph_nodes:
      - "Spec Agent"
      - "Front Agent"
      - "QA Agent"
      - "Curator Agent"
      - "Call CLI/render"
    agents:
      - "FrontAgent"
      - "QAAgent"
      - "CuratorAgent"
  tests:
    unit:
      - "apps/server/test/previewExecutionSpine.test.mjs"
      - "apps/server/test/projectWorkspaceLifecycle.test.mjs"
      - "apps/web/test/previewExecutionProjection.test.mjs"
    integration:
      - "scripts/preview-browser-smoke.mjs"
      - "scripts/horus-chat-preview-e2e.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec bridges workflow execution and preview UI. The project workspace becomes a durable execution artifact,
    not a late side effect. Preview and file tree consume the same project identity and lifecycle events.

  depends_on:
    - name: "Project workspace writer"
      type: "backend_service"
      owner: "apps/server application/infrastructure workspace"
      direction: "this_spec_consumes_dependency"
      contract_used: "workspace path, projectId, file metadata, write/apply lifecycle"
      required_for: "Create file tree entries and previewable project files."
      failure_modes:
        - "Project does not exist when preview tries to start."
        - "File tree cannot resolve generated files."
      fallback_or_recovery: "Create placeholder project record with creating/error states."
      verification:
        - "Unit test: project record exists before FrontAgent completion."

    - name: "Preview process runtime"
      type: "backend_service"
      owner: "apps/server preview infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "start/stop/reload/session status/previewUrl/logs"
      required_for: "Show live generated app in preview canvas."
      failure_modes:
        - "Stale pid reports running but no listener exists."
        - "Dependencies missing causes vite command not found."
      fallback_or_recovery: "Detect stale pid, hydrate dependencies, emit actionable preview_error."
      verification:
        - "Preview stale process regression test."
        - "Generated workspace dependency hydration smoke."

  depended_on_by:
    - name: "VisualPreviewConsole"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Preview lifecycle snapshot/events"
      compatibility_obligation: "May extend event shape; must preserve existing status values or migrate all consumers."
      expected_consumer_behavior: "Render creating/installing/starting/ready/error states with current project identity."
      migration_or_notification_required: false
      verification:
        - "web typecheck"
        - "frontend projection tests"

    - name: "Curator runtime validation"
      type: "agent"
      owner: "apps/server agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "RuntimeValidationEvidence.preview and project file evidence"
      compatibility_obligation: "Must expose latest evidence for the exact project generated by current run."
      expected_consumer_behavior: "Curator can block if preview is absent, stale or broken."
      migration_or_notification_required: false
      verification:
        - "Curator test with stale preview evidence."

  data_flow:
    inbound:
      - source: "Workflow execution"
        payload_or_state: "threadId, runId, storyId, specId, agentResults"
        validation: "Shared workflow event schemas"
    outbound:
      - target: "Preview UI"
        payload_or_state: "projectId, previewSessionId, lifecycle status, previewUrl, logs, file event counts"
        compatibility: "Frontend supports unknown future statuses by showing actionable fallback."
      - target: "File browser"
        payload_or_state: "project file tree and active project metadata"
        compatibility: "Existing file browser must continue listing completed projects."
```

## 7. Architecture And Coding Rules

```yaml
architecture_rules:
  universal:
    - "Do not make preview startup a hidden side effect without persisted lifecycle events."
    - "Do not store processId as proof of liveness; verify listener/health."
    - "Do not emit project-ready before required files and preview command are present."
    - "Keep generated workspace ownership in backend services, not React components."
  project_specific:
    - "Use packages/shared for new Preview/Project lifecycle contracts."
    - "Update WorkflowEventProjector and frontend projection together."
    - "Preserve local-first file mode and Postgres compatibility."
coding_rules:
  backend:
    - "Model lifecycle state with explicit enums and actionable error codes."
    - "Use atomic writes for project registry/session state."
    - "Guard against stale preview sessions after restart."
  frontend:
    - "Render all lifecycle states without blank canvases."
    - "Do not require manual refresh to see active project files."
    - "Keep fullscreen/open-loopback host controls accessible and stable."
  tests:
    - "Cover missing dependency, stale process, project-created-before-preview and error projection."
```

## 8. Contracts And Invariants

```yaml
contracts:
  domain_contracts:
    - name: "ExecutionProjectLink"
      producer: "WorkflowOrchestrator/ProjectWorkspaceService"
      consumers:
        - "Preview routes"
        - "File browser"
        - "Curator runtime validation"
        - "VisualPreviewConsole"
      invariant: "A workflow run that writes generated project files must expose one active projectId and, when previewable, one active previewSessionId."
  ui_contracts:
    - name: "Preview lifecycle rendering"
      producer: "VisualPreviewConsole"
      consumers:
        - "Horus user"
      requirement: "No silent stopped state during active execution; show creating/installing/starting/ready/error."
  data_contracts:
    - name: "Preview lifecycle event"
      producer: "Server event stream"
      consumers:
        - "usePreviewEvents"
        - "Workflow run snapshot"
      migration_required: true
      compatibility_notes: "Extend shared event schemas and update all projectors."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Map current preview/project lifecycle"
    agent: "repo_explorer"
    action: "Read preview routes, project workspace service, file browser services, workflow projector and frontend preview hooks."
    expected_output: "Current lifecycle map with missing links and exact files to change."
  - step: 2
    name: "Add shared execution-project lifecycle contract"
    agent: "backend_specialist"
    action: "Add or extend shared schemas for project lifecycle, preview lifecycle and workflow event linking."
    expected_output: "Typed contracts and schema tests."
  - step: 3
    name: "Persist project identity early"
    agent: "backend_specialist"
    action: "Create project registry entry before FrontAgent finalization and update on file changes."
    expected_output: "File tree can list active project while run is active."
  - step: 4
    name: "Auto-start preview with hydration states"
    agent: "backend_specialist"
    action: "Detect package manager, install missing dependencies when policy allows, start preview, verify listener and emit events."
    expected_output: "Preview starts or fails with actionable reason."
  - step: 5
    name: "Project lifecycle UI projection"
    agent: "frontend_specialist"
    action: "Render active project, file changes and preview states in VisualPreviewConsole/file tree."
    expected_output: "No blank/stale preview during active execution."
  - step: 6
    name: "Validate E2E"
    agent: "qa_specialist"
    action: "Run typecheck/build/tests and browser smoke from execution start to visible preview."
    expected_output: "Validation evidence with commands and screenshots/logs."
```

## 10. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Starting a spec/agent execution creates an active project record before agent completion."
    - "File tree displays the active project and file update count during execution."
    - "Preview canvas shows lifecycle states and then renders the app when ready."
    - "Open-loopback host and fullscreen controls work for the active preview."
    - "If preview cannot start, the UI shows the failing command/stage and next action."
  integration:
    - "workflow events, preview sessions and file browser reference the same projectId."
    - "Curator receives preview evidence tied to the latest generated project."
  quality:
    - "No false ready state based only on stored pid."
    - "No manual refresh required for active file tree/preview."
  observability:
    - "Install/start logs are available from the execution console."
```

## 11. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared type-check"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate shared lifecycle contracts."
      success_condition: "exit code 0"
    - command: "pnpm --filter @u-build/server type-check && pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate backend lifecycle and emitted test imports."
      success_condition: "exit code 0"
    - command: "pnpm --filter @u-build/web type-check && pnpm --filter @u-build/web build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate frontend lifecycle consumers."
      success_condition: "exit code 0"
    - command: "node --test apps/server/test/*.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Run focused and existing runtime regressions."
      success_condition: "all tests pass"
    - command: "pnpm preview:smoke"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Prove browser-visible preview behavior."
      success_condition: "exit code 0"
  runtime_checks:
    - name: "Story-to-preview live check"
      method: "API/SSE/browser"
      expected: "Project visible in files and preview before final curator pass."
```

## 12. Risks And Recovery

```yaml
risks:
  - risk: "Auto-install may be slow or unsafe for arbitrary projects."
    severity: "high"
    mitigation: "Use command policy/catalog and explicit lifecycle state; never hide install failures."
  - risk: "Existing preview sessions may be stale after restart."
    severity: "high"
    mitigation: "Verify listener and emit recovered_after_restart or stale_session_error."
  - risk: "Frontend may show project from wrong run."
    severity: "critical"
    mitigation: "Key active project by runId/threadId/projectId and test switching."
recovery_strategy:
  retryable_failures:
    - "dependency install timeout"
    - "port collision"
    - "preview process startup race"
  non_retryable_failures:
    - "missing package.json"
    - "no preview command"
    - "invalid generated source syntax"
  rollback_rules:
    - "Do not delete generated project files during rollback unless created by this failed run and explicitly marked disposable."
```

## 13. Minimal Output Contract

```yaml
agent_result:
  status: "<completed | failed | blocked>"
  summary: "<what lifecycle path was implemented>"
  files_read:
    - "<preview/project/workflow files>"
  files_changed:
    - "<shared/backend/frontend/tests>"
  commands_run:
    - command: "<command>"
      cwd: "<REPOSITORY_ROOT>"
      exit_code: "<exit>"
      result: "<short result>"
  validation:
    passed:
      - "<checks>"
    failed:
      - "<checks>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "Implement spec 111 after preview evidence is stable."
```
