```yaml
format_version: "agentic_sdd.v1"
task_id: "59-agentic-project-construction-reliability"
title: "Agentic Project Construction Reliability"
created_at_utc: "2026-05-27T06:32:41Z"
author: "agent"
target_mode: "bugfix"
priority: "p0"
risk_level: "critical"
```

# 1. Original User Request

```yaml
raw_user_request: |
  liste todos esses problemas e crie uma spec para resolver eles
```

# 2. System Interpretation

```yaml
system_translation: |
  Resolver falhas sistêmicas observadas ao pedir ao Horus para gerar um frontend React/Vite de gerenciamento de projeto.
  O fluxo atual produz specs e propostas de patch, mas não consegue entregar um projeto validado de forma confiável.
  A correção deve cobrir timeout do FrontAgent, fallback de geração, preflight de dependências, mensagens de erro,
  sincronização entre workflow e project construction run, retries repetidos e evidência real de build/preview.

expected_user_visible_result: |
  Ao solicitar a geração de um frontend, o usuário deve ver progresso real, erro legível quando houver falha,
  retry com correção objetiva e, ao final, um projeto realmente alterado, validado e abrível no preview.

expected_engineering_result: |
  O workflow só pode declarar sucesso quando os arquivos foram aplicados, dependências foram instaladas,
  type-check/build/test passaram, preview foi verificado, e os estados persistidos refletem o resultado real.
```

# 3. Observed Problem Inventory

1. **FrontAgent expira em saídas estruturadas grandes.**
   - Evidência: múltiplos runs falharam com `FrontAgent timed out after 180s while generating project file operations`.
   - Impacto: o usuário pede um front robusto, mas o agente não aplica arquivos.

2. **Fallback de FrontAgent não preserva contrato do entrypoint.**
   - Evidência reproduzida em diretório temporário: `src/main.tsx(3,10): error TS2614: Module '"./App"' has no exported member 'App'. Did you mean to use 'import App from "./App"' instead?`
   - Causa: fallback gerou `function App()` + `export default App`, enquanto o scaffold importa `import { App } from "./App"`.

3. **Preflight valida projeto novo antes de instalar dependências.**
   - Evidência inicial: `tsc: command not found` ao reproduzir o patch antes de `npm install`.
   - Impacto: falha falsa em `type-check`, `test` e `build`.

4. **Preflight registra erro pouco útil.**
   - Evidência persistida no `failed_reason`: só aparece `npm warn Unknown env config "recursive"` para os comandos que falharam.
   - Impacto: esconde o erro real de TypeScript/build e impede retry inteligente.

5. **Retry repete o mesmo patch inválido.**
   - Evidência: CodeChangeSets sucessivos com os mesmos dois arquivos e a mesma falha terminal.
   - Impacto: consome tentativas sem corrigir causa raiz.

6. **Status de construção fica divergente do workflow.**
   - Evidência: `/api/workflow/status/:id` entra em `error` ou `awaiting_human`, enquanto `/api/project-construction/runs/:id` pode permanecer `running` e até com `workflowRunId: null`.
   - Impacto: UI e API mostram progresso/estado incoerente.

7. **Project construction não expõe command runs e quality gates de CodeChangeSet preflight.**
   - Evidência: workflow events mostram `validation_evidence`, mas `project-construction/runs/:id` retorna `commands: []` e `gates: []`.
   - Impacto: o usuário não consegue auditar o que falhou.

8. **Patch proposto não vira projeto real quando preflight falha.**
   - Evidência: workspace final ainda mantinha `src/App.tsx` com `WelcomeScreen`, apesar de eventos `Front Agent concluiu`.
   - Impacto: usuário vê “agente concluiu”, mas o frontend não foi gerado.

9. **Preview smoke fica `skipped` em cenários onde o objetivo é visual.**
   - Evidência: `validation_evidence` com `preview: skipped`.
   - Impacto: não existe prova visual de que o front é bonito, responsivo e navegável.

