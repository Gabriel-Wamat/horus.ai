---
format_version: "agentic_sdd.v1"
task_id: "feature-62-preview-project-registry-hygiene"
title: "Preview Project Registry Hygiene And Canonical Delivery"
created_at_utc: "2026-05-27T13:14:20Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "1.1.0"
status: "implemented"
depends_on:
  - "spec/features/16-visual-preview-backend-runtime.md"
  - "spec/features/17-visual-preview-frontend-console.md"
  - "spec/features/25-process-browser-preview-adapter.md"
  - "spec/features/26-preview-command-policy-and-catalog.md"
  - "spec/features/27-preview-runtime-observability.md"
  - "spec/features/28-qa-preview-smoke-validation.md"
  - "spec/features/40-react-frontend-project-architecture.md"
  - "spec/features/47-validation-gates-true-success.md"
  - "spec/features/59-agentic-project-construction-reliability.md"
---

# 62 - Preview Project Registry Hygiene And Canonical Delivery

## 1. Original User Request

```yaml
raw_user_request: |
  use a skill de criar specs para criar o planejamento desse problema rigorosamente(lembre de colocar a versão na pasta de specs, que tá na raíz do projeto). quero que destrinche cada cenário abordando diversos casos que podem dar erro, já para você desenhar uma solução robusta sobre como resolver isso. Caso precise, pesquise na web boas práticas para esse tipo de problema
```

## 2. System Interpretation

```yaml
system_translation: |
  Planejar uma correção robusta para a sujeira sistêmica no catálogo de projetos de preview do Horus.
  O select da tela Preview está expondo tentativas técnicas, retries, projetos scaffold, entradas antigas e
  múltiplos projetos que compartilham a mesma previewUrl/porta. Isso causa preview em branco, erro de timeout,
  front errado carregado, confusão para o usuário e falsa impressão de que agentes entregaram projetos válidos.

expected_user_visible_result: |
  Na tela Preview, o usuário vê apenas projetos canônicos e úteis por padrão. Projetos falhos, scaffold,
  duplicados ou tentativas antigas ficam arquivados/filtrados com motivo visível. Ao iniciar um preview,
  o canvas sempre carrega o projeto selecionado ou mostra erro específico e acionável, nunca um timeout genérico
  nem o front de outro projeto.

expected_engineering_result: |
  Introduzir lifecycle/status no registry de frontend projects, auditoria de saúde por projeto, migração/reparo
  de portas e commandCatalog, canonicalização por família de projeto, validações de manifesto/porta/processo,
  filtros de UI, mensagens de erro específicas, testes unitários/integrados e runbook seguro de limpeza.
```

## 3. Investigation Basis

```yaml
local_evidence:
  - "GET /api/preview/projects retornou 13 projetos visíveis no select."
  - "12 projetos diferentes estavam registrados com previewUrl http://127.0.0.1:5184."
  - "A porta 5184 estava ocupada por processo Vite do workspace project-manager-beautiful-ui-spec59-status-76a48be0."
  - "Selecionar project-manager-beautiful-ui-spec59-clean resultou em erro Preview URL did not become reachable before timeout."
  - "9 projetos React/Vite diferentes tinham o mesmo hash de src/App.tsx e renderizavam apenas <WelcomeScreen />."
  - "Somente project-manager-beautiful-ui-spec59-final e project-manager-beautiful-ui-spec59-status tinham app real com Home, Tarefas e Calendario."
  - "Project construction workspaces continham multiplas entradas userstories-agent-validation com mesmo nome e diferentes estados/roots."
  - "data/frontend-projects/projects.json tinha apenas a seed user_stories, enquanto a UI vinha de Postgres; logo file-mode e Postgres podem divergir."

web_research:
  required_for_this_spec: false
  rationale: |
    A causa raiz foi reproduzida por evidencia local: registry, endpoints, manifests, processos e arquivos gerados.
    A solucao segue praticas consolidadas de lifecycle de recursos, health checks, canonicalizacao, migracoes
    idempotentes, soft archive em vez de delecao destrutiva, validacao de manifesto e erros acionaveis.
    Pesquisa externa deve ser feita somente se a implementacao escolher uma biblioteca nova de migracao, locking,
    processo ou scheduler, o que esta spec nao exige.
```

## 4. Product And Technical Context

