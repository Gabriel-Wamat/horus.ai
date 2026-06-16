---
format_version: "agentic_sdd.v1"
task_id: "feature-111-runtime-visual-curator-design-evaluator"
title: "Runtime Visual Curator And Design Evaluator"
created_at_utc: "2026-06-08T18:29:35Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "docs/spec/features/28-qa-preview-smoke-validation.md"
  - "docs/spec/features/29-chat-runtime-evidence-integration.md"
  - "docs/spec/features/47-validation-gates-true-success.md"
  - "docs/spec/features/56-visual-contract-design-system.md"
  - "docs/spec/features/57-visual-curator-screenshot-gate.md"
  - "docs/spec/features/110-live-preview-file-tree-execution-spine.md"
---

# 111 - Runtime Visual Curator And Design Evaluator

## 1. Original User Request

```yaml
raw_user_request: |
  falta inteligência nos agentes e ajustes nos prompts. Analise na imagem que há erros de front, na qual ficando "US01 - Criar tarefa pessoal" entre outras cosias no projeto, além disso, quero que melhore a skill de system design para que o agente tenha a capacidade de escolher as cores do projeto a partir de uma pespectiva de como um designer real faz

  cuidado para não ser algo mocado, o agente tem que ter inteligência
```

## 2. System Interpretation

```yaml
system_translation: |
  Transformar a validação do Curator em um gate de sucesso real, baseado em evidência runtime e visual.
  O Curator deve avaliar código, QA, build, preview, screenshot/DOM e aderência ao DesignBrief/visualContract.
  O sistema deve bloquear UI com metadados de SDD, fake data não solicitado, superfície errada, paleta arbitrária,
  overflow, estados ausentes e preview quebrado.

expected_user_visible_result: |
  O usuário vê relatórios de Curator com razões objetivas: quais estados passaram/falharam, qual evidência visual foi usada,
  se a superfície correta foi gerada, se a copy é produto real e se a interface renderiza em preview.

expected_engineering_result: |
  Criar um DesignEvaluator runtime e integrá-lo ao QA/Curator para usar DesignBrief, visualContract, DOM/screenshot e evidências
  de build/test/preview antes de aprovar uma entrega.
```

## 3. Context

