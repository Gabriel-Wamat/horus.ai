---
format_version: "agentic_sdd.v1"
task_id: "feature-69-release-hardening-and-orchestrator-modularization"
title: "Release Hardening And Orchestrator Modularization"
created_at_utc: "2026-05-27T23:26:16Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
depends_on:
  - "spec/features/39-agentic-orchestration-integrity.md"
  - "spec/features/41-agentic-runtime-validation-observability.md"
  - "spec/features/43-specialized-subagents-tool-boundaries.md"
  - "spec/features/45-structured-agent-tools-no-shell.md"
  - "spec/features/47-validation-gates-true-success.md"
  - "spec/features/59-agentic-project-construction-reliability.md"
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "spec/features/67-artifact-validation-self-healing-and-observability-control-plane.md"
---

# 69 - Release Hardening And Orchestrator Modularization

## 1. Original User Request

```yaml
raw_user_request: |
  use a skill de spec e crie uma  para esses 4 casos que você levantou
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar uma SPEC executável para os quatro achados de maior gravidade levantados na auditoria do projeto:
  1. o comando global de lint está quebrado por incompatibilidade do script de docs com Next 16;
  2. o terminal preflight aplica candidatos diretamente no projeto real e executa validações com risco de efeitos colaterais;
  3. o SafeCliRunner herda o process.env inteiro ao executar comandos de projeto, expondo segredos e variáveis locais;
  4. o WorkflowOrchestrator concentra responsabilidades demais e precisa ser modularizado sem alterar a semântica LangGraph.

expected_user_visible_result: |
  O projeto volta a ter um gate de lint confiável, comandos de validação deixam de colocar o projeto real em risco,
  execuções de CLI passam a rodar com ambiente saneado, e o orquestrador fica mais legível e testável sem regressão
  no fluxo Spec -> Odin -> Front/QA -> Curator -> Odin -> CLI.

expected_engineering_result: |
  Implementar uma sequência curta e auditável de correções P0/P1: reparar lint, isolar preflight em workspace temporário
  ou sandbox explícito, sanear ambiente de comandos, e extrair responsabilidades do WorkflowOrchestrator para serviços
  coesos com contratos tipados, testes focados e validação full-stack.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O Horus nao pode ser considerado pronto para evoluir enquanto o gate de lint falha, o preflight altera projetos reais, comandos recebem segredos locais e o orquestrador permanece dificil de validar."
  target_user: "Operador e desenvolvedor do Horus.AI que depende de agentes para gerar, validar, aplicar e renderizar projetos frontend."
  expected_outcome: "A base fica mais segura para refatoracoes futuras e mais confiavel para execucoes agenticas."
  product_surface:
    - "CI/local validation"
    - "Preview chat code-change workflow"
    - "Curator validation and CodeChangeSet preflight"
    - "LangGraph workflow orchestration"
    - "Runtime event/chat/memory projection"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph StateGraph"
      - "Express"
      - "WorkflowOrchestrator"
      - "ProjectExecutionService"
      - "SafeCliRunner"
      - "CodeChangeSetPreflightService"
    frontend:
      - "React"
      - "Vite"
      - "EventSource clients"
    database:
      - "workflow_states"
      - "workflow_events"
      - "agent_execution_*"
      - "code_change_sets"
      - "artifact candidate/evidence tables"
    infrastructure:
      - "pnpm monorepo"
      - "Turborepo"
      - "Next docs app"
      - "file-mode and Postgres persistence"
  known_entrypoints:
    - "apps/docs/package.json"
    - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
    - "apps/server/src/infrastructure/project/ProjectDefaultContractBuilder.ts"
    - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
    - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/langgraph/graph.ts"
    - "apps/server/src/infrastructure/langgraph/state.ts"
  known_existing_patterns:
    - "Specs locais vivem em spec/ e sao indexadas no README e CHANGELOG."
    - "Fluxo agentico deve preservar LangGraph TS, StateGraph, reducers e limite de retries."
    - "Runtime validation evidence deve ser explicitamente persistida e projetada para UI/chat."
    - "Structured tools and deny-by-default boundaries ja existem e devem ser reaproveitados."
```

## 4. Observed Evidence

