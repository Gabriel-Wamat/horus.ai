---
format_version: "agentic_sdd.v1"
task_id: "feature-98-governed-shell-runtime"
title: "Governed Shell Runtime"
created_at_utc: "2026-05-28T22:30:10Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_3_agent_code_execution_runtime"
depends_on:
  - "spec/features/69-release-hardening-and-orchestrator-modularization.md"
  - "spec/features/71-agent-tool-runtime-governed-write-access.md"
  - "spec/features/91-validation-runner-and-command-policy.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 98 - Governed Shell Runtime

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  Runtime real de shell governado. O agente precisa rodar pnpm, testes, build, preview e comandos de
  diagnostico com timeout, cwd, streaming, logs e politica de seguranca.
```

## 2. System Interpretation

```yaml
system_translation: |
  Introduce a first-class ShellCommandRuntime for agent tools. It must support cross-platform providers,
  command policy, cwd validation, timeout/cancellation, streaming output, bounded persisted logs and
  structured command evidence.

expected_user_visible_result: |
  Users see when an agent starts a command, the current command status, streamed output summary and exact
  failure reason when a command is blocked, times out or fails.

expected_engineering_result: |
  SafeCliRunner evolves into or is wrapped by a governed shell runtime inspired by opencode-style shell
  providers, preserving Horus command policy and validation evidence contracts.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Agents cannot reliably finish code changes unless they can run install-free diagnostics, tests, builds and preview checks."
  target_user: "Developer/operator delegating local code changes to Horus agents."
  expected_outcome: "Commands run safely, visibly and with reproducible evidence."
  product_surface:
    - "Preview chat"
    - "Agent Flow"
    - "Coding runtime validation"
technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "Node child_process"
      - "TypeScript"
      - "SafeCliRunner"
      - "CliCommandPolicy"
    frontend:
      - "SSE command progress"
    database:
      - "Agent execution ledger or event log"
    infrastructure:
      - "macOS"
      - "Windows"
      - "Linux"
  known_entrypoints:
    - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
    - "apps/server/src/infrastructure/tools/CliCommandPolicy.ts"
    - "apps/server/src/infrastructure/tools/SafeCliValidationCommandRunner.ts"
    - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
    - "packages/shared/src/entities/CodingValidation.ts"
    - "packages/shared/src/entities/HorusRunFlow.ts"
  known_existing_patterns:
    - "SafeCliRunner already enforces allowlisted executables and bounded output."
    - "Validation runner records command id, cwd, exit code, stdout/stderr tail and duration."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add ShellCommandRuntimePort and ShellCommandRuntime implementation."
    - "Support provider abstraction for POSIX shell and Windows PowerShell without OS-specific hardcoding in agents."
    - "Validate cwd is inside the selected project/worktree root."
    - "Support timeout, AbortSignal cancellation and kill tree behavior."
    - "Stream stdout/stderr chunks as bounded command events."
    - "Persist command evidence with command id, cwd, normalized argv, exit code, signal, duration and output tails."
    - "Use command policy before execution."
  out_of_scope:
    - "Unrestricted arbitrary shell access."
    - "Deploy, secret exfiltration, network scanners or destructive filesystem commands."
    - "Interactive TTY sessions."
    - "Replacing validation runner semantics in the same change."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/application/ports/ShellCommandRuntimePort.ts"
      - "apps/server/src/infrastructure/tools/ShellCommandRuntime.ts"
      - "apps/server/src/infrastructure/tools/ShellProvider.ts"
      - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
      - "apps/server/src/application/services/AgentToolRuntime.ts"
      - "packages/shared/src/entities/ShellCommand.ts"
      - "packages/shared/src/entities/HorusRunFlow.ts"
    services:
      - "ShellCommandRuntime"
      - "CliCommandPolicy"
      - "AgentToolRuntime"
    database:
      migrations_required: false
  frontend:
    files:
      - "apps/web/src/features/visual-preview/workflowProgress.ts"
    components:
      - "Command progress rows"
  workflow:
    graph_nodes:
      - "frontAgentNode"
      - "qaAgentNode"
    agents:
      - "Front Agent"
      - "QA Agent"
  tests:
    unit:
      - "apps/server/test/shellCommandRuntime.test.mjs"
      - "apps/server/test/safeCliRunnerPolicy.test.mjs"
    integration:
      - "apps/server/test/agentToolRuntimeRunCommand.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    ShellCommandRuntime is the controlled execution substrate for validation, project preview commands and
    agent diagnostics. It must remain below application ports and above OS-specific providers.
  depends_on:
    - name: "CliCommandPolicy"
      type: "internal_module"
      owner: "apps/server/infrastructure/tools"
      direction: "this_spec_consumes_dependency"
      contract_used: "normalize, classify, allow/block command"
      required_for: "Prevent unsafe commands before spawn."
      assumptions: []
      failure_modes:
        - "Unsafe command executes or safe command is blocked without reason."
      fallback_or_recovery: "Return policy_blocked result with reason."
      verification:
        - "apps/server/test/safeCliRunnerPolicy.test.mjs"
    - name: "Runtime event sink"
      type: "event_stream"
      owner: "apps/server/domain/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "tool_call_started/finished/blocked plus command output events if added"
      required_for: "Expose command progress to UI."
      assumptions:
        - "Existing event stream can carry additive metadata."
      failure_modes:
        - "Command runs but UI remains stale."
      fallback_or_recovery: "Persist final evidence even if streaming fails."
      verification:
        - "apps/server/test/workflowToolEvents.test.mjs"
  depended_on_by:
    - name: "Validation runner"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "ShellCommandResult"
      compatibility_obligation: "Validation evidence fields remain stable."
      expected_consumer_behavior: "Use shell runtime for test/typecheck/build commands."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/codingValidationRunner.test.mjs"
    - name: "Agent run_command tool"
      type: "agent"
      owner: "apps/server/application/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "run_command tool result"
      compatibility_obligation: "Tool result is bounded and serializable."
      expected_consumer_behavior: "Use for diagnostics and validation, not arbitrary destructive actions."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/agentToolRuntimeRunCommand.test.mjs"
