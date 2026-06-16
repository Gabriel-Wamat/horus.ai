---
format_version: "agentic_sdd.v1"
task_id: "feature-91-validation-runner-and-command-policy"
title: "Validation Runner And Command Policy"
created_at_utc: "2026-05-28T18:21:43Z"
author: "agent"
target_mode: "new_project"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_1_minimal_viable_coding_agent"
depends_on:
  - "spec/features/47-validation-gates-true-success.md"
  - "spec/features/69-release-hardening-and-orchestrator-modularization.md"
  - "spec/features/70-code-change-set-delete-and-safe-file-mutations.md"
  - "spec/features/82-production-boundary-release-readiness.md"
  - "spec/features/87-coding-runtime-orchestrator-state-machine.md"
  - "spec/features/90-ast-patch-planner-diff-safe-apply-rollback.md"
---

# 91 - Validation Runner And Command Policy

## 1. Original User Request

```yaml
raw_user_request: |
  crie as specs 87 até 91

source_feature_request: |
  Phase 1 must include AST validation, lint/typecheck/test execution and safe patch apply. The system
  must not execute arbitrary dangerous commands and must produce auditable validation evidence.
```

## 2. System Interpretation

```yaml
system_translation: |
  Create the validation layer for the minimal coding agent. This SPEC must define how Horus validates
  generated patches through AST parse checks, deterministic lint/typecheck/test/build commands, safe command
  policy, timeout/cancellation, evidence capture and pass/fail gates before patch application.

expected_user_visible_result: |
  The user sees whether a coding change passed AST/lint/typecheck/test gates and receives actionable failure
  messages with retry/resend options instead of silent or fake success.

expected_engineering_result: |
  Horus gains a CodingValidationRunner that wraps existing SafeCliRunner, ProjectExecutionService and
  CodeChangeSetPreflightService into a deterministic, policy-governed validation protocol for coding tasks.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "Coding agents are unsafe when they apply patches without proof that syntax, types and tests still pass."
  target_user: "Developer/operator expecting Horus to make local code changes with reliable evidence."
  expected_outcome: "No patch is marked successful until structural and runtime validation have passed or been explicitly skipped with reason."
  product_surface:
    - "Coding task timeline"
    - "Preview chat response/evidence"
    - "Future patch review UI"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "SafeCliRunner"
      - "ProjectExecutionService"
      - "CodeChangeSetPreflightService"
    frontend:
      - "React validation evidence rendering"
    database:
      - "Existing CodeChangeSet validation array"
      - "Future coding task event persistence"
    infrastructure:
      - "pnpm/npm/yarn/bun command allowlist"
      - "AbortSignal command cancellation"
  known_entrypoints:
    - "apps/server/src/infrastructure/tools/CliCommandPolicy.ts"
    - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
    - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
    - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
    - "apps/server/src/infrastructure/code/FrontendChangeSetQualityGate.ts"
    - "packages/shared/src/entities/CodeChangeSet.ts"
  known_existing_patterns:
    - "SafeCliRunner uses allowlisted executables, timeout and env allowlist."
    - "Preflight already validates candidate patches in an isolated temp workspace."
    - "Validation evidence is stored on CodeChangeSet validation commands."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create CodingValidationPlan and CodingValidationResult contracts."
    - "Run AST validation before command validation."
    - "Discover deterministic project validation commands from HorusProjectConfig and package scripts."
    - "Execute lint/typecheck/test/build/check through SafeCliRunner only."
    - "Capture bounded stdout/stderr tails, duration, exit code, status and failure classification."
    - "Support AbortSignal cancellation and timeout propagation."
    - "Block patch apply unless required validation gates pass or are explicitly skipped with policy reason."
  out_of_scope:
    - "Running arbitrary user-provided shell commands."
    - "Network commands, deploy commands or destructive git/database commands."
    - "Full CI/CD implementation."
    - "Visual browser validation beyond existing preview smoke checks."
    - "Changing command policy to permit curl/wget/nc or shell interpolation."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/CodingValidation.ts"
      - "apps/server/src/application/ports/CodingValidationPort.ts"
      - "apps/server/src/application/coding/CodingValidationRunner.ts"
      - "apps/server/src/application/coding/ValidationCommandSelector.ts"
      - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
      - "apps/server/src/infrastructure/tools/CliCommandPolicy.ts"
      - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
    services:
      - "CodingValidationRunner"
      - "ValidationCommandSelector"
      - "SafeCliRunner"
    database:
      migrations_required: false
  frontend:
    files:
      - "apps/web/src/features/visual-preview/previewChatMessages.ts"
    components:
      - "PreviewConversationPanel validation evidence rendering"
    routes: []
  workflow:
    graph_nodes: []
    agents:
      - "Validation agent in later phase consumes the result contract."
  tests:
    unit:
      - "packages/shared/test/codingValidation.test.mjs"
      - "apps/server/test/codingValidationRunner.test.mjs"
      - "apps/server/test/validationCommandSelector.test.mjs"
      - "apps/server/test/safeCliRunnerPolicy.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This SPEC is the final Phase 1 safety gate. It consumes structural patches from SPEC 90, validates them
    in an isolated candidate workspace and only lets the coding runtime apply patches after explicit pass/fail evidence.

  depends_on:
    - name: "Structural patch plan"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "this_spec_consumes_dependency"
      contract_used: "StructuralPatchPlan / CodeChangeSet"
      required_for: "Know exactly which candidate files and diffs must be validated."
      assumptions:
        - "SPEC 90 compiles structural patches into CodeChangeSet-compatible operations."
      failure_modes:
        - "Validation runs against different content than the patch eventually applied."
      fallback_or_recovery: "Use candidate workspace produced from exact patch operations and verify patch hash before apply."
      verification:
        - "apps/server/test/codingValidationRunner.test.mjs"

    - name: "Safe CLI runner"
      type: "internal_module"
      owner: "apps/server/infrastructure/tools"
      direction: "this_spec_consumes_dependency"
      contract_used: "SafeCliRunner.executeWithOptions, CliCommandPolicy"
      required_for: "Execute validation commands with allowlist, timeout, env isolation and cancellation."
      assumptions: []
      failure_modes:
        - "Unsafe command execution leaks secrets, hangs processes or mutates host state."
      fallback_or_recovery: "Reject command and mark validation failed/rejected with policy reason."
      verification:
        - "apps/server/test/safeCliRunnerPolicy.test.mjs"

    - name: "Project command catalog"
      type: "internal_module"
      owner: "apps/server/infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "HorusProjectConfig.commandCatalog"
      required_for: "Select deterministic validation commands per project."
      assumptions: []
      failure_modes:
        - "Runner misses project-specific typecheck/test commands."
      fallback_or_recovery: "If no deterministic commands exist, return skipped status with reason and require AST validation at minimum."
      verification:
        - "apps/server/test/validationCommandSelector.test.mjs"

  depended_on_by:
    - name: "CodingRuntimeOrchestrator"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "CodingValidationResult"
      compatibility_obligation: "Result must be deterministic, replayable and terminal for the validation step."
      expected_consumer_behavior: "Apply patch only when validation result passes required gates."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/codingRuntimeOrchestrator.test.mjs"

    - name: "Preview chat UI"
      type: "frontend_component"
      owner: "apps/web/features/visual-preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Validation evidence summary"
      compatibility_obligation: "Existing chat failures remain renderable; validation details are additive."
      expected_consumer_behavior: "Show command status, failed gate and retry/copy details affordances."
      migration_or_notification_required: false
      verification:
        - "pnpm --filter @u-build/web test:guards"

  data_flow:
    inbound:
      - source: "Patch planner"
        payload_or_state: "StructuralPatchPlan and candidate CodeChangeSet"
        validation: "Patch hash, file preconditions and AST diagnostics."
    outbound:
      - target: "Coding runtime"
        payload_or_state: "pass/fail/skipped validation result with command evidence"
        compatibility: "Failure reasons are typed and user-visible."
      - target: "CodeChangeSet validation"
        payload_or_state: "CodeChangeValidationCommand[]"
        compatibility: "Preserve existing validation array semantics."

  integration_risks:
    - risk: "Validation gives false green because root scripts do not cover target package."
      severity: "high"
      mitigation: "Select commands from project config and package-local scripts; include skipped reason when unavailable."
    - risk: "Validation command hangs or leaks secrets."
      severity: "critical"
      mitigation: "SafeCliRunner timeout, process group kill and allowlisted child env only."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Validation is required before patch apply."
    - "Command execution is deny-by-default."
    - "Validation must run in an isolated candidate workspace when possible."
    - "AST validation must run before lint/typecheck/test."
    - "Skipped validation must be explicit and policy-approved."
  project_specific:
    - "Reuse SafeCliRunner and CliCommandPolicy; do not create a second command runner."
    - "Preserve existing CodeChangeSet validation command schema."
    - "Do not inherit the full process.env into child processes."
```