```yaml
business_context:
  user_problem: "O usuario nao consegue confiar no select da Preview: alguns projetos nao carregam, outros sao iguais, e alguns mostram front errado."
  target_user: "Operador do Horus que precisa inspecionar, testar e continuar projetos gerados por agentes."
  expected_outcome: "Catalogo limpo, preview confiavel, projetos ruins arquivados com diagnostico e novas geracoes impedidas de poluir a lista."
  product_surface:
    - "Tela Preview"
    - "Select de projetos"
    - "Preview canvas iframe"
    - "Chat contextual do projeto selecionado"
    - "Arquivos / Project Files"
    - "Project construction workflow"
    - "Agent generated project registry"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "PreviewRuntimeManager"
      - "ProcessBrowserPreviewAdapter"
      - "Postgres persistence"
      - "File-mode fallback repositories"
    frontend:
      - "React"
      - "Vite"
      - "VisualPreviewConsole"
      - "PreviewConversationPanel"
      - "PreviewCanvas"
    database:
      - "frontend_projects"
      - "preview_sessions"
      - "project_workspaces"
      - "project_construction_runs"
    infrastructure:
      - "commandCatalog"
      - "horus.project.json"
      - "project.horus.json"
      - "Vite dev server"
      - "local process ownership via cwd/port"
  known_entrypoints:
    - "packages/shared/src/entities/Preview.ts"
    - "apps/server/src/infrastructure/repositories/PostgresFrontendProjectRepository.ts"
    - "apps/server/src/infrastructure/preview/FileFrontendProjectRegistry.ts"
    - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
    - "apps/server/src/infrastructure/preview/ProcessBrowserPreviewAdapter.ts"
    - "apps/server/src/application/usecases/StartProjectConstructionUseCase.ts"
    - "apps/server/src/infrastructure/http/routes/previewRoutes.ts"
    - "apps/web/src/api/previewApi.ts"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/components/PreviewCanvas.tsx"
  known_existing_patterns:
    - "Shared contracts live in packages/shared and are consumed by backend and frontend."
    - "Postgres repositories have file-mode equivalents."
    - "Preview lifecycle is mediated by PreviewRuntimeManager; UI must not infer runtime state directly."
    - "Preview process readiness must be based on project identity, not only port reachability."
    - "Generated React/Vite project commands must come from commandCatalog, not arbitrary shell strings."
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Add lifecycle/visibility fields to FrontendProject and persistence."
    - "Add preview project health audit with deterministic reasons and severity."
    - "Repair existing previewUrl/preview-dev port collisions through an idempotent migration or repair use case."
    - "Introduce soft archive/hide behavior for scaffold, failed, stale, duplicate and superseded projects."
    - "Canonicalize project families so only latest valid published project appears by default."
    - "Make Preview list endpoint optionally include archived/unhealthy projects for admin/debug."
    - "Make Preview UI show status badges and actionable reasons instead of a raw flat select."
    - "Prevent new generated projects from being registered as visible/published before passing minimum delivery gates."
    - "Add runtime checks that reject wrong-owner port, wrong manifest, missing manifest and stale process with precise messages."
    - "Add tests for Postgres mode and file mode."
  out_of_scope:
    - "Delete project workspaces permanently."
    - "Rewrite generated project UI quality rules already covered by specs 56-59."
    - "Redesign the full Preview page visual identity."
    - "Change unrelated chat, agents, or project files flows except where they consume project visibility/status."
    - "Introduce a third-party process manager or database migration framework."
```

## 6. Observed Scenario Matrix

| Scenario | Example Evidence | User Symptom | Required System Behavior |
| --- | --- | --- | --- |
| Multiple projects share one previewUrl | 12 projects registered as `http://127.0.0.1:5184` | Selecting one project loads another or errors | Detect collision, assign project-scoped port, update commandCatalog, block wrong-owner reuse |
| Port owned by another project | `lsof :5184` cwd = `project-manager-beautiful-ui-spec59-status` while selected = `spec59-clean` | Timeout generic | Error: "Port 5184 is serving project X, not selected project Y" |
| Scaffold project visible | `src/App.tsx` renders only `<WelcomeScreen />` | User sees empty/default project after "generation" | Mark `health=scaffold_only`, default hidden unless admin filter enabled |
| Logical duplicate/retry visible | `project-manager-beautiful-ui`, `retry`, `final`, `fixed`, etc. | Select has many meaningless versions | Group by family/canonical base, show only published latest valid by default |
| Valid duplicate exists | `spec59-final` and `spec59-status` have same app hash | User must guess which is current | Keep one canonical; mark other as superseded with link/reason |
| Project workspace id differs from frontend project id | `horus.project.json.projectId` equals project workspace id, not frontend_projects.id | Identity checks can be misinterpreted | Store and label both ids explicitly: frontendProjectId and projectWorkspaceId/manifestProjectId |
| Missing `horus.project.json` | legacy static userstories project | Identity check has no manifest | Either allow legacy static project through explicit `projectKind=seed/legacy`, or mark health warning |
| Missing React entrypoints | userstories project has only `src/index.html` | React assumptions break | Health profile must classify as `static_html` or `legacy_static`, not React app |
| Root path missing | old workspace under `apps/server/data/...` no longer exists | Select option cannot start | Mark `root_missing`, hide by default, never start |
| Project marked running forever | project construction rows with stale running status | UI says running but no process/workflow exists | Stale detection must mark archived/failed/stale after TTL and expose reason |
| Postgres/file-mode drift | local `data/frontend-projects/projects.json` only seed, UI uses Postgres | Debugging wrong source of truth | Runtime config/debug endpoint must identify active persistence driver and registry source |
| Env fixed port override | `HORUS_GENERATED_PROJECT_PREVIEW_PORT` may force one port | Collision reintroduced | If fixed port configured, backend must mark multi-project sharing unsafe and serialize/stop previous owner before start |
| Preview session stale after restart | saved processId no longer owned | UI shows impossible state | Recover stale sessions to stopped with event and reason |
| Command catalog missing preview command | project has no preview-dev | Start fails late | Health audit flags `preview_command_missing`; UI disables start with reason |
| Node modules absent | generated workspace has package.json but no install | dev server fails | Start may run declared install command or show dependency missing with command evidence |
| Build passes but preview blank | app loads empty shell | User sees blank canvas | Preview smoke must inspect body content and project identity before publishing |
| Chat asks about selected project after failed preview | chat history exists for unhealthy project | Chat may claim tech stack from wrong project | Chat context must include health/canonical status and warn when selected project is archived/unhealthy |

