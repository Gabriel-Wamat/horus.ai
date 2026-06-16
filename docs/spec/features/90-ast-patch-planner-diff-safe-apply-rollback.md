---
format_version: "agentic_sdd.v1"
task_id: "feature-90-ast-patch-planner-diff-safe-apply-rollback"
title: "AST Patch Planner Diff Safe Apply And Rollback"
created_at_utc: "2026-05-28T18:21:43Z"
author: "agent"
target_mode: "new_project"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_1_minimal_viable_coding_agent"
depends_on:
  - "spec/features/70-code-change-set-delete-and-safe-file-mutations.md"
  - "spec/features/71-agent-tool-runtime-governed-write-access.md"
  - "spec/features/83-provider-port-decoupling.md"
  - "spec/features/87-coding-runtime-orchestrator-state-machine.md"
  - "spec/features/89-tree-sitter-ast-analysis-spine.md"
---

# 90 - AST Patch Planner Diff Safe Apply And Rollback

## 1. Original User Request

```yaml
raw_user_request: |
  crie as specs 87 até 91

source_feature_request: |
  Phase 1 must include AST editing, diff patch generation, file modification pipeline and rollback.
  The assistant must prioritize AST-driven editing, symbol-level modifications and safe diff-based patching.
```

## 2. System Interpretation