10. **Mensagens operacionais são técnicas demais e pouco acionáveis.**
    - Evidência: eventos como `Patch proposto`, `Retry iniciado`, `Status: failed; comandos: 4; falhas: 3; preview: skipped`.
    - Impacto: o usuário não entende se o Horus está corrigindo, travado ou só repetindo a falha.

# 4. Product and Technical Context

```yaml
business_context:
  user_problem: "O Horus precisa gerar projetos frontend robustos e bonitos sem entregar falsa conclusão ou falha silenciosa."
  target_user: "Usuário que usa o Horus para transformar user stories/specs em projetos React executáveis."
  expected_outcome: "Projeto gerado, validado, com preview real e falhas inteligíveis quando algo bloquear."
  product_surface:
    - "Project construction workflow"
    - "Agent flow / preview progress"
    - "Generated frontend workspaces"
    - "CodeChangeSet preflight and runtime validation"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph"
      - "Postgres persistence"
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
    database:
      - "Postgres tables: workflow_events, workflow_states, code_change_sets, project_construction_runs, project_command_runs, project_quality_gates"
    infrastructure:
      - "SafeCliRunner"
      - "ProjectExecutionService"
      - "CodeChangeSetPreflightService"
  known_entrypoints:
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
    - "apps/server/src/infrastructure/repositories/PostgresProjectConstructionRepository.ts"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/features/agent-flow-map/utils/deriveHorusRunSnapshot.ts"
  known_existing_patterns:
    - "CodeChangeSet is proposed by FrontAgent and applied only after Curator approval."
    - "Terminal validation evidence is converted into runtime evidence."
    - "Project commands must come from commandCatalog."
    - "Generated React/Vite projects start with src/main.tsx importing named App from src/App.tsx."
```

# 5. Scope

```yaml
scope:
  in_scope:
    - "Make FrontAgent fallback deterministic, entrypoint-aware and type-safe."
    - "Make preflight install dependencies before type-check/test/build when dependencies are absent."
    - "Persist complete command evidence, including the actual TypeScript/build error, not only npm warnings."
    - "Feed structured validation failure back into FrontAgent retries so repeated patches are forbidden."
    - "Synchronize project_construction_runs status/workflowRunId with workflow state."
    - "Expose preflight command runs and quality gates in project construction APIs/UI."
    - "Require preview smoke for visual project generation before success."
    - "Improve user-facing run messages with concise, actionable progress."
  out_of_scope:
    - "Redesign the entire Horus UI."
    - "Change LLM provider architecture beyond timeout/fallback/error handling."
    - "Replace LangGraph orchestration."
    - "Add external design generation services."
    - "Change generated project stack away from React/Vite/TypeScript."
```

# 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
      - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
      - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
      - "apps/server/src/infrastructure/project/ProjectQualityGateService.ts"
      - "apps/server/src/infrastructure/repositories/PostgresProjectConstructionRepository.ts"
      - "apps/server/src/infrastructure/http/routes/projectConstructionRoutes.ts"
    services:
      - "FrontAgent"
      - "CuratorAgent"
      - "CodeChangeSetPreflightService"
      - "ProjectExecutionService"
      - "ProjectConstructionRepository"
    database:
      migrations_required: false
      tables:
        - "code_change_sets"
        - "workflow_events"
        - "project_construction_runs"
        - "project_command_runs"
        - "project_quality_gates"
  frontend:
    files:
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/api/workflowApi.ts"
      - "apps/web/src/features/agent-flow-map/utils/deriveHorusRunSnapshot.ts"
    components:
      - "Preview conversation panel"
      - "Agent flow status"
      - "Project construction run inspector"
    routes:
      - "?mode=preview"
      - "?mode=agents"
  workflow:
    graph_nodes:
      - "frontAgentNode"
      - "curatorAgentNode"
      - "odin router"
    agents:
      - "Front Agent"
      - "Curator Agent"
      - "Odin"
  tests:
    unit:
      - "apps/server/test/codeChangeSetPreflightService.test.mjs"
      - "apps/server/test/frontAgentNodeCodeContext.test.mjs"
      - "apps/server/test/projectQualityGateService.test.mjs"
    integration:
      - "StartProjectConstructionUseCase construction status synchronization"
      - "Workflow event persistence for validation evidence"
    e2e:
      - "Generate React/Vite project from a user story and verify build + preview"