## 8. Contracts and Invariants

```yaml
contracts:
  domain_contracts:
    - name: "Validation gate result"
      producer: "CodingValidationRunner"
      consumers:
        - "CodingRuntimeOrchestrator"
        - "Preview chat UI"
        - "CodeChangeSetPreflightService"
      invariant: "A failed required gate prevents patch apply."
    - name: "Command policy"
      producer: "CliCommandPolicy"
      consumers:
        - "SafeCliRunner"
        - "CodingValidationRunner"
      invariant: "Only allowlisted executables and project-root cwd are executable."
  data_contracts:
    - name: "Validation evidence"
      producer: "CodingValidationRunner"
      consumers:
        - "CodeChangeSet validation"
        - "Coding task events"
      migration_required: false
      compatibility_notes: "Evidence extends current CodeChangeValidationCommand format without breaking old consumers."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current validation and command runners"
    agent: "repo_explorer"
    action: "Read SafeCliRunner, CliCommandPolicy, ProjectExecutionService, PreflightService and quality gate."
    expected_output: "Current validation guarantees and gaps."
  - step: 2
    name: "Define validation contracts"
    agent: "backend_specialist"
    action: "Add shared CodingValidation schemas for plan, gate, command evidence and result."
    expected_output: "Shared contract tests."
  - step: 3
    name: "Implement command selector"
    agent: "backend_specialist"
    action: "Choose lint/typecheck/test/build/check commands from project config with deterministic priority."
    expected_output: "Selector tests for Vite/React, Node backend and no-command projects."
  - step: 4
    name: "Implement validation runner"
    agent: "backend_specialist"
    action: "Run AST validation, candidate workspace validation and SafeCliRunner commands with cancellation."
    expected_output: "Runner tests for pass, fail, rejected, timeout, aborted and skipped."
  - step: 5
    name: "Connect validation to coding runtime"
    agent: "architect"
    action: "Make SPEC 87 runtime block apply unless validation result passes."
    expected_output: "Orchestrator tests covering validation failure."
  - step: 6
    name: "Validate"
    agent: "qa_specialist"
    action: "Run shared/server build and focused validation tests."
    expected_output: "Validation evidence and any command policy changes documented."
```

