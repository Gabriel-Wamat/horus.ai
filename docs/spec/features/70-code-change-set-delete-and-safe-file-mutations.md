---
format_version: "agentic_sdd.v1"
task_id: "feature-70-code-change-set-delete-and-safe-file-mutations"
title: "CodeChangeSet Delete And Safe File Mutation Semantics"
created_at_utc: "2026-05-27T23:58:00Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented"
depends_on:
  - "spec/features/22-chat-driven-agent-code-change-loop.md"
  - "spec/features/37-project-file-editing-persistence.md"
  - "spec/features/45-structured-agent-tools-no-shell.md"
  - "spec/features/47-validation-gates-true-success.md"
  - "spec/features/59-agentic-project-construction-reliability.md"
  - "spec/features/67-artifact-validation-self-healing-and-observability-control-plane.md"
  - "spec/features/69-release-hardening-and-orchestrator-modularization.md"
blocks:
  - "spec/features/71-agent-tool-runtime-governed-write-access.md"
---

# 70 - CodeChangeSet Delete And Safe File Mutation Semantics

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec para resolver esses problemas, se precisar crie mais de uma
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar uma SPEC executavel para corrigir a base de mutacao de arquivos do Horus antes de habilitar
  runtime ReAct com tools reais. O problema imediato e que CodeChangeSet suporta create/update, mas
  nao modela delete como operacao de primeira classe; preflight e applier assumem afterContent
  obrigatorio; e rollback/validacao precisam ser seguros para write/update/delete.

expected_user_visible_result: |
  Quando um agente precisar remover, criar ou atualizar arquivos de um projeto gerado, o workflow deve
  aplicar a alteracao correta, refletir o resultado no preview/chat, e nunca dizer que alterou algo se
  o patch nao foi aplicado.

expected_engineering_result: |
  CodeChangeSet passa a ter semantica transacional para create, update e delete. Preflight, applier,
  builders, repositorios, artifact control plane e testes entendem delete sem gambiarras de conteúdo
  vazio. Operacoes continuam root-scoped, rollback-safe, auditaveis e compativeis com os consumidores
  existentes.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O Horus precisa editar projetos de verdade. Sem delete/update/save consistentes, o chat pode aprovar trabalho que nao modifica o workspace ou nao consegue remover arquivos obsoletos."
  target_user: "Operador do Horus usando Preview chat, fluxo de construcao de projeto e Project Files para pedir alteracoes em projetos gerados."
  expected_outcome: "Mutacoes de arquivo viram contrato confiavel: create/update/delete, preflight seguro, apply atomico, rollback verificavel e feedback real para UI."
  product_surface:
    - "Preview chat code-change workflow"
    - "Project construction workflow"
    - "Project file browser/editor"
    - "CodeChangeSet artifact lineage"
    - "Curator approval/apply flow"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph StateGraph"
      - "WorkflowOrchestrator"
      - "CodeChangeSetPreflightService"
      - "ProjectCodeChangeSetApplier"
      - "ProjectFileBrowserService"
      - "ProjectExecutionService"
    frontend:
      - "React"
      - "Vite"
      - "PreviewConversationPanel"
      - "VisualPreviewConsole"
      - "Project Files UI"
    database:
      - "code_change_sets"
      - "agent_artifacts"
      - "workflow_events"
    infrastructure:
      - "file-mode persistence"
      - "Postgres persistence"
      - "generated project workspaces"
  known_entrypoints:
    - "packages/shared/src/entities/CodeChangeSet.ts"
    - "packages/shared/src/entities/ProjectConstruction.ts"
    - "apps/server/src/infrastructure/code/buildFrontendCodeChangeSet.ts"
    - "apps/server/src/infrastructure/code/buildGeneratedHtmlChangeSet.ts"
    - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
    - "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
    - "apps/server/src/infrastructure/code/FrontendChangeSetQualityGate.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/application/tools/registerProjectAgentTools.ts"
    - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
    - "apps/server/src/infrastructure/repositories/PostgresCodeChangeSetRepository.ts"
    - "apps/server/src/infrastructure/repositories/FileCodeChangeSetRepository.ts"
  known_existing_patterns:
    - "Shared schemas in packages/shared are the contract source of truth."
    - "CodeChangeSet is proposed by FrontAgent and applied only after Curator approval or deterministic gate approval."
    - "Preflight validates candidate changes before apply."
    - "Artifact control plane records candidates, validation evidence and apply traces."
    - "Generated project paths must remain relative to selected project root."
