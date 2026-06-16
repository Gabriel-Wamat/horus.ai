# SPEC 24 - Real CLI Capability Gate

```yaml
format_version: "agentic_sdd.v1"
task_id: "24-real-cli-capability-gate"
title: "Prove safe real CLI execution before preview and QA automation"
created_at_utc: "2026-05-26T18:00:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
```

## 1. Original User Request

```yaml
raw_user_request: |
  crie a pasta de tools, em seguida crie uma spec de planejamento para implementar cada feature dessas que você listou. Sua prioridade máxima é testar a capacidade real de CLI. Isso é regra obrigatória
```

## 2. System Interpretation

```yaml
system_translation: |
  Establish a mandatory first feature that proves Horus can execute safe, real CLI commands from the backend before implementing preview process orchestration, QA validation, or browser checks.

expected_user_visible_result: |
  The user can see validated evidence that the backend can run a controlled CLI command and report stdout, stderr, exit code, duration, cwd, and failure details.

expected_engineering_result: |
  A minimal safe CLI runner exists behind tests and explicit command policy. It is not exposed to chat as arbitrary terminal access.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "QA and preview agents cannot validate frontend behavior without real process execution."
  target_user: "Horus operators and future QA/Frontend agents."
  expected_outcome: "CLI execution is proven safely before higher-level automation depends on it."
  product_surface:
    - "Backend preview runtime"
    - "QA validation workflow"
    - "Tooling foundation"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Node.js"
      - "TypeScript"
      - "Express"
    frontend:
      - "React"
      - "Vite"
    database: []
    infrastructure:
      - "pnpm workspace"
      - "local filesystem persistence"
  known_entrypoints:
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
  known_existing_patterns:
    - "Use case classes wrap infrastructure services."
    - "Preview runtime is isolated from workflow state."
    - "Shared contracts live under packages/shared/src/entities."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create a safe backend CLI runner abstraction."
    - "Run only internally selected allowlisted commands."
    - "Capture stdout, stderr, exit code, signal, duration, cwd, and timeout."
    - "Add unit tests proving real command execution and blocked dangerous commands."
    - "Use this as the mandatory first gate before specs 25 through 29."
  out_of_scope:
    - "Do not expose arbitrary terminal access to chat."
    - "Do not allow agents to provide raw shell commands."
    - "Do not start frontend preview servers in this spec."
    - "Do not add browser automation in this spec."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
      - "apps/server/src/infrastructure/tools/CliCommandPolicy.ts"
    services:
      - "safe CLI runner"
    database:
      migrations_required: false
      tables: []
  frontend:
    files: []
    components: []
    routes: []
  workflow:
    graph_nodes: []
    agents:
      - "QA agent, future consumer only"
      - "Frontend agent, future consumer only"
  tests:
    unit:
      - "apps/server/test/safeCliRunner.test.mjs"
    integration:
      - "apps/server/test/cliCapabilityGate.test.mjs"
    e2e: []
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec creates the minimum safe primitive required by preview runtime and QA validation. Other specs must consume this primitive instead of spawning processes directly.

  depends_on:
    - name: "Node child_process"
      type: "external_dependency"
      owner: "Node.js runtime"
      direction: "this_spec_consumes_dependency"
      contract_used: "spawn(command, args, options)"
      required_for: "Execute a real process without shell expansion."
      assumptions:
        - "Node 20+ is available because package.json requires it."
      failure_modes:
        - "Spawn fails when executable is unavailable."
        - "Timeout leaves child process alive if process-group termination is wrong."
      fallback_or_recovery: "Return failed command evidence with actionable error."
      verification:
        - "Run a harmless Node command through the runner."

  depended_on_by:
    - name: "Process preview adapter"
      type: "backend_service"
      owner: "preview runtime"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "execute(commandSpec): CliExecutionResult"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "Use runner for dev-server startup probes and safe process lifecycle evidence."
      migration_or_notification_required: false
      verification:
        - "Spec 25 adapter tests must use the runner."

    - name: "QA smoke validation"
      type: "agent"
      owner: "QA workflow"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "command evidence and status"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "QA consumes validation evidence, not raw terminal access."
      migration_or_notification_required: false
      verification:
        - "Spec 28 QA tests assert command evidence is present."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "No raw shell access from user chat or agents."
    - "Use spawn without shell expansion for all default execution."
    - "Represent commands as structured executable plus args."
    - "Keep process execution in infrastructure, not domain logic."
    - "Every command result must be auditable."
  project_specific_rules:
    - "Preview runtime must stay isolated from workflow state."
    - "QA can consume CLI evidence but cannot create arbitrary commands."
    - "The copied Zup tools are reference-only, not production imports."
```

