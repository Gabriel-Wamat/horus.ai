---
format_version: "agentic_sdd.v1"
task_id: "feature-107-advanced-repl-notebook-tool-extensions"
title: "Advanced REPL Notebook Tool Extensions"
created_at_utc: "2026-05-28T22:30:10Z"
author: "agent"
target_mode: "existing_repo"
priority: "p3"
risk_level: "medium"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
phase: "phase_3_agent_code_execution_runtime"
depends_on:
  - "spec/features/98-governed-shell-runtime.md"
  - "spec/features/102-agent-tool-profiles-capability-registry.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 107 - Advanced REPL Notebook Tool Extensions

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  REPL/notebook/tools avancadas extras. Util no futuro, mas so depois do agente editar, salvar, deletar,
  rodar e reportar corretamente.
```

## 2. System Interpretation

```yaml
system_translation: |
  Plan optional advanced tools for later runtime maturity: REPL execution, notebook editing and richer
  diagnostic tools. These tools must stay disabled by default until governed shell, profiles and audit
  events are in place.

expected_user_visible_result: |
  Future agents can perform deeper diagnostics and notebook-style edits when explicitly enabled and visible.

expected_engineering_result: |
  Horus has a clear extension architecture for advanced tools without weakening the core safety model.
```

## 3. Scope And Entities

```yaml
scope:
  in_scope:
    - "Define AdvancedAgentToolCapability schema."
    - "Specify REPL tool lifecycle: start, execute, output, stop, timeout."
    - "Specify notebook edit semantics for cell-level read/edit/add/delete."
    - "Gate advanced tools behind explicit profile flags and environment configuration."
    - "Emit operational session events for every advanced tool action."
  out_of_scope:
    - "Enabling advanced tools by default."
    - "Remote kernel execution."
    - "Binary notebook diff renderer in first implementation."
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/AdvancedAgentTool.ts"
      - "apps/server/src/application/services/AgentToolRegistry.ts"
      - "apps/server/src/application/services/AgentToolRuntime.ts"
      - "apps/server/src/infrastructure/tools/ReplToolRuntime.ts"
      - "apps/server/src/infrastructure/tools/NotebookToolRuntime.ts"
    services:
      - "AgentToolRegistry"
      - "AgentToolRuntime"
    database:
      migrations_required: false
  frontend:
    files:
      - "apps/web/src/features/visual-preview/workflowProgress.ts"
    components:
      - "Future advanced tool progress cards"
  tests:
    unit:
      - "packages/shared/test/advancedAgentTool.test.mjs"
      - "apps/server/test/advancedToolProfileGate.test.mjs"
```

## 4. Integration Context Map

```yaml
integration_context:
  summary: |
    Advanced tools are downstream of the governed tool runtime and profile registry. They must not become
    bypass paths for shell execution or file mutation.
  depends_on:
    - name: "Agent tool profiles"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "AgentToolProfile allowed advanced capabilities"
      required_for: "Keep REPL/notebook disabled unless explicitly granted."
      assumptions:
        - "SPEC 102 is implemented."
      failure_modes:
        - "Advanced tool executes for an agent that should not have it."
      fallback_or_recovery: "Fail closed and emit blocked event."
      verification:
        - "apps/server/test/advancedToolProfileGate.test.mjs"
    - name: "Governed shell runtime"
      type: "backend_service"
      owner: "apps/server/infrastructure/tools"
      direction: "this_spec_consumes_dependency"
      contract_used: "execution, timeout, cancellation and output bounding"
      required_for: "Implement REPL process safely."
      assumptions:
        - "SPEC 98 is implemented."
      failure_modes:
        - "REPL hangs or leaks output."
      fallback_or_recovery: "Timeout and terminate session."
      verification:
        - "apps/server/test/replToolRuntime.test.mjs"
  depended_on_by:
    - name: "Future specialist agents"
      type: "agent"
      owner: "apps/server/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "advanced tool capabilities"
      compatibility_obligation: "Must be opt-in."
      expected_consumer_behavior: "Use only for diagnostics or notebook-specific tasks."
      migration_or_notification_required: false
      verification:
        - "profile gate tests"
```

## 5. Plan, Acceptance, Validation

```yaml
architecture_rules:
  project_specific:
    - "Advanced tools are opt-in and profile-gated."
    - "REPL cannot bypass command classifier restrictions."
    - "Notebook cell edits must use mutation preflight."
execution_plan:
  - step: 1
    name: "Design advanced tool contracts"
    agent: "architect"
    action: "Define schemas and opt-in capability flags."
    expected_output: "Shared advanced tool contract."
  - step: 2
    name: "Implement gated stubs"
    agent: "backend_specialist"
    action: "Register advanced tools as disabled-by-default with blocked evidence."
    expected_output: "Safe extension points."
  - step: 3
    name: "Implement first REPL runtime behind flag"
    agent: "backend_specialist"
    action: "Use governed runtime and bounded output."
    expected_output: "Optional REPL execution."
  - step: 4
    name: "Specify notebook cell mutation"
    agent: "backend_specialist"
    action: "Route cell changes through mutation preflight."
    expected_output: "Notebook edit plan with tests."
acceptance_criteria:
  functional:
    - "Advanced tools are unavailable unless profile and environment flag allow them."
    - "Blocked advanced tool attempts produce visible evidence."
    - "REPL sessions timeout and clean up."
  quality:
    - "Profile gate tests prove default-deny behavior."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server test -- advancedToolProfileGate"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate disabled-by-default behavior."
      success_condition: "Exit code 0."
    - command: "pnpm typecheck"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate types."
      success_condition: "Exit code 0."
implementation_notes:
  preferred_approach: |
    Use opencode PTY/session route and process lifecycle as implementation reference for advanced tools.
    Copy only bounded streaming/lifecycle primitives after the core runtime is stable. Prefer stubs and gates
    first, implementation second.
risks:
  - risk: "Advanced tools distract from core edit/run/report reliability."
    severity: "medium"
    mitigation: "Keep this spec P3 and block default enablement."
```
