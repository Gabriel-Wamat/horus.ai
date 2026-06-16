---
format_version: "agentic_sdd.v1"
task_id: "feature-100-robust-file-mutation-preflight-applier"
title: "Robust File Mutation Preflight Applier"
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
  - "spec/features/90-ast-patch-planner-diff-safe-apply-rollback.md"
  - "spec/features/97-incremental-edit-tool-read-before-write.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 100 - Robust File Mutation Preflight Applier

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  Preflight/aplicador de patch robusto. Antes de gravar: validar caminho, existencia, versao do arquivo,
  delete permitido, patch aplicavel e diff final.
```

## 2. System Interpretation

```yaml
system_translation: |
  Strengthen the file mutation pipeline into a single preflight/apply service for create, update and delete.
  The service must validate path safety, file state, operation legality, patch applicability, diff output and
  rollback before any mutation is considered successful.

expected_user_visible_result: |
  Agent edits either apply with reviewable evidence or fail with a precise reason such as path blocked,
  stale file, delete denied, disconnected file or validation failure.

expected_engineering_result: |
  Horus has one canonical FileMutationPreflightApplier used by CodeChangeSet, incremental edit tools and
  coding runtime patches.
```

## 3. Context, Scope, Entities

```yaml
business_context:
  user_problem: "Different mutation paths can drift and let unsafe writes/deletes through."
  target_user: "Developer/operator relying on agents to safely update generated project files."
  expected_outcome: "All file mutations pass through the same auditable gate."
  product_surface:
    - "Agent generated changes"
    - "Project Files save/delete"
    - "Preview chat code changes"
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "CodeChangeSet"
      - "StructuralPatch"
    frontend:
      - "Diff preview consumers"
    database:
      - "CodeChangeSet persistence"
    infrastructure:
      - "Node fs"
  known_entrypoints:
    - "apps/server/src/infrastructure/code/CodeChangeSetFileOperations.ts"
    - "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
    - "apps/server/src/application/coding/CodingPatchApplier.ts"
    - "apps/server/src/application/coding/DiffBuilder.ts"
    - "packages/shared/src/entities/CodeChangeSet.ts"
scope:
  in_scope:
    - "Create canonical FileMutationPlan and FileMutationApplyResult."
    - "Validate create/update/delete operations through one path."
    - "Support stale checks by hash, mtime, size and optional baseVersion."
    - "Reject unsafe deletes for protected files, project root, config secrets and generated dependency folders."
    - "Generate final diff before apply and actual diff after apply."
    - "Rollback all successful operations if any later operation fails."
    - "Expose structured preflight failure reasons."
  out_of_scope:
    - "New manual file editor UI."
    - "Remote filesystem mutation."
    - "Force delete of protected files."
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/code/FileMutationPreflightApplier.ts"
      - "apps/server/src/infrastructure/code/CodeChangeSetFileOperations.ts"
      - "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
      - "apps/server/src/application/coding/CodingPatchApplier.ts"
      - "packages/shared/src/entities/CodeChangeSet.ts"
    services:
      - "ProjectCodeChangeSetApplier"
      - "CodingPatchApplier"
    database:
      migrations_required: false
  frontend:
    files:
      - "apps/web/src/features/project-files"
    components:
      - "Project files diff/error consumers"
  tests:
    unit:
      - "apps/server/test/fileMutationPreflightApplier.test.mjs"
      - "apps/server/test/projectCodeChangeSetApplier.test.mjs"
      - "apps/server/test/codeChangeSetRollback.test.mjs"
```

## 4. Integration Context Map

```yaml
integration_context:
  summary: |
    FileMutationPreflightApplier is the canonical mutation gate. It consumes CodeChangeSet and structural
    patch operations, produces durable mutation evidence, and is depended on by agent tools and project files.
  depends_on:
    - name: "Path safety helpers"
      type: "internal_module"
      owner: "apps/server/infrastructure/code"
      direction: "this_spec_consumes_dependency"
      contract_used: "resolve path, block symlink, block sensitive target"
      required_for: "Prevent root escape and protected file mutation."
      assumptions: []
      failure_modes:
        - "Unsafe path is written or deleted."
      fallback_or_recovery: "Reject operation before reading content."
      verification:
        - "apps/server/test/fileMutationPreflightApplier.test.mjs"
    - name: "Diff builder"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "this_spec_consumes_dependency"
      contract_used: "before/after content to unified diff"
      required_for: "Show reviewable mutation evidence."
      assumptions: []
      failure_modes:
        - "Mutation applies without reviewable diff."
      fallback_or_recovery: "Block apply if diff generation fails for text file."
      verification:
        - "apps/server/test/fileMutationPreflightApplier.test.mjs"
  depended_on_by:
    - name: "Incremental edit tool"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "preflight/apply mutation API"
      compatibility_obligation: "Must support exact-edit update operations."
      expected_consumer_behavior: "Never write directly after oldString replacement."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/agentToolRuntimeIncrementalEdit.test.mjs"
    - name: "Project Files save/delete"
      type: "api"
      owner: "apps/server/infrastructure/project"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "mutation failure reasons"
      compatibility_obligation: "Existing save behavior remains compatible."
      expected_consumer_behavior: "Show actionable conflict/delete blocked messages."
      migration_or_notification_required: false
      verification:
        - "project files backend tests"
