---
format_version: "agentic_sdd.v1"
task_id: "feature-109-professionalization-master-plan"
title: "Professionalization Master Plan"
created_at_utc: "2026-06-08T18:29:35Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "docs/spec/features/47-validation-gates-true-success.md"
  - "docs/spec/features/57-visual-curator-screenshot-gate.md"
  - "docs/spec/features/58-frontend-pattern-library-and-agent-skill.md"
  - "docs/spec/features/63-browser-visual-validation-and-worktree-hygiene.md"
  - "docs/spec/features/68-preview-chat-durable-workflow-recovery.md"
  - "docs/spec/features/77-production-observability-and-release-hygiene.md"
  - "docs/spec/features/84-production-critical-closure.md"
  - "docs/spec/features/85-chat-experience-product-hardening.md"
  - "docs/spec/features/108-agent-tool-activity-code-visualization.md"
follow_up_specs:
  - "docs/spec/features/110-live-preview-file-tree-execution-spine.md"
  - "docs/spec/features/111-runtime-visual-curator-design-evaluator.md"
  - "docs/spec/features/112-surface-pattern-library-design-intelligence.md"
  - "docs/spec/features/113-docker-ci-release-hardening.md"
  - "docs/spec/features/114-ops-recovery-observability-control-plane.md"
---

# 109 - Professionalization Master Plan

## 1. Original User Request

```yaml
raw_user_request: |
  liste tudo que falta, use a skill de criar spec para ter um planejamento altamente detalhado. se precisar crie várias specs versionadas
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar um plano versionado, detalhado e executável para levar o Horus.AI de um sistema agentic local funcional para um produto profissional.
  O plano deve listar tudo que ainda falta, ordenar por criticidade e quebrar a execução em specs independentes, auditáveis e compatíveis
  com o fluxo LangGraph/TypeScript já existente.

expected_user_visible_result: |
  O usuário deve conseguir olhar a documentação de specs e ver um roadmap claro: o que falta, por que falta, qual ordem executar,
  quais arquivos/superfícies serão tocados e como provar que cada etapa realmente ficou pronta.

expected_engineering_result: |
  O repositório passa a ter uma trilha de specs versionadas para fechar: preview em tempo real, árvore de arquivos em execução,
  Curator com prova visual/runtime, Design Intelligence avaliável, biblioteca de padrões por superfície, Docker/CI/release e
  observabilidade/recuperação operacional.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O Horus ainda parece experimental quando a execução não aparece ao vivo, o preview não sobe automaticamente, o Curator aprova sem prova visual e a entrega depende de confiança manual."
  target_user: "Operador/desenvolvedor que usa Horus para transformar stories em aplicações React/Node reais, inspecionáveis e executáveis."
  expected_outcome: "Horus se comporta como console profissional de entrega agentic: inicia, mostra progresso, materializa arquivos, sobe preview, valida e preserva evidência."
  product_surface:
    - "Preview console"
    - "Project file browser"
    - "Agent execution timeline"
    - "Spec/DesignBrief review"
    - "Curator validation"
    - "Generated project workspace"
    - "Docker/CI/release path"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph"
      - "LangChain"
      - "Zod shared contracts"
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
    database:
      - "File repositories for local mode"
      - "Postgres migrations and repositories"
    infrastructure:
      - "pnpm"
      - "Turborepo"
      - "Docker"
      - "GitHub Actions/CI"
  known_entrypoints:
    - "packages/shared/src/entities/*"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/agents/*"
    - "apps/server/src/infrastructure/preview/*"
    - "apps/server/src/infrastructure/http/routes/*"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/api/previewApi.ts"
    - "apps/web/src/features/visual-preview/*"
  known_existing_patterns:
    - "Shared contracts live in packages/shared and must be updated with backend/frontend consumers."
    - "Runtime evidence already exists through RuntimeValidationEvidence and validation_evidence events."
    - "The DesignBrief contract now exists and must become a runtime evaluator input, not prompt text only."
    - "Horus visual identity must remain an operational console, not a landing page."
```

## 4. What Still Needs To Be Professional