```yaml
business_context:
  user_problem: "O agente pode gerar uma tela visualmente plausível, mas errada para o produto, com copy interna e sem prova de funcionamento."
  target_user: "Usuário que espera uma interface final usável, não um mock estático de requisitos."
  expected_outcome: "A aprovação do Curator significa que a UI é executável, visualmente coerente e aderente à intenção do usuário."
  product_surface:
    - "Curator report"
    - "Preview canvas"
    - "Generated app UI"
    - "Execution console"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "CuratorAgentImpl"
      - "QaAgentImpl"
      - "RuntimeValidationEvidence"
      - "Preview smoke service"
    frontend:
      - "Preview canvas"
      - "Run validation/evidence panels"
    database:
      - "Workflow event/evidence persistence"
    infrastructure:
      - "Playwright/browser smoke"
      - "Node tests"
  known_entrypoints:
    - "packages/shared/src/entities/Spec.ts"
    - "packages/shared/src/entities/ProjectConstruction.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
    - "apps/server/src/infrastructure/validation/*"
    - "apps/server/src/domain/services/CodeChangeSetLifecycleService.ts"
    - "scripts/preview-browser-smoke.mjs"
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add shared DesignEvaluationEvidence contracts."
    - "Implement DesignEvaluator service using DesignBrief, visualContract, DOM text, accessibility hints, screenshot metadata and runtime validation."
    - "Fail when generated UI contains forbidden workflow copy such as USxx, User Story, Spec, Pattern, visualContract, Project OS or fallback unless domain-valid."
    - "Fail when runtime seeds fake records not required by the acceptance criteria."
    - "Fail when DesignBrief.surfaceType conflicts with rendered IA/component inventory."
    - "Fail when stateMatrix validation signals are absent or untested."
    - "Fail when color roles are arbitrary, low-contrast or one-note compared to visualStrategy."
    - "Thread DesignEvaluationEvidence into Curator inputs and reports."
    - "Expose visual/runtime failure reasons in Preview UI."
  out_of_scope:
    - "Training a computer vision model."
    - "Pixel-perfect subjective scoring."
    - "Replacing human review."
    - "Full accessibility audit beyond automated/observable checks."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/ProjectConstruction.ts"
      - "packages/shared/src/entities/Spec.ts"
      - "apps/server/src/application/services/DesignEvaluationService.ts"
      - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
      - "apps/server/src/infrastructure/validation/QaPreviewSmokeValidationService.ts"
      - "apps/server/src/domain/services/CodeChangeSetLifecycleService.ts"
    services:
      - "DesignEvaluationService"
      - "CuratorAgentImpl"
      - "QA preview smoke validation"
      - "Runtime validation evidence projector"
    database:
      migrations_required: false
      tables:
        - "workflow_events"
        - "agent_results"
  frontend:
    files:
      - "apps/web/src/components/ValidationEvidencePanel.tsx"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/features/visual-preview/*"
    components:
      - "Validation/evidence panel"
      - "Preview toast/error details"
  workflow:
    graph_nodes:
      - "QA Agent"
      - "Curator Agent"
      - "Call CLI/render"
    agents:
      - "QA"
      - "Curator"
  tests:
    unit:
      - "apps/server/test/designEvaluationService.test.mjs"
      - "apps/server/test/curatorDesignBriefGate.test.mjs"
    integration:
      - "apps/server/test/frontAgentDesignIntelligence.test.mjs"
      - "scripts/preview-browser-smoke.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    DesignEvaluator sits between runtime evidence and Curator. It consumes Spec.designBrief, visualContract,
    generated project files, preview DOM/screenshot evidence and QA results; it produces structured pass/fail
    evidence that Curator must treat as a hard gate.

  depends_on:
    - name: "DesignBrief and visualContract"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "Spec.designBrief, Spec.visualContract"
      required_for: "Evaluate surface type, IA, components, states, tokens and visual strategy."
      failure_modes:
        - "Evaluator cannot distinguish CRUD from dashboard."
        - "Prompt text is treated as advisory only."
      fallback_or_recovery: "If designBrief missing for legacy specs, mark evaluation partial and require stricter Curator scrutiny."
      verification:
        - "Schema tests"
        - "Curator partial-evidence tests"

    - name: "Preview runtime evidence"
      type: "backend_service"
      owner: "QA/preview validation"
      direction: "this_spec_consumes_dependency"
      contract_used: "RuntimeValidationEvidence.preview, screenshot path/metadata, DOM text, console errors"
      required_for: "Prove the UI renders and inspect visible product copy."
      failure_modes:
        - "Curator passes blank or stopped preview."
        - "Curator misses visible SDD metadata."
      fallback_or_recovery: "Fail closed when preview evidence is missing for previewable frontend work."
      verification:
        - "Preview evidence required test"

  depended_on_by:
    - name: "CuratorAgentImpl"
      type: "agent"
      owner: "apps/server agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "DesignEvaluationEvidence"
      compatibility_obligation: "Curator must not ignore hard failures."
      expected_consumer_behavior: "Curator report references evaluation failures and routes back to Front/QA."
      migration_or_notification_required: false
      verification:
        - "Curator fails known bad UI fixture."

    - name: "Preview validation UI"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Structured validation reasons"
      compatibility_obligation: "Existing validation evidence remains visible."
      expected_consumer_behavior: "Show failing dimension, evidence and next action."
      migration_or_notification_required: false
      verification:
        - "web typecheck"
        - "frontend evidence rendering test"
```

## 7. Contracts And Invariants

```yaml
contracts:
  domain_contracts:
    - name: "Curator true success"
      producer: "CuratorAgentImpl"
      consumers:
        - "ODIN routing"
        - "User-facing run status"
      invariant: "Curator pass requires latest Front output, QA output, runtime validation and DesignEvaluationEvidence without hard failures."
    - name: "DesignBrief adherence"
      producer: "DesignEvaluationService"
      consumers:
        - "CuratorAgentImpl"
        - "Preview validation UI"
      invariant: "Each non-empty stateMatrix entry must have implementation or explicit justified non-applicability."
  ui_contracts:
    - name: "No workflow copy in generated product"
      producer: "FrontAgent generated app"
      consumers:
        - "End user"
      requirement: "Visible UI copy must be product/domain copy, not SDD/workflow metadata."
  data_contracts:
    - name: "DesignEvaluationEvidence"
      producer: "DesignEvaluationService"
      consumers:
        - "CuratorAgentImpl"
        - "Workflow event projector"
        - "Preview UI"
      migration_required: true
      compatibility_notes: "Additive shared contract; unknown checks must be rendered safely."
```