```

# 7. Integration Context Map

```yaml
integration_context:
  summary: |
    This change connects the generation workflow, CodeChangeSet preflight, project construction persistence,
    command execution evidence, and preview UI so they agree on whether a generated project is actually delivered.

  depends_on:
    - name: "Generated React/Vite scaffold"
      type: "internal_module"
      owner: "project construction"
      direction: "this_spec_consumes_dependency"
      contract_used: "src/main.tsx imports { App } from './App'"
      required_for: "Fallback and LLM-generated patches must preserve entrypoint compatibility."
      assumptions: []
      failure_modes:
        - "TypeScript fails with missing named App export."
      fallback_or_recovery: "FrontAgent must inspect entrypoint exports/imports before writing fallback."
      verification:
        - "npm run type-check in generated workspace"

    - name: "commandCatalog"
      type: "backend_service"
      owner: "ProjectDefaultContractBuilder"
      direction: "this_spec_consumes_dependency"
      contract_used: "install-root-dependencies, type-check-root-type-check, test-root-test, build-root-build"
      required_for: "Preflight must run deterministic commands in safe order."
      assumptions: []
      failure_modes:
        - "Validation runs before dependencies exist."
        - "Validation uses unavailable commands."
      fallback_or_recovery: "If install command exists, run it before validation commands; otherwise detect node_modules/dependencies and report explicit missing dependency state."
      verification:
        - "Unit test with fresh package.json and no node_modules"

    - name: "CodeChangeSet persistence"
      type: "database"
      owner: "workflow persistence"
      direction: "this_spec_consumes_dependency"
      contract_used: "code_change_sets.status, failed_reason, operations, validation"
      required_for: "Retries and UI need exact failure details."
      assumptions: []
      failure_modes:
        - "Failed reason truncates/hides real compiler error."
      fallback_or_recovery: "Store structured command evidence with stdoutTail and stderrTail merged into user-visible diagnostic."
      verification:
        - "Postgres query after failed preflight contains TypeScript error text"

  depended_on_by:
    - name: "Preview chat and agent map UI"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "workflow_events, validation_evidence, project construction status"
      compatibility_obligation: "must preserve existing event types and may add structured metadata"
      expected_consumer_behavior: "Show concise progress and actionable error, not raw thread ids or generic failed command count."
      migration_or_notification_required: false
      verification:
        - "Frontend regression test for progress/error rendering"

    - name: "User project download/preview"
      type: "workflow"
      owner: "project construction"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "passed construction run with workspacePath and previewUrl"
      compatibility_obligation: "success requires applied files, passing validation and preview smoke"
      expected_consumer_behavior: "Only offer final project when quality gates passed."
      migration_or_notification_required: false
      verification:
        - "E2E: run status passed, App.tsx changed, npm run build passed, preview body contains generated UI"

  bidirectional_integrations:
    - name: "FrontAgent retry loop"
      participants:
        - "FrontAgent"
        - "CuratorAgent"
        - "Odin router"
      shared_contract: "curatorFeedback + runtimeValidation evidence"
      consistency_rule: "A retry must address the previous failure signature and must not emit the identical invalid patch."
      verification:
        - "Test repeated CodeChangeSet hash is rejected unless failure reason changed"

  data_flow:
    inbound:
      - source: "User story/spec"
        payload_or_state: "Spec with components, acceptanceCriteria, visualContract"
        validation: "SpecSchema"
      - source: "SafeCliRunner"
        payload_or_state: "ProjectCommandRun with stdoutTail, stderrTail, exitCode"
        validation: "ProjectCommandRunSchema"
    outbound:
      - target: "workflow_events"
        payload_or_state: "validation_evidence, patch_proposed, patch_applied, retry_started, awaiting_retry_approval"
        compatibility: "Existing events preserved; add metadata without breaking old clients."
      - target: "project_construction_runs"
        payload_or_state: "status, workflowRunId, error, finishedAt"
        compatibility: "Run status must mirror terminal workflow state."

  sequencing_dependencies:
    - dependency: "Dependency install before TypeScript/build/test"
      reason: "Fresh generated projects do not have node_modules."
      validation: "Command evidence order begins with install-root-dependencies."
    - dependency: "Preflight before applying CodeChangeSet"
      reason: "Broken code must not be written to the real project."
      validation: "Failed preflight rolls back candidate files."
    - dependency: "Preview smoke after successful apply"
      reason: "Visual feature cannot be considered complete without rendered UI."
      validation: "Preview evidence status passed and screenshot/body snippet exists."

  integration_risks:
    - risk: "Running npm install in preflight increases latency."
      severity: "medium"
      mitigation: "Skip install when node_modules and lockfile hash are already current; otherwise run once per workspace."
    - risk: "Fallback UI becomes too generic."
      severity: "medium"
      mitigation: "Fallback must use spec title, summary, acceptance criteria and local entrypoint contract."
    - risk: "Project status migration changes UI assumptions."
      severity: "high"
      mitigation: "Keep old fields and add derived status only after tests."