```yaml
observed_evidence:
  lint_gate:
    - file: "apps/docs/package.json"
      lines: "8-14"
      finding: "O script lint usa next lint, enquanto a app usa next ^16.0.0; pnpm lint falhou apontando diretorio invalido apps/docs/lint."
  preflight_mutates_real_project:
    - file: "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
      lines: "83-90"
      finding: "O preflight escreve operations diretamente no projectRoot real antes de validar."
    - file: "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
      lines: "257-270"
      finding: "Rollback reverte apenas arquivos planejados, nao efeitos colaterais de install/build/test."
  validation_command_surface:
    - file: "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
      lines: "22-29"
      finding: "A prioridade inclui install como comando possivel de validacao."
    - file: "apps/server/src/infrastructure/project/ProjectDefaultContractBuilder.ts"
      lines: "126-135"
      finding: "O catalogo default sempre adiciona install-root-dependencies."
    - file: "apps/server/src/infrastructure/project/ProjectDefaultContractBuilder.ts"
      lines: "72-88"
      finding: "Perfis de agentes recebem todos os commandIds por padrao, inclusive curator."
  env_exposure:
    - file: "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
      lines: "85-88"
      finding: "spawn herda todo process.env e mistura spec.env, expondo variaveis locais a scripts de projeto."
  orchestrator_god_class:
    - file: "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      lines: "273-289"
      finding: "Construtor injeta muitos sinks/servicos e sinaliza baixa coesao."
    - file: "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      lines: "751-941"
      finding: "runGraphStream mistura stream LangGraph, handoffs, eventos, aplicacao de patch e ledger."
    - file: "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      lines: "1006-1143"
      finding: "Emissao de eventos, projecao de chat/memoria e persistencia de estado vivem no mesmo servico."
    - file: "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      lines: "1222-1410"
      finding: "Lifecycle de CodeChangeSet e aplicacao pos-Curator tambem estao no orquestrador."
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Caso 1: reparar o lint do app docs e garantir que pnpm lint volte a ser gate real."
    - "Caso 2: substituir preflight mutante por validacao em workspace isolado ou sandbox explicito."
    - "Caso 3: sanear o ambiente de execucao do SafeCliRunner com allowlist e redacao de logs."
    - "Caso 4: modularizar WorkflowOrchestrator por responsabilidades sem trocar o contrato LangGraph nem o fluxo publico."
    - "Adicionar testes focados para cada caso e rodar validacoes globais ao final."
    - "Preservar compatibilidade de estados, eventos, schemas compartilhados e UI consumers."
  out_of_scope:
    - "Refatorar VisualPreviewConsole, StorySpecWorkspace, FrontAgentImpl ou index.css nesta SPEC."
    - "Migrar para outro framework de agentes."
    - "Introduzir fornecedor externo de fila, sandbox ou observabilidade."
    - "Remover suporte a file-mode ou Postgres."
    - "Fazer cleanup de data/ ou workspaces gerados."
    - "Renomear eventos publicos de workflow sem migracao e testes de consumidores."
```

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/domain/services/*Workflow*.ts"
      - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
      - "apps/server/src/infrastructure/project/ProjectDefaultContractBuilder.ts"
      - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
      - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
      - "apps/server/src/infrastructure/langgraph/graph.ts"
      - "apps/server/src/infrastructure/langgraph/state.ts"
    services:
      - "WorkflowOrchestrator"
      - "WorkflowExecutionService"
      - "WorkflowEventProjector"
      - "WorkflowStatePersister"
      - "CodeChangeSetLifecycleService"
      - "PreflightWorkspaceService"
      - "SafeCliRunner"
      - "ProjectExecutionService"
    database:
      migrations_required: false
      tables:
        - "workflow_states"
        - "workflow_events"
        - "agent_workflow_runs"
        - "agent_workflow_attempts"
        - "code_change_sets"
  frontend:
    files:
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
    components:
      - "Preview workflow activity"
      - "Agent Flow event consumers"
    routes:
      - "?mode=preview"
      - "?mode=agents"
  workflow:
    graph_nodes:
      - "specAgent"
      - "odinAgent"
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
      - "callCli"
    agents:
      - "Spec"
      - "Odin"
      - "Front"
      - "QA"
      - "Curator"
  tests:
    unit:
      - "SafeCliRunner env sanitization"
      - "CodeChangeSetPreflight isolated workspace"
      - "Workflow event projection"
      - "CodeChangeSet lifecycle extraction"
    integration:
      - "chat-originated CodeChangeSet preflight/apply path"
      - "workflow stream persists same events after service extraction"
      - "docs lint command works through turbo"
    e2e:
      - "Preview chat mutable request still reaches terminal status with evidence"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    Esta SPEC atua na base de seguranca e manutencao do Horus. Ela conecta validacao local/CI,
    execucao de comandos de projetos gerados, preflight de candidatos, persistencia de workflow,
    eventos para UI/chat/memoria e fluxo LangGraph. O contrato externo do usuario deve permanecer
    o mesmo; a mudanca e interna, mas afeta produtores e consumidores de eventos e evidencias.

  depends_on:
    - name: "Turborepo lint pipeline"
      type: "external_dependency"
      owner: "repo tooling"
      direction: "this_spec_consumes_dependency"
      contract_used: "pnpm lint -> turbo run lint -> package lint scripts"
      required_for: "Provar que a base tem gate estatico confiavel."
      assumptions:
        - "Next 16 nao oferece next lint como comando valido no formato atual."
      failure_modes:
        - "CI/local validation continua falhando antes de testar codigo real."
      fallback_or_recovery: "Trocar script docs para eslint/next-compatible lint e documentar comando."
      verification:
        - "pnpm lint"

    - name: "Project command catalog"
      type: "backend_service"
      owner: "apps/server infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "ProjectCommand ids, cwd, executable, args, env, timeoutMs"
      required_for: "Executar apenas comandos permitidos no preflight e em validacoes."
      assumptions:
        - "Catalogos existentes podem incluir install, dev e start."
      failure_modes:
        - "Curator ou preflight rodam comandos com efeitos colaterais ou duracao indefinida."
      fallback_or_recovery: "Criar perfis de validacao sem install/dev/start para preflight."
      verification:
        - "testes de selecao de comandos por role/profile"

    - name: "LangGraph workflow runner"
      type: "agent"
      owner: "apps/server infrastructure/langgraph"
      direction: "this_spec_consumes_dependency"
      contract_used: "workflowGraph.stream(input, config), getState(config), Command resume"
      required_for: "Preservar a semantica do StateGraph durante modularizacao."
      assumptions: []
      failure_modes:
        - "Extracao muda ordem de eventos ou status terminal."
      fallback_or_recovery: "Adicionar characterization tests antes de extrair responsabilidades."
      verification:
        - "workflow stream regression tests"

  depended_on_by:
    - name: "Preview chat mutable actions"
      type: "workflow"
      owner: "apps/server application + apps/web preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "accepted chat turn -> workflow thread -> events/evidence -> terminal status"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "A UI continua recebendo os mesmos eventos e estados, agora com maior confiabilidade."
      migration_or_notification_required: false
      verification:
        - "chat code-change regression"
        - "web guard tests"

    - name: "Curator and artifact control plane"
      type: "backend_service"
      owner: "apps/server domain/infrastructure"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "candidate validation evidence, change-set preflight result, apply result"
      compatibility_obligation: "must preserve and may extend with isolation metadata"
      expected_consumer_behavior: "Curator aprova/rejeita candidatos sem alterar projeto real durante preflight."
      migration_or_notification_required: false
      verification:
        - "candidate preflight/applier tests"

    - name: "Workflow event consumers"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "WorkflowEvent types and persisted WorkflowState"
      compatibility_obligation: "breaking change forbidden"
      expected_consumer_behavior: "VisualPreviewConsole e Agent Flow continuam renderizando progresso sem adaptar nomes de eventos."
      migration_or_notification_required: false
      verification:
        - "web test:guards"

  bidirectional_integrations:
    - name: "WorkflowOrchestrator and execution ledger"
      participants:
        - "WorkflowOrchestrator or extracted WorkflowExecutionService"
        - "AgentExecutionLedger repositories"
      shared_contract: "turnId, runId, attemptId, threadId, status, terminal timestamps"
      consistency_rule: "Todo workflow iniciado por chat/acesso publico deve ter ledger consistente ou erro explicito."
      verification:
        - "ledger lifecycle tests"

    - name: "Preflight workspace and ProjectExecutionService"
      participants:
        - "CodeChangeSetPreflightService"
        - "ProjectExecutionService"
      shared_contract: "temporary root/cwd, selected validation command ids, runtime evidence"
      consistency_rule: "Comandos de preflight devem executar no workspace isolado e nunca no projectRoot real."
      verification:
        - "testes comparando ausencia de mutacao no projectRoot real"

  data_flow:
    inbound:
      - source: "FrontAgent CodeChangeSet"
        payload_or_state: "operations[targetPath, afterContent], workflowThreadId, userStoryId, candidate metadata"
        validation: "CodeChangeSetSchema + path safety + static frontend gate"
      - source: "Project command catalog"
        payload_or_state: "command ids and executable specs"
        validation: "role/profile allowlist + SafeCliRunner policy"
    outbound:
      - target: "RuntimeValidationEvidence"
        payload_or_state: "command status, tails, duration, skipped/failed/passed"
        compatibility: "must preserve existing shared schema or extend additively"
      - target: "WorkflowEvent stream"
        payload_or_state: "node_completed, validation_evidence, status_changed, error"
        compatibility: "must preserve event names consumed by web"

  sequencing_dependencies:
    - dependency: "Fix lint script before relying on pnpm lint as acceptance gate."
      reason: "A pipeline global esta quebrada por tooling, nao por codigo do feature."
      validation: "pnpm lint exits 0 after docs script correction."
    - dependency: "Add characterization tests before WorkflowOrchestrator extraction."
      reason: "The orchestrator is high blast-radius and currently encodes event order/status side effects."
      validation: "Tests pass before and after each extraction step."
    - dependency: "Sanitize SafeCliRunner before broadening isolated preflight execution."
      reason: "Mesmo em workspace isolado, scripts ainda podem ler env herdado se o runner nao for saneado."
      validation: "Env tests prove secrets are absent by default."

  integration_risks:
    - risk: "Preflight isolation becomes slow if it copies node_modules or entire project workspaces."
      severity: "high"
      mitigation: "Use ignore rules, no node_modules copy, and deterministic command selection without install by default."
    - risk: "Workflow modularization changes event order."
      severity: "critical"
      mitigation: "Characterization tests and incremental extraction behind same public API."
    - risk: "Env allowlist removes variables needed for pnpm/node execution."
      severity: "medium"
      mitigation: "Allow minimal PATH/HOME/SHELL/TMPDIR plus explicit spec.env; test package-manager commands."
```

## 8. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Separate application, domain, infrastructure, and presentation concerns."
    - "Prefer dependency injection over direct construction of concrete services."
    - "Avoid god classes, god components, and unrelated state objects."
    - "Do not introduce circular dependencies."
    - "Do not duplicate business rules across layers."
  project_specific:
    - "Preserve the official LangGraph TypeScript StateGraph flow and typed state contracts."
    - "Keep the max retry / anti-infinite-loop behavior intact."
    - "Workflow events are public contracts for chat, memory, SSE and frontend consumers."
    - "Runtime validation must never claim success without real evidence or explicit skipped evidence."
    - "No candidate preflight may mutate the selected project root."
    - "No command runner may inherit process.env wholesale."
    - "Extract WorkflowOrchestrator responsibilities only behind stable, narrow service interfaces."
```

## 9. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files and references before editing."
    - "Prefer small, cohesive functions."
    - "Keep public API compatibility unless breaking changes are explicitly allowed."
    - "Use Zod/shared schemas or typed interfaces for new contracts."
    - "Handle errors explicitly with actionable messages."
    - "Avoid silent fallbacks unless logged and intentional."
  backend:
    - "Preflight temporary workspaces must be created under a controlled temp/data root and deleted or retained according to explicit debug policy."
    - "Path safety must reject absolute paths and project-root escape before any file operation."
    - "Command selection must be role-aware and exclude install/dev/start from curator preflight unless explicitly approved."
    - "SafeCliRunner must use sanitized env by default and redact env-like values in logs/evidence."
    - "Workflow extracted services must be injected into WorkflowOrchestrator or composed in server bootstrap."
  frontend:
    - "Do not change event names or UI assumptions unless consumers are updated and tested."
    - "Render any new failure/isolation evidence in existing surfaces only if shared contracts require it."
  tests:
    - "Add characterization tests before high-risk refactors."
    - "Cover success, failure and side-effect cases."
    - "Do not mark work complete without pnpm lint and workflow/preflight focused tests."
```

## 10. Contracts And Invariants

```yaml
contracts:
  api_contracts:
    - name: "Workflow public lifecycle"
      producer: "WorkflowOrchestrator facade"
      consumers:
        - "SubmitHorusChatTurnUseCase"
        - "HTTP workflow routes"
        - "SSE stream clients"
      request_shape: "start/resume options with userStories, workflowMode, chat/project context, llmSettings"
      response_shape: "threadId plus persisted WorkflowState/events"
      compatibility: "must preserve"

    - name: "CLI command execution"
      producer: "SafeCliRunner"
      consumers:
        - "ProjectExecutionService"
        - "CodeChangeSetPreflightService"
        - "Preview runtime adapters if applicable"
      request_shape: "NormalizedCliCommandSpec"
      response_shape: "CliExecutionResult with stdout/stderr tails and exitCode"
      compatibility: "must preserve response shape; env behavior changes to secure default"

  domain_contracts:
    - name: "No real-root mutation during preflight"
      producer: "CodeChangeSetPreflightService"
      consumers:
        - "Curator"
        - "Artifact control plane"
        - "Project preview runtime"
      invariant: "A failed or passed preflight leaves the selected projectRoot byte-identical except for explicitly allowed temp/debug artifacts outside the root."

    - name: "Workflow event order"
      producer: "WorkflowExecutionService/EventProjector"
      consumers:
        - "WorkflowStatePersister"
        - "chat progress sink"
        - "memory sink"
        - "frontend SSE clients"
      invariant: "Events emitted for the same LangGraph run preserve existing order and sequence semantics."

  data_contracts:
    - name: "RuntimeValidationEvidence"
      producer: "preflight and quality gates"
      consumers:
        - "CuratorAgentImpl"
        - "WorkflowOrchestrator extracted services"
        - "Preview chat/progress UI"
      migration_required: false
      compatibility_notes: "New fields must be additive and schema-backed."

    - name: "Docs lint package script"
      producer: "apps/docs/package.json"
      consumers:
        - "turbo run lint"
        - "pnpm lint"
      migration_required: false
      compatibility_notes: "Script name remains lint; implementation may change from next lint to eslint-compatible command."
```

## 11. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Reconfirm current failures and contracts"
    agent: "repo_explorer"
    action: "Run/inspect pnpm lint failure, docs lint script, SafeCliRunner, preflight service, command catalog, WorkflowOrchestrator references and workflow tests."
    expected_output: "Evidence map with exact files, lines, commands and consumers."

  - step: 2
    name: "Fix docs lint gate"
    agent: "tooling_specialist"
    action: "Replace invalid Next lint invocation with the repo-compatible lint command for apps/docs, preserving script name."
    expected_output: "pnpm lint no longer fails because of docs tooling."

  - step: 3
    name: "Harden SafeCliRunner environment"
    agent: "backend_security_specialist"
    action: "Introduce sanitized environment builder with minimal allowlist and explicit spec.env overlay; redact env-like values in evidence/log tails where needed."
    expected_output: "SafeCliRunner no longer passes process.env wholesale and has focused tests proving secret exclusion and required PATH behavior."

  - step: 4
    name: "Restrict validation command selection"
    agent: "backend_specialist"
    action: "Adjust command catalog/profile or preflight selector so curator preflight excludes install/dev/start by default and reports skipped commands explicitly."
    expected_output: "Preflight command IDs are deterministic, bounded and side-effect aware."

  - step: 5
    name: "Isolate CodeChangeSet preflight"
    agent: "backend_specialist"
    action: "Create PreflightWorkspaceService that materializes a bounded temp copy/overlay, applies candidate operations there, runs selected validation there and cleans up safely."
    expected_output: "Preflight validates candidates without writing to projectRoot real; failures preserve real project contents."

  - step: 6
    name: "Add WorkflowOrchestrator characterization tests"
    agent: "qa_specialist"
    action: "Capture current expected event emission, state persistence, ledger status and CodeChangeSet lifecycle behavior using mocked graph/sinks."
    expected_output: "Regression tests that fail if event order/status/lifecycle changes."

  - step: 7
    name: "Extract orchestrator services incrementally"
    agent: "architect_backend_specialist"
    action: "Extract WorkflowEventProjector, WorkflowStatePersister, CodeChangeSetLifecycleService and WorkflowExecutionService while preserving WorkflowOrchestrator public API."
    expected_output: "WorkflowOrchestrator becomes a thin facade/composition root with narrow injected collaborators."

  - step: 8
    name: "Validate"
    agent: "qa_specialist"
    action: "Run focused tests, full shared/server/web tests, type-check, build and lint. Record exact commands and results."
    expected_output: "Validation evidence with cwd, commands, exit codes and any residual risk."
```

## 12. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm service boundaries and extraction order for WorkflowOrchestrator."
    inputs:
      - "this SDD"
      - "WorkflowOrchestrator"
      - "LangGraph graph/state files"
    outputs:
      - "service boundary map"
      - "characterization test plan"

  - agent_name: "backend_security_specialist"
    responsibility: "Harden SafeCliRunner env handling and command selection."
    inputs:
      - "SafeCliRunner"
      - "ProjectExecutionService"
      - "ProjectDefaultContractBuilder"
    outputs:
      - "secure env builder"
      - "command profile restrictions"
      - "security regression tests"

  - agent_name: "backend_specialist"
    responsibility: "Implement isolated preflight and orchestrator service extraction."
    inputs:
      - "CodeChangeSetPreflightService"
      - "WorkflowOrchestrator"
      - "artifact control plane contracts"
    outputs:
      - "backend diff"
      - "preflight isolation tests"
      - "workflow regression tests"

  - agent_name: "tooling_specialist"
    responsibility: "Repair docs lint script and validate monorepo lint."
    inputs:
      - "apps/docs/package.json"
      - "turbo config"
      - "eslint/next docs config"
    outputs:
      - "tooling diff"
      - "pnpm lint evidence"

  - agent_name: "qa_specialist"
    responsibility: "Run and document focused/full validation."
    inputs:
      - "diff"
      - "acceptance criteria"
    outputs:
      - "test report"
      - "remaining risks"
```

## 13. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "pnpm lint exits 0 from repository root or fails only on real lint issues, not on invalid docs command wiring."
    - "CodeChangeSetPreflightService validates candidates without writing candidate files to the real projectRoot."
    - "Preflight does not run install/dev/start by default for curator validation."
    - "SafeCliRunner child processes do not receive arbitrary process.env keys by default."
    - "Preview chat and standard workflows still reach terminal states with the same public workflow events."
  integration:
    - "ProjectExecutionService continues consuming command specs without response-shape changes."
    - "Curator runtime evidence remains compatible with shared RuntimeValidationEvidenceSchema."
    - "Frontend SSE/event consumers do not require event-name migrations."
    - "Ledger run/attempt status updates remain equivalent before and after orchestrator extraction."
  architectural:
    - "WorkflowOrchestrator no longer owns event projection, state persistence, CodeChangeSet lifecycle and graph-stream mechanics in one class."
    - "Extracted services have narrow interfaces and no circular imports."
    - "LangGraph StateGraph topology and max-retry protections are preserved."
  quality:
    - "Focused tests cover lint tooling, env sanitization, preflight isolation and orchestrator extraction."
    - "pnpm type-check passes."
    - "pnpm --filter @u-build/server build passes."
    - "pnpm --filter @u-build/web test:guards passes."
    - "node --test packages/shared/test/*.test.mjs apps/server/test/*.test.mjs passes."
    - "pnpm build passes or any unrelated chunk warning is documented."
  observability:
    - "Preflight evidence records isolated workspace path only when safe/redacted."
    - "Command evidence never exposes secret env values."
    - "Workflow failures remain user-visible through existing error/status events."
```

## 14. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm lint"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Prove global lint gate is repaired."
      success_condition: "exit code 0"
    - command: "pnpm type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Prove TypeScript contracts remain valid across packages."
      success_condition: "exit code 0"
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Prove backend build remains valid after service extraction."
      success_condition: "exit code 0"
    - command: "pnpm --filter @u-build/web test:guards"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Prove frontend workflow/event consumers are not regressed."
      success_condition: "exit code 0"
    - command: "node --test packages/shared/test/*.test.mjs apps/server/test/*.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Run shared/server regression tests, including new security/preflight/workflow tests."
      success_condition: "exit code 0"
    - command: "pnpm build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Prove production build remains valid after refactor."
      success_condition: "exit code 0; pre-existing chunk-size warnings may be documented separately"

  runtime_checks:
    - name: "Real-root preflight immutability"
      method: "test with fixture project and file hash snapshot"
      expected: "projectRoot files are byte-identical before and after preflight, including failure case"
    - name: "Safe env exclusion"
      method: "test runner command prints selected env keys"
      expected: "secret/unlisted process.env keys are undefined; allowlisted PATH-like keys remain available"
    - name: "Workflow event compatibility"
      method: "mocked graph stream characterization test"
      expected: "same public event sequence and persisted terminal status as before extraction"

  integration_checks:
    - name: "Curator candidate validation path"
      surfaces:
        - "CodeChangeSetPreflightService"
        - "ProjectExecutionService"
        - "RuntimeValidationEvidence"
        - "CuratorAgentImpl"
      method: "integration test"
      expected: "failed isolated command blocks approval with evidence and no projectRoot mutation"
    - name: "Chat-originated code-change workflow"
      surfaces:
        - "SubmitHorusChatTurnUseCase"
        - "WorkflowOrchestrator facade"
        - "execution ledger"
        - "workflow events"
      method: "server regression test"
      expected: "accepted action receives threadId/runId and terminal status remains projected"

  manual_checks:
    - "Inspect git diff to ensure no unrelated frontend monolith refactor entered this SPEC."
    - "Inspect command evidence/logs for accidental secret values before final report."
```

## 15. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent files, APIs, routes, tables, settings, or dependencies."
    - "Inspect the repository before deciding when unsure."
    - "Never claim a command was run unless it was actually executed."
  read_before_write:
    - "Read surrounding implementation before editing a file."
    - "Search for existing patterns before creating abstractions."
    - "Find references before deleting or renaming code."
    - "Before changing WorkflowEvent, inspect frontend and chat consumers."
  failure_handling:
    - "If pnpm lint fails after docs repair, separate tooling failure from real lint violations."
    - "If preflight isolation is too slow, optimize copy/overlay strategy before reverting to real-root mutation."
    - "If env sanitization breaks package manager lookup, adjust allowlist narrowly and add a regression test."
  state_consistency:
    - "Do not update only producers or only consumers of workflow events."
    - "Do not change RuntimeValidationEvidence without shared/server/frontend compatibility checks."
    - "Do not change workflow status semantics without ledger and UI checks."
  scope_control:
    - "Do not refactor FrontAgentImpl, VisualPreviewConsole, StorySpecWorkspace or index.css in this pass."
    - "Do not clean generated data or node_modules as part of this SPEC."
    - "Do not format unrelated files."
```

## 16. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary test flake unrelated to changed files"
    - "temporary package-manager cache failure"
    - "temporary filesystem cleanup failure for isolated temp workspace"
  non_retryable_failures:
    - "preflight mutates real project root"
    - "SafeCliRunner leaks unallowlisted env key"
    - "workflow event compatibility test fails"
    - "pnpm lint remains broken due to invalid script wiring"
  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only changes introduced by this task."
    - "If rollback is unsafe because files are mixed with user edits, stop and report exact state."
  escalation_rules:
    - "Escalate if implementation requires changing public workflow event names."
    - "Escalate if a generated project requires install during curator preflight."
    - "Escalate if safe env allowlist needs credentials or secret values."
```

## 17. Observability Requirements

```yaml
observability:
  logs:
    - event: "preflight_workspace_created"
      fields:
        - "workflowThreadId"
        - "candidateId"
        - "isolatedRootKind"
        - "fileCount"
        - "durationMs"
    - event: "command_env_sanitized"
      fields:
        - "commandId"
        - "allowedEnvKeyCount"
        - "explicitEnvKeyCount"
        - "redactedKeyCount"
    - event: "workflow_service_extracted_boundary"
      fields:
        - "threadId"
        - "serviceName"
        - "eventType"
        - "status"
  audit_trail:
    required: true
    must_capture:
      - "files read"
      - "files changed"
      - "commands executed"
      - "test results"
      - "preflight isolation result"
      - "workflow event compatibility result"
  user_visible_failures:
    - "Show validation failed, not silent success."
    - "Show terminal error when workflow fails."
    - "Do not expose temp paths or env details to normal users unless debug mode requires it."
```

## 18. Risks And Unknowns

```yaml
risks:
  - risk: "The docs lint fix may require adding or adjusting ESLint config for Next 16."
    severity: "medium"
    mitigation: "Inspect Next/ESLint setup locally and choose the smallest compatible command."
  - risk: "Preflight isolation can be expensive for large generated projects."
    severity: "high"
    mitigation: "Ignore node_modules/dist/build artifacts and prefer overlay/copy-on-write behavior."
  - risk: "Some generated project validations currently rely on install."
    severity: "high"
    mitigation: "Separate bootstrap from curator preflight; require explicit approved bootstrap outside this SPEC's preflight path."
  - risk: "WorkflowOrchestrator extraction could regress recovery/ledger/chat projection."
    severity: "critical"
    mitigation: "Characterization tests first, one extraction at a time, full validation after each major boundary."

unknowns:
  - "Whether apps/docs already has an ESLint flat config compatible with Next 16."
  - "Whether any current tests assume SafeCliRunner inherits arbitrary environment variables."
  - "Whether existing generated projects require package-manager install before every candidate validation."
  - "Exact best temp workspace strategy: copy filtered tree, overlay operations, or git worktree-style materialization."
```

## 19. Completion Checklist

```yaml
completion_checklist:
  - "Case 1 complete: docs lint script repaired and pnpm lint passes."
  - "Case 2 complete: preflight runs against isolated workspace and real-root immutability test passes."
  - "Case 3 complete: SafeCliRunner env allowlist/redaction tests pass."
  - "Case 4 complete: WorkflowOrchestrator public API preserved and at least event projection/state persistence/CodeChangeSet lifecycle are extracted."
  - "Workflow characterization tests exist and pass."
  - "Shared/server/web validation commands have recorded evidence."
  - "No unrelated frontend monolith refactor entered the diff."
  - "Spec Implementation log is updated with exact files and command results."
```

## 20. Minimal Output Contract For Implementing Agent

```yaml
implementation_output_contract:
  required_summary:
    - "List exact files changed."
    - "Map each changed file to Case 1, 2, 3 or 4."
    - "Report validation commands with exit codes."
    - "Report whether preflight real-root immutability was proven."
    - "Report whether env sanitization was proven."
    - "Report remaining risks or skipped checks."
  forbidden_claims:
    - "Do not claim full release readiness if pnpm lint is not passing."
    - "Do not claim preflight isolation without a test that detects projectRoot mutation."
    - "Do not claim env hardening without a test proving unallowlisted env keys are absent."
    - "Do not claim safe orchestrator refactor without workflow compatibility tests."
```

## 21. Implementation Log

```yaml
implementation_log:
  status: "implemented"
  entries:
    - timestamp_utc: "2026-05-28T00:00:00Z"
      summary: "Implemented the four SPEC 69 cases: repaired docs lint for Next 16 with ESLint flat config, hardened SafeCliRunner env inheritance, kept CodeChangeSet preflight isolated while excluding install from curator validation, and extracted WorkflowOrchestrator event projection, state persistence and CodeChangeSet lifecycle responsibilities."
      case_mapping:
        case_1_lint_gate:
          files:
            - "apps/docs/package.json"
            - "apps/docs/eslint.config.mjs"
            - "apps/docs/lib/use-mounted.ts"
            - "apps/docs/app/components/docs/search-dialog.tsx"
            - "apps/docs/app/components/docs/theme-toggle.tsx"
          result: "pnpm lint passes; docs lint now runs ESLint CLI and real React hook issues were corrected."
        case_2_preflight_isolation:
          files:
            - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
            - "apps/server/test/codeChangeSetPreflightService.test.mjs"
          result: "Preflight validates candidates in a temporary filtered workspace and focused tests prove the real project root remains unchanged."
        case_3_safe_cli_env:
          files:
            - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
            - "apps/server/test/safeCliRunner.test.mjs"
          result: "SafeCliRunner now inherits only an allowlisted environment and explicit command env; regression test proves an arbitrary HORUS_SECRET_PROBE is not visible to child processes."
        case_4_orchestrator_modularization:
          files:
            - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
            - "apps/server/src/domain/services/WorkflowEventProjector.ts"
            - "apps/server/src/domain/services/WorkflowStatePersister.ts"
            - "apps/server/src/domain/services/CodeChangeSetLifecycleService.ts"
            - "apps/server/src/infrastructure/project/ProjectDefaultContractBuilder.ts"
            - "apps/server/test/projectConstructionWorkspace.test.mjs"
          result: "WorkflowOrchestrator keeps its public API but delegates event/chat/memory projection, state persistence/project-run sync and CodeChangeSet candidate/apply lifecycle to dedicated services. Curator command profile no longer allows install/dev/start by default."
      validation:
        - command: "pnpm --filter @u-build/docs lint"
          cwd: "/Users/wamat/Desktop/horus.ai"
          exit_code: 0
        - command: "pnpm --filter @u-build/server build"
          cwd: "/Users/wamat/Desktop/horus.ai"
          exit_code: 0
        - command: "node --test apps/server/test/safeCliRunner.test.mjs apps/server/test/codeChangeSetPreflightService.test.mjs apps/server/test/projectConstructionWorkspace.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs apps/server/test/agentExecutionLedger.test.mjs"
          cwd: "/Users/wamat/Desktop/horus.ai"
          exit_code: 0
          result: "26 tests passed"
        - command: "pnpm lint"
          cwd: "/Users/wamat/Desktop/horus.ai"
          exit_code: 0
        - command: "pnpm type-check"
          cwd: "/Users/wamat/Desktop/horus.ai"
          exit_code: 0
        - command: "pnpm --filter @u-build/web test:guards"
          cwd: "/Users/wamat/Desktop/horus.ai"
          exit_code: 0
          result: "17 tests passed"
        - command: "node --test packages/shared/test/*.test.mjs apps/server/test/*.test.mjs"
          cwd: "/Users/wamat/Desktop/horus.ai"
          exit_code: 0
          result: "236 tests passed"
        - command: "pnpm build"
          cwd: "/Users/wamat/Desktop/horus.ai"
          exit_code: 0
          notes: "Build passed. Vite still warns that the web JS chunk is over 500 kB, and Turbo warns that docs build has no configured output files."
      residual_risks:
        - "Preflight isolation currently copies a filtered project tree to a temp directory. Very large generated projects may still need an overlay/copy-on-write strategy."
        - "The repository worktree already contained many unrelated modifications before this implementation; this pass did not clean or revert them."
```