```yaml
missing_work_inventory:
  p0:
    - id: "p0.clean-release-baseline"
      title: "Clean worktree, commit and push current Design Intelligence changes"
      why_it_matters: "Uncommitted product/runtime changes make every following validation ambiguous."
      evidence_or_symptom: "Current tree contains many modified/untracked files from DesignBrief and fallback/frontend prompt work."
      target_spec: "This master plan; execute before feature specs 110-114."
    - id: "p0.live-preview-spine"
      title: "Execution must automatically create/update file tree and live preview"
      why_it_matters: "The user's key failure is that specs run but the project does not appear in preview/files in real time."
      target_spec: "110-live-preview-file-tree-execution-spine"
    - id: "p0.true-success-gate"
      title: "Curator must block without build/test/preview/runtime evidence"
      why_it_matters: "A professional agent cannot mark success from prose or static code alone."
      target_spec: "111-runtime-visual-curator-design-evaluator"
    - id: "p0.no-mocked-product-output"
      title: "Generated UI must not expose SDD metadata or seeded fake data unless requested"
      why_it_matters: "Visible copy like US01 or Project OS makes generated apps look artificial."
      target_spec: "111-runtime-visual-curator-design-evaluator"

  p1:
    - id: "p1.design-intelligence-evaluator"
      title: "DesignBrief must be evaluated against real DOM/screenshot"
      target_spec: "111-runtime-visual-curator-design-evaluator"
    - id: "p1.surface-pattern-library"
      title: "FrontAgent needs reusable surface patterns for CRUD, dashboard, calendar, kanban, editor/canvas, chat-preview, workflow-map, auth, settings, file-browser, report, checkout and gallery"
      target_spec: "112-surface-pattern-library-design-intelligence"
    - id: "p1.project-hydration"
      title: "Generated projects need dependency install/start detection, status and recovery"
      target_spec: "110-live-preview-file-tree-execution-spine"
    - id: "p1.docker-runtime"
      title: "Docker path must run the whole app with healthchecks, migrations and volumes"
      target_spec: "113-docker-ci-release-hardening"
    - id: "p1.release-gates"
      title: "CI must prove typecheck/build/tests/secret scan/preview smoke"
      target_spec: "113-docker-ci-release-hardening"

  p2:
    - id: "p2.ops-control-plane"
      title: "Operator needs recovery, run history, failed-step explanations and retry controls"
      target_spec: "114-ops-recovery-observability-control-plane"
    - id: "p2.visual-regression"
      title: "Preview needs screenshot checks for blank page, overflow, mobile and fullscreen/open-loopback host controls"
      target_spec: "111-runtime-visual-curator-design-evaluator"
    - id: "p2.agent-capability-matrix"
      title: "Agent skills and tool profiles need product-surface capabilities, not only generic edit/build tools"
      target_spec: "112-surface-pattern-library-design-intelligence"

  p3:
    - id: "p3.docs-runbooks"
      title: "Docs must teach local, Docker and failure recovery paths without tribal knowledge"
      target_spec: "113-docker-ci-release-hardening"
    - id: "p3.metrics"
      title: "Product telemetry should expose success rate, preview startup time, curator fail reasons and retry counts"
      target_spec: "114-ops-recovery-observability-control-plane"
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Create a prioritized professionalization roadmap."
    - "Create follow-up specs that are executable by implementation agents."
    - "Map upstream/downstream integrations for preview, file tree, curator, design evaluator, pattern library, Docker/CI and observability."
    - "Define validation and acceptance criteria for each phase."
  out_of_scope:
    - "Implementing all features in this planning step."
    - "Replacing LangGraph, TypeScript, React or the existing shared-contract architecture."
    - "Adding enterprise multi-tenant SaaS features unless required by release readiness."
    - "Making broad aesthetic redesigns that violate the Horus operational-console identity."
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This plan coordinates multiple high-risk surfaces. The implementation order matters because preview/file tree evidence
    feeds curator validation, curator validation depends on DesignBrief and runtime evidence, and release/Docker gates must
    eventually run those same checks in automation.

  depends_on:
    - name: "Shared contracts"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "Spec, DesignBrief, Preview, HorusRunFlow, RuntimeValidationEvidence, workflow events"
      required_for: "All follow-up specs must update producers and consumers together."
      failure_modes:
        - "Backend emits fields frontend cannot parse."
        - "Curator receives stale or untyped evidence."
      fallback_or_recovery: "Fail typecheck and schema tests before runtime."
      verification:
        - "pnpm --filter @u-build/shared type-check"
        - "pnpm --filter @u-build/server type-check"
        - "pnpm --filter @u-build/web type-check"

    - name: "Preview runtime and project workspace"
      type: "backend_service"
      owner: "apps/server preview infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "Preview session/project/session events, project registry, generated workspace paths"
      required_for: "Live preview, file tree visibility and runtime validation."
      failure_modes:
        - "Preview remains stopped after specs run."
        - "File browser has no project to display."
        - "Curator lacks runtime proof."
      fallback_or_recovery: "Expose actionable preview failure state and rehydrate/install dependencies."
      verification:
        - "Preview smoke script"
        - "Browser DOM/screenshot check"

  depended_on_by:
    - name: "User-facing Horus console"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Roadmap/spec files and future runtime event/UI contracts"
      compatibility_obligation: "Future specs must preserve existing preview and chat behavior while adding evidence."
      expected_consumer_behavior: "UI displays live execution, files, preview, validation and recovery state."
      migration_or_notification_required: false
      verification:
        - "web typecheck"
        - "browser smoke"

  bidirectional_integrations:
    - name: "Agent workflow <-> preview runtime"
      participants:
        - "LangGraph workflow nodes"
        - "Preview/project registry"
      shared_contract: "workflow events, projectId, previewSessionId, RuntimeValidationEvidence"
      consistency_rule: "Every executable run that creates/updates a project must link to the active project and preview session."
      verification:
        - "E2E run from story/spec to visible preview and file tree."

  sequencing_dependencies:
    - dependency: "Commit current DesignBrief/agent prompt changes"
      reason: "Follow-up specs should start from a clean baseline."
      validation: "git status shows only intended new spec files or a committed working tree."
    - dependency: "Feature 110 before 111"
      reason: "Visual/runtime Curator needs reliable preview/file tree evidence."
      validation: "Preview session and file tree are created automatically during execution."
    - dependency: "Feature 111 before 112 full adoption"
      reason: "Pattern library needs a validator to prevent templates from becoming decorative mocks."
      validation: "Design evaluator fails known bad surfaces."
```