```

## 4. Observed Evidence

```yaml
observed_evidence:
  missing_delete_contract:
    - file: "packages/shared/src/entities/CodeChangeSet.ts"
      finding: "CodeChangeOperationSchema currently restricts changeType to create/update and requires afterContent as string."
    - file: "apps/server/src/infrastructure/code/buildFrontendCodeChangeSet.ts"
      finding: "Builder derives create/update from beforeContent and cannot represent a delete operation."
  applier_assumes_write:
    - file: "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
      finding: "Applier loops operations and always writes operation.afterContent to disk."
    - file: "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
      finding: "Preflight applies every operation by writing operation.afterContent before running validation."
  agent_prompt_has_delete_but_pipeline_does_not:
    - file: "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
      finding: "Project execution plan schema mentions operation write/delete, but CodeChangeSet conversion narrows frontend operations to full afterContent writes."
  existing_safety_contracts_to_preserve:
    - file: "apps/server/src/infrastructure/code/FrontendChangeSetQualityGate.ts"
      finding: "Reachability and source syntax gates must continue to block disconnected or invalid frontend writes."
    - file: "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      finding: "Approved CodeChangeSets are persisted as curator_approved then applied; failed apply emits validation evidence and error."
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Add delete as a first-class CodeChangeSet operation."
    - "Represent create/update/delete with typed payload rules instead of nullable guessing."
    - "Update all builders, preflight, quality gate and applier paths that assume afterContent."
    - "Guarantee rollback restores deleted files and removes created files after partial failure."
    - "Guarantee path safety for create/update/delete: root-scoped, no absolute path, no escape, no .git, no sensitive files, no symlink writes/deletes."
    - "Persist and reload delete operations in file-mode and Postgres repositories without schema ambiguity."
    - "Emit accurate patch_applied and validation evidence for delete operations."
    - "Add focused unit/integration tests for create/update/delete, preflight, rollback, repository roundtrip and workflow apply."
  out_of_scope:
    - "Enable ReAct tool mode for agents. That is feature 71."
    - "Give agents arbitrary shell access."
    - "Change visual design, docs frontend, or public README."
    - "Replace LangGraph or WorkflowOrchestrator."
    - "Change generated project business logic beyond tests needed for mutation semantics."
    - "Add external queue, sandbox vendor, or cloud service."