```

# 8. Required Implementation Plan

1. **Harden FrontAgent fallback.**
   - Inspect `codeContext.files` for `src/main.tsx` and determine whether `App` is imported as named or default.
   - Generate matching export shape:
     - If `import { App } from "./App"`, emit `export function App()`.
     - If `import App from "./App"`, emit `function App()` plus `export default App`.
   - Add a unit test for both entrypoint styles.
   - Keep timeout fallback, but set the fallback output summary as an explicit controlled fallback, not an agent “success” without qualification.

2. **Fix preflight command ordering.**
   - `CodeChangeSetPreflightService` must include `install-*` commands before validation commands for fresh generated projects.
   - Do not run install repeatedly when dependencies are already present and package files did not change.
   - Tests must assert command order and that `install-root-dependencies` failure blocks later validation.

3. **Expose complete terminal error diagnostics.**
   - Store merged diagnostic text containing:
     - command id
     - command
     - exit code
     - stderr tail
     - stdout tail
     - first TypeScript/build error line when present
   - Avoid selecting only `stderrTail` if it contains a non-fatal npm warning while real errors are in stdout.
   - UI copy must show the actionable error first.

4. **Make retries evidence-driven.**
   - Feed structured `runtimeValidation.commands[*]` and `issues` into `curatorFeedback`.
   - FrontAgent retry prompt must include the previous exact compiler/build error.
   - Reject identical CodeChangeSet content on retry when the previous failure signature is unchanged.
   - Odin must stop after the configured retry limit and mark the run as failed/awaiting user with exact next action.

5. **Synchronize workflow and project construction state.**
   - Ensure project construction run persists `workflowRunId` immediately and never regresses to `null`.
   - On workflow terminal states:
     - `passed` -> construction run `passed`, `finishedAt` set.
     - `error`/failed validation after retry limit -> construction run `failed`, `error` set.
     - `awaiting_human` -> construction run remains non-terminal but exposes `pendingApproval`.
   - Add repository tests for status synchronization.

6. **Persist preflight evidence into project construction APIs.**
   - Convert CodeChangeSet preflight command evidence into `project_command_runs` or expose it through the run endpoint.
   - Create a `project_quality_gates` row for each preflight attempt with failed checks.
   - `/api/project-construction/runs/:id` must return non-empty `commands` and `gates` when validation has run.

7. **Require visual preview proof for visual tasks.**
   - After patch apply and terminal validation pass, start the preview command.
   - Run smoke verification against the preview URL.
   - Capture body snippet and screenshot or static DOM evidence.
   - Mark visual project construction incomplete if preview is skipped without explicit reason.

8. **Clean user-facing progress messages.**
   - Replace raw event summaries with concise states:
     - "Gerando interface"
     - "Validando dependências"
     - "Corrigindo erro de TypeScript"
     - "Abrindo preview"
     - "Entrega validada"
   - Hide thread ids and raw CodeChangeSet ids by default; keep them in debug/inspector.
   - Avoid dumping many messages at once in chat; stream or group milestones.

# 9. Contracts and Invariants

```yaml
contracts:
  generated_react_app:
    invariant: "Generated src/App.tsx must match the import contract used by src/main.tsx."
    examples:
      - "src/main.tsx: import { App } from './App' => src/App.tsx must export function App or export const App"
      - "src/main.tsx: import App from './App' => src/App.tsx must default export App"

  validation_order:
    invariant: "Fresh workspace validation must install dependencies before type-check/test/build."

  true_success:
    invariant: "A project construction run cannot be passed unless files were applied and terminal validation passed."

  visual_success:
    invariant: "For visual/frontend generation, preview smoke cannot be skipped in a successful run."

  retry_discipline:
    invariant: "A retry cannot resubmit byte-identical file operations after the same validation failure."

  evidence_quality:
    invariant: "Every failed validation must include the root actionable error, not only warnings."
