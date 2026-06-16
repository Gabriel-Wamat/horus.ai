---
format_version: "agentic_sdd.v1"
task_id: "feature-97-incremental-edit-tool-read-before-write"
title: "Incremental Edit Tool With Read Before Write"
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
  - "spec/features/70-code-change-set-delete-and-safe-file-mutations.md"
  - "spec/features/71-agent-tool-runtime-governed-write-access.md"
  - "spec/features/72-agent-tool-runtime-react-loop-and-e2e-closure.md"
  - "spec/features/90-ast-patch-planner-diff-safe-apply-rollback.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 97 - Incremental Edit Tool With Read Before Write

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  Tool de edicao incremental com leitura obrigatoria. edit_file precisa aceitar oldString/newString,
  replaceAll, hash/baseVersion e exigir leitura previa.
```

## 2. System Interpretation

```yaml
system_translation: |
  Replace broad file-overwrite behavior with a governed incremental edit tool. The agent must read a file
  in the same operational session before editing it, must supply exact oldString/newString edit intent, and
  must pass file staleness checks before the runtime writes any content.

expected_user_visible_result: |
  When an agent edits a file, Horus can explain which file was read, which exact text was replaced, how
  many replacements happened, and why an edit was blocked if the file changed.

expected_engineering_result: |
  AgentToolRuntime exposes an edit_file contract inspired by opencode-style edit tools: read-before-write,
  exact-match replacement, optional replaceAll, stale-content protection, diff output and auditable tool
  events.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Agents that overwrite whole files are hard to trust and can silently destroy user work."
  target_user: "Horus operator using Preview chat or agent flows to change generated projects."
  expected_outcome: "Agents edit files with precise, reviewable, stale-safe replacements."
  product_surface:
    - "Preview chat code-change workflow"
    - "Agent Flow execution"
    - "Project Files editor"
technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Zod"
      - "AgentToolRuntime"
      - "CodeChangeSet"
    frontend:
      - "React event consumers"
    database:
      - "Existing file/Postgres event persistence"
    infrastructure:
      - "Node fs/promises"
  known_entrypoints:
    - "apps/server/src/application/services/AgentToolRuntime.ts"
    - "apps/server/src/application/tools/registerProjectAgentTools.ts"
    - "apps/server/src/infrastructure/code/CodeChangeSetFileOperations.ts"
    - "packages/shared/src/entities/CodeChangeSet.ts"
    - "packages/shared/src/entities/HorusRunFlow.ts"
  known_existing_patterns:
    - "Tool calls are represented through shared workflow events."
    - "CodeChangeSet operations already carry before/after content and validation metadata."
    - "Path safety must stay centralized in CodeChangeSetFileOperations."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add shared IncrementalEditInput and IncrementalEditResult schemas."
    - "Require the same agent session to have a successful read_file event for target path before edit_file."
    - "Support oldString/newString exact replacement."
    - "Support replaceAll only when explicitly set and replacement count is reported."
    - "Support expectedContentHash, expectedMtimeMs or baseVersion preconditions."
    - "Reject ambiguous single-edit matches when oldString occurs more than once and replaceAll is false."
    - "Return unified diff, additions, deletions, changed ranges and failure reason."
    - "Emit started/succeeded/failed/blocked tool events."
  out_of_scope:
    - "Arbitrary regex replacement."
    - "Full-file rewrite through edit_file."
    - "Binary file mutation."
    - "Global rename across project without symbol index integration."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/AgentTool.ts"
      - "packages/shared/src/entities/HorusRunFlow.ts"
      - "apps/server/src/application/services/AgentToolRuntime.ts"
      - "apps/server/src/application/services/AgentToolLoop.ts"
      - "apps/server/src/application/tools/registerProjectAgentTools.ts"
      - "apps/server/src/infrastructure/code/CodeChangeSetFileOperations.ts"
    services:
      - "AgentToolRuntime"
      - "AgentToolLoop"
      - "CodeChangeSet file planner"
    database:
      migrations_required: false
  frontend:
    files:
      - "apps/web/src/features/visual-preview/workflowProgress.ts"
    components:
      - "Preview progress timeline"
  workflow:
    graph_nodes:
      - "frontAgentNode"
    agents:
      - "Front Agent"
  tests:
    unit:
      - "packages/shared/test/agentToolSchemas.test.mjs"
      - "apps/server/test/agentToolRuntimeIncrementalEdit.test.mjs"
      - "apps/server/test/agentToolLoop.test.mjs"
    integration:
      - "apps/server/test/workflowToolEvents.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    edit_file is the first hard safety boundary for real code modification. It consumes file-read session
    evidence and existing path-safety utilities, then exposes diff/evidence events to backend workflow
    projections and frontend progress consumers.
  depends_on:
    - name: "Read-file session evidence"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "tool_call_finished event with toolName=read_file, filePath, contentHash"
      required_for: "Prove the agent saw the file version it wants to edit."
      assumptions:
        - "read_file exists or will be added as part of the agent tool runtime."
      failure_modes:
        - "Agent edits stale or unseen content."
      fallback_or_recovery: "Block edit_file with read_required or stale_file."
      verification:
        - "apps/server/test/agentToolRuntimeIncrementalEdit.test.mjs"
    - name: "CodeChangeSet path safety"
      type: "backend_service"
      owner: "apps/server/infrastructure/code"
      direction: "this_spec_consumes_dependency"
      contract_used: "resolveCodeChangeSetPath and symlink/sensitive path checks"
      required_for: "Prevent edits outside selected project root."
      assumptions: []
      failure_modes:
        - "Path traversal or sensitive file mutation."
      fallback_or_recovery: "Reject before reading or writing."
      verification:
        - "apps/server/test/projectCodeChangeSetApplier.test.mjs"
  depended_on_by:
    - name: "Agent tool loop"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "edit_file tool contract and edit result"
      compatibility_obligation: "Existing tool loop result status remains backward compatible."
      expected_consumer_behavior: "Retry with fresh read on stale_file; stop on policy_blocked."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/agentToolLoop.test.mjs"
    - name: "Frontend progress projection"
      type: "frontend_component"
      owner: "apps/web/features/visual-preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "file edit tool events with diff summary"
      compatibility_obligation: "Events are additive and do not break old tool_call rendering."
      expected_consumer_behavior: "Show editing/blocked/succeeded states."
      migration_or_notification_required: false
      verification:
        - "apps/web test coverage for workflowProgress"
  data_flow:
    inbound:
      - source: "LLM tool call"
        payload_or_state: "filePath, oldString, newString, replaceAll, expectedContentHash"
        validation: "Zod schema plus path and session-read checks"
    outbound:
      - target: "Workflow event stream"
        payload_or_state: "tool call status, diff summary, replacement count"
        compatibility: "Additive event metadata"