## 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read current preview runtime files before editing."
    - "Prefer typed command specs over strings."
    - "Do not use shell: true unless a later spec explicitly justifies it."
    - "Terminate child process groups on timeout and stop."
    - "Truncate long stdout/stderr tails while preserving exit metadata."
  tests:
    - "A real CLI process must run during validation."
    - "Dangerous commands must be rejected before spawn."
    - "Timeout behavior must be covered."
```

## 9. Constraints

```yaml
technical_constraints:
  - "Must work on local macOS development environment."
  - "Must not require Docker for the first capability gate."
  - "Must not require network access."
operational_constraints:
  - "Do not run destructive commands."
  - "Do not overwrite user changes."
  - "Do not claim CLI capability without a real spawned process and captured evidence."
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect preview and test patterns"
    agent: "backend"
    action: "Read preview runtime, tests, package scripts, and copied Zup reference."
    expected_output: "Implementation map and safety constraints."
  - step: 2
    name: "Implement structured CLI runner"
    agent: "backend"
    action: "Create SafeCliRunner and CliCommandPolicy using spawn without shell."
    expected_output: "Typed runner with command evidence."
  - step: 3
    name: "Test real command execution"
    agent: "qa"
    action: "Run unit/integration tests that spawn harmless local commands."
    expected_output: "Evidence includes cwd, stdout, stderr, exit code, duration."
  - step: 4
    name: "Block unsafe execution"
    agent: "qa"
    action: "Assert destructive/shell-expansion commands are rejected before spawn."
    expected_output: "Blocked-command evidence."
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "A harmless real CLI command can be spawned and observed."
    - "Command evidence includes command id, executable, args, cwd, stdout tail, stderr tail, exit code, signal, duration, and timeout flag."
    - "Dangerous commands are rejected before process creation."
  architectural:
    - "No chat path can execute arbitrary commands."
    - "CLI logic is isolated under backend infrastructure."
  quality:
    - "Focused server tests pass."
    - "Server build passes."
  observability:
    - "Failures return actionable error messages and command evidence."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate backend TypeScript build."
      success_condition: "Exit code 0."
    - command: "node --test apps/server/test/safeCliRunner.test.mjs apps/server/test/cliCapabilityGate.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Prove real CLI capability and safety gates."
      success_condition: "Exit code 0 and evidence asserts real spawned command."
  runtime_checks:
    - name: "real_cli_spawn"
      method: "test"
      expected: "A local command runs through SafeCliRunner and returns exit code 0."
  manual_checks: []
```

## 13. Error-Mitigation Rules for Agents

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent command support that tests did not execute."
    - "Do not claim process lifecycle support from this spec alone."
  read_before_write:
    - "Read current preview adapter and registry before modifying runtime wiring."
  failure_handling:
    - "If spawn fails, report executable, cwd, errno, and stderr."
  scope_control:
    - "Do not implement preview server startup until this gate passes."
```

## 14. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Preview runtime and tests were read."
  implementation:
    - "SafeCliRunner exists."
    - "CliCommandPolicy blocks unsafe commands."
  validation:
    - "Real CLI command was executed by automated test."
    - "Dangerous command rejection was tested."
  reporting:
    - "Files changed and commands run are listed."
```

## 14.1. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-26T18:45:00Z"
  summary:
    - "Added backend SafeCliRunner using child_process.spawn with shell disabled."
    - "Added CliCommandPolicy with executable allowlisting, cwd root validation, dangerous command blocking, shell-pattern blocking, timeout limits, and structured command normalization."
    - "Added focused tests proving real spawned CLI execution, blocked dangerous commands, blocked non-allowlisted executables, timeout handling, and auditable command evidence."
  validation:
    passed:
      - "pnpm --filter @u-build/server build"
      - "node --test apps/server/test/safeCliRunner.test.mjs apps/server/test/cliCapabilityGate.test.mjs"
      - "Focused CLI gate executed a real spawned Node process and captured stdout, stderr, exit code, signal, cwd, process id, timeout flag, and duration."
      - "Focused safety tests rejected dangerous and non-allowlisted commands before spawn."
```

## 15. Minimal Output Contract for Agents

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