```

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/CodeChangeSet.ts"
      - "apps/server/src/infrastructure/code/buildFrontendCodeChangeSet.ts"
      - "apps/server/src/infrastructure/code/buildGeneratedHtmlChangeSet.ts"
      - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
      - "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
      - "apps/server/src/infrastructure/code/FrontendChangeSetQualityGate.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/repositories/PostgresCodeChangeSetRepository.ts"
      - "apps/server/src/infrastructure/repositories/FileCodeChangeSetRepository.ts"
    services:
      - "CodeChangeSetPreflightService"
      - "ProjectCodeChangeSetApplier"
      - "FrontendChangeSetQualityGate"
      - "WorkflowOrchestrator code-change lifecycle"
    database:
      migrations_required: false
      tables:
        - "code_change_sets"
        - "agent_artifacts"
        - "workflow_events"
  frontend:
    files:
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/features/project-files/*"
    components:
      - "Preview chat progress"
      - "Project Files tree/editor"
    routes:
      - "?mode=preview"
      - "?mode=files"
  workflow:
    graph_nodes:
      - "frontAgent"
      - "curatorAgent"
    agents:
      - "Front Agent"
      - "Curator Agent"
  tests:
    unit:
      - "packages/shared/test/codeChangeSetSchema.test.mjs"
      - "apps/server/test/projectCodeChangeSetApplier.test.mjs"
      - "apps/server/test/codeChangeSetPreflight.test.mjs"
    integration:
      - "apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
      - "apps/server/test/projectAgentTools.test.mjs"
    e2e:
      - "Preview chat smoke for applied delete/update/create"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    CodeChangeSet is the handoff object between FrontAgent output, Curator validation, artifact lineage,
    persistence repositories, preflight, final apply, workflow events, chat projection and Project Files.
    This spec changes that contract, so every consumer must be updated in one coordinated pass.

  depends_on:
    - name: "Shared CodeChangeSet schema"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "CodeChangeSetSchema and CodeChangeOperationSchema"
      required_for: "All backend repositories and workflow services parse CodeChangeSets from this schema."
      assumptions: []
      failure_modes:
        - "Existing persisted CodeChangeSets fail to parse if backward compatibility is broken."
        - "Delete operations are silently misclassified as update if schema is not discriminated."
      fallback_or_recovery: "Keep create/update parsing backward-compatible; add schema tests for old fixtures."
      verification:
        - "node --test packages/shared/test/*.test.mjs"

    - name: "CodeChangeSet persistence repositories"
      type: "backend_service"
      owner: "apps/server infrastructure repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "save(changeSet), listByWorkflow(threadId)"
      required_for: "Curator approval and apply lifecycle must read/write delete operations intact."
      assumptions:
        - "Postgres stores operations as JSON payload and likely does not need migration, but implementation must verify."
      failure_modes:
        - "Delete operation loses null beforeContent/afterContent data."
        - "File-mode and Postgres serialize different shapes."
      fallback_or_recovery: "Add repository roundtrip tests for both file and Postgres schema integrity."
      verification:
        - "node --test apps/server/test/postgresSchema.test.mjs"
        - "node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"

    - name: "Project root resolution"
      type: "backend_service"
      owner: "project runtime"
      direction: "this_spec_consumes_dependency"
      contract_used: "frontendProjectRootPath and project.rootPath"
      required_for: "Preflight/apply must mutate only the selected project workspace."
      assumptions: []
      failure_modes:
        - "Wrong selected project receives a delete."
        - "Path escape deletes a host file."
      fallback_or_recovery: "Abort before mutation when project root or relative path validation fails."
      verification:
        - "Unit tests for absolute path, ../ path and symlink path rejection."

  depended_on_by:
    - name: "WorkflowOrchestrator code-change lifecycle"
      type: "workflow"
      owner: "apps/server domain"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "proposed -> curator_approved -> applied|failed CodeChangeSet status lifecycle"
      compatibility_obligation: "must preserve statuses and extend operation semantics without breaking existing flows"
      expected_consumer_behavior: "Apply approved create/update/delete operations atomically and emit patch_applied only after disk success."
      migration_or_notification_required: false
      verification:
        - "node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"

    - name: "Artifact control plane"
      type: "backend_service"
      owner: "apps/server application/infrastructure"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "CodeChangeSet candidate, apply trace and runtime evidence payloads"
      compatibility_obligation: "must preserve candidate IDs and include delete paths in evidence"
      expected_consumer_behavior: "Record delete operations as normal candidate operations with accurate file paths."
      migration_or_notification_required: false
      verification:
        - "Focused artifact candidate tests if affected."

    - name: "Preview chat and activity UI"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "workflow events, patch_applied filePaths, chat progress messages"
      compatibility_obligation: "must not claim success before apply; deleted files should appear in applied filePaths"
      expected_consumer_behavior: "Show applied/failed terminal state based on backend evidence."
      migration_or_notification_required: false
      verification:
        - "pnpm --filter @u-build/web test:guards"
        - "Browser smoke on Preview chat after delete/update request"

  bidirectional_integrations:
    - name: "Preflight/apply transaction"
      participants:
        - "CodeChangeSetPreflightService"
        - "ProjectCodeChangeSetApplier"
      shared_contract: "Operation semantics and rollback metadata"
      consistency_rule: "Any operation accepted by preflight must be executable by applier with the same path/content/delete semantics."
      verification:
        - "Shared test fixture reused by preflight and applier tests."

  data_flow:
    inbound:
      - source: "FrontAgent output"
        payload_or_state: "operations with targetPath, operation intent and content"
        validation: "Zod schema, path validation, payload validation and quality gate"
      - source: "Generated HTML fallback"
        payload_or_state: "create operation for generated/horus/*.html"
        validation: "Existing generated artifact path rules"
    outbound:
      - target: "Project workspace filesystem"
        payload_or_state: "create/update/delete file operations"
        compatibility: "Only selected project root can be mutated"
      - target: "Workflow events and chat projection"
        payload_or_state: "patch_applied or failed validation evidence"
        compatibility: "Existing event consumers must continue to parse old events"

  sequencing_dependencies:
    - dependency: "Spec 69 preflight isolation"
      reason: "Delete support is risky if preflight still mutates the real project root directly."
      validation: "Preflight tests must prove candidate operations run in an isolated temp workspace or equivalent sandbox before final apply."
    - dependency: "Shared schema update before server implementation"
      reason: "Backend TypeScript cannot safely compile if CodeChangeSet operation shape changes after consumers."
      validation: "packages/shared build passes before server build."

  integration_risks:
    - risk: "Backward-incompatible parsing of old CodeChangeSets"
      severity: "high"
      mitigation: "Keep old create/update shape valid and add fixture tests."
    - risk: "Delete path applies to wrong project"
      severity: "critical"
      mitigation: "Require project root resolution and relative path safety at preflight and apply."
    - risk: "Rollback does not restore deleted file after partial apply"
      severity: "critical"
      mitigation: "Capture beforeContent before any operation and test mixed create/update/delete rollback."
```

