---
format_version: "agentic_sdd.v1"
task_id: "feature-104-semantic-command-classifier-policy"
title: "Semantic Command Classifier Policy"
created_at_utc: "2026-05-28T22:30:10Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
phase: "phase_3_agent_code_execution_runtime"
depends_on:
  - "spec/features/91-validation-runner-and-command-policy.md"
  - "spec/features/98-governed-shell-runtime.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 104 - Semantic Command Classifier Policy

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  Classificador semantico de comandos. Separar comando de leitura, teste, build, install, git, rede e
  destrutivo. Regex simples nao e suficiente.
```

## 2. System Interpretation

```yaml
system_translation: |
  Replace brittle regex-only command policy with a semantic classifier that normalizes command invocations,
  strips safe wrappers, identifies command intent and returns allow/ask/deny decisions with precise reasons.

expected_user_visible_result: |
  Safe commands run without friction, risky commands are blocked with an understandable reason, and command
  failures explain policy category instead of generic rejection.

expected_engineering_result: |
  CliCommandPolicy gains a semantic classification layer consumed by ShellCommandRuntime and validation
  runners.
```

## 3. Scope, Entities, Integration

```yaml
scope:
  in_scope:
    - "Normalize argv/script into command AST-like tokens."
    - "Classify categories: read, search, test, build, typecheck, lint, package_install, dev_server, git_read, git_write, network, destructive, secrets, unknown."
    - "Support allow/ask/deny policy decision."
    - "Strip safe env/cd/wrapper prefixes only when deterministic."
    - "Deny command substitution, pipes to network/destructive tools and shell injection patterns."
    - "Return policy evidence for UI and logs."
  out_of_scope:
    - "LLM-based permission decisions."
    - "Arbitrary interactive shell sessions."
    - "Allowing deploy or credential commands."
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/CommandPolicy.ts"
      - "apps/server/src/infrastructure/tools/CliCommandPolicy.ts"
      - "apps/server/src/infrastructure/tools/ShellCommandRuntime.ts"
      - "apps/server/src/infrastructure/tools/CommandClassifier.ts"
    services:
      - "CliCommandPolicy"
      - "ShellCommandRuntime"
    database:
      migrations_required: false
  tests:
    unit:
      - "packages/shared/test/commandPolicy.test.mjs"
      - "apps/server/test/commandClassifier.test.mjs"
      - "apps/server/test/safeCliRunnerPolicy.test.mjs"
integration_context:
  summary: |
    CommandClassifier is upstream of ShellCommandRuntime. It consumes normalized command input and emits a
    decision that every command executor must respect.
  depends_on:
    - name: "ShellCommandRuntime"
      type: "backend_service"
      owner: "apps/server/infrastructure/tools"
      direction: "this_spec_consumes_dependency"
      contract_used: "command request and policy context"
      required_for: "Enforce classifier decision before spawn."
      assumptions:
        - "SPEC 98 provides the runtime integration point."
      failure_modes:
        - "Classifier exists but runtime ignores it."
      fallback_or_recovery: "Fail closed when classification is missing."
      verification:
        - "apps/server/test/shellCommandRuntime.test.mjs"
  depended_on_by:
    - name: "Validation runner"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "CommandPolicyDecision"
      compatibility_obligation: "Validation-safe commands must remain allowed."
      expected_consumer_behavior: "Run allowed validation categories only."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/codingValidationRunner.test.mjs"
```

## 4. Architecture, Plan, Acceptance

```yaml
architecture_rules:
  project_specific:
    - "Policy must fail closed on unknown dangerous syntax."
    - "Command categories are typed shared contracts."
    - "No command runs without a policy decision."
contracts:
  domain_contracts:
    - name: "Command policy decision"
      producer: "CommandClassifier"
      consumers:
        - "ShellCommandRuntime"
        - "SafeCliRunner"
      invariant: "deny blocks execution; ask blocks until an explicit approval mechanism exists."
execution_plan:
  - step: 1
    name: "Audit current policy"
    agent: "repo_explorer"
    action: "Read CliCommandPolicy, SafeCliRunner and validation command selector."
    expected_output: "Current regex and allowlist map."
  - step: 2
    name: "Add shared command policy schema"
    agent: "backend_specialist"
    action: "Define categories, risk levels and decisions."
    expected_output: "Typed policy contract."
  - step: 3
    name: "Implement deterministic classifier"
    agent: "backend_specialist"
    action: "Classify common package manager, git, filesystem, network and destructive commands."
    expected_output: "Classifier with fixture coverage."
  - step: 4
    name: "Integrate runtime policy"
    agent: "backend_specialist"
    action: "Require classifier decision before command execution."
    expected_output: "Fail-closed shell runtime."
acceptance_criteria:
  functional:
    - "test/build/typecheck/lint commands are classified and allowed when rooted in project."
    - "rm -rf, credential reads, network exfiltration and git write commands are denied by default."
    - "Unknown shell syntax is denied unless explicitly allowlisted."
  quality:
    - "Classifier fixture tests cover POSIX and PowerShell-shaped commands."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server test -- commandClassifier"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate semantic command classification."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test -- safeCliRunnerPolicy"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate policy integration."
      success_condition: "Exit code 0."
implementation_notes:
  preferred_approach: |
    Use opencode-style command parsing, wrapper stripping and path validation concepts as inspiration. Do
    copy isolated command/path extraction helpers when they are portable. Do not import broad permission
    prompts until Horus has an explicit approval UX; ask decisions should block.
risks:
  - risk: "False positives block useful commands."
    severity: "medium"
    mitigation: "Classify validation command fixtures first and add explicit category allowlists."
```
