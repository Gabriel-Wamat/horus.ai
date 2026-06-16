---
format_version: "agentic_sdd.v1"
task_id: "feature-78-production-readiness-p0-remediation"
title: "Production Readiness P0 Remediation"
created_at_utc: "2026-05-28T14:57:32Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "in_progress"
depends_on:
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "spec/features/65-event-sourced-chat-and-progress-streaming.md"
  - "spec/features/73-workflow-chat-memory-contract-spine.md"
  - "spec/features/74-error-taxonomy-and-recovery-engine.md"
  - "spec/features/75-monolith-decomposition.md"
  - "spec/features/76-durable-restart-and-chaos-validation.md"
  - "spec/features/77-production-observability-and-release-hygiene.md"
---

# 78 - Production Readiness P0 Remediation

## 1. Original User Request

```yaml
raw_user_request: |
  após isso, use a skill de spec e crie um planejamento para resolver, após criar a spec, inicie
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar uma SPEC executável para resolver os bloqueadores críticos e altos da auditoria técnica
  production-grade feita antes da fase 77, sem sobrescrever a SPEC 77 existente. A implementação
  deve começar imediatamente pelos riscos P0/P1 de menor ambiguidade e maior impacto: contrato
  Postgres/shared para status de workflow, segurança de ambiente em processos de Preview, gates
  de teste/lint que dão falso verde e documentação operacional dos próximos cortes.

expected_user_visible_result: |
  O projeto passa a ter um plano local versionado para remediação production-grade e uma primeira
  fatia implementada, com evidências de validação reais.

expected_engineering_result: |
  Contratos de persistência mais seguros, Preview sem herança indiscriminada de secrets, testes
  focados cobrindo regressões críticas, README/CHANGELOG de specs atualizados e backlog P0/P1
  sequenciado para execução posterior.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "O Horus.AI ainda não pode ser tratado como produto final por riscos de segurança, concorrência, persistência, release e qualidade."
  target_user: "Desenvolvedores e operadores do Horus.AI que precisam executar workflows agênticos com segurança e previsibilidade."
  expected_outcome: "Reduzir os bloqueadores que impedem o sistema de evoluir para produção."
  product_surface:
    - "API backend Express"
    - "LangGraph workflow runtime"
    - "Preview runtime"
    - "Postgres persistence"
    - "Local file persistence"
    - "CI/release gates"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph"
      - "node:test"
    frontend:
      - "React"
      - "Vite"
      - "Vitest guard tests"
    database:
      - "Postgres SQL migrations"
      - "File repositories for local/dev mode"
    infrastructure:
      - "pnpm"
      - "Turbo"
      - "local-only spec folder"
  known_entrypoints:
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/preview/ProcessBrowserPreviewAdapter.ts"
    - "apps/server/src/infrastructure/database/migrate.ts"
  known_existing_patterns:
    - "Specs live under spec/features with README and CHANGELOG updates."
    - "Focused regression tests live under apps/server/test and import from dist after build."
    - "Shared contracts live in packages/shared/src and must remain the source of truth."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add a Postgres migration that aligns workflow_states.status with the shared WorkflowStatus contract."
    - "Add schema tests proving the migration accepts completed_unverified, failed_validation and blocked."
    - "Prevent Preview child processes from inheriting arbitrary process.env secrets by default."
    - "Add focused tests proving Preview env inheritance is allowlisted."
    - "Fix the broken docs theme contract found by the audit."
    - "Document the remaining P0/P1 production readiness sequence in this SPEC."
  out_of_scope:
    - "Full authentication/RBAC/tenant implementation."
    - "Full CI/CD and Docker implementation."
    - "Full file repository locking implementation."
    - "Full LLM gateway with circuit breaker and cost budgets."
    - "Large-scale frontend monolith decomposition."
    - "Cloud deployment."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/database/migrations/012_workflow_state_status_contract.sql"
      - "apps/server/src/infrastructure/preview/ProcessBrowserPreviewAdapter.ts"
      - "apps/server/test/postgresSchema.test.mjs"
      - "apps/server/test/processBrowserPreviewAdapter.test.mjs"
    services:
      - "PostgresWorkflowStateRepository"
      - "WorkflowStatePersister"
      - "ProcessBrowserPreviewAdapter"
    database:
      migrations_required: true
      tables:
        - "workflow_states"
  frontend:
    files: []
    components: []
    routes: []
  workflow:
    graph_nodes:
      - "WorkflowOrchestrator persistence boundary"
    agents: []
  docs:
    files:
      - "apps/docs/lib/theme-config.ts"
      - "apps/docs/__tests__/theme-config.test.ts"
  tests:
    unit:
      - "apps/server/test/postgresSchema.test.mjs"
      - "apps/server/test/processBrowserPreviewAdapter.test.mjs"
      - "apps/docs/__tests__/theme-config.test.ts"
    integration:
      - "pnpm test"
      - "pnpm --filter @u-build/docs test -- --run"
    e2e: []
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec tightens production-critical contracts at the boundaries where workflow state,
    child processes, docs gates and release validation connect. It deliberately starts with
    changes that reduce real production risk without requiring a full auth/tenant/CI rewrite.

  depends_on:
    - name: "WorkflowStatusSchema"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "WorkflowStatus union"
      required_for: "Postgres workflow_states.status constraint must match shared runtime statuses."
      assumptions: []
      failure_modes:
        - "Runtime can produce a status that Postgres rejects."
      fallback_or_recovery: "Migration must preserve existing rows and expand accepted statuses."
      verification:
        - "node --test apps/server/test/postgresSchema.test.mjs"

    - name: "Preview command catalog"
      type: "backend_service"
      owner: "apps/server/infrastructure/preview"
      direction: "this_spec_consumes_dependency"
      contract_used: "NormalizedCliCommandSpec.env"
      required_for: "Preview child processes still need explicit command env."
      assumptions: []
      failure_modes:
        - "Generated preview process cannot find PATH or package manager binary."
        - "Secrets leak if full process.env is inherited."
      fallback_or_recovery: "Default env allowlist plus explicit command env override."
      verification:
        - "node --test apps/server/test/processBrowserPreviewAdapter.test.mjs"

    - name: "Docs theme config"
      type: "frontend_component"
      owner: "apps/docs"
      direction: "this_spec_consumes_dependency"
      contract_used: "siteConfig.logo"
      required_for: "Docs tests must stop failing outside the root test gate."
      assumptions: []
      failure_modes:
        - "Docs package remains broken while root tests pass."
      fallback_or_recovery: "Add the missing theme contract and include focused docs validation."
      verification:
        - "pnpm --filter @u-build/docs test -- --run"

  depended_on_by:
    - name: "WorkflowOrchestrator"
      type: "backend_service"
      owner: "apps/server/domain"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Durable WorkflowState persistence accepts all terminal statuses."
      compatibility_obligation: "Must preserve existing statuses and only add accepted values."
      expected_consumer_behavior: "Persist terminal validation states without silent DB rejection."
      migration_or_notification_required: true
      verification:
        - "pnpm test"

    - name: "PreviewRuntimeManager"
      type: "backend_service"
      owner: "apps/server/infrastructure/preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Preview start spawns process with redacted inherited env."
      compatibility_obligation: "Must preserve explicit command.env behavior."
      expected_consumer_behavior: "Preview command runs with safe baseline env only."
      migration_or_notification_required: false
      verification:
        - "node --test apps/server/test/processBrowserPreviewAdapter.test.mjs"

  bidirectional_integrations:
    - name: "Workflow state shared contract and Postgres schema"
      participants:
        - "packages/shared/src/entities/WorkflowState.ts"
        - "apps/server/src/infrastructure/database/migrations"
      shared_contract: "WorkflowStatus"
      consistency_rule: "Every shared WorkflowStatus value must be valid in workflow_states.status."
      verification:
        - "Schema regression test scans SQL for all required statuses."

  data_flow:
    inbound:
      - source: "LangGraph workflow state"
        payload_or_state: "WorkflowStatus and WorkflowState"
        validation: "WorkflowStateSchema before repository save"
      - source: "Preview command catalog"
        payload_or_state: "NormalizedCliCommandSpec"
        validation: "PreviewCommandResolver and executable allowlist"
    outbound:
      - target: "Postgres workflow_states"
        payload_or_state: "WorkflowState JSON and status column"
        persistence: "SQL migration + repository save"
      - target: "Preview child process"
        payload_or_state: "safe inherited env + explicit command env"
        persistence: "none"
```