```yaml
system_translation: |
  Define the safe code modification layer for the coding assistant. This SPEC must introduce structural
  patch plans, AST-aware edit builders, import management, diff generation, pre-apply validation and
  rollback while preserving compatibility with the existing CodeChangeSet pipeline.

expected_user_visible_result: |
  Coding edits are shown as precise diffs with affected symbols/files, can be validated before apply, and
  roll back automatically if application fails.

expected_engineering_result: |
  Horus gains a StructuralPatchPlan contract, AST patch planner, diff builder, version checks and safe
  applier that compile into or extend existing CodeChangeSet operations.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "Full-file rewrites and naive replacements cause regressions, lost edits and unreviewable changes."
  target_user: "Developer/operator who needs Horus to modify code safely in local projects."
  expected_outcome: "Code changes are structural, reviewable, version-checked and reversible."
  product_surface:
    - "Coding assistant patch preview"
    - "Preview chat code-change workflow"
    - "Project Files save/edit pipeline"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Tree-sitter analysis"
      - "ts-morph or Babel AST for TS/JS edit builders"
      - "Zod"
    frontend:
      - "Diff preview as downstream consumer"
    database:
      - "Existing CodeChangeSet repositories"
    infrastructure:
      - "Node fs"
      - "Existing rollback helpers"
  known_entrypoints:
    - "packages/shared/src/entities/CodeChangeSet.ts"
    - "apps/server/src/infrastructure/code/CodeChangeSetFileOperations.ts"
    - "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
    - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
    - "apps/server/src/infrastructure/code/FrontendChangeSetQualityGate.ts"
    - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
  known_existing_patterns:
    - "CodeChangeSet already supports create/update/delete operations with before/after content and diff."
    - "Path safety blocks root escape, symlinks, node_modules, build outputs and sensitive filenames."
    - "Appliers already support rollback on write failure."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create StructuralPatchPlan and StructuralPatchOperation shared contracts."
    - "Support symbol-level edit intents: insert, replace, delete, rename-local, add-import, remove-import and update-export."
    - "Create AST-aware edit builders for TypeScript/TSX first."
    - "Generate unified diffs from before/after content and attach them to CodeChangeSet-compatible operations."
    - "Add file version/content hash preconditions before apply."
    - "Add patch application transaction with rollback and failure evidence."
    - "Run AST validation before runtime validation."
  out_of_scope:
    - "Free-form full repository rewrites."
    - "Global rename across project references without LSP support."
    - "Python/Swift editing implementation."
    - "Automatic formatting beyond project formatter/validation commands."
    - "Direct writes outside CodeChangeSet or structural patch pipeline."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/StructuralPatch.ts"
      - "packages/shared/src/entities/CodeChangeSet.ts"
      - "apps/server/src/application/ports/PatchPlannerPort.ts"
      - "apps/server/src/application/coding/AstPatchPlanner.ts"
      - "apps/server/src/application/coding/DiffBuilder.ts"
      - "apps/server/src/application/coding/AstPatchValidationGate.ts"
      - "apps/server/src/infrastructure/code/CodeChangeSetFileOperations.ts"
      - "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
    services:
      - "AstPatchPlanner"
      - "DiffBuilder"
      - "ProjectCodeChangeSetApplier"
    database:
      migrations_required: false
      tables:
        - "code_change_sets"
  frontend:
    files:
      - "apps/web/src/features/visual-preview/previewChatMessages.ts"
    components:
      - "PreviewConversationPanel"
      - "Future diff preview component"
    routes: []
  workflow:
    graph_nodes: []
    agents:
      - "Front/refactor agent consumes structural patch contract in later phases."
  tests:
    unit:
      - "packages/shared/test/structuralPatch.test.mjs"
      - "apps/server/test/astPatchPlanner.test.mjs"
      - "apps/server/test/diffBuilder.test.mjs"
      - "apps/server/test/codeChangeSetRollback.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This SPEC converts AST analysis plus code-generation intent into safe patch operations. It must preserve
    the existing CodeChangeSet pipeline while adding structural preconditions and AST validation.

  depends_on:
    - name: "AST analysis result"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "this_spec_consumes_dependency"
      contract_used: "AstAnalysisResult"
      required_for: "Locate target symbols, imports and structural insertion points."
      assumptions:
        - "SPEC 89 provides deterministic symbol ranges for TS/TSX."
      failure_modes:
        - "Planner cannot prove edit location and falls back to brittle text replacement."
      fallback_or_recovery: "Fail with unsupported_edit_target; never perform naive replacement."
      verification:
        - "apps/server/test/astPatchPlanner.test.mjs"

    - name: "CodeChangeSet file operations"
      type: "backend_service"
      owner: "apps/server/infrastructure/code"
      direction: "this_spec_consumes_dependency"
      contract_used: "planCodeChangeSetOperations, applyPlannedCodeChangeOperationsWithRollback"
      required_for: "Reuse existing path safety, beforeContent and rollback behavior."
      assumptions: []
      failure_modes:
        - "Structural patch bypasses sensitive path and symlink protections."
      fallback_or_recovery: "Structural patch compiler must call existing path resolver/planner before write."
      verification:
        - "apps/server/test/codeChangeSetRollback.test.mjs"

    - name: "Project file versions"
      type: "backend_service"
      owner: "apps/server/infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "ProjectFileVersion hash/mtime/size"
      required_for: "Detect concurrent edits before applying patches."
      assumptions: []
      failure_modes:
        - "Patch overwrites user edits made after planning."
      fallback_or_recovery: "Reject with version_conflict and require re-retrieval."
      verification:
        - "apps/server/test/astPatchPlanner.test.mjs"

  depended_on_by:
    - name: "Validation runner"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "StructuralPatchPlan and generated CodeChangeSet"
      compatibility_obligation: "Validation must run against the exact candidate content and diffs."
      expected_consumer_behavior: "Validate AST first, then lint/typecheck/test in preflight workspace."
      migration_or_notification_required: false
      verification:
        - "SPEC 91 validation tests."

    - name: "Preview chat code-change UI"
      type: "frontend_component"
      owner: "apps/web/features/visual-preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "diff summaries and patch evidence"
      compatibility_obligation: "Existing message rendering remains compatible; diff details are additive."
      expected_consumer_behavior: "Show affected files/symbols and failure reasons."
      migration_or_notification_required: false
      verification:
        - "pnpm --filter @u-build/web test:guards"

  data_flow:
    inbound:
      - source: "AST analysis and code generation"
        payload_or_state: "target symbol, edit intent, generated snippet, import requirements"
        validation: "Symbol/range exists and file version matches."
    outbound:
      - target: "CodeChangeSet repository and applier"
        payload_or_state: "create/update/delete operations with before/after content and diffs"
        compatibility: "Compatible with existing CodeChangeSet schema or explicitly additive schema extension."

  integration_risks:
    - risk: "Patch planner silently falls back to full-file rewrite."
      severity: "critical"
      mitigation: "Full-file replacement requires explicit operation type and stricter validation; default structural edits must fail when target is ambiguous."
    - risk: "Import management creates duplicate or broken imports."
      severity: "high"
      mitigation: "Import operations must be AST-validated and covered by fixture tests."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "AST-driven edits are the default for supported languages."
    - "Naive text replacement is prohibited for supported structural edits."
    - "Every patch must have before content, after content, diff and preconditions."
    - "Every apply must be rollback-capable."
    - "Patch planner cannot execute commands."
  project_specific:
    - "Existing CodeChangeSet path safety remains the write gateway."
    - "Structural patches compile to CodeChangeSet operations until storage schema is intentionally extended."
    - "No production code path may write files directly with fs.writeFile outside the governed applier."
```

