# SPEC 29 - Chat Runtime Evidence Integration

```yaml
format_version: "agentic_sdd.v1"
task_id: "29-chat-runtime-evidence-integration"
title: "Report preview execution and QA validation evidence back through Horus chat"
created_at_utc: "2026-05-26T18:25:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p2"
risk_level: "medium"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
blocked_by:
  - "24-real-cli-capability-gate"
  - "25-process-browser-preview-adapter"
  - "27-preview-runtime-observability"
  - "28-qa-preview-smoke-validation"
```

## 1. Original User Request

```yaml
raw_user_request: |
  crie a pasta de tools, em seguida crie uma spec de planejamento para implementar cada feature dessas que você listou. Sua prioridade máxima é testar a capacidade real de CLI. Isso é regra obrigatória
```

## 2. System Interpretation

```yaml
system_translation: |
  Make Horus chat responses reflect real preview and QA execution evidence so the user can understand what happened without reading logs or terminal output.

expected_user_visible_result: |
  When the user asks Horus to run or validate a project, the assistant reply includes concise status grounded in real CLI/runtime evidence.

expected_engineering_result: |
  SubmitHorusChatTurnUseCase consumes preview runtime and QA smoke results and reports them without exposing raw terminal control.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Add runtime evidence summary to Horus chat responses."
    - "Surface blocked/failed/success states with next action."
    - "Keep chat as command intent surface, not terminal surface."
  out_of_scope:
    - "Do not add arbitrary command prompt."
    - "Do not implement full terminal transcript UI."
    - "Do not let chat bypass preview runtime or QA services."
```

## 4. Integration Context

```yaml
integration_context:
  summary: |
    Chat becomes the user-facing reporting layer for controlled runtime actions. It must reflect evidence from preview and QA, not invent success.
  depends_on:
    - name: "SubmitHorusChatTurnUseCase"
      type: "backend_service"
      owner: "Horus chat"
      direction: "this_spec_consumes_dependency"
      contract_used: "chat turn intent handling"
      required_for: "Report runtime action results to the chat session."
      assumptions: []
      failure_modes:
        - "Chat may claim success if evidence is not required."
      fallback_or_recovery: "Require evidence object before success response."
      verification:
        - "Chat tests assert evidence-backed messages."
    - name: "QA preview smoke validation"
      type: "agent"
      owner: "QA workflow"
      direction: "this_spec_consumes_dependency"
      contract_used: "QA smoke validation result"
      required_for: "Report whether preview is testable."
      assumptions: []
      failure_modes:
        - "QA not run means chat must say validation was not run."
      fallback_or_recovery: "Return status without QA claim."
      verification:
        - "Chat tests distinguish run success from QA validation success."
  depended_on_by:
    - name: "PreviewConversationPanel"
      type: "frontend_component"
      owner: "web app"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "assistant message text and context snapshot"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "Display concise status and keep preview controls synchronized."
      migration_or_notification_required: false
      verification:
        - "Web build and visual smoke."
```

## 5. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "Chat reports evidence; it does not own execution."
    - "No success message without runtime or QA evidence."
    - "Do not leak raw stderr unless sanitized and bounded."
```

## 6. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Define chat evidence summary"
    agent: "backend"
    action: "Map preview/QA evidence to concise assistant messages."
    expected_output: "Typed evidence summary."
  - step: 2
    name: "Wire use case"
    agent: "backend"
    action: "SubmitHorusChatTurnUseCase reads preview action evidence and QA smoke result when available."
    expected_output: "Evidence-backed chat replies."
  - step: 3
    name: "Validate UI rendering"
    agent: "frontend"
    action: "Ensure conversation panel displays status without overflow."
    expected_output: "Readable chat output."
  - step: 4
    name: "Regression tests"
    agent: "qa"
    action: "Test success, failure, blocked, and not-run QA states."
    expected_output: "No false success."
```

## 7. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Chat says project is running only after preview runtime evidence exists."
    - "Chat says QA passed only after QA smoke result passed."
    - "Blocked states include the failed step and next action."
  architectural:
    - "Chat cannot provide arbitrary terminal access."
    - "Execution remains routed through preview runtime and QA services."
  quality:
    - "Horus chat tests pass."
    - "Web build passes."
  observability:
    - "Messages include concise evidence references without raw unbounded logs."
```

## 8. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate chat runtime evidence integration."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate chat UI rendering."
      success_condition: "Exit code 0."
    - command: "node --test apps/server/test/horusChatTurn.test.mjs apps/server/test/qaPreviewSmokeValidation.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate evidence-backed chat behavior."
      success_condition: "Exit code 0."
```

## 9. Minimal Output Contract for Agents

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

