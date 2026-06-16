---
format_version: "agentic_sdd.v1"
task_id: "feature-47-validation-gates-true-success"
title: "Validation Gates And True Success Semantics"
created_at_utc: "2026-05-26T23:45:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented"
depends_on:
  - "spec/features/24-real-cli-capability-gate.md"
  - "spec/features/28-qa-preview-smoke-validation.md"
  - "spec/features/41-agentic-runtime-validation-observability.md"
  - "spec/features/42-agentic-execution-loop.md"
---

# 47 - Validation Gates And True Success Semantics

## 1. Original User Request

```yaml
raw_user_request: |
  minha preocupação é no 4, 5, 6, 8, 9 e 10. destrinche como podemos corrigir o projeto com base o que foi listar. e crie uma spec para cada cenário que expressei preocupação
concern_mapped_from_previous_answer: "10. Avaliação antes de afirmar sucesso"
```

## 2. System Interpretation

```yaml
system_translation: |
  Impedir que Horus, agentes ou UI afirmem sucesso sem validação explícita. Toda conclusão deve ter gates:
  schema, patch safety, build/typecheck/test quando disponível, preview smoke quando aplicável, QA e Curator.

expected_user_visible_result: |
  O usuário vê "concluído" apenas quando os checks passaram. Se não foi possível validar, Horus diz exatamente
  o que foi implementado e o que não foi validado.

expected_engineering_result: |
  A semântica de status passa a diferenciar completed, completed_unverified, failed_validation, blocked e failed.
  Final messages, run snapshots and UI status dependem de ValidationGateResult, não de texto do agente.
```

## 3. Current Project Fit

```yaml
verified_existing_surfaces:
  - "apps/server/src/infrastructure/code/FrontendChangeSetQualityGate.ts"
  - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
  - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
  - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
  - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
  - "packages/shared/src/entities/CodeChangeSet.ts"

good_existing_parts:
  - "FrontendChangeSetQualityGate exists."
  - "SafeCliRunner can execute allowlisted commands."
  - "Curator can fail based on CodeChangeSet quality."
  - "Tests already cover many command and code change paths."

gaps_to_fix:
  - "No single ValidationGateResult contract controls final status."
  - "Skipped validation can be indistinguishable from passed validation."
  - "Final assistant summary can overstate success."
  - "Preview/build/typecheck evidence is not uniformly required by run type."
```

## 4. Status Semantics

```yaml
run_statuses:
  completed:
    meaning: "All required gates for this run type passed."
  completed_unverified:
    meaning: "Changes were made or answer produced, but one or more gates were unavailable/skipped with explicit reason."
  failed_validation:
    meaning: "Implementation ran, but a required gate failed."
  blocked:
    meaning: "Run did not execute due to missing permission, missing context, or unsafe request."
  failed:
    meaning: "Unexpected infrastructure/model/tool error."

gate_statuses:
  - "pending"
  - "running"
  - "passed"
  - "failed"
  - "skipped"
  - "blocked"
```

## 5. Required Gates By Run Type

```yaml
required_gates:
  chat_answer:
    gates:
      - "grounding_check when answer references code"
    success_rule: "grounded or explicit ungrounded disclosure."
  code_change:
    gates:
      - "schema_valid"
      - "path_safety"
      - "quality_gate"
      - "apply_success"
      - "build_or_typecheck_if_catalog_exists"
      - "curator_verdict"
    success_rule: "All available required gates passed; skipped gates documented."
  project_construction:
    gates:
      - "workspace_created"
      - "manifest_valid"
      - "code_changes_applied"
      - "install_or_dependency_check_if_configured"
      - "build_or_typecheck"
      - "preview_smoke_if_frontend"
      - "qa_result"
      - "curator_verdict"
    success_rule: "No failed required gate and at least one runtime validation evidence."
```

## 6. Integration Context Map

```yaml
integration_context:
  depends_on:
    - name: "SafeCliRunner"
      type: "backend_service"
      contract_used: "controlled command evidence"
      required_for: "Run build/typecheck/test gates."
      failure_modes:
        - "Command unavailable or unsafe."
      fallback_or_recovery: "Gate skipped or blocked with reason, never passed."
      verification:
        - "Test unavailable command records skipped."
    - name: "CuratorAgent"
      type: "agent"
      contract_used: "Curator verdict"
      required_for: "Final approval."
      failure_modes:
        - "Curator approves despite failed required gate."
      fallback_or_recovery: "Validation aggregator overrides final status to failed_validation."
      verification:
        - "Test failed gate prevents completed even with positive curator text."

  depended_on_by:
    - name: "WorkflowOrchestrator"
      type: "workflow"
      contract_exposed: "ValidationGateResult[] and finalRunStatus"
      compatibility_obligation: "Final status must be derived, not free text."
      expected_consumer_behavior: "Persist and expose derived status."
    - name: "Frontend status UI"
      type: "frontend_component"
      contract_exposed: "gate list and final status"
      compatibility_obligation: "Display skipped/failed accurately."
      expected_consumer_behavior: "Do not show success styling unless status=completed."
```

## 7. Execution Plan

```yaml
execution_plan:
  - step: "Add shared ValidationGateResult schema."
    files:
      - "packages/shared/src/entities/WorkflowState.ts"
      - "packages/shared/src/entities/HorusRunFlow.ts"
  - step: "Create ValidationGateAggregator service."
    files:
      - "apps/server/src/application/services/ValidationGateAggregator.ts"
  - step: "Wire gates into code change/project construction workflows."
    files:
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
      - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
  - step: "Update chat final summaries to disclose validation state."
    files:
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      - "apps/server/src/infrastructure/agents/HorusChatAgentImpl.ts"
  - step: "Render gate results in UI."
    files:
      - "apps/web/src/features/agents-flow/components/AgentEvidencePanel.tsx"
      - "apps/web/src/components/PreviewTimeline.tsx"
```

## 8. Acceptance Checklist

```yaml
acceptance_checklist:
  - "No run can be marked completed without derived ValidationGateResult status."
  - "Skipped validation is visible and cannot count as passed."
  - "Failed build/typecheck/test sets run status failed_validation."
  - "Curator positive prose cannot override failed required gates."
  - "Final chat message states validation result honestly."
  - "UI distinguishes completed, completed_unverified and failed_validation."
  - "Tests cover passed, failed, skipped and blocked gates."

validation_commands:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "pnpm --filter @u-build/web type-check"
  - "node --test apps/server/test/*quality* apps/server/test/*validation* apps/server/test/*workflow*"
  - "pnpm test"
```

## 9. Implementation Log

```yaml
implemented_at_utc: "2026-05-26T00:00:00Z"
implementation_summary:
  - "Extended workflow status semantics with completed_unverified, failed_validation and blocked."
  - "Added shared ValidationGateResult, ValidationGateSummary and final status schemas."
  - "Added ValidationGateAggregator that derives completed, completed_unverified, failed_validation and blocked from required gate outcomes."
  - "Added validationGates to WorkflowState and validationSummary to Horus run snapshots."
  - "Updated frontend status mapping and evidence UI to distinguish skipped, failed and blocked gates."
  - "Added tests proving skipped required gates cannot count as passed and failed/blocked gates override positive curator prose."
validation_record:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "pnpm --filter @u-build/web type-check"
  - "node --test apps/server/test/validationGateAggregator.test.mjs apps/server/test/projectQualityGateRuntimeEvidence.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs packages/shared/test/horusRunFlow.test.mjs"
  - "pnpm test"
```