## 8. Contracts and Invariants

```yaml
contracts:
  domain_contracts:
    - name: "Structural patch plan"
      producer: "AstPatchPlanner"
      consumers:
        - "ValidationRunner"
        - "CodeChangeSet applier"
        - "Preview chat UI"
      invariant: "Plan references existing AST documents and file versions for every modified file."
    - name: "Patch preconditions"
      producer: "PatchPlanner"
      consumers:
        - "SafePatchApplier"
      invariant: "Apply is rejected when file hash/mtime/size differ from planning snapshot."
    - name: "Rollback"
      producer: "SafePatchApplier"
      consumers:
        - "CodingRuntimeOrchestrator"
      invariant: "If any operation fails, previously applied operations are restored in reverse order."
  data_contracts:
    - name: "CodeChangeSet compatibility"
      producer: "StructuralPatchCompiler"
      consumers:
        - "CodeChangeSetRepository"
        - "ProjectCodeChangeSetApplier"
      migration_required: false
      compatibility_notes: "Initial implementation compiles structural operations to existing create/update/delete operations."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect existing write and rollback pipeline"
    agent: "repo_explorer"
    action: "Read CodeChangeSetFileOperations, ProjectCodeChangeSetApplier, PreflightService and ProjectFileBrowser save path."
    expected_output: "Current safety guarantees and missing structural checks."
  - step: 2
    name: "Define structural patch contracts"
    agent: "backend_specialist"
    action: "Add shared schemas for patch plan, edit operations, preconditions, diff summary and validation state."
    expected_output: "Shared contract tests."
  - step: 3
    name: "Implement diff builder"
    agent: "backend_specialist"
    action: "Create deterministic unified diff generation for before/after content."
    expected_output: "Diff fixture tests."
  - step: 4
    name: "Implement TS/TSX AST patch planner"
    agent: "backend_specialist"
    action: "Use AST facts and a TS AST edit library to add/update/remove symbols and imports safely."
    expected_output: "Patch planner fixture tests for imports, components, hooks and functions."
  - step: 5
    name: "Add precondition and rollback hardening"
    agent: "backend_specialist"
    action: "Validate file versions before apply and ensure rollback evidence is persisted."
    expected_output: "Conflict and rollback tests."
  - step: 6
    name: "Validate"
    agent: "qa_specialist"
    action: "Run shared/server build and focused patch tests."
    expected_output: "Validation evidence and explicit deferred edit types."
```

## 10. Pseudo-Code

```ts
interface PatchPlannerPort {
  plan(input: {
    task: CodingTask;
    ast: AstAnalysisResult;
    generatedEdits: GeneratedEditIntent[];
  }): Promise<StructuralPatchPlan>;
}

class AstPatchPlanner implements PatchPlannerPort {
  async plan(input: PatchPlannerInput): Promise<StructuralPatchPlan> {
    for (const edit of input.generatedEdits) {
      const target = findTargetSymbol(input.ast, edit.target);
      if (!target) throw new UnsupportedEditTargetError(edit.target);
      this.editBuilder.apply(target, edit);
    }
    return this.diffBuilder.buildPlan();
  }
}

class SafePatchApplier {
  async apply(plan: StructuralPatchPlan): Promise<ApplyResult> {
    await this.assertPreconditions(plan);
    const changeSet = this.compiler.toCodeChangeSet(plan);
    return this.codeChangeSetApplier.apply(changeSet);
  }
}
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Supported TS/TSX edits generate structural patch plans with diffs."
    - "Patch application rejects stale file versions before writing."
    - "Rollback restores already-applied files when a later operation fails."
  integration:
    - "Generated patch plans compile into existing CodeChangeSet operations."
    - "Validation runner can validate the exact candidate patch."
  architectural:
    - "No direct uncontrolled fs writes exist in patch planner."
    - "Naive text replacement is not used for supported AST edit types."
  quality:
    - "Tests cover import insertion/removal, component update, function insertion, delete operation, conflict and rollback."
  observability:
    - "Patch events expose affected files, symbols, diff stats, precondition failures and rollback outcome."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate structural patch contracts."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate patch planner/applier compilation."
      success_condition: "Exit code 0."
    - command: "node --test packages/shared/test/structuralPatch.test.mjs apps/server/test/astPatchPlanner.test.mjs apps/server/test/diffBuilder.test.mjs apps/server/test/codeChangeSetRollback.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate patch planning, diffs, conflict detection and rollback."
      success_condition: "All tests pass."
```