```

## 7. Architecture, Contracts, Plan

```yaml
architecture_rules:
  project_specific:
    - "Agents request commands through run_command; they never instantiate child_process."
    - "Provider selection is environment-driven and tested for macOS, Windows and Linux behavior."
    - "Command output must be bounded before persistence or event emission."
contracts:
  api_contracts:
    - name: "ShellCommandRuntimePort.execute"
      producer: "ShellCommandRuntime"
      consumers:
        - "AgentToolRuntime"
        - "CodingValidationRunner"
      request_shape: "cwd, command, args or script, timeoutMs, signal, policyContext"
      response_shape: "status, exitCode, signal, stdoutTail, stderrTail, durationMs, policyDecision"
      compatibility: "can extend"
  domain_contracts:
    - name: "No ungoverned shell"
      producer: "Architecture boundary"
      consumers:
        - "All agents"
      invariant: "All agent command execution passes through ShellCommandRuntime."
execution_plan:
  - step: 1
    name: "Inspect command execution surfaces"
    agent: "repo_explorer"
    action: "Find all SafeCliRunner and child_process usage."
    expected_output: "Map of command execution entrypoints."
  - step: 2
    name: "Add shell runtime port and provider abstraction"
    agent: "backend_specialist"
    action: "Create platform-neutral port and OS provider adapters."
    expected_output: "Typed runtime that wraps existing safe runner behavior."
  - step: 3
    name: "Add streaming and persistence evidence"
    agent: "backend_specialist"
    action: "Emit bounded output chunks and final command evidence."
    expected_output: "Command progress is observable."
  - step: 4
    name: "Wire run_command tool"
    agent: "backend_specialist"
    action: "Expose governed command execution to allowed agent profiles only."
    expected_output: "Agents can run approved commands."
  - step: 5
    name: "Validate cross-platform behavior"
    agent: "qa_specialist"
    action: "Run unit tests with provider fakes and policy fixtures."
    expected_output: "Safe command handling is deterministic."
```

## 8. Acceptance And Validation

```yaml
acceptance_criteria:
  functional:
    - "run_command can execute approved test/build/diagnostic commands."
    - "Blocked commands return structured policy evidence."
    - "Timed out commands terminate and produce timeout evidence."
    - "Streaming events are bounded and ordered."
  integration:
    - "Validation runner can consume ShellCommandRuntime results."
    - "Preview progress can render command started/finished/blocked."
  architectural:
    - "No new direct child_process call is introduced outside shell runtime/providers."
  quality:
    - "Focused command runtime and policy tests pass."
  observability:
    - "Every command has commandId, cwd, status, duration and output tails."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server test -- shellCommandRuntime"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate governed shell runtime."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test -- safeCliRunnerPolicy"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate command blocking and normalization."
      success_condition: "Exit code 0."
    - command: "pnpm typecheck"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate shared/backend typing."
      success_condition: "Exit code 0."
```

## 9. Implementation Notes And Risks

```yaml
implementation_notes:
  preferred_approach: |
    Use opencode-style shell provider separation as inspiration: normalize the shell provider, policy-check
    before spawn, stream bounded output, persist final result, and keep user-visible status independent from
    raw process details. Copy generic provider, output-buffering, timeout and command path extraction helpers
    when they can be isolated cleanly; adapt anything tied to opencode globals, PTY routing or UI state into
    Horus ports and event contracts.
  backward_compatibility:
    required: true
    notes:
      - "SafeCliRunner consumers must keep working during migration."
risks:
  - risk: "Shell runtime accidentally permits destructive commands."
    severity: "critical"
    mitigation: "Default deny until semantic command classifier SPEC 104 expands policy safely."
  - risk: "Long-running preview command never terminates."
    severity: "high"
    mitigation: "Use background/session model only in later preview-specific work; this spec requires timeout/cancel."
completion_checklist:
  repository_understood:
    - "All command execution entrypoints were inspected."
  implementation:
    - "All agent commands use ShellCommandRuntime."
  validation:
    - "Command runtime, policy and typecheck commands were run."
  reporting:
    - "Command evidence schema and changed files are listed."
```

## 10. Implementation Log

```yaml
implemented_at_utc: "2026-05-29T00:05:00Z"
implementation_summary:
  - "Added shared ShellCommand request/result/output-event contracts."
  - "Added ShellCommandRuntimePort and infrastructure ShellCommandRuntime backed by SafeCliRunner and CliCommandPolicy."
  - "Extended SafeCliRunner with bounded stdout/stderr output callbacks while keeping existing consumers compatible."
  - "Registered governed run_command as an agent tool with project-root cwd policy, timeout, AbortSignal and structured result evidence."
  - "Allowed Front and QA profiles to use run_command while preserving existing chat/spec/odin shell restrictions."
validation:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "node --test packages/shared/test/shellCommand.test.mjs apps/server/test/shellCommandRuntime.test.mjs apps/server/test/agentToolRuntimeRunCommand.test.mjs apps/server/test/safeCliRunner.test.mjs apps/server/test/safeCliRunnerPolicy.test.mjs apps/server/test/agentToolRegistry.test.mjs"
known_followups:
  - "Spec 99 should persist command/tool activity into an operational session ledger."
  - "Spec 104 should deepen command classification beyond the current allowlist and destructive-pattern policy."
```