## 7. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/Preview.ts"
      - "packages/shared/src/index.ts"
      - "apps/server/src/infrastructure/database/migrations/007_preview_project_registry_hygiene.sql"
      - "apps/server/src/infrastructure/repositories/contracts.ts"
      - "apps/server/src/infrastructure/repositories/PostgresFrontendProjectRepository.ts"
      - "apps/server/src/infrastructure/preview/FileFrontendProjectRegistry.ts"
      - "apps/server/src/infrastructure/preview/PreviewProjectHealthService.ts"
      - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
      - "apps/server/src/infrastructure/preview/ProcessBrowserPreviewAdapter.ts"
      - "apps/server/src/application/usecases/ListFrontendProjectsUseCase.ts"
      - "apps/server/src/application/usecases/StartProjectConstructionUseCase.ts"
      - "apps/server/src/infrastructure/http/routes/previewRoutes.ts"
    services:
      - "PreviewRuntimeManager"
      - "ProcessBrowserPreviewAdapter"
      - "FrontendProjectRepository"
      - "ProjectConstructionRepository"
      - "PreviewProjectHealthService"
    database:
      migrations_required: true
      tables:
        - "frontend_projects"
        - "project_workspaces"
        - "project_construction_runs"
        - "preview_sessions"
  frontend:
    files:
      - "apps/web/src/api/previewApi.ts"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/components/PreviewCanvas.tsx"
      - "apps/web/src/index.css"
    components:
      - "VisualPreviewConsole"
      - "PreviewConversationPanel"
      - "PreviewCanvas"
    routes:
      - "?mode=preview"
  workflow:
    graph_nodes:
      - "FrontAgent"
      - "CuratorAgent"
      - "Project construction start use case"
    agents:
      - "Odin"
      - "Front Agent"
      - "Curator"
  tests:
    unit:
      - "packages/shared/test/preview.test.mjs"
      - "apps/server/test/frontendProjectRegistry.test.mjs"
      - "apps/server/test/processBrowserPreviewAdapter.test.mjs"
      - "apps/server/test/previewProjectHealthService.test.mjs"
      - "apps/web/test/frontendRegressionGuards.test.mjs"
    integration:
      - "apps/server/test/projectConstructionWorkspace.test.mjs"
      - "apps/server/test/previewRoutes.test.mjs"
      - "apps/server/test/postgresFrontendProjectRepository.test.mjs"
    e2e:
      - "Browser validation for ?mode=preview selecting canonical, archived and unhealthy projects"
```

## 8. Integration Context Map

```yaml
integration_context:
  summary: |
    This change sits between generated project construction, preview runtime, persisted project registry,
    project file browsing, Horus chat context, and the user-facing Preview UI. The registry becomes a curated
    catalog, not a raw append-only list of attempts.

  depends_on:
    - name: "FrontendProject shared schema"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "FrontendProjectSchema"
      required_for: "Add lifecycle, health and canonical metadata without breaking existing consumers."
      assumptions:
        - "Additive fields with defaults preserve existing project rows."
      failure_modes:
        - "Frontend/backend type mismatch hides projects or crashes API parsing."
      fallback_or_recovery: "Schema defaults and migration backfill."
      verification:
        - "pnpm --filter @u-build/shared build"
        - "packages/shared/test/preview.test.mjs"

    - name: "FrontendProjectRepository"
      type: "backend_service"
      owner: "preview infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "listProjects/getProject/registerProject"
      required_for: "List, audit, archive, repair and register projects."
      assumptions:
        - "Postgres and file-mode repositories must expose equivalent semantics."
      failure_modes:
        - "Postgres list differs from file-mode list; archived projects leak into default UI."
      fallback_or_recovery: "Repository contract tests for both drivers."
      verification:
        - "Postgres repository tests"
        - "File registry tests"

    - name: "ProjectConstructionRepository"
      type: "backend_service"
      owner: "project construction"
      direction: "this_spec_consumes_dependency"
      contract_used: "project_workspaces and project_construction_runs"
      required_for: "Relate generated preview projects to construction status, family and canonical version."
      assumptions:
        - "ProjectWorkspace id is the manifest project id in generated horus.project.json."
      failure_modes:
        - "Frontend project id is confused with project workspace id."
      fallback_or_recovery: "Add explicit field names and tests around id mapping."
      verification:
        - "Integration test maps frontend project to project workspace and manifest id."

    - name: "ProcessBrowserPreviewAdapter"
      type: "backend_service"
      owner: "preview infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "start(project, session) -> PreviewStartResult"
      required_for: "Reject wrong-owner ports and return actionable evidence."
      assumptions:
        - "Generated projects expose horus.project.json at preview root when applicable."
      failure_modes:
        - "Port reachable but belongs to another project."
      fallback_or_recovery: "Manifest identity check and process cwd inspection when available."
      verification:
        - "Adapter tests with reachable URL owned by same project and wrong project."

  depended_on_by:
    - name: "Preview UI project selector"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "GET /api/preview/projects?visibility=visible|all returns projects plus health/canonical status"
      compatibility_obligation: "Must preserve existing project fields and extend response additively."
      expected_consumer_behavior: "Show only visible canonical projects by default; offer admin/debug toggle for archived/unhealthy."
      migration_or_notification_required: false
      verification:
        - "Frontend regression guard ensures status fields are consumed."

    - name: "PreviewRuntimeManager"
      type: "backend_service"
      owner: "preview infrastructure"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "healthy project with unique preview URL and commandCatalog"
      compatibility_obligation: "Must reject starts for archived/root_missing/preview_command_missing unless explicitly forced for debug."
      expected_consumer_behavior: "Create/start sessions only for eligible projects."
      migration_or_notification_required: false
      verification:
        - "Start session tests for visible project, archived project and wrong-owner port."

    - name: "Horus chat selected project context"
      type: "workflow"
      owner: "Horus chat"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "selected project health/canonical metadata"
      compatibility_obligation: "Must avoid claiming project evidence from archived/unhealthy wrong project."
      expected_consumer_behavior: "Warn when selected project is archived/unhealthy and prefer canonical replacement."
      migration_or_notification_required: false
      verification:
        - "Chat context test for archived selected project."

    - name: "Project Files screen"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "canonical/visible generated project list"
      compatibility_obligation: "Project files may need the same visibility policy or an explicit all projects mode."
      expected_consumer_behavior: "Do not show stale duplicates by default."
      migration_or_notification_required: false
      verification:
        - "Project Files project list smoke check."

  bidirectional_integrations:
    - name: "Registry health and preview runtime"
      participants:
        - "PreviewProjectHealthService"
        - "PreviewRuntimeManager"
      shared_contract: "FrontendProject health report and start eligibility"
      consistency_rule: "A project marked not startable must not create a running preview session."
      verification:
        - "Integration test: health blocks start with same reason shown in API/UI."

    - name: "Project construction publication"
      participants:
        - "StartProjectConstructionUseCase"
        - "FrontendProjectRepository"
      shared_contract: "Project registration lifecycle"
      consistency_rule: "New generated projects start as draft/running and become published only after delivery gates pass."
      verification:
        - "Construction test: failed scaffold project stays hidden; passing project becomes visible."

  data_flow:
    inbound:
      - source: "Postgres frontend_projects"
        payload_or_state: "project registry rows"
        validation: "FrontendProjectSchema and health audit"
      - source: "Generated project root"
        payload_or_state: "package.json, horus.project.json, src/App.tsx, commandCatalog"
        validation: "filesystem and JSON schema reads with bounded file size"
      - source: "Local process table"
        payload_or_state: "port listener pid/cwd when available"
        validation: "best-effort process ownership check"
    outbound:
      - target: "Preview UI"
        payload_or_state: "visible project list with status, health and replacement suggestions"
        compatibility: "Existing fields retained; new fields optional/defaulted"
      - target: "Preview runtime start"
        payload_or_state: "eligible project or precise rejection"
        compatibility: "Start endpoint response shape remains compatible, but errorMessage becomes more specific"

  sequencing_dependencies:
    - dependency: "Shared schema update before repository migration"
      reason: "Runtime parse must accept new fields before rows include them."
      validation: "shared build then repository tests"
    - dependency: "Migration before UI filtering"
      reason: "UI should not depend on transient computed-only status for persisted cleanup."
      validation: "migration smoke + GET /api/preview/projects"
    - dependency: "Repair commandCatalog before starting previews"
      reason: "preview-dev command args must match unique previewUrl."
      validation: "curl and startSession tests"

  integration_risks:
    - risk: "Archiving wrong project hides user data."
      severity: "high"
      mitigation: "Soft archive only, no deletion; expose admin toggle and reversible status."
    - risk: "Canonical grouping collapses unrelated projects with similar names."
      severity: "medium"
      mitigation: "Use explicit family key from construction lineage when available; name heuristics only as fallback and logged."
    - risk: "Postgres and file-mode behavior diverge."
      severity: "high"
      mitigation: "Add equivalent tests for both repository implementations."
