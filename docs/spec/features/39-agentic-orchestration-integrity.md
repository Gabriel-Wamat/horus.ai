---
format_version: "agentic_sdd.v1"
task_id: "feature-39-agentic-orchestration-integrity"
title: "Agentic Orchestration Integrity And Post-Curator Apply"
created_at_utc: "2026-05-26T23:20:29Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
---

# 39 - Agentic Orchestration Integrity And Post-Curator Apply

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec extremamente rigorosa detalhando como resolve todos esses problemas, se precisar divida em 2 ou 3 specs para garantir que você conseguirá detalhar bem como resolver, integrar e modularizar a resolução de cada problema
```

## 2. System Interpretation

```yaml
system_translation: |
  Corrigir a integridade do fluxo agentico para que nenhum código gerado pelo FrontAgent seja aplicado antes de validação do Curator, e para que a construção de projeto use o fluxo multiagente real em vez de chamar diretamente apenas o FrontAgent.

expected_user_visible_result: |
  Ao clicar para gerar specs ou iniciar projeto, o usuário verá status coerente do fluxo: Spec Agent, aprovação humana quando aplicável, Horus/Odin, Front, QA, Curator, retries e conclusão. O projeto só será considerado construído quando a curadoria e o quality gate aprovarem a entrega.

expected_engineering_result: |
  A aplicação de CodeChangeSet será transacional e acontecerá somente depois de Curator aprovar. O fluxo "Iniciar projeto" será conectado ao orquestrador multiagente com contratos explícitos para specs, user stories, artefatos, code changes, retries e eventos.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O sistema pode aparentar ter agentes, mas aplica alterações cedo demais e a construção de projeto não passa pelo ciclo completo Odin/Front/QA/Curator."
  target_user: "Usuário operador do Horus criando user stories, specs e projetos no workspace."
  expected_outcome: "Construção confiável, auditável e sem código aplicado antes de aprovação agentica."
  product_surface:
    - "Tela User Stories"
    - "Preview chat"
    - "Project construction"
    - "Workflow timeline / run flow"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "Node.js"
      - "TypeScript"
      - "Express"
      - "LangGraph"
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
    database:
      - "Postgres repositories"
    infrastructure:
      - "Local project workspaces"
      - "Git-backed generated project directories"
  known_entrypoints:
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/langgraph/graph.ts"
    - "apps/server/src/application/usecases/StartProjectConstructionUseCase.ts"
  known_existing_patterns:
    - "WorkflowGraph dependencies are injectable through LangGraphDependencies."
    - "Workflow state is persisted after graph stream completion."
    - "CodeChangeSet repositories persist proposed/applied/failed code changes."
    - "Project workspaces are isolated and git-backed."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Move CodeChangeSet apply from agent-node completion to post-Curator approval."
    - "Represent proposed, rejected, approved, applied and failed CodeChangeSet lifecycle explicitly."
    - "Make StartProjectConstructionUseCase use the multiagent workflow instead of directly calling generateProjectExecutionPlan."
    - "Ensure retries do not apply failed/intermediate FrontAgent outputs."
    - "Preserve chat-driven code-change flow without routing every message through SpecAgent."
    - "Persist enough run state for frontend timeline and future debugging."
    - "Add focused tests proving pre-curator outputs are not applied."
  out_of_scope:
    - "Redesign the User Stories UI."
    - "Change LLM provider selection."
    - "Implement browser visual QA; that is covered by spec 41."
    - "Migrate generated frontend architecture to React; that is covered by spec 40."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/langgraph/graph.ts"
      - "apps/server/src/infrastructure/langgraph/state.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
      - "apps/server/src/application/usecases/StartProjectConstructionUseCase.ts"
      - "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
      - "apps/server/src/infrastructure/repositories/contracts.ts"
    services:
      - "WorkflowOrchestrator"
      - "ProjectCodeChangeSetApplier"
      - "ProjectConstructionRepository"
      - "CodeChangeSetRepository"
    database:
      migrations_required: true
      tables:
        - "code_change_sets"
        - "workflow_states"
        - "project_construction_runs"
        - "workflow_events"
  frontend:
    files:
      - "apps/web/src/api/workflowApi.ts"
      - "apps/web/src/components/StorySpecWorkspace.tsx"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
    components:
      - "User Stories action buttons"
      - "Run flow/timeline viewers"
    routes:
      - "UserStories screen"
      - "Preview screen"
  workflow:
    graph_nodes:
      - "specAgent"
      - "hitlCheckpoint"
      - "odinAgent"
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
      - "retryCheckpoint"
    agents:
      - "Horus/Odin"
      - "FrontAgent"
      - "QAAgent"
      - "CuratorAgent"
  tests:
    unit:
      - "apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
      - "apps/server/test/selectCuratorInputs.test.mjs"
    integration:
      - "apps/server/test/projectConstructionWorkspace.test.mjs"
      - "apps/server/test/horusChatTurn.test.mjs"
    e2e:
      - "Workflow start to approved apply smoke test"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This change turns the graph into the single source of truth for agent execution and makes Curator approval the boundary before any generated code is applied to a project workspace.

  depends_on:
    - name: "WorkflowGraph"
      type: "workflow"
      owner: "backend/langgraph"
      direction: "this_spec_consumes_dependency"
      contract_used: "graph.stream(input, config) emits node updates"
      required_for: "Detect when FrontAgent, QAAgent and Curator complete."
      assumptions: []
      failure_modes:
        - "Node update shape changes and CodeChangeSet lifecycle is not detected."
      fallback_or_recovery: "Fail workflow and persist error event."
      verification:
        - "Unit test with fake graph stream emitting frontAgent then curatorAgent."

    - name: "CodeChangeSetRepository"
      type: "backend_service"
      owner: "infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "save(changeSet), listByWorkflow(threadId)"
      required_for: "Persist proposed and applied changes without losing audit trail."
      assumptions:
        - "Repository can store extra lifecycle fields or status values after migration."
      failure_modes:
        - "Generated changes are lost or applied without trace."
      fallback_or_recovery: "Return workflow error and do not write project files."
      verification:
        - "Repository test for proposed -> approved -> applied status transition."

    - name: "ProjectCodeChangeSetApplier"
      type: "backend_service"
      owner: "infrastructure/code"
      direction: "this_spec_consumes_dependency"
      contract_used: "apply({ changeSet, projectRootPath }): Promise<CodeChangeSet>"
      required_for: "Write approved files inside isolated project roots."
      assumptions: []
      failure_modes:
        - "Partial write corrupts project."
      fallback_or_recovery: "Rollback applied operations and mark change set failed."
      verification:
        - "Test partial failure rollback."

  depended_on_by:
    - name: "User Stories UI"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Workflow event/status API and persisted workflow status"
      compatibility_obligation: "must preserve existing start/resume/status behavior and may extend event payloads"
      expected_consumer_behavior: "Show progress and only show project as ready after applied Curator-approved changes."
      migration_or_notification_required: false
      verification:
        - "Frontend smoke with disabled/enabled buttons and completed workflow state."

    - name: "Preview Chat"
      type: "workflow"
      owner: "apps/server/application"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "startChatCodeChange(input)"
      compatibility_obligation: "must preserve chat isolation and avoid SpecAgent for normal code-change chat requests"
      expected_consumer_behavior: "Chat action starts executor flow with active story/spec/project."
      migration_or_notification_required: false
      verification:
        - "horusChatTurn test proving code_change starts at Odin and not SpecAgent."

  bidirectional_integrations:
    - name: "FrontAgent-Curator-CodeApply lifecycle"
      participants:
        - "FrontAgent"
        - "CuratorAgent"
        - "WorkflowOrchestrator"
        - "ProjectCodeChangeSetApplier"
      shared_contract: "CodeChangeSet status and workflowThreadId/userStoryId/specRevisionId"
      consistency_rule: "Only CodeChangeSet from the latest FrontAgent attempt for the active story/spec can be applied after Curator passed=true."
      verification:
        - "Test multiple failed retries do not write files; only final approved change writes files."

  data_flow:
    inbound:
      - source: "FrontAgent node"
        payload_or_state: "AgentResult.output.codeChangeSet"
        validation: "CodeChangeSetSchema.parse plus ownership checks"
      - source: "CuratorAgent node"
        payload_or_state: "passed, score, missingItems, fixTarget"
        validation: "CuratorOutput schema and state.currentUSIndex alignment"
    outbound:
      - target: "CodeChangeSetRepository"
        payload_or_state: "proposed/approved/applied/failed CodeChangeSet"
        compatibility: "existing listByWorkflow consumers must continue reading saved change sets"
      - target: "Project workspace files"
        payload_or_state: "approved file operations"
        compatibility: "writes must stay inside selected project root"

  sequencing_dependencies:
    - dependency: "Curator decision must happen after latest FrontAgent and QAAgent results for the same story."
      reason: "Avoid approving stale or incomplete output."
      validation: "selectCuratorInputs test with multiple attempts."
    - dependency: "Code apply must happen after Curator passed=true."
      reason: "Prevent bad code from entering project workspace."
      validation: "workflowOrchestrator test asserting no file exists before curator pass."

  integration_risks:
    - risk: "Existing UI expects node_completed as soon as FrontAgent finishes."
      severity: "medium"
      mitigation: "Keep node_completed event but add code_change_set status events separately."
    - risk: "Chat-driven code changes need project root but standard spec workflows may not have one."
      severity: "high"
      mitigation: "Apply only when frontendProjectRootPath exists; otherwise persist proposed artifact without writing."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve domain/application/infrastructure boundaries."
    - "Prefer dependency injection over direct construction of concrete services."
    - "Avoid circular imports between graph nodes and application use cases."
    - "Do not apply side effects inside LangGraph nodes except producing state updates."
  project_specific:
    - "LangGraph nodes produce proposed outputs; WorkflowOrchestrator owns persistence and side effects."
    - "Project file writes must go through ProjectCodeChangeSetApplier or ProjectExecutionService, never directly from an agent implementation."
    - "Curator pass is the only approval signal for automated code apply."
    - "HITL approval remains the approval signal for spec acceptance, not for arbitrary code writes unless explicitly added later."