## 8. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current validation and curator handoff"
    agent: "repo_explorer"
    action: "Read QA preview smoke, RuntimeValidationEvidence, CuratorAgentImpl, CodeChangeSetLifecycleService and frontend evidence rendering."
    expected_output: "Map of evidence producers/consumers and missing gates."
  - step: 2
    name: "Add shared DesignEvaluationEvidence"
    agent: "backend_specialist"
    action: "Define checks for copy hygiene, surface type, IA, components, states, visual strategy, accessibility and runtime render."
    expected_output: "Shared schemas and tests."
  - step: 3
    name: "Implement deterministic DesignEvaluationService"
    agent: "qa_specialist"
    action: "Evaluate DOM text, project files, QA output and preview evidence against DesignBrief."
    expected_output: "Service with deterministic failure reasons and fixtures."
  - step: 4
    name: "Thread evidence into Curator"
    agent: "agent_runtime_specialist"
    action: "Add DesignEvaluationEvidence to curator prompt/context and enforce hard failures before LLM pass."
    expected_output: "Curator cannot pass known bad cases."
  - step: 5
    name: "Expose evidence in UI"
    agent: "frontend_specialist"
    action: "Render pass/fail dimensions and next action in Preview/Execution console."
    expected_output: "Operator can see why a build failed visually."
  - step: 6
    name: "Validate with bad fixtures"
    agent: "qa_specialist"
    action: "Add fixtures for US01 visible, fake seeded records, wrong dashboard for CRUD, blank preview and missing mobile state."
    expected_output: "All bad fixtures fail for the expected reason."
```

## 9. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "A UI containing visible 'US01 - Criar tarefa pessoal' fails copy hygiene unless explicitly domain-valid."
    - "A CRUD story rendered as a generic dashboard fails surfaceType validation."
    - "A previewable frontend without ready preview evidence cannot receive Curator pass."
    - "Missing stateMatrix validation signals produce QA or Curator failure."
    - "Color strategy must explain domain roles and cannot be only arbitrary hex values."
  integration:
    - "DesignEvaluationEvidence is persisted or attached to workflow validation evidence."
    - "Curator consumes the latest Front/QA/runtime evidence, not stale successful attempts."
  quality:
    - "Bad fixture tests fail before implementation and pass after evaluator integration."
    - "No regex-only broad parser is introduced; text checks use bounded token/DOM extraction helpers."
  observability:
    - "Validation report shows dimension, severity, evidence and fix target."
```

## 10. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared type-check"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate DesignEvaluationEvidence contracts."
      success_condition: "exit code 0"
    - command: "pnpm --filter @u-build/server type-check && pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate evaluator and curator integration."
      success_condition: "exit code 0"
    - command: "node --test apps/server/test/*.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Run curated bad-fixture and runtime evidence tests."
      success_condition: "all tests pass"
    - command: "pnpm --filter @u-build/web type-check"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate UI evidence consumers."
      success_condition: "exit code 0"
    - command: "pnpm preview:smoke"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Collect browser evidence for visual gate."
      success_condition: "exit code 0"
  runtime_checks:
    - name: "Known bad UI rejection"
      method: "test fixture or generated run"
      expected: "Curator returns fail with fixTarget front or qa."
```

## 11. Risks And Unknowns

```yaml
risks:
  - risk: "Visual validation becomes too subjective."
    severity: "medium"
    mitigation: "Use deterministic checks first: DOM copy, surface contract, state signals, screenshot nonblank, contrast thresholds where practical."
  - risk: "Curator LLM overrides hard evaluator failures."
    severity: "critical"
    mitigation: "Hard-fail before or after LLM if evaluator severity is blocking."
  - risk: "Legacy specs without DesignBrief become impossible to validate."
    severity: "medium"
    mitigation: "Support partial evaluation with explicit lower-confidence status for legacy specs."
unknowns:
  - question: "Where should screenshot bytes/paths be stored long-term?"
    resolution_strategy: "Inspect current preview smoke artifacts and choose file/Postgres metadata pattern."
```

## 12. Minimal Output Contract

```yaml
agent_result:
  status: "<completed | failed | blocked>"
  summary: "<evaluator and curator gate implemented>"
  files_read:
    - "<curator/qa/preview evidence files>"
  files_changed:
    - "<shared/backend/frontend/tests>"
  commands_run:
    - command: "<validation command>"
      cwd: "<REPOSITORY_ROOT>"
      exit_code: "<exit>"
      result: "<result>"
  validation:
    passed:
      - "<checks>"
    failed:
      - "<checks>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "Implement spec 112 after evaluator gates are stable."
```