## 8. Required Architecture Rules

```yaml
architecture_rules:
  - "packages/shared schema changes must happen before backend consumers."
  - "Use discriminated operation semantics; do not infer delete from empty strings."
  - "Every mutating operation must be relative to selected project root."
  - "Do not allow writes/deletes to .git, .env, key/cert/credential files, node_modules, dist, build, coverage, or ignored runtime state."
  - "Do not emit patch_applied until disk mutation has succeeded."
  - "Preflight must not leave project workspace changed."
  - "Rollback must restore all files touched before failure."
  - "Delete must be auditable with beforeContent or equivalent restoration metadata."
  - "Existing create/update CodeChangeSets must remain parseable."
```

## 9. Detailed Execution Plan

```yaml
execution_plan:
  phase_1_schema:
    owner: "backend/shared agent"
    steps:
      - "Replace flat CodeChangeOperationSchema with a discriminated or refined union."
      - "Define create/update operations with afterContent:string and beforeContent nullable."
      - "Define delete operation with beforeContent nullable and afterContent null."
      - "Export operation type helpers if needed: isDeleteOperation, isWriteOperation."
      - "Add shared tests for legacy create/update and new delete fixtures."

  phase_2_builders:
    owner: "backend agent"
    steps:
      - "Update FrontendFileOperationPlan to include operation intent."
      - "Map FrontAgent delete output to CodeChangeSet delete operation."
      - "Keep generated HTML fallback as create operation."
      - "Generate meaningful delete diff: diff --git, deleted file mode if available, old lines removed, /dev/null target."
      - "Ensure diff string remains non-empty for all operations."

  phase_3_preflight:
    owner: "backend agent"
    steps:
      - "Apply create/update/delete to isolated validation workspace."
      - "For delete, remove file only inside isolated workspace."
      - "Capture and restore beforeContent metadata for all touched files."
      - "Run quality gate and command validation against isolated candidate state."
      - "Return runtimeEvidence with operation paths and delete status."

  phase_4_applier:
    owner: "backend agent"
    steps:
      - "Plan all operations first and validate paths before mutating any file."
      - "Capture beforeContent for rollback."
      - "Apply operations sequentially: create/update write afterContent; delete unlink file."
      - "On failure, rollback reverse order."
      - "Persist appliedAt only when every operation succeeds."
      - "Persist failed status and failedReason if quality gate rejects."

  phase_5_consumers:
    owner: "backend/frontend agent"
    steps:
      - "Update workflow apply evidence to include delete paths."
      - "Update Project Files refresh behavior if deleted file is open in editor."
      - "Ensure Preview chat progress does not display stale success for failed deletes."
      - "Keep old event payloads parseable."

  phase_6_validation:
    owner: "qa agent"
    steps:
      - "Run shared schema tests."
      - "Run applier/preflight tests."
      - "Run workflow CodeChangeSet lifecycle tests."
      - "Run server build and web guard tests."
      - "Perform one browser smoke if implementation touches Preview UI."
```