```

## 7. Architecture And Coding Rules

```yaml
architecture_rules:
  universal:
    - "Keep filesystem writes inside infrastructure-owned mutation services."
    - "Do not bypass existing path-safety helpers."
    - "Keep shared schemas in packages/shared before backend/frontend consumers use them."
  project_specific:
    - "AgentToolRuntime owns tool execution; graph nodes only consume results."
    - "Tool events must project through the existing HorusRunFlow contract."
coding_rules:
  general:
    - "Use exact string matching, not ad hoc regex mutation."
    - "Return structured blocked reasons instead of throwing generic errors."
    - "Keep output tails bounded and do not persist full file content in progress events."
```

## 8. Contracts And Invariants

```yaml
contracts:
  domain_contracts:
    - name: "Read before write"
      producer: "AgentToolRuntime"
      consumers:
        - "AgentToolLoop"
        - "Workflow projection"
      invariant: "edit_file cannot write unless the same session has read the target file version."
    - name: "Single replacement determinism"
      producer: "Incremental edit service"
      consumers:
        - "Front Agent"
      invariant: "replaceAll=false requires exactly one oldString match."
  data_contracts:
    - name: "IncrementalEditResult"
      producer: "AgentToolRuntime"
      consumers:
        - "AgentToolLoop"
        - "Frontend progress UI"
      migration_required: false
      compatibility_notes: "Additive to existing tool result payload."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current agent tool runtime"
    agent: "repo_explorer"
    action: "Read AgentToolRuntime, AgentToolLoop, registerProjectAgentTools and shared workflow event schemas."
    expected_output: "Current tool contract and event map."
  - step: 2
    name: "Add shared edit schemas"
    agent: "backend_specialist"
    action: "Define IncrementalEditInput/Result and blocked reasons."
    expected_output: "Typed schemas with tests."
  - step: 3
    name: "Implement read-before-write guard"
    agent: "backend_specialist"
    action: "Track session read evidence and enforce content hash/base version checks."
    expected_output: "edit_file blocks unseen or stale files."
  - step: 4
    name: "Implement exact replacement and diff output"
    agent: "backend_specialist"
    action: "Apply oldString/newString replacement in memory, route write through existing safe planner, return diff."
    expected_output: "Precise mutation with replacement count."
  - step: 5
    name: "Project events"
    agent: "backend_specialist"
    action: "Emit started/succeeded/failed/blocked events with bounded metadata."
    expected_output: "Workflow projection sees edit status."
  - step: 6
    name: "Validate"
    agent: "qa_specialist"
    action: "Run shared/server focused tests and typecheck."
    expected_output: "Validation evidence with commands and exit codes."