## 7. Architecture and Coding Rules

```yaml
architecture_rules:
  - "Do not introduce broad rewrites while fixing P0 contracts."
  - "Shared package contracts remain the source of truth for workflow status names."
  - "Infrastructure may adapt contracts, but must not silently narrow domain states."
  - "Child process execution must use explicit env allowlists."
  - "All new behavior must have focused regression coverage."
  - "Do not expose secret values in test names, logs, errors, specs or final summaries."

coding_rules:
  - "Use apply_patch for manual edits."
  - "Keep implementation changes small and auditable."
  - "Avoid adding new dependencies for this initial slice."
  - "Preserve existing public APIs unless the spec explicitly requires a contract extension."
  - "Use ASCII text in new files."
```

## 8. Execution Plan

```yaml
execution_plan:
  phase_1_initial_slice:
    status: "in_progress"
    tasks:
      - "Create SPEC 78 and update spec index/changelog."
      - "Add Postgres migration 012 for workflow_states.status."
      - "Extend postgres schema regression tests."
      - "Harden ProcessBrowserPreviewAdapter env inheritance."
      - "Add Preview env inheritance regression test."
      - "Fix docs theme config contract."
      - "Run focused validations."

  phase_2_security_boundary:
    status: "planned"
    tasks:
      - "Introduce AuthBoundary abstraction."
      - "Add tenant/request context model."
      - "Add route-level authorization and rate limits."
      - "Make CORS fail closed in production."
      - "Add secret scanning gate."

  phase_3_concurrency_and_outbox:
    status: "planned"
    tasks:
      - "Add lease TTL semantics to file and Postgres outbox claim."
      - "Mark file driver as dev-only unless lock provider is configured."
      - "Add concurrent claim regression tests."
      - "Move projection persistence toward awaited/outbox-backed semantics."

  phase_4_release_and_observability:
    status: "planned"
    tasks:
      - "Fold SPEC 77 work into a real release gate."
      - "Add structured logger, correlation IDs and health readiness checks."
      - "Add complete root test/lint scripts."
      - "Add dependency audit and outdated budget."
```