```

## 5. Architecture, Contracts, Plan

```yaml
architecture_rules:
  project_specific:
    - "There is exactly one canonical mutation applier for project files."
    - "Deletes require explicit operation type and explicit allowDelete policy."
    - "Preflight result must be serializable for chat/UI evidence."
contracts:
  domain_contracts:
    - name: "Mutation atomicity"
      producer: "FileMutationPreflightApplier"
      consumers:
        - "AgentToolRuntime"
        - "ProjectCodeChangeSetApplier"
      invariant: "Multi-file apply either succeeds or rolls back prior mutations."
    - name: "Protected delete"
      producer: "FileMutationPreflightApplier"
      consumers:
        - "All mutation callers"
      invariant: "Protected files cannot be deleted by agent tools."
execution_plan:
  - step: 1
    name: "Map all mutation paths"
    agent: "repo_explorer"
    action: "Find project file writes/deletes and CodeChangeSet apply paths."
    expected_output: "Mutation path inventory."
  - step: 2
    name: "Introduce canonical applier"
    agent: "backend_specialist"
    action: "Extract common preflight/apply/rollback behavior."
    expected_output: "One reusable service."
  - step: 3
    name: "Wire existing callers"
    agent: "backend_specialist"
    action: "Route CodeChangeSet, coding patch and agent tool writes through canonical service."
    expected_output: "No duplicated mutation logic."
  - step: 4
    name: "Validate edge cases"
    agent: "qa_specialist"
    action: "Test stale, protected delete, rollback, symlink and disconnected file behavior."
    expected_output: "Regression coverage for dangerous cases."
```

## 6. Acceptance And Validation

```yaml
acceptance_criteria:
  functional:
    - "Create, update and delete share one preflight/apply path."
    - "Unsafe paths and protected deletes are blocked."
    - "Stale version/hash conflicts block writes."
    - "Rollback restores prior files after partial failure."
  integration:
    - "CodeChangeSet and AgentToolRuntime both use the canonical applier."
  architectural:
    - "No duplicated direct fs mutation path remains for agent/project file changes."
  quality:
    - "Focused mutation and rollback tests pass."
  observability:
    - "Preflight failure reasons are structured and user-visible."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server test -- fileMutationPreflightApplier"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate canonical mutation behavior."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test -- projectCodeChangeSetApplier"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate existing applier compatibility."
      success_condition: "Exit code 0."
    - command: "pnpm typecheck"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate types."
      success_condition: "Exit code 0."
implementation_notes:
  preferred_approach: |
    Use opencode edit/write/snapshot/revert/protected-file behavior as reusable source material. Copy small
    diff, file-state and protected-file algorithms where compatible, but keep Horus CodeChangeSet and
    FileMutationPreflightApplier as the only project-facing mutation contract.
risks:
  - risk: "Refactor changes behavior for Project Files manual save."
    severity: "high"
    mitigation: "Add compatibility tests before rewiring existing callers."
completion_checklist:
  implementation:
    - "Canonical mutation service is used by CodeChangeSet, coding patch apply and agent file tools."
  validation:
    - "Edge case tests pass."
```

## 7. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T23:18:00Z"
implementation_summary:
  - "Added FileMutationPreflightApplier as the canonical create/update/delete mutation gate."
  - "Added structured FileMutationPreflightError reasons for path, version, delete, binary, size and apply failures."
  - "Added preflight validation for path safety, writeRoots, symlink traversal, protected deletes, stale hash, stale mtime, stale size, baseVersion and structural preconditions."
  - "Added planned final diff and actual post-apply diff evidence with diff stats."
  - "Added atomic text writes and rollback for multi-operation partial apply failures."
  - "Rewired ProjectCodeChangeSetApplier through the canonical applier before frontend quality gate and apply."
  - "Kept CodeChangeSetFileOperations as a compatibility wrapper over the canonical applier."
  - "Added ProjectFileMutationApplierPort and wired save_file, write_file, edit_file and delete_file tools through it."
  - "Wired FileMutationPreflightApplier into server tool registration."
  - "Added focused regression tests for stale versions, protected deletes, writeRoot denial, actual diff evidence, rollback, CodeChangeSet compatibility and agent tool mutation behavior."
validation_evidence:
  - command: "pnpm build"
    status: "passed"
  - command: "node --test apps/server/test/fileMutationPreflightApplier.test.mjs apps/server/test/projectCodeChangeSetApplier.test.mjs apps/server/test/codeChangeSetRollback.test.mjs apps/server/test/projectAgentTools.test.mjs apps/server/test/agentToolRuntime.test.mjs apps/server/test/agentToolLoop.test.mjs apps/server/test/agentToolRuntimeRunCommand.test.mjs"
    status: "passed"
```
