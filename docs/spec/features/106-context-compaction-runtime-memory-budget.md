---
format_version: "agentic_sdd.v1"
task_id: "feature-106-context-compaction-runtime-memory-budget"
title: "Context Compaction Runtime Memory Budget"
created_at_utc: "2026-05-28T22:30:10Z"
author: "agent"
target_mode: "existing_repo"
priority: "p2"
risk_level: "medium"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
phase: "phase_3_agent_code_execution_runtime"
depends_on:
  - "spec/features/66-agent-memory-and-runtime-skills-governance.md"
  - "spec/features/96-index-memory-lifecycle-and-context-budget.md"
  - "spec/features/99-agent-operational-session-ledger.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 106 - Context Compaction Runtime Memory Budget

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  Compactacao de contexto. Quando a sessao cresce, o runtime deveria compactar contexto mantendo spec,
  arquivos tocados, decisoes, diffs, evidencias e proximos passos.
```

## 2. System Interpretation

```yaml
system_translation: |
  Add deterministic context compaction for long-running agent sessions. Compaction must preserve execution
  truth from structured state and evidence, not hallucinated summaries, and must feed future LLM calls within
  a token budget.

expected_user_visible_result: |
  Long runs continue with continuity instead of forgetting prior files, decisions or validation evidence.

expected_engineering_result: |
  Horus gains AgentContextCompactor using operational session events, repository context budget and memory
  services.
```

## 3. Scope And Integration

```yaml
scope:
  in_scope:
    - "Define AgentCompactedContext shared schema."
    - "Trigger compaction by token budget, event count or explicit runtime checkpoint."
    - "Preserve spec summary, selected project, files read/changed, diffs summary, commands, decisions, blockers and next steps."
    - "Use structured event projection as primary source."
    - "Persist compacted context per session."
    - "Inject compacted context into subsequent agent prompts."
  out_of_scope:
    - "Replacing repository semantic retrieval."
    - "Unbounded free-form memory."
    - "Vector memory implementation."
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/AgentCompactedContext.ts"
      - "apps/server/src/application/services/AgentContextCompactor.ts"
      - "apps/server/src/application/services/ChatContextAssembler.ts"
      - "apps/server/src/application/services/AgentToolLoop.ts"
      - "apps/server/src/application/services/AgentMemoryService.ts"
    services:
      - "AgentContextCompactor"
      - "ChatContextAssembler"
    database:
      migrations_required: false
  tests:
    unit:
      - "packages/shared/test/agentCompactedContext.test.mjs"
      - "apps/server/test/agentContextCompactor.test.mjs"
integration_context:
  summary: |
    Context compaction consumes operational session/runbook events and context budget services, then feeds
    compact truth back into agent prompt assembly.
  depends_on:
    - name: "Operational session ledger"
      type: "database"
      owner: "apps/server/application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "AgentOperationEvent and projection"
      required_for: "Build factual compacted context."
      assumptions:
        - "SPEC 99 is available."
      failure_modes:
        - "Compactor summarizes missing or stale events."
      fallback_or_recovery: "Block compaction or mark compacted context partial."
      verification:
        - "apps/server/test/agentContextCompactor.test.mjs"
  depended_on_by:
    - name: "Agent prompt assembly"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "AgentCompactedContext"
      compatibility_obligation: "Prompt remains bounded and deterministic."
      expected_consumer_behavior: "Include compact context before latest user instruction when budget requires it."
      migration_or_notification_required: false
      verification:
        - "prompt context tests"
```

## 4. Plan, Acceptance, Validation

```yaml
architecture_rules:
  project_specific:
    - "Compaction must preserve structured evidence ids."
    - "Do not claim validation that is not present in session events."
    - "Context budget limits must be configurable and not hardcoded to one machine."
contracts:
  data_contracts:
    - name: "AgentCompactedContext"
      producer: "AgentContextCompactor"
      consumers:
        - "ChatContextAssembler"
        - "AgentToolLoop"
      migration_required: false
      compatibility_notes: "Stored as compact JSON alongside session metadata."
execution_plan:
  - step: 1
    name: "Inspect current memory/context budget services"
    agent: "repo_explorer"
    action: "Read AgentMemoryService, ChatContextAssembler and ContextBudgeter."
    expected_output: "Context assembly map."
  - step: 2
    name: "Define compact context schema"
    agent: "backend_specialist"
    action: "Add structured fields and evidence references."
    expected_output: "Shared compact context contract."
  - step: 3
    name: "Implement deterministic compactor"
    agent: "backend_specialist"
    action: "Build compact context from session projection and budget constraints."
    expected_output: "Budgeted context artifact."
  - step: 4
    name: "Inject into agent prompts"
    agent: "backend_specialist"
    action: "Use compacted context when full history exceeds budget."
    expected_output: "Prompt continuity."
acceptance_criteria:
  functional:
    - "Compaction preserves files touched, diffs summary, commands, decisions and blockers."
    - "Prompt assembly uses compact context without exceeding configured budget."
  quality:
    - "Compaction tests cover long event streams and partial evidence."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server test -- agentContextCompactor"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate compaction."
      success_condition: "Exit code 0."
    - command: "pnpm typecheck"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate types."
      success_condition: "Exit code 0."
implementation_notes:
  preferred_approach: |
    Use opencode compaction, overflow, summary and todo preservation as the strongest reference. Copy/adapt
    the compaction trigger and preservation model where possible, but keep Horus compaction grounded in typed
    operational-session events and context budget services.
risks:
  - risk: "Compaction hides important failure evidence."
    severity: "high"
    mitigation: "Preserve evidence ids and command result summaries, and test blocked/failure cases."
```