```

# 10. Validation Plan

```yaml
validation:
  static:
    - "pnpm --filter @u-build/server build"
    - "pnpm test"
  unit_tests:
    - "FrontAgent fallback preserves named App export"
    - "FrontAgent fallback preserves default App export"
    - "CodeChangeSetPreflightService runs install before type-check/test/build in fresh workspace"
    - "CodeChangeSetPreflightService captures stdout TypeScript errors even when stderr has npm warnings"
    - "Retry loop rejects identical patch for same failure signature"
  integration_tests:
    - "Start project construction persists workflowRunId and terminal status"
    - "Project construction run endpoint exposes command evidence and quality gate failure"
    - "Curator feedback includes runtime command failure details"
  e2e_tests:
    - "Create one React/Vite project from a project-management UI story"
    - "Wait for workflow terminal state"
    - "Assert src/App.tsx is changed from WelcomeScreen"
    - "Run npm install, npm run type-check, npm test, npm run build"
    - "Start preview and verify rendered Home, Tarefas and Calendario navigation"
```

# 11. Acceptance Criteria

1. A generated React/Vite project no longer fails with missing `App` export.
2. Fresh generated workspaces run dependency install before validation.
3. Failed validation messages include the real root cause, e.g. TypeScript compiler line, not only npm warnings.
4. The same invalid CodeChangeSet cannot be retried repeatedly without change.
5. `/api/project-construction/runs/:id` and `/api/workflow/status/:id` agree on terminal and waiting states.
6. Project construction run details expose command evidence and quality gates.
7. A successful visual/frontend generation includes passing terminal validation and preview smoke evidence.
8. If the system cannot deliver after max retries, it marks the run failed/awaiting user with exact fix targets.
9. User-facing progress messages are concise and actionable.
10. `pnpm test` passes after implementation.

# 12. Execution Guardrails

- Do not mark any run as successful based only on `Front Agent concluiu`.
- Do not apply broken patches to the real workspace after failed preflight.
- Do not hide validation details behind generic "command failed" messages.
- Do not increase retry count without changing the candidate patch or explaining why retry is impossible.
- Do not introduce shell commands outside the configured `commandCatalog`.
- Do not skip preview verification for frontend generation unless the project has no runnable preview command; if skipped, expose the reason.

# 13. Minimal Output Contract For Implementing Agent

When implementing this spec, the agent must report:

```yaml
changed_files:
  - "<path>"
tests_run:
  - "pnpm test"
e2e_runs:
  - workflow_run_id: "<id>"
    construction_run_id: "<id>"
    final_status: "<passed | failed | awaiting_human>"
    generated_project_path: "<absolute path>"
    preview_url: "<url or null>"
    evidence_summary: "<build/type-check/preview result>"
known_residual_risks:
  - "<risk or empty>"
```