## 7. Execution Roadmap

```yaml
execution_plan:
  - step: 0
    name: "Baseline hygiene"
    agent: "release_engineer"
    action: "Review current dirty tree, split coherent commits, run validation, commit and push."
    expected_output: "Clean branch or explicitly documented pending changes."

  - step: 1
    name: "Live preview and file tree execution spine"
    agent: "backend_frontend_pair"
    action: "Implement spec 110 so generated projects appear immediately in files and preview during spec/agent execution."
    expected_output: "Project/file/preview lifecycle events and UI projection."

  - step: 2
    name: "Runtime visual curator and DesignBrief evaluator"
    agent: "qa_curator_specialist"
    action: "Implement spec 111 so Curator blocks without runtime/build/test/screenshot/DesignBrief evidence."
    expected_output: "True success gate with visual/runtime proof."

  - step: 3
    name: "Surface pattern library and Design Intelligence execution"
    agent: "frontend_agent_architect"
    action: "Implement spec 112 with reusable surface patterns selected by designBrief.surfaceType."
    expected_output: "FrontAgent adapts professional UI patterns instead of improvising generic screens."

  - step: 4
    name: "Docker, CI and release hardening"
    agent: "platform_engineer"
    action: "Implement spec 113 to make local/Docker/CI paths reproducible and healthchecked."
    expected_output: "One-command Docker and CI gates proving build/test/preview/security."

  - step: 5
    name: "Operations, recovery and observability control plane"
    agent: "runtime_observability_engineer"
    action: "Implement spec 114 for recovery, run history, metrics, dead-letter visibility and operator controls."
    expected_output: "Professional operational console for failed/running/recovered agent work."
```

