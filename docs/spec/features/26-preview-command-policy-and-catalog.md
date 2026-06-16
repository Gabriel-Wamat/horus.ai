# SPEC 26 - Preview Command Policy And Catalog

```yaml
format_version: "agentic_sdd.v1"
task_id: "26-preview-command-policy-and-catalog"
title: "Move preview execution from raw devCommand strings to a safe command catalog"
created_at_utc: "2026-05-26T18:10:00Z"
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
```

## 1. Original User Request

```yaml
raw_user_request: |
  crie a pasta de tools, em seguida crie uma spec de planejamento para implementar cada feature dessas que você listou. Sua prioridade máxima é testar a capacidade real de CLI. Isso é regra obrigatória
```

## 2. System Interpretation

```yaml
system_translation: |
  Convert preview project execution to catalog-driven command ids so Horus never treats arbitrary command strings as runtime authority.

expected_user_visible_result: |
  Project execution remains the same from the UI, but unsafe or unknown commands fail with clear messages.

expected_engineering_result: |
  FrontendProject execution uses command ids and structured command specs compatible with future QA validation.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Add structured preview command metadata while preserving devCommand compatibility during migration."
    - "Resolve allowed preview commands by id."
    - "Deny shell expansion, network transfer utilities, destructive commands, and cwd escapes."
    - "Add tests for allowed and denied command ids."
  out_of_scope:
    - "Do not implement a UI for editing command catalogs."
    - "Do not allow per-message command overrides."
```

## 4. Integration Context

```yaml
integration_context:
  summary: |
    This spec hardens the execution model after real CLI capability exists. It borrows the Zup catalog pattern without importing its Python runtime.
  depends_on:
    - name: "FrontendProjectSchema"
      type: "internal_module"
      owner: "shared contracts"
      direction: "this_spec_consumes_dependency"
      contract_used: "FrontendProject fields"
      required_for: "Represent project execution command metadata."
      assumptions:
        - "Additive schema changes are allowed."
      failure_modes:
        - "Frontend code may reject new fields if schema exports are inconsistent."
      fallback_or_recovery: "Keep devCommand nullable compatibility."
      verification:
        - "Shared schema tests."
  depended_on_by:
    - name: "ProcessBrowserPreviewAdapter"
      type: "backend_service"
      owner: "preview runtime"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Resolved safe command spec"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "Adapter receives executable/args/cwd instead of raw shell string."
      migration_or_notification_required: false
      verification:
        - "Adapter tests use command id resolution."
```

## 5. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "Command ids are authority; raw command strings are display/migration data only."
    - "Policy validation happens before process execution."
    - "Backend owns command catalog enforcement."
  project_specific_rules:
    - "Registered project roots remain inside repository root."
    - "Chat intents cannot create or modify command catalog entries."
```

## 6. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Design additive command schema"
    agent: "backend"
    action: "Extend shared preview project metadata or add backend-only policy wrapper."
    expected_output: "Backward-compatible command model."
  - step: 2
    name: "Implement resolver"
    agent: "backend"
    action: "Resolve preview command id to structured executable, args, cwd, env."
    expected_output: "Safe command spec."
  - step: 3
    name: "Wire adapter"
    agent: "backend"
    action: "Make ProcessBrowserPreviewAdapter consume resolver output."
    expected_output: "No direct raw devCommand execution."
  - step: 4
    name: "Validate denies"
    agent: "qa"
    action: "Test unknown ids, cwd escape, shell expansion, destructive patterns."
    expected_output: "Blocked before spawn."
```

## 7. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Known preview command id starts the configured project."
    - "Unknown command id is rejected."
    - "Dangerous raw command content cannot execute."
  architectural:
    - "Preview adapter no longer owns command authorization."
    - "Command policy has focused tests."
  quality:
    - "Shared and server builds pass."
  observability:
    - "Denied commands report policy reason without leaking secrets."
```

## 8. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate shared schema compatibility."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate backend command policy."
      success_condition: "Exit code 0."
    - command: "node --test packages/shared/test/preview.test.mjs apps/server/test/previewCommandPolicy.test.mjs apps/server/test/processBrowserPreviewAdapter.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate command catalog and adapter integration."
      success_condition: "Exit code 0."
```

## 9. Minimal Output Contract for Agents

## 10. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-26T19:45:00Z"
  summary:
    - "Extended FrontendProject with additive previewCommandId and commandCatalog fields while preserving nullable devCommand compatibility."
    - "Added PreviewCommandResolver so ProcessBrowserPreviewAdapter consumes resolved structured command specs instead of parsing raw devCommand directly."
    - "Kept legacy devCommand as migration fallback through a structured legacy-dev command path."
    - "Hardened CliCommandPolicy to deny network transfer executables such as curl, wget, nc, and netcat even when allowlisted."
    - "Seeded the web preview project with commandCatalog id dev and strict Vite port arguments."
    - "Added focused tests for known command ids, unknown ids, cwd escape, shell expansion, denied network transfer utilities, legacy fallback, and adapter integration."
  validation:
    passed:
      - "pnpm --filter @u-build/shared build"
      - "pnpm --filter @u-build/server build"
      - "node --test packages/shared/test/preview.test.mjs apps/server/test/previewCommandPolicy.test.mjs apps/server/test/processBrowserPreviewAdapter.test.mjs"
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