```

## 9. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership between preview, project construction, chat and project files."
    - "Do not make frontend infer backend health rules from names or paths."
    - "Use additive schemas and migrations when possible."
    - "Prefer soft archive over destructive delete."
    - "Do not let raw process/port state become the only source of truth."
  project_specific:
    - "FrontendProject identity and ProjectWorkspace/manifest identity must be named separately."
    - "Preview readiness must validate project ownership, not only URL reachability."
    - "Generated projects must not become visible by default until they pass minimum delivery gates."
    - "The seed project user_stories must remain protected and visible."
    - "All preview commands must come from commandCatalog."
    - "Postgres mode and file mode must keep compatible behavior."
```

## 10. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Do not delete data/workspaces as part of implementation."
    - "Any cleanup must be reversible through status/archive fields."
    - "Use typed schemas for health/status outputs."
    - "Make migration idempotent where possible."
  backend:
    - "Add migration 007 with defaults for existing rows."
    - "Use transactions for bulk repair/archive operations."
    - "Expose precise error messages without leaking absolute paths unless the app already exposes project roots in trusted debug surfaces."
    - "Do not run arbitrary shell commands to inspect projects; use filesystem reads and controlled process checks."
  frontend:
    - "Keep the Preview page visually calm and compact."
    - "Do not overload the select with every archived/debug entry by default."
    - "Expose unhealthy reasons as concise badges/tooltips or detail text."
    - "Do not hide the selected project abruptly; show replacement/canonical suggestion."
  tests:
    - "Cover success, failure, stale and migration cases."
    - "Test exact user-facing error messages for wrong-owner ports."
    - "Do not mark work complete without runtime smoke on at least one canonical project and one archived/unhealthy project."