```

## 8. Contracts And Invariants

```yaml
contracts:
  code_change_lifecycle:
    statuses:
      - "proposed"
      - "curator_rejected"
      - "curator_approved"
      - "applied"
      - "failed"
    invariant: "applied requires curator_approved for the same workflowThreadId/userStoryId/specRevisionId."
  latest_attempt_selection:
    invariant: "Curator validates only the latest FrontAgent result and latest QAAgent result for current userStoryId."
  project_apply:
    invariant: "No operation can write outside frontendProjectRootPath."
  eventing:
    invariant: "Frontend receives explicit progress for generated, validated, applied, failed and retry states."
```

## 9. Execution Plan

```yaml
execution_plan:
  phase_1_state_and_repository_contract:
    - "Extend CodeChangeSet status schema if needed."
    - "Add migration for new lifecycle status metadata if current DB schema is too narrow."
    - "Add repository methods or safe helper to save lifecycle transitions without overwriting audit fields."

  phase_2_orchestrator_side_effect_boundary:
    - "Stop calling apply from generic node_completed handling."
    - "Persist FrontAgent CodeChangeSet as proposed when FrontAgent finishes."
    - "When Curator passes, select latest proposed CodeChangeSet for active story/spec and apply it."
    - "When Curator fails, mark latest proposed CodeChangeSet as curator_rejected and never write it."
    - "On retry, keep prior rejected attempts visible but non-applied."

  phase_3_project_construction_integration:
    - "Replace direct generateProjectExecutionPlan loop with orchestration-backed construction or a shared construction runner that executes Odin/Front/QA/Curator semantics."
    - "Ensure selected user stories/specs become initial graph state."
    - "Ensure generated project workspace root is passed as frontendProjectRootPath."
    - "Persist project construction run status from workflow terminal state."

  phase_4_events_and_ui_contract:
    - "Emit code_change_set_proposed, code_change_set_rejected, code_change_set_applied and code_change_set_failed events."
    - "Keep existing events backward compatible."
    - "Update UI labels only if needed to show true lifecycle state."

  phase_5_tests:
    - "Add no-apply-before-curator test."
    - "Add rejected-curator-does-not-write test."
    - "Add approved-curator-applies-latest-attempt test."
    - "Add project construction delegates through multiagent orchestration test."
