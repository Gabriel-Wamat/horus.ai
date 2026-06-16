---
format_version: "agentic_sdd.v1"
task_id: "feature-105-worktree-isolation-per-agent-run"
title: "Worktree Isolation Per Agent Run"
created_at_utc: "2026-05-28T22:30:10Z"
author: "agent"
target_mode: "existing_repo"
priority: "p2"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
phase: "phase_3_agent_code_execution_runtime"
depends_on:
  - "spec/features/79-agentic-runtime-isolation.md"
  - "spec/features/98-governed-shell-runtime.md"
  - "spec/features/100-robust-file-mutation-preflight-applier.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 105 - Worktree Isolation Per Agent Run

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  Worktree isolado por execucao. Cada run do agente poderia operar numa worktree temporaria e so depois
  promover o patch aprovado para o projeto real.
```

## 2. System Interpretation

```yaml
system_translation: |
  Add optional git worktree isolation for mutable agent runs. Agents edit and validate inside a temporary
  isolated workspace, then Horus promotes approved diffs through the canonical mutation applier.

expected_user_visible_result: |
  Users can trust that failed agent attempts do not dirty the selected project root.

expected_engineering_result: |
  Horus gains WorktreeIsolationService with create, resolve, promote, cleanup and recovery behavior.
```

## 3. Scope And Entities

```yaml
scope:
  in_scope:
    - "Detect whether selected project root is git-backed and worktree-capable."
    - "Create temporary worktree or safe copy fallback when git worktree is unavailable."
    - "Run mutable tools and validation inside isolated root."
    - "Promote approved diff through FileMutationPreflightApplier."
    - "Cleanup successful, failed and cancelled isolation roots."
    - "Persist isolation metadata in operational session."
  out_of_scope:
    - "Nested repository management beyond explicit detection."
    - "Pushing branches or creating pull requests."
    - "Long-lived user-managed worktrees."
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/WorktreeIsolation.ts"
      - "apps/server/src/application/services/WorktreeIsolationService.ts"
      - "apps/server/src/application/services/AgentToolLoop.ts"
      - "apps/server/src/infrastructure/tools/ShellCommandRuntime.ts"
      - "apps/server/src/infrastructure/code/FileMutationPreflightApplier.ts"
    services:
      - "WorktreeIsolationService"
      - "AgentToolLoop"
    database:
      migrations_required: false
  workflow:
    agents:
      - "Front Agent"
      - "QA Agent when validating mutable candidate"
  tests:
    unit:
      - "packages/shared/test/worktreeIsolation.test.mjs"
      - "apps/server/test/worktreeIsolationService.test.mjs"
    integration:
      - "apps/server/test/agentToolLoopIsolation.test.mjs"
```

## 4. Integration Context Map

```yaml
integration_context:
  summary: |
    Worktree isolation wraps mutable tool execution. Shell, edit and validation tools receive the isolated
    root, while final promotion uses canonical mutation semantics against the real selected project.
  depends_on:
    - name: "ShellCommandRuntime"
      type: "backend_service"
      owner: "apps/server/infrastructure/tools"
      direction: "this_spec_consumes_dependency"
      contract_used: "cwd-root validation"
      required_for: "Run validation inside isolated root."
      assumptions:
        - "SPEC 98 provides root-aware command execution."
      failure_modes:
        - "Command runs against real project instead of isolated root."
      fallback_or_recovery: "Abort isolation session and cleanup."
      verification:
        - "apps/server/test/agentToolLoopIsolation.test.mjs"
    - name: "File mutation applier"
      type: "backend_service"
      owner: "apps/server/infrastructure/code"
      direction: "this_spec_consumes_dependency"
      contract_used: "apply approved diff safely"
      required_for: "Promote validated changes to real project."
      assumptions:
        - "SPEC 100 provides canonical mutation service."
      failure_modes:
        - "Promotion bypasses stale/path checks."
      fallback_or_recovery: "Block promotion and keep isolation evidence."
      verification:
        - "apps/server/test/worktreeIsolationService.test.mjs"
  depended_on_by:
    - name: "AgentToolLoop mutable runs"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "isolatedRoot and promotion result"
      compatibility_obligation: "Isolation can be disabled for unsupported projects with explicit evidence."
      expected_consumer_behavior: "Use isolated root for mutable tools when enabled."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/agentToolLoopIsolation.test.mjs"
```

## 5. Plan, Acceptance, Validation

```yaml
architecture_rules:
  project_specific:
    - "Generated projects must not be dirtied by failed isolated runs."
    - "Cleanup is best-effort but must be recorded."
    - "Promotion always passes through canonical preflight."
execution_plan:
  - step: 1
    name: "Inspect project root/git assumptions"
    agent: "repo_explorer"
    action: "Map generated project workspace layout and git availability."
    expected_output: "Isolation support matrix."
  - step: 2
    name: "Implement isolation service"
    agent: "backend_specialist"
    action: "Create temporary worktree/copy, track metadata, cleanup."
    expected_output: "Reusable isolation lifecycle."
  - step: 3
    name: "Wire mutable agent loop"
    agent: "backend_specialist"
    action: "Run edit/command tools against isolated root and promote diff after approval."
    expected_output: "Isolated mutable execution."
acceptance_criteria:
  functional:
    - "Failed mutable run leaves real project unchanged."
    - "Successful approved run promotes only validated changed files."
    - "Cleanup runs for success, failure and cancellation."
  observability:
    - "Run progress shows isolation enabled/disabled, isolated root id and cleanup status."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server test -- worktreeIsolationService"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate isolation lifecycle."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test -- agentToolLoopIsolation"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate agent loop isolation."
      success_condition: "Exit code 0."
implementation_notes:
  preferred_approach: |
    Use opencode workspace/worktree/snapshot/revert boundaries as the primary reference. Copy lifecycle
    helpers only when they are decoupled from opencode globals; otherwise adapt the behavior behind Horus
    WorktreeIsolationService. Keep Horus portability: fallback to safe temporary copy when git worktree is
    not available, and never rely on machine-specific absolute paths.
risks:
  - risk: "Generated projects are not git repositories."
    severity: "medium"
    mitigation: "Implement safe copy fallback with clear degraded-mode evidence."
```