## 10. Pseudo-Code

```ts
interface CodingValidationPort {
  validate(input: {
    patch: StructuralPatchPlan;
    projectRoot: string;
    signal: AbortSignal;
  }): Promise<CodingValidationResult>;
}

class CodingValidationRunner implements CodingValidationPort {
  async validate(input: ValidationInput): Promise<CodingValidationResult> {
    const ast = await this.astGate.validate(input.patch);
    if (!ast.passed) return fail("ast", ast);

    const candidateRoot = await this.workspace.createCandidate(input.projectRoot, input.patch);
    const commands = await this.selector.select(candidateRoot);
    const runs = await this.safeRunner.runAll(commands, { signal: input.signal });
    return summarize(ast, runs);
  }
}
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Validation runner returns passed, failed, rejected, timed_out, aborted or skipped states with evidence."
    - "Failed required gates prevent patch apply."
    - "Cancellation terminates running validation commands and updates task state."
  integration:
    - "Runner validates the same candidate patch that will be applied."
    - "Existing CodeChangeSet validation arrays remain populated for compatibility."
  architectural:
    - "No arbitrary shell execution is introduced."
    - "No validation command inherits unfiltered environment secrets."
  quality:
    - "Tests cover command selection, policy rejection, timeout, abort, failure and skipped validation."
  observability:
    - "Validation events include command id, duration, status, exit code and bounded output tail."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate validation contracts."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate runner and command policy integration."
      success_condition: "Exit code 0."
    - command: "node --test packages/shared/test/codingValidation.test.mjs apps/server/test/codingValidationRunner.test.mjs apps/server/test/validationCommandSelector.test.mjs apps/server/test/safeCliRunnerPolicy.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate validation runner behavior."
      success_condition: "All tests pass."
```