```

## 10. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "edit_file rejects calls without prior read_file evidence."
    - "edit_file rejects stale hashes/base versions."
    - "edit_file rejects ambiguous oldString matches unless replaceAll=true."
    - "edit_file returns diff summary, replacement count, additions and deletions."
  integration:
    - "AgentToolLoop handles edit_file succeeded, failed and blocked statuses."
    - "Workflow events remain consumable by existing Preview progress code."
  architectural:
    - "No direct unchecked fs write is introduced in graph nodes."
  quality:
    - "Focused shared/server tests pass."
  observability:
    - "Blocked edit reasons are visible in run progress and chat evidence."
```

## 11. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared test"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate shared tool schemas."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test -- agentToolRuntimeIncrementalEdit"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate edit tool safety behavior."
      success_condition: "Exit code 0."
    - command: "pnpm typecheck"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate cross-package typing."
      success_condition: "Exit code 0."
  runtime_checks:
    - name: "Preview chat edit"
      method: "local API or browser smoke"
      expected: "Editing a generated file streams an edit event and produces a diff."
```

## 12. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Use the opencode-style separation between read, write and edit semantics: read establishes file
    version evidence; edit applies exact replacement; write remains for new/full file creation only.
    Copy or adapt as much as possible from the opencode edit/write implementation, especially
    oldString/newString validation, replaceAll semantics, line-ending normalization, diff metadata and stale
    file assertion. All copied code must be routed through Horus schemas, session evidence, path safety and
    workflow events.
  alternatives_considered:
    - option: "Continue full-file update operations"
      tradeoff: "Faster but preserves the current silent overwrite risk."
  backward_compatibility:
    required: true
    notes:
      - "Existing CodeChangeSet operations must continue to work."
```

## 13. Risks, Deliverables, Checklist

```yaml
risks:
  - risk: "LLM supplies oldString with whitespace drift."
    severity: "medium"
    mitigation: "Return no_match with nearby context hints, but do not fuzzy-edit automatically."
unknowns:
  - question: "Does current read_file expose contentHash in tool events?"
    resolution_strategy: "inspect"
deliverables:
  code:
    - "Incremental edit schemas"
    - "AgentToolRuntime edit_file implementation"
    - "Workflow event metadata projection"
  tests:
    - "Read-before-write, stale, ambiguous, replaceAll and path-safety tests"
completion_checklist:
  repository_understood:
    - "Relevant runtime and shared files were read."
  implementation:
    - "edit_file is incremental and stale-safe."
    - "No raw unchecked write path was added."
  validation:
    - "Focused tests and typecheck were run."
  reporting:
    - "Changed files and commands are listed."
```

## 14. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T23:45:00Z"
implementation_summary:
  - "Added shared IncrementalEditInput, IncrementalEditResult and WriteFile tool schemas."
  - "Changed AgentToolRuntime to persist successful read_file evidence by project/path and require that evidence before edit_file writes."
  - "Changed edit_file from full-file overwrite to exact oldString/newString replacement with replaceAll, hash/baseVersion checks, line-ending normalization and diff/stats output."
  - "Added create-oriented write_file and routed CodeChangeSet create operations through it while update operations now read before edit."
  - "Updated Front/QA tool profile boundaries and startup registration checks for write_file."
validation:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "node --test packages/shared/test/agentToolSchemas.test.mjs apps/server/test/agentToolRuntime.test.mjs apps/server/test/projectAgentTools.test.mjs apps/server/test/agentToolLoop.test.mjs apps/server/test/frontAgentNodeToolRuntime.test.mjs"
known_followups:
  - "Spec 98 will add governed shell execution."
  - "Spec 100 should deepen delete/preflight semantics beyond the create/update path implemented here."
```
