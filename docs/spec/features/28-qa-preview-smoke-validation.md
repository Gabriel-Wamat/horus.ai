# SPEC 28 - QA Preview Smoke Validation

```yaml
format_version: "agentic_sdd.v1"
task_id: "28-qa-preview-smoke-validation"
title: "Allow QA to validate a real running preview without arbitrary terminal access"
created_at_utc: "2026-05-26T18:20:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
blocked_by:
  - "24-real-cli-capability-gate"
  - "25-process-browser-preview-adapter"
  - "27-preview-runtime-observability"
```

## 1. Original User Request

```yaml
raw_user_request: |
  crie a pasta de tools, em seguida crie uma spec de planejamento para implementar cada feature dessas que você listou. Sua prioridade máxima é testar a capacidade real de CLI. Isso é regra obrigatória
```

## 2. System Interpretation

```yaml
system_translation: |
  Give QA a safe validation path that checks whether the frontend preview is actually reachable and suitable for testing, using runtime evidence instead of raw command execution.

expected_user_visible_result: |
  QA can report whether the generated frontend preview is reachable, navigable at a basic level, and ready for deeper visual/browser testing.

expected_engineering_result: |
  QA validation consumes preview runtime evidence and runs controlled smoke checks through approved tools only.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Add QA smoke validation service for preview URLs."
    - "Check HTTP status, content type, non-empty body, and route reachability."
    - "Attach QA smoke result to QA agent output and/or Curator input."
    - "Use real CLI evidence from earlier specs as prerequisite."
  out_of_scope:
    - "Do not add full Playwright visual regression yet."
    - "Do not allow QA to run arbitrary commands."
    - "Do not let QA restart projects directly unless routed through PreviewRuntimeManager."
```

## 4. Integration Context

```yaml
integration_context:
  summary: |
    QA becomes a consumer of preview runtime state. It validates whether the frontend is real and reachable before evaluating implementation quality.
  depends_on:
    - name: "PreviewRuntimeManager"
      type: "backend_service"
      owner: "preview runtime"
      direction: "this_spec_consumes_dependency"
      contract_used: "PreviewSession status and previewUrl"
      required_for: "Know what URL QA should test."
      assumptions: []
      failure_modes:
        - "No running preview means QA must report blocked."
      fallback_or_recovery: "Return blocked QA result with missing runtime evidence."
      verification:
        - "QA smoke tests for missing/running/error sessions."
    - name: "Preview runtime evidence"
      type: "internal_module"
      owner: "preview runtime"
      direction: "this_spec_consumes_dependency"
      contract_used: "startup evidence and errors"
      required_for: "Avoid false QA success when preview did not start."
      assumptions: []
      failure_modes:
        - "Evidence missing makes result unauditable."
      fallback_or_recovery: "QA reports validation inconclusive."
      verification:
        - "Curator input includes QA smoke evidence."
  depended_on_by:
    - name: "Curator agent"
      type: "agent"
      owner: "quality gate"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "QA smoke validation result"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "Curator rejects frontend work without real preview validation when required."
      migration_or_notification_required: false
      verification:
        - "Curator prompt tests include QA smoke result."
```

## 5. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "QA validates runtime state; it does not own process lifecycle."
    - "QA reports blocked when preview evidence is missing."
    - "Smoke checks must be deterministic and bounded."
```

## 6. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Define QA smoke contract"
    agent: "backend"
    action: "Create typed result shape for preview smoke validation."
    expected_output: "Reachability, route, status, content, and evidence fields."
  - step: 2
    name: "Implement smoke service"
    agent: "qa"
    action: "Fetch previewUrl with timeout and bounded body inspection."
    expected_output: "Deterministic validation result."
  - step: 3
    name: "Feed QA and Curator"
    agent: "backend"
    action: "Pass smoke evidence into QA result and curator prompt input."
    expected_output: "Quality gate can reason from real preview evidence."
  - step: 4
    name: "Validate blocked states"
    agent: "qa"
    action: "Test missing preview, failed preview, reachable preview."
    expected_output: "No false success."
```

## 7. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "QA reports pass only when preview URL responds successfully."
    - "QA reports blocked when no real preview evidence exists."
    - "QA result includes HTTP status and elapsed time."
  architectural:
    - "QA has no arbitrary terminal access."
    - "Process lifecycle remains owned by preview runtime."
  quality:
    - "QA smoke tests pass."
  observability:
    - "Curator receives smoke validation evidence."
```

## 8. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate QA smoke service build."
      success_condition: "Exit code 0."
    - command: "node --test apps/server/test/qaPreviewSmokeValidation.test.mjs apps/server/test/buildCuratorPrompt.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate smoke result and curator consumption."
      success_condition: "Exit code 0."
```

## 9. Minimal Output Contract for Agents

## 10. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-26T21:05:00Z"
  summary:
    - "Added QaPreviewSmokeValidationService with bounded fetch validation for running preview sessions."
    - "QA output can now carry previewSmoke evidence with status, reason, preview URL, HTTP status, content type, body size, elapsed time, and runtime evidence."
    - "QA blocks chat code-change runs when no preview session is attached."
    - "Curator input selection now forwards previewSmoke from QA."
    - "Curator deterministically rejects QA output when previewSmoke exists and did not pass."
    - "Horus chat code-change orchestration now forwards previewSessionId into the workflow state."
  validation:
    passed:
      - "pnpm --filter @u-build/server build"
      - "node --test apps/server/test/qaPreviewSmokeValidation.test.mjs apps/server/test/buildCuratorPrompt.test.mjs"
      - "node --test apps/server/test/qaPreviewSmokeValidation.test.mjs apps/server/test/buildCuratorPrompt.test.mjs apps/server/test/selectCuratorInputs.test.mjs apps/server/test/horusChatTurn.test.mjs"
    notes:
      - "Scope stayed backend/orchestration focused; no arbitrary terminal or Playwright access was added to QA."
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