## 9. Contracts, Invariants and Compatibility

```yaml
contracts:
  workflow_status_db_contract:
    invariant: "workflow_states.status must accept every WorkflowStatusSchema value."
    compatible_values:
      - "idle"
      - "running"
      - "awaiting_human"
      - "completed"
      - "completed_unverified"
      - "failed_validation"
      - "blocked"
      - "cancelled"
      - "error"

  preview_env_contract:
    invariant: "Preview child processes inherit only an allowlisted base env plus explicit command env."
    forbidden_by_default:
      - "OPENAI_API_KEY"
      - "DATABASE_URL"
      - "ANTHROPIC_API_KEY"
      - "HORUS_SECRET_*"
    required_compatibility:
      - "PATH must remain available when present."
      - "Explicit command.env must still be passed through."

  docs_theme_contract:
    invariant: "siteConfig must satisfy the docs tests and theme expectations."
```

## 10. Validation

```yaml
validation:
  required_commands:
    - "pnpm --filter @u-build/server build"
    - "node --test apps/server/test/postgresSchema.test.mjs"
    - "node --test apps/server/test/processBrowserPreviewAdapter.test.mjs"
    - "pnpm --filter @u-build/docs test -- --run"
    - "pnpm test"
  acceptance_criteria:
    - "SPEC 78 is indexed and changelogged."
    - "Postgres migration 012 expands workflow_states.status without dropping data."
    - "Schema test proves all shared workflow terminal statuses are accepted by SQL."
    - "Preview process env no longer inherits arbitrary process.env secrets by default."
    - "Explicit command.env still works for Preview."
    - "Docs focused tests pass."
    - "Any remaining failure is reported with exact command and reason."
```

## 11. Error Mitigation Rules

```yaml
error_mitigation:
  - "If a validation command fails, inspect the first real failure instead of claiming success."
  - "If a migration cannot be validated against a live DB, add static schema regression coverage and document the limitation."
  - "Do not rotate or print the local OpenAI key; only report that rotation is required."
  - "Do not broaden this implementation into auth/tenant unless explicitly requested after this initial slice."
```

## 12. Output Contract

```yaml
agent_output_contract:
  implementation_summary:
    - "Files changed."
    - "P0/P1 issues started or resolved."
    - "Validation commands and results."
    - "Remaining production-readiness phases."
  forbidden_output:
    - "Secret values."
    - "Claims of full production readiness before auth, tenanting, CI, and concurrency are completed."
```

## Implementation Log

- 2026-05-28: Created SPEC 78 from the production audit, scoped the initial implementation slice, and began remediation.
- 2026-05-28: Added Postgres migration 012 for `workflow_states.status`, centralized child-process env allowlisting, hardened Preview process spawning against arbitrary env inheritance, fixed docs `siteConfig.logo`, and validated with focused server/docs/web guards plus full root test runs.