```

## 10. Validation Protocol

```yaml
validation_protocol:
  static_checks:
    - command: "pnpm --filter @u-build/server type-check"
      cwd: "<REPOSITORY_ROOT>"
      required: true
    - command: "pnpm --filter @u-build/web type-check"
      cwd: "<REPOSITORY_ROOT>"
      required: true

  tests:
    - command: "node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs apps/server/test/projectConstructionWorkspace.test.mjs apps/server/test/horusChatTurn.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      required: true
    - command: "pnpm test"
      cwd: "<REPOSITORY_ROOT>"
      required: false

  runtime_checks:
    - command: "./scripts/run_local_api.sh"
      cwd: "<REPOSITORY_ROOT>"
      expected: "Backend health OK and workflow APIs reachable."

  manual_checks:
    - "Start a sample folder with specs and confirm generated files only appear after Curator pass."
    - "Open preview and confirm project is visible only after applied state."
```

## 11. Acceptance Criteria

- FrontAgent completion alone never writes project files.
- Curator failure marks generated CodeChangeSet rejected/failed and does not apply files.
- Curator pass applies only the latest CodeChangeSet for the active story/spec.
- Retry loop preserves failed attempts without corrupting project workspace.
- “Iniciar projeto” goes through the same agentic approval semantics as chat code changes.
- UI can distinguish generated, validating, retrying, applied and failed states.
- Tests prove the lifecycle and no-early-apply invariant.

## 12. Agent Error Mitigation

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent event names without updating shared schemas and consumers."
    - "Do not assume repository methods exist; inspect contracts first."
  anti_overengineering:
    - "Do not create a second workflow engine."
    - "Extend the existing WorkflowOrchestrator and graph contracts."
  anti_regression:
    - "Keep existing chat isolation behavior."
    - "Keep existing spec HITL approval behavior."
    - "Do not break file-based repositories while adding Postgres support."
  anti_false_validation:
    - "Do not claim project construction passed unless quality gate and code apply are verified."
```

## 13. Final Output Contract

```yaml
final_report:
  status: "completed | partially_completed | blocked"
  files_changed:
    - "list every changed file"
  lifecycle_evidence:
    - "proof no code was applied before curator"
    - "proof approved code was applied"
  validation:
    commands_run:
      - "command, cwd, exit code"
    not_run:
      - "reason"
  remaining_risks:
    - "explicit risk or empty"
```