## 13. Error Mitigation And Handoff Rules

```yaml
error_mitigation:
  - "If target symbol is ambiguous, ask for narrower scope or fail with ambiguous_target."
  - "If the edit cannot be represented structurally, do not fake success with a full-file rewrite."
  - "If formatter changes unrelated files, treat them as validation artifacts and do not include them unless explicitly approved."
  - "If rollback fails, mark task critical_failed and include exact files requiring manual inspection."

handoff_output_contract:
  - "List supported edit operation types."
  - "List unsupported edit cases."
  - "Report diff stats and rollback validation results."
```

## 14. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T21:00:00Z"
implemented_by: "Codex"
summary: |
  Implemented the first production-safe structural patch layer for the coding runtime. The shared
  StructuralPatch contract now models patch intents, operations, file changes, preconditions,
  diagnostics and diff stats. The server now has an AstPatchPlanner that consumes retrieval plus
  Tree-sitter AST evidence, builds symbol-scoped TS/TSX edits, generates deterministic diffs and
  compiles patch plans into existing CodeChangeSet operations. The CodeChangeSet file operation
  planner now enforces structural preconditions, including content-hash conflicts before writes.
  The runtime also has an AstPatchValidationGate that validates the exact patched content before
  later runtime validation/apply phases.

implemented_files:
  shared:
    - "packages/shared/src/entities/StructuralPatch.ts"
    - "packages/shared/src/entities/CodeChangeSet.ts"
    - "packages/shared/src/index.ts"
  server:
    - "apps/server/src/application/ports/PatchPlannerPort.ts"
    - "apps/server/src/application/ports/index.ts"
    - "apps/server/src/application/coding/AstPatchPlanner.ts"
    - "apps/server/src/application/coding/StructuralPatchEditUtils.ts"
    - "apps/server/src/application/coding/DiffBuilder.ts"
    - "apps/server/src/application/coding/AstPatchValidationGate.ts"
    - "apps/server/src/infrastructure/code/CodeChangeSetFileOperations.ts"
    - "apps/server/src/infrastructure/http/server.ts"
  tests:
    - "packages/shared/test/structuralPatch.test.mjs"
    - "apps/server/test/astPatchPlanner.test.mjs"
    - "apps/server/test/astPatchValidationGate.test.mjs"
    - "apps/server/test/diffBuilder.test.mjs"
    - "apps/server/test/codeChangeSetRollback.test.mjs"

supported_edit_operations:
  - "add_import"
  - "remove_import"
  - "replace"
  - "update_export"
  - "delete"
  - "insert"
  - "rename_local"

important_limits:
  - "rename_local edits only the local symbol definition name range; global project-wide rename waits for LSP/SPEC 92+."
  - "TS/TSX/JS/JSX are supported through the Tree-sitter TypeScript adapter; Python/Swift remain out of scope."
  - "Patch apply is still performed by the existing CodeChangeSet applier; SPEC 91 owns runtime command policy and final apply orchestration."

validation:
  passed:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/structuralPatch.test.mjs"
    - "node --test apps/server/test/diffBuilder.test.mjs apps/server/test/astPatchPlanner.test.mjs apps/server/test/astPatchValidationGate.test.mjs apps/server/test/codeChangeSetRollback.test.mjs"
    - "node --test packages/shared/test/structuralPatch.test.mjs apps/server/test/astPatchPlanner.test.mjs apps/server/test/diffBuilder.test.mjs apps/server/test/codeChangeSetRollback.test.mjs"
    - "node --test apps/server/test/projectCodeChangeSetApplier.test.mjs apps/server/test/buildFrontendCodeChangeSet.test.mjs apps/server/test/codingRuntimeAstIntegration.test.mjs apps/server/test/treeSitterAstAnalyzer.test.mjs apps/server/test/astAnalysisService.test.mjs"
    - "pnpm --filter @u-build/web test:guards"
```
