# SPEC 25 - Process Browser Preview Adapter

```yaml
format_version: "agentic_sdd.v1"
task_id: "25-process-browser-preview-adapter"
title: "Start and stop frontend preview projects through a real managed process"
created_at_utc: "2026-05-26T18:05:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
blocked_by:
  - "24-real-cli-capability-gate"
```

## 1. Original User Request

```yaml
raw_user_request: |
  crie a pasta de tools, em seguida crie uma spec de planejamento para implementar cada feature dessas que você listou. Sua prioridade máxima é testar a capacidade real de CLI. Isso é regra obrigatória
```

## 2. System Interpretation

```yaml
system_translation: |
  Replace the no-op preview adapter with a real process-backed adapter that starts the registered frontend project, waits for the preview URL to become reachable, and stops the process safely.

expected_user_visible_result: |
  Pressing Start or asking Horus to run the project starts a real frontend preview that can be loaded in the iframe.

expected_engineering_result: |
  PreviewRuntimeManager uses a ProcessBrowserPreviewAdapter backed by the safe CLI capability from spec 24.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Implement ProcessBrowserPreviewAdapter."
    - "Start only registered FrontendProject dev commands."
    - "Wait for previewUrl readiness before marking running."
    - "Stop process groups on stop."
    - "Persist processId and preview status."
  out_of_scope:
    - "Do not expose arbitrary terminal commands."
    - "Do not add Playwright or visual inspection in this spec."
    - "Do not change FrontendProject registration UI."
```

## 4. Integration Context

```yaml
integration_context:
  summary: |
    This spec converts the existing preview lifecycle from simulated to real execution while preserving the current API and frontend contracts.
  depends_on:
    - name: "SafeCliRunner"
      type: "backend_service"
      owner: "tools infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "real safe CLI execution and process metadata"
      required_for: "Start and stop dev server commands."
      assumptions: []
      failure_modes:
        - "Runner unavailable or unsafe command rejected."
      fallback_or_recovery: "Set preview session status to error with actionable message."
      verification:
        - "Spec 24 validation must pass first."
    - name: "FileFrontendProjectRegistry"
      type: "backend_service"
      owner: "preview runtime"
      direction: "this_spec_consumes_dependency"
      contract_used: "FrontendProject.rootPath, devCommand, previewUrl"
      required_for: "Know what project may be started."
      assumptions: []
      failure_modes:
        - "Missing devCommand or previewUrl prevents startup."
      fallback_or_recovery: "Reject start with clear preview_error event."
      verification:
        - "Registry tests cover root isolation."
  depended_on_by:
    - name: "Preview UI"
      type: "frontend_component"
      owner: "web app"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "PreviewSession status/processId/previewUrl and events"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "UI can display starting, running, stopped, and error states."
      migration_or_notification_required: false
      verification:
        - "Existing previewLifecycle tests continue to pass with updated expectations."
```

## 5. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "The adapter owns process lifecycle, not PreviewRuntimeManager."
    - "PreviewRuntimeManager owns session state and event recording."
    - "No shell command should be assembled from user chat."
    - "The copied Zup launch utilities are design reference only."
  project_specific_rules:
    - "Preview runtime remains isolated from workflow and user-story folders."
    - "Start/stop/reload API shape must remain backward compatible."
```

## 6. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Confirm CLI gate"
    agent: "backend"
    action: "Run spec 24 tests before implementing adapter."
    expected_output: "Real CLI capability evidence."
  - step: 2
    name: "Implement adapter"
    agent: "backend"
    action: "Create ProcessBrowserPreviewAdapter and wire it into server.ts."
    expected_output: "Preview start uses a real process."
  - step: 3
    name: "Readiness polling"
    agent: "backend"
    action: "Poll previewUrl until reachable or timeout."
    expected_output: "running only after reachable URL."
  - step: 4
    name: "Lifecycle validation"
    agent: "qa"
    action: "Test start, ready, stop, and failure paths."
    expected_output: "Process lifecycle evidence."
```

## 7. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Preview start launches a real dev server process or reports a clear error."
    - "Preview running state is set only after previewUrl is reachable."
    - "Stop terminates the managed process."
  architectural:
    - "Adapter depends on SafeCliRunner or equivalent approved runner."
    - "No arbitrary chat command execution exists."
  quality:
    - "Server build passes."
    - "Preview lifecycle tests cover real process behavior through a harmless fixture."
  observability:
    - "preview_error includes cwd, command id, and safe stderr tail when startup fails."
```

## 8. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "node --test apps/server/test/safeCliRunner.test.mjs apps/server/test/processBrowserPreviewAdapter.test.mjs apps/server/test/previewLifecycle.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate real CLI and preview lifecycle."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate backend build."
      success_condition: "Exit code 0."
  runtime_checks:
    - name: "start_actual_web_preview"
      method: "API smoke"
      expected: "POST /api/preview/sessions/:id/start reaches running and iframe URL responds."
  manual_checks:
    - "Open Preview UI and confirm Start changes canvas from stopped to real rendered app."
```

## 9. Minimal Output Contract for Agents

## 10. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-26T19:25:00Z"
  summary:
    - "Added ProcessBrowserPreviewAdapter with real child_process.spawn lifecycle management."
    - "Wired the Express app preview runtime from NoopBrowserPreviewAdapter to ProcessBrowserPreviewAdapter."
    - "Added startup readiness polling, post-readiness process stability check, stop/kill handling, and bounded process evidence."
    - "Updated PreviewRuntimeManager to persist error state and emit preview_error when adapter startup fails."
    - "Updated seeded web preview command to run Vite on <HORUS_PUBLIC_HOST>:5174 with strictPort for fresh registries."
    - "Added focused tests for real managed process start/stop, missing command rejection, runtime preview_error, and preserved noop adapter compatibility."
  validation:
    passed:
      - "pnpm --filter @u-build/server build"
      - "node --test apps/server/test/safeCliRunner.test.mjs apps/server/test/processBrowserPreviewAdapter.test.mjs apps/server/test/previewLifecycle.test.mjs"
      - "Runtime smoke: backend health endpoint responded on <HORUS_PUBLIC_HOST>:3100 after escalated local bind permission."
      - "Runtime smoke: preview session create/start/stop endpoints responded and recorded timeline events."
    notes:
      - "A pre-existing Vite process was already occupying <HORUS_PUBLIC_HOST>:5174 in the local environment, so the smoke was used to validate API lifecycle behavior rather than a clean port ownership scenario."
      - "The adapter now includes a post-readiness stability check to avoid declaring success when a spawned process exits immediately after an already-running preview URL responds."
```

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
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```