## 13. Error Mitigation And Handoff Rules

```yaml
error_mitigation:
  - "If no validation command exists, mark runtime validation skipped with explicit reason and keep AST validation mandatory."
  - "If a command is rejected by policy, do not rerun it through shell; surface rejected status."
  - "If timeout occurs, kill process group and record timed_out evidence."
  - "If validation output contains secrets, redact before persistence/display."

handoff_output_contract:
  - "List supported validation command kinds."
  - "Report policy changes to allowed executables or dangerous patterns."
  - "Report commands run, exit codes and failure classifications."
```

## 14. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T22:00:00Z"
implemented_by: "Codex"
summary: |
  Implemented the Phase 1 runtime validation and command-policy gate. Horus now has shared
  CodingValidation contracts, deterministic validation command selection, a runtime validation runner
  that validates the exact candidate workspace produced from the structural patch, SafeCliRunner-backed
  command execution, bounded/redacted command evidence, explicit skipped validation semantics and a
  patch applier that refuses to write when runtime validation failed.

implemented_files:
  shared:
    - "packages/shared/src/entities/CodingValidation.ts"
    - "packages/shared/src/index.ts"
  application:
    - "apps/server/src/application/ports/CodingValidationPort.ts"
    - "apps/server/src/application/ports/index.ts"
    - "apps/server/src/application/coding/ValidationCommandSelector.ts"
    - "apps/server/src/application/coding/CodingValidationRunner.ts"
    - "apps/server/src/application/coding/CodingPatchApplier.ts"
    - "apps/server/src/application/coding/CodingRuntimeOrchestrator.ts"
  infrastructure:
    - "apps/server/src/infrastructure/code/CodeChangeSetValidationWorkspace.ts"
    - "apps/server/src/infrastructure/tools/SafeCliValidationCommandRunner.ts"
    - "apps/server/src/infrastructure/http/server.ts"
  tests:
    - "packages/shared/test/codingValidation.test.mjs"
    - "apps/server/test/codingValidationRunner.test.mjs"
    - "apps/server/test/validationCommandSelector.test.mjs"
    - "apps/server/test/safeCliRunnerPolicy.test.mjs"
    - "apps/server/test/codingPatchApplier.test.mjs"
    - "apps/server/test/codingRuntimeOrchestrator.test.mjs"

supported_validation_command_kinds:
  - "type_check"
  - "check"
  - "test"
  - "build"
  - "lint"

runtime_safety:
  - "Runtime validation uses a copied candidate workspace and applies the exact StructuralPatchPlan-derived CodeChangeSet there before commands run."
  - "Commands execute through SafeCliRunner and CliCommandPolicy only."
  - "No arbitrary user shell command path was introduced."
  - "Network transfer executables remain blocked by existing policy."
  - "Validation output is bounded by SafeCliRunner and secret-like output is redacted before persistence."
  - "CodingRuntimeOrchestrator now stops before patch apply when a step artifact is failed."

important_limits:
  - "Browser/visual smoke validation remains out of scope for SPEC 91."
  - "If no deterministic validation command exists, runtime validation is explicitly skipped and apply may proceed after AST validation."
  - "The existing CodeChangeSetPreflightService remains compatible and was not replaced in this slice."

validation:
  passed:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/codingValidation.test.mjs"
    - "node --test apps/server/test/codingValidationRunner.test.mjs apps/server/test/validationCommandSelector.test.mjs apps/server/test/safeCliRunnerPolicy.test.mjs apps/server/test/codingPatchApplier.test.mjs apps/server/test/codingRuntimeOrchestrator.test.mjs"
    - "node --test packages/shared/test/structuralPatch.test.mjs packages/shared/test/codingRuntime.test.mjs packages/shared/test/codeChangeSetSchema.test.mjs apps/server/test/astPatchPlanner.test.mjs apps/server/test/astPatchValidationGate.test.mjs apps/server/test/codeChangeSetRollback.test.mjs apps/server/test/projectCodeChangeSetApplier.test.mjs apps/server/test/codeChangeSetPreflightService.test.mjs apps/server/test/safeCliRunner.test.mjs apps/server/test/codingRuntimeAstIntegration.test.mjs"
    - "pnpm --filter @u-build/web test:guards"
```