## 8. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Running a spec/agent workflow creates or updates a project visible in the file tree without manual refresh."
    - "The preview starts automatically or displays a specific actionable failure."
    - "The Curator cannot pass without latest Front output, QA output, build/test evidence and preview/runtime evidence."
    - "Generated UI does not expose SDD/workflow metadata unless it is the real product domain."
    - "DesignBrief fields are validated against implementation, not only included in prompts."
  integration:
    - "Shared contracts, backend mappings and frontend projections are updated together."
    - "Preview/project IDs remain consistent across workflow events, chat, file browser and runtime validation."
    - "Docker and CI run the same meaningful validation gates used locally."
  architectural:
    - "No new god component or god service is introduced."
    - "Persistence and runtime dependencies are behind existing ports/repositories where possible."
    - "Prompt changes are paired with schemas/tests when they affect contracts."
  quality:
    - "pnpm --filter @u-build/shared type-check passes."
    - "pnpm --filter @u-build/server type-check and build pass."
    - "pnpm --filter @u-build/web type-check and build pass."
    - "node --test apps/server/test/*.test.mjs passes."
    - "Preview/browser smoke passes for at least one generated project."
  observability:
    - "Every failed professionalization gate shows step, reason, evidence and next action."
```

## 9. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared type-check"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate shared schemas and generated types."
      success_condition: "exit code 0"
    - command: "pnpm --filter @u-build/server type-check && pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate backend contracts and emitted JS for Node tests."
      success_condition: "exit code 0"
    - command: "pnpm --filter @u-build/web type-check && pnpm --filter @u-build/web build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate frontend contract consumers and production bundle."
      success_condition: "exit code 0"
    - command: "node --test apps/server/test/*.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Run focused backend/runtime regression coverage."
      success_condition: "all tests pass"
    - command: "pnpm preview:smoke"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Prove preview UI/runtime path when the stack is available."
      success_condition: "smoke exits 0 and records visible preview evidence"
  runtime_checks:
    - name: "Live project execution proof"
      method: "browser + API + event stream"
      expected: "Project appears in file tree and preview updates while execution is still active."
    - name: "Curator true success proof"
      method: "inspect run evidence"
      expected: "Curator report cites latest front, QA, build/test and preview evidence."
  manual_checks:
    - "Inspect generated UI at desktop and mobile widths for SDD metadata, overflow, blank canvas and wrong surface type."
```

## 10. Risks And Unknowns

```yaml
risks:
  - risk: "The existing dirty tree mixes multiple change themes."
    severity: "high"
    mitigation: "Split commits or create a checkpoint commit before implementing follow-up specs."
  - risk: "Preview failures may be caused by generated project hydration, not UI state."
    severity: "high"
    mitigation: "Spec 110 must model hydration/install/start as first-class lifecycle states."
  - risk: "Visual validation can become flaky if it depends only on screenshots."
    severity: "medium"
    mitigation: "Combine DOM assertions, screenshots, computed layout checks and explicit DesignBrief validation signals."
  - risk: "Pattern library can regress into canned mocked outputs."
    severity: "high"
    mitigation: "Patterns must be adapters with empty/local state and no seeded fake records by default."
unknowns:
  - question: "Which preview runtime paths are currently flaky under Docker?"
    resolution_strategy: "Run Docker smoke during spec 113 implementation."
  - question: "Which generated project archetypes fail most often?"
    resolution_strategy: "Collect curator/preview fail reasons during specs 110 and 114."
```

## 11. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Existing docs/spec index and prior feature specs were inspected."
    - "Current dirty tree was reviewed before implementation."
    - "Memory-derived known risks were checked against current repository surfaces."
  implementation:
    - "Feature specs 109-114 exist and are indexed."
    - "Follow-up specs include integration maps and validation protocols."
    - "No runtime code was changed by this planning task."
  validation:
    - "Markdown files are syntactically readable."
    - "README and CHANGELOG reference new specs."
  reporting:
    - "All missing professionalization work is listed by priority."
    - "Next implementation order is explicit."
```