```

## 11. Contracts And Invariants

```yaml
contracts:
  api_contracts:
    - name: "List preview projects"
      producer: "GET /api/preview/projects"
      consumers:
        - "VisualPreviewConsole"
        - "Project Files if it reuses preview project list"
      request_shape: "Optional query visibility=visible|all|archived, includeHealth=true|false"
      response_shape: "{ projects: FrontendProjectSummary[] }"
      compatibility: "can extend; existing fields id/name/slug/rootPath/defaultRoute/previewUrl remain"

    - name: "Start preview session"
      producer: "POST /api/preview/sessions/:sessionId/start"
      consumers:
        - "Preview toolbar"
        - "Horus chat run_project"
      request_shape: "sessionId path param"
      response_shape: "PreviewActionResult with session and event"
      compatibility: "must preserve success shape; errorMessage can be more specific"

    - name: "Repair/audit preview registry"
      producer: "new backend admin/use-case surface"
      consumers:
        - "developer runbook"
        - "future admin UI"
      request_shape: "dryRun boolean; optional apply boolean; optional project ids"
      response_shape: "audit report, proposed actions, applied actions"
      compatibility: "new endpoint/use case only; must be guarded and non-destructive by default"

  domain_contracts:
    - name: "Visible project eligibility"
      producer: "PreviewProjectHealthService"
      consumers:
        - "ListFrontendProjectsUseCase"
        - "PreviewRuntimeManager"
        - "VisualPreviewConsole"
      invariant: "A project visible by default is either seed/legacy allowed or has startable preview, valid root, valid command, non-scaffold app, and canonical status."

    - name: "Preview port uniqueness"
      producer: "StartProjectConstructionUseCase and repair use case"
      consumers:
        - "ProcessBrowserPreviewAdapter"
        - "PreviewRuntimeManager"
      invariant: "Two visible generated projects must not share the same previewUrl unless a fixed-port single-active policy is explicitly configured."

    - name: "Canonical project family"
      producer: "registry hygiene migration/use case"
      consumers:
        - "Preview UI"
        - "Project Files UI"
      invariant: "At most one project per family is marked canonical visible when multiple attempts exist."

  ui_contracts:
    - name: "Preview project selector"
      producer: "PreviewConversationPanel"
      consumers:
        - "End user"
      requirement: "Default project selector shows canonical usable projects; archived/unhealthy are hidden unless user enables debug/all mode."

    - name: "Preview error state"
      producer: "PreviewCanvas"
      consumers:
        - "End user"
      requirement: "Wrong project, missing root, missing command and scaffold-only states show specific actionable text."

  data_contracts:
    - name: "frontend_projects lifecycle columns"
      producer: "PostgresFrontendProjectRepository/FileFrontendProjectRegistry"
      consumers:
        - "ListFrontendProjectsUseCase"
        - "PreviewRuntimeManager"
      migration_required: true
      compatibility_notes: "Existing rows default to status='published' or 'needs_audit' only long enough for audit; final migration classifies them."
```

### Proposed Shared Fields

```yaml
frontend_project_additive_fields:
  projectKind:
    type: "seed | generated | legacy_static"
    default: "generated except seed user_stories"
  lifecycleStatus:
    type: "draft | running | published | failed | archived | superseded"
    default: "published for existing rows before audit; repair may update"
  visibility:
    type: "visible | hidden"
    default: "visible"
  healthStatus:
    type: "unknown | healthy | warning | blocked"
    default: "unknown"
  healthReasons:
    type: "array of typed reason codes"
    examples:
      - "root_missing"
      - "manifest_missing"
      - "preview_command_missing"
      - "preview_url_collision"
      - "wrong_owner_port"
      - "scaffold_only"
      - "duplicate_app_hash"
      - "superseded_by_canonical"
      - "stale_running_run"
  canonicalProjectId:
    type: "uuid | null"
    meaning: "If superseded/duplicate, points to visible canonical frontend project id"
  projectWorkspaceId:
    type: "uuid | null"
    meaning: "Generated project workspace/manifest id when known"
  appFingerprint:
    type: "string | null"
    meaning: "Hash of significant app entrypoint files for duplicate/scaffold detection"
  lastHealthCheckedAt:
    type: "datetime | null"
  archivedAt:
    type: "datetime | null"
  archivedReason:
    type: "string | null"
```

## 12. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current implementation and data model"
    agent: "repo_explorer"
    action: "Read shared preview schemas, Postgres/file repositories, PreviewRuntimeManager, ProcessBrowserPreviewAdapter, StartProjectConstructionUseCase, VisualPreviewConsole and existing migrations."
    expected_output: "Confirmed affected contracts, existing patterns, and migration constraints."

  - step: 2
    name: "Design project health contract"
    agent: "architect"
    action: "Add typed shared health/lifecycle fields and reason codes to Preview entities while preserving backward compatibility."
    expected_output: "Shared schema diff with defaults and tests."

  - step: 3
    name: "Add persistence migration and repository support"
    agent: "backend_specialist"
    action: "Create migration 007, update PostgresFrontendProjectRepository and FileFrontendProjectRegistry to read/write lifecycle, health, canonical and audit fields."
    expected_output: "Persistence supports new fields in Postgres and file mode."

  - step: 4
    name: "Implement PreviewProjectHealthService"
    agent: "backend_specialist"
    action: "Inspect project root safely and classify root, manifest, commandCatalog, previewUrl, app entrypoints, scaffold hash, duplicate app hash, construction linkage and canonical family."
    expected_output: "Deterministic health report for each project."

  - step: 5
    name: "Implement registry repair use case"
    agent: "backend_specialist"
    action: "Build dry-run and apply modes to repair previewUrl collisions, update preview-dev ports, archive/supersede duplicate/scaffold projects, and protect seed user_stories."
    expected_output: "Idempotent repair report and reversible status updates."

  - step: 6
    name: "Harden preview start eligibility and errors"
    agent: "backend_specialist"
    action: "Require startable health before starting a session; enrich ProcessBrowserPreviewAdapter wrong-owner and timeout evidence with project identity and port ownership."
    expected_output: "Start failures are specific and actionable."

  - step: 7
    name: "Gate new project registration"
    agent: "backend_specialist"
    action: "Change StartProjectConstructionUseCase so generated projects register as draft/running/hidden until delivery validation publishes them, and ensure generated ports are project-scoped unless fixed-port mode is explicit."
    expected_output: "New failed attempts do not pollute Preview select."

  - step: 8
    name: "Update Preview UI"
    agent: "frontend_specialist"
    action: "Consume health/lifecycle fields, show canonical visible projects by default, add compact status badges/reasons, optional 'show archived/unhealthy' debug filter, and replacement suggestion for superseded selection."
    expected_output: "Preview selector is curated and errors are understandable."

  - step: 9
    name: "Cross-surface consistency"
    agent: "frontend_specialist"
    action: "Audit Project Files and Horus chat selected project behavior so archived/unhealthy projects do not silently act as normal."
    expected_output: "Consumers either use the same visibility policy or explicitly expose all projects with warnings."

  - step: 10
    name: "Validate and produce cleanup report"
    agent: "qa_specialist"
    action: "Run shared/server/web tests, migration tests, endpoint smoke checks, browser preview checks for healthy, archived and wrong-owner scenarios, and produce before/after registry report."
    expected_output: "Validation evidence with commands, endpoints, browser screenshots if available, and remaining risks."
```