## 10. Validation Commands

```yaml
validation_commands:
  required:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/*.test.mjs"
    - "node --test apps/server/test/projectCodeChangeSetApplier.test.mjs"
    - "node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
    - "node --test apps/server/test/postgresSchema.test.mjs"
    - "pnpm --filter @u-build/web test:guards"
    - "git diff --check"
  conditional:
    - "Browser smoke on http://localhost:5174/?mode=preview when Preview UI behavior changes."
    - "Postgres migration smoke only if repository storage shape changes."
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  - "CodeChangeSet accepts create, update and delete operations with explicit payload rules."
  - "Existing create/update CodeChangeSet fixtures still parse."
  - "Delete operation can remove a file in selected project root after Curator/deterministic approval."
  - "Delete operation cannot remove absolute, escaped, sensitive, git metadata or symlink paths."
  - "Preflight validates delete without leaving the real project changed."
  - "Applier rollback restores deleted files and removes created files after partial failure."
  - "patch_applied event includes deleted file paths only after successful disk mutation."
  - "Project Files and Preview chat do not show stale success when apply fails."
  - "All required validation commands pass."
```

## 12. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  - "Do not claim delete support until a test proves an actual file was removed."
  - "Do not use shell rm in implementation tests; exercise the applier/service contracts."
  - "Do not weaken path validation to make tests pass."
  - "Do not bypass quality gate for delete operations."
  - "Do not modify unrelated specs, docs app, README, visual styles or generated project workspaces."
  - "If persisted old fixtures fail to parse, add compatibility transform or schema union instead of deleting old data."
  - "If a command requires external services, replace it with deterministic local fixture tests."
```

## 13. Minimal Output Contract For Implementing Agent

```yaml
implementation_output_contract:
  must_report:
    - "Files changed."
    - "Schema contract changes."
    - "Delete operation behavior."
    - "Rollback behavior."
    - "Validation commands and results."
    - "Any skipped browser/Postgres checks and why."
  must_not_report:
    - "Success without test evidence."
    - "Runtime ReAct tool parity; that belongs to feature 71."
```

## 14. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T00:04:24Z"
status: "implemented"
summary:
  - "CodeChangeSet now has explicit create/update/delete operation semantics."
  - "Front Agent CodeChangeSet builders can emit delete operations with auditable diffs."
  - "Preflight applies candidate operations inside an isolated temporary workspace and removes it after validation."
  - "ProjectCodeChangeSetApplier plans all operations, rejects unsafe paths, applies delete/write operations, and rolls back partial failure."
  - "Frontend quality and visual gates skip deleted content while evaluating candidate state."
  - "Focused schema, builder, preflight, applier, workflow, project-tool, Postgres schema, and web guard tests passed."
validation_evidence:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "node --test packages/shared/test/*.test.mjs"
  - "node --test apps/server/test/buildFrontendCodeChangeSet.test.mjs apps/server/test/frontendChangeSetQualityGate.test.mjs apps/server/test/projectCodeChangeSetApplier.test.mjs apps/server/test/codeChangeSetPreflightService.test.mjs"
  - "node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs apps/server/test/projectAgentTools.test.mjs"
  - "node --test apps/server/test/postgresSchema.test.mjs"
  - "pnpm --filter @u-build/web test:guards"
  - "git diff --check"
out_of_scope_remaining:
  - "Runtime ReAct/tool parity remains feature 71."
```
