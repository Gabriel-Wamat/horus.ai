# SPEC 27 - Preview Runtime Observability

```yaml
format_version: "agentic_sdd.v1"
task_id: "27-preview-runtime-observability"
title: "Expose preview process logs and runtime evidence safely"
created_at_utc: "2026-05-26T18:15:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
blocked_by:
  - "24-real-cli-capability-gate"
  - "25-process-browser-preview-adapter"
```

## 1. Original User Request

```yaml
raw_user_request: |
  crie a pasta de tools, em seguida crie uma spec de planejamento para implementar cada feature dessas que você listou. Sua prioridade máxima é testar a capacidade real de CLI. Isso é regra obrigatória
```

## 2. System Interpretation

```yaml
system_translation: |
  Add safe runtime evidence around preview processes so users, Horus, QA, and Curator can understand whether project execution succeeded, failed, or is still starting.

expected_user_visible_result: |
  Preview errors become actionable and timeline entries include concise process evidence.

expected_engineering_result: |
  Preview events carry sanitized command evidence and bounded stdout/stderr tails without leaking secrets or unbounded logs.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Persist or stream bounded process evidence for preview sessions."
    - "Add preview_ready and preview_error details."
    - "Make evidence consumable by QA and Curator."
  out_of_scope:
    - "Do not build a full terminal emulator."
    - "Do not display raw unbounded logs in the UI."
    - "Do not store secrets or full environment dumps."
```

## 4. Integration Context

```yaml
integration_context:
  summary: |
    This spec turns CLI execution into auditable evidence. It does not expand command authority.
  depends_on:
    - name: "PreviewEventStreamAdapter"
      type: "event_stream"
      owner: "preview runtime"
      direction: "this_spec_consumes_dependency"
      contract_used: "PreviewEvent data"
      required_for: "Emit runtime status and bounded evidence."
      assumptions: []
      failure_modes:
        - "Frontend timeline does not update if event stream fails."
      fallback_or_recovery: "Persist evidence in FilePreviewSessionStore events."
      verification:
        - "Timeline tests assert stored evidence."
  depended_on_by:
    - name: "QA validation"
      type: "agent"
      owner: "QA workflow"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "sanitized runtime evidence"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "QA uses evidence to decide whether frontend can be tested."
      migration_or_notification_required: false
      verification:
        - "QA tests consume evidence object."
```

## 5. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "Evidence is bounded, sanitized, and structured."
    - "Events are for status and audit, not arbitrary terminal interaction."
    - "Session state stays isolated from workflow state."
```

## 6. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Define evidence shape"
    agent: "backend"
    action: "Add a structured runtime evidence shape in preview event data or shared schema."
    expected_output: "Stable event data contract."
  - step: 2
    name: "Capture lifecycle evidence"
    agent: "backend"
    action: "Attach command evidence to preview_ready and preview_error events."
    expected_output: "Timeline shows process evidence."
  - step: 3
    name: "Frontend display"
    agent: "frontend"
    action: "Show concise actionable error details without terminal UI."
    expected_output: "User can diagnose failed preview startup."
  - step: 4
    name: "Validate bounds"
    agent: "qa"
    action: "Assert logs are truncated and secrets are not exposed."
    expected_output: "Safe observability tests pass."
```

## 7. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "preview_ready includes ready URL and startup duration."
    - "preview_error includes command id, cwd, exit status, and bounded stderr tail."
    - "Timeline remains readable."
  architectural:
    - "No unbounded terminal stream is added."
  quality:
    - "Server and web builds pass."
  observability:
    - "QA and Curator can receive structured preview runtime evidence."
```

## 8. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate backend event/evidence code."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend timeline display."
      success_condition: "Exit code 0."
    - command: "node --test apps/server/test/previewRuntimeEvidence.test.mjs apps/server/test/previewLifecycle.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate evidence persistence and truncation."
      success_condition: "Exit code 0."
```

## 9. Minimal Output Contract for Agents

## 10. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-26T20:05:00Z"
  summary:
    - "Added structured preview runtime evidence sanitizer with bounded stdout/stderr tails and secret redaction."
    - "PreviewRuntimeManager now emits preview_started and preview_ready separately for successful starts."
    - "preview_ready includes ready URL, startup duration, and sanitized runtimeEvidence."
    - "preview_error includes sanitized runtimeEvidence with command id, cwd, exit status, signal, reason, and stderr tail when available."
    - "Preview timeline UI now renders concise runtime evidence and bounded stderr details without becoming a terminal."
    - "Added tests for preview_ready evidence, preview_error evidence, truncation, and secret redaction."
  validation:
    passed:
      - "pnpm --filter @u-build/server build"
      - "pnpm --filter @u-build/web build"
      - "node --test apps/server/test/previewRuntimeEvidence.test.mjs apps/server/test/previewLifecycle.test.mjs"
      - "node --test apps/server/test/processBrowserPreviewAdapter.test.mjs apps/server/test/previewCommandPolicy.test.mjs packages/shared/test/preview.test.mjs"
    notes:
      - "Web build still reports the existing Vite chunk-size warning for the main bundle."
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