## 13. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm lifecycle taxonomy, canonical family rules, compatibility and no-delete cleanup policy."
    inputs:
      - "This SDD"
      - "Existing preview/project construction specs"
      - "Current runtime evidence"
    outputs:
      - "Final contract choices"
      - "Migration safety notes"

  - agent_name: "backend_specialist"
    responsibility: "Implement schemas, migrations, repositories, health service, repair use case, start eligibility and precise errors."
    inputs:
      - "Backend affected files"
      - "Contracts and scenario matrix"
    outputs:
      - "Backend diff"
      - "Backend tests"
      - "Dry-run cleanup report"

  - agent_name: "frontend_specialist"
    responsibility: "Implement curated selector, status/reason UI, debug/all mode and user-facing error handling."
    inputs:
      - "Frontend affected files"
      - "New API contracts"
    outputs:
      - "Frontend diff"
      - "Frontend tests"
      - "Browser validation"

  - agent_name: "qa_specialist"
    responsibility: "Validate migration, registry repair, start failures, successful preview and no data deletion."
    inputs:
      - "Diff"
      - "Acceptance criteria"
    outputs:
      - "Test report"
      - "Endpoint smoke evidence"
      - "Remaining risks"
```

## 14. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "The default Preview project list no longer shows scaffold-only, superseded, failed, stale-running or root-missing projects."
    - "The Preview list still allows an explicit debug/admin mode to inspect archived/unhealthy projects with reasons."
    - "Starting a preview for a visible generated project loads that exact project's manifest and UI."
    - "Starting a preview whose port is owned by another project fails with a specific wrong-owner message."
    - "The seed user_stories project remains available and protected."
    - "No project workspace is permanently deleted by this feature."
  integration:
    - "FrontendProject shared schema builds and remains backward-compatible."
    - "Postgres and file-mode repositories produce equivalent lifecycle/health behavior."
    - "PreviewRuntimeManager refuses non-startable projects with the same reason shown in the UI."
    - "Project construction registration does not publish failed/scaffold attempts into the default Preview selector."
    - "Project Files and Horus chat do not silently treat archived/unhealthy projects as normal."
  architectural:
    - "Health classification lives in backend service/use case, not frontend name heuristics."
    - "Preview command execution remains restricted to commandCatalog."
    - "Canonicalization and archive are soft, auditable and reversible."
  quality:
    - "Tests cover previewUrl collisions, duplicate app hash, scaffold-only App.tsx, missing manifest, missing root, missing command, wrong-owner port and valid canonical project."
    - "Migration is idempotent or safely rerunnable in development."
    - "Build/typecheck/test suite passes."
  observability:
    - "Audit report lists every hidden/archived/repaired project with reason."
    - "Preview start errors include reason code and actionable message."
    - "Preview events record repair/start failure evidence without exposing secrets."
```

## 15. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate shared Preview contract changes."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate backend schemas, repositories and routes."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend API and UI consumers."
      success_condition: "Exit code 0."
    - command: "pnpm test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Run full regression suite after contract changes."
      success_condition: "Exit code 0 with no failed tests."
    - command: "node --test apps/server/test/previewProjectHealthService.test.mjs apps/server/test/processBrowserPreviewAdapter.test.mjs apps/server/test/frontendProjectRegistry.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Focused backend health/preview/registry validation."
      success_condition: "All tests pass."

  runtime_checks:
    - name: "Preview project audit dry run"
      method: "curl or test helper"
      expected: "Report shows collisions, scaffold-only projects, canonical project and proposed non-destructive archive/repair actions."
    - name: "Preview list visible mode"
      method: "curl http://localhost:5174/api/preview/projects"
      expected: "Default response excludes archived/superseded/scaffold projects."
    - name: "Preview list all mode"
      method: "curl http://localhost:5174/api/preview/projects?visibility=all&includeHealth=true"
      expected: "Response includes archived/unhealthy projects with healthReasons."
    - name: "Wrong-owner port"
      method: "controlled test server or existing process fixture"
      expected: "Start fails with wrong_owner_port and identifies expected vs actual project."
    - name: "Canonical preview"
      method: "Browser on http://localhost:5174/?mode=preview"
      expected: "Selecting canonical project and clicking Iniciar renders its actual UI in iframe."

  integration_checks:
    - name: "Postgres migration"
      surfaces:
        - "frontend_projects"
        - "project_workspaces"
      method: "migration test + repository roundtrip"
      expected: "Existing rows parse and new fields backfill safely."
    - name: "File mode compatibility"
      surfaces:
        - "data/frontend-projects/projects.json"
      method: "file registry test"
      expected: "Missing lifecycle fields default correctly and write back when updated."
    - name: "Project construction publication gate"
      surfaces:
        - "StartProjectConstructionUseCase"
        - "FrontendProjectRepository"
      method: "unit/integration test"
      expected: "Failed/scaffold run does not become visible published project."

  manual_checks:
    - "Open Preview screen and confirm the project selector is not a long list of retry/final/fixed variants."
    - "Enable archived/unhealthy mode and confirm each hidden project has a concise reason."
    - "Confirm no project workspace directory was deleted."
```

## 16. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent DB columns; inspect current migrations before editing."
    - "Do not assume file-mode is active just because data/frontend-projects exists; check runtime driver."
    - "Do not claim duplicate projects without computing names, roots and app fingerprints."
  read_before_write:
    - "Read Preview.ts, repositories, runtime manager, adapter, frontend console and current migrations before editing."
    - "Search for every FrontendProject consumer before adding required fields."
    - "Inspect generated project manifests before changing identity checks."
  failure_handling:
    - "If migration fails, inspect SQL error and rollback only migration changes from this task."
    - "If preview start fails, inspect runtime evidence, port owner and manifest response."
    - "If test data differs between Postgres and file mode, document active driver and test both implementations."
  state_consistency:
    - "Update shared schema, backend repositories, route responses, frontend API types and frontend rendering together."
    - "Do not update previewUrl without updating the preview-dev command args."
    - "Do not mark project visible if health says blocked."
  scope_control:
    - "Do not delete project-workspaces."
    - "Do not refactor unrelated chat/agent UI."
    - "Do not re-run agent generation as part of cleanup unless explicitly requested."
```

## 17. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary dev server startup failure"
    - "port still occupied by a stopped process during test"
    - "Postgres connection unavailable in local dev"
    - "Vite warmup timeout"
  non_retryable_failures:
    - "missing project root"
    - "missing package.json"
    - "invalid commandCatalog"
    - "manifest id mismatch"
    - "scaffold-only app for a generated project claimed as delivered"
  rollback_rules:
    - "Do not rollback user changes."
    - "Do not delete generated project directories."
    - "Rollback only schema/code changes introduced by this task if required."
    - "Data cleanup must be soft archive and reversible; repair use case must support dry-run."
  escalation_rules:
    - "Escalate before destructive deletion."
    - "Escalate if canonical project cannot be determined from lineage/hash/status."
    - "Escalate if fixed port env policy conflicts with project-scoped preview URLs."
```

## 18. Observability Requirements

```yaml
observability:
  logs:
    - event: "preview_project_health_audited"
      fields:
        - "frontend_project_id"
        - "project_workspace_id"
        - "health_status"
        - "health_reasons"
        - "app_fingerprint"
        - "duration_ms"
    - event: "preview_project_repaired"
      fields:
        - "frontend_project_id"
        - "repair_actions"
        - "previous_preview_url"
        - "next_preview_url"
        - "archived_reason"
    - event: "preview_start_blocked"
      fields:
        - "session_id"
        - "frontend_project_id"
        - "reason_code"
        - "expected_project"
        - "actual_project"
        - "port"
  audit_trail:
    required: true
    must_capture:
      - "projects audited"
      - "projects archived/superseded"
      - "ports repaired"
      - "commandCatalog changes"
      - "validation commands"
      - "runtime preview checks"
  user_visible_failures:
    - "Projeto arquivado: motivo claro."
    - "Projeto sem app real: somente scaffold inicial."
    - "Porta em uso por outro projeto: mostrar projeto dono."
    - "Comando de preview ausente: mostrar comando esperado."
    - "Pasta do projeto não existe: sugerir arquivar/remover da lista."
```

## 19. Risks And Unknowns

```yaml
risks:
  - risk: "A migration classifies existing projects incorrectly."
    severity: "high"
    mitigation: "Ship dry-run report first; apply soft archive only; keep all project roots untouched."
  - risk: "Name-based family grouping collapses unrelated projects."
    severity: "medium"
    mitigation: "Prefer projectWorkspace/construction lineage and app fingerprint; only use name heuristics as fallback with reason."
  - risk: "Fixed-port env intentionally configured for one-project-at-a-time dev."
    severity: "medium"
    mitigation: "Support fixed-port mode by stopping previous owner or disabling concurrent visible starts, not by allowing wrong-owner success."
  - risk: "File-mode and Postgres cleanup diverge."
    severity: "high"
    mitigation: "Implement repository contract tests for both drivers and expose active persistence driver in debug."
  - risk: "UI hides a project the user still wants."
    severity: "medium"
    mitigation: "Archived/unhealthy mode exposes all entries with reasons and reversible archive."

unknowns:
  - question: "Should canonical project selection be global per family or per workspace folder/user story?"
    resolution_strategy: "Inspect project construction lineage and product expectation; default to per workspace folder/family when available."
  - question: "Should failed but manually useful projects be visible in Project Files even if hidden in Preview?"
    resolution_strategy: "Keep Project Files all-mode or status filter; do not rely on Preview visibility alone."
  - question: "Should legacy static userstories-agent-validation remain visible?"
    resolution_strategy: "Treat as legacy_static only if it has a valid preview command and is not superseded; otherwise archive old failed attempts."
  - question: "Which project should be canonical among spec59-final and spec59-status?"
    resolution_strategy: "Prefer latest passed project construction run; if equal app fingerprint and one passed, keep passed latest and supersede the other."
```

## 20. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Build an additive registry hygiene layer. Do not manually delete rows or folders. Add lifecycle and
    health metadata to FrontendProject, then compute health from real local evidence. Use a repair use case
    to mark old attempts archived/superseded, assign unique ports and update preview-dev commands. Make the
    Preview UI consume curated visible projects by default, with a debug mode for all entries.

  alternatives_considered:
    - option: "Manually delete bad Postgres rows and workspaces"
      tradeoff: "Fast but destructive, unauditable, likely to lose useful evidence and repeat later."
    - option: "Only fix port collisions"
      tradeoff: "Solves timeout but leaves scaffold/duplicate projects visible."
    - option: "Only filter by project name suffix"
      tradeoff: "Brittle and hides/keeps wrong projects when names do not follow retry/final/fixed convention."
    - option: "Move all cleanup to frontend"
      tradeoff: "UI would duplicate backend health rules and other consumers would remain broken."

  migration_notes:
    - "Create migration 007_preview_project_registry_hygiene.sql after 006_agent_skill_registry.sql."
    - "Add nullable/defaulted columns first; backfill in a separate transactional step."
    - "Do not make new columns required in shared schema until repositories provide defaults."
    - "Archive/supersede changes should be run by repair use case after code deploy, not hidden inside schema migration if the logic requires filesystem inspection."
    - "Filesystem health cannot run inside SQL migration; store unknown initially, then run audit/repair."

  backward_compatibility:
    required: true
    notes:
      - "Existing API consumers must continue receiving id/name/slug/rootPath/defaultRoute/commandCatalog/previewUrl."
      - "Existing seed user_stories must remain available."
      - "File-mode projects without new fields must parse with defaults."
      - "Archived projects remain addressable by id for old chat sessions and timeline history."
```

## 21. Deliverables

```yaml
deliverables:
  code:
    - "Shared Preview schema additions"
    - "Postgres migration 007"
    - "Postgres and file repository lifecycle/health support"
    - "PreviewProjectHealthService"
    - "Registry repair/audit use case"
    - "Preview route query support"
    - "PreviewRuntimeManager start eligibility checks"
    - "ProcessBrowserPreviewAdapter precise wrong-owner evidence"
    - "Preview UI curated selector and health badges"
  tests:
    - "Shared schema compatibility tests"
    - "Postgres/file repository tests"
    - "Health service scenario tests"
    - "Preview adapter wrong-owner tests"
    - "Preview route visibility tests"
    - "Frontend selector regression tests"
  docs:
    - "Update spec/CHANGELOG.md when implemented"
    - "Optional runbook note for registry repair dry-run/apply commands if exposed as CLI/script"
  validation_evidence:
    - "Before/after GET /api/preview/projects report"
    - "Dry-run cleanup report"
    - "Focused test output"
    - "Build/test output"
    - "Browser preview smoke for canonical project"
```

## 22. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Relevant preview/project construction/shared/frontend files were read."
    - "Postgres and file-mode persistence patterns were inspected."
    - "Upstream dependencies and downstream consumers were mapped."
  implementation:
    - "Changes are scoped to registry hygiene and Preview project selection."
    - "No project directory was deleted."
    - "All producer and consumer contracts were updated together."
    - "Archived/superseded projects remain addressable."
    - "previewUrl and preview-dev command args stay in sync."
  validation:
    - "Shared/server/web builds passed."
    - "Focused tests for health, registry, adapter and UI passed."
    - "Runtime API smoke checks passed."
    - "Browser preview checks covered healthy and unhealthy paths."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Registry cleanup report is included."
    - "Remaining risks are disclosed."
```

## 22.1 Implementation Log

```yaml
implemented_at_utc: "2026-05-27T13:56:00Z"
implementation_summary:
  - "Added additive FrontendProject lifecycle, visibility, health, canonical and workspace metadata to shared contracts."
  - "Added Postgres migration 007 for preview project hygiene metadata and repository support in Postgres/file mode."
  - "Implemented PreviewProjectHealthService to audit root existence, preview command availability, manifest linkage, scaffold-only apps, duplicate fingerprints, preview URL collisions and canonical families."
  - "Changed PreviewRuntimeManager to list only visible canonical projects by default and block unhealthy/hidden projects before starting a preview."
  - "Changed ProcessBrowserPreviewAdapter to detect reachable preview URLs owned by a different manifest project and return wrong_owner_port evidence instead of a generic timeout."
  - "Extended GET /api/preview/projects with visibility=visible|all|archived."
  - "Updated the Preview UI selector with the default curated list, a compact invalid-project toggle and health badges."
  - "Registered generated preview projects with projectWorkspaceId so manifest/workspace identity can be traced."
validation:
  - "pnpm test: passed, 201 tests."
  - "pnpm --filter @u-build/web test:guards: passed, 15 tests."
  - "GET /api/preview/projects?visibility=visible returned 2 curated projects instead of the 13 raw entries."
  - "GET /api/preview/projects?visibility=all returned hidden scaffold/duplicate entries with reasons and canonicalProjectId."
  - "Starting the canonical project project-manager-beautiful-ui-spec59-status returned preview_ready at http://127.0.0.1:5184/."
  - "Starting hidden project project-manager-beautiful-ui-spec59-clean returned preview_error with reason scaffold_only."
known_limits:
  - "No destructive deletion was implemented; bad entries are dynamically hidden/superseded instead of physically removed."
  - "A standalone admin repair CLI was not added yet because the runtime audit now produces the cleanup result without mutating existing workspaces."
  - "Browser automation with Playwright could not run because the package is not installed in this repo; API and test validation covered the implemented behavior."
```

## 23. Minimal Output Contract For Executing Agents

```yaml
agent_result:
  status: "<completed | failed | blocked>"
  summary: "<short factual summary>"
  files_read:
    - "<path>"
  files_changed:
    - "<path>"
  commands_run:
    - command: "<command>"
      cwd: "<cwd>"
      exit_code: "<exit code>"
      result: "<short result>"
  validation:
    passed:
      - "<check>"
    failed:
      - "<check>"
  registry_report:
    total_projects_seen: "<number>"
    visible_projects_after: "<number>"
    archived_projects:
      - name: "<project>"
        reason: "<reason>"
    repaired_ports:
      - project: "<project>"
        previous_preview_url: "<url>"
        next_preview_url: "<url>"
    canonical_projects:
      - family: "<family>"
        project: "<project>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```
