---
format_version: "agentic_sdd.v1"
task_id: "34-project-file-browser-frontend"
title: "Project file browser frontend"
created_at_utc: "2026-05-26T21:42:08Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
companion_backend_spec: "spec/features/33-project-file-browser-backend.md"
reference_repo: "/Users/wamat/Desktop/zup-sdd-agents"
---

# 1. Original User Request

```yaml
raw_user_request: |
  use a skill de spec e crie uma extremamente rigorosa para construir o bakcend e outra para construir o frontend. funcionando perfeitamente como no zup-sdd-agents. Ressalto, se você identificar boas práticas que não foi feito no projeto da zup, mas poderíamos encaixar no nosso então faça, e atenção para não copiar nada de ruim ou mal feito
```

# 2. System Interpretation

```yaml
system_translation: |
  Construir a tela frontend de Arquivos do Horus, inspirada na imagem enviada e na CodePage do zup-sdd-agents:
  seletor de projeto, árvore de arquivos, busca, abas de arquivos abertos, editor read-only, abas SPEC/User Stories,
  estados robustos de carregamento/erro/vazio e integração com o backend seguro de arquivos.

expected_user_visible_result: |
  O usuário vê uma tela "Arquivos" na navegação, escolhe um projeto, navega por pastas, abre arquivos em abas,
  lê código com editor profissional e alterna para SPEC/User Stories do mesmo projeto sem perder contexto.

expected_engineering_result: |
  O frontend tem uma feature modular e testável, sem lógica de filesystem local, consumindo contratos compartilhados
  do backend e mantendo uma UX estável, responsiva e semelhante à referência do zup sem copiar suas fragilidades.
```

# 3. Product and Technical Context

```yaml
business_context:
  user_problem: "O usuário não consegue inspecionar arquivos reais gerados/manipulados pelos agentes dentro do Horus."
  target_user: "Operador do Horus acompanhando projeto, construção por agentes, specs e user stories."
  expected_outcome: "Uma área de arquivos com sensação de IDE, rápida, clara e confiável."
  product_surface:
    - "Sidebar principal do Horus"
    - "Tela Arquivos"
    - "ProjectFiles API"
    - "SPEC/User Stories context"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Project file browser backend from spec 33"
    frontend:
      - "React"
      - "Vite"
      - "@tanstack/react-query"
      - "lucide-react"
      - "Optional @monaco-editor/react"
    database:
      - "No direct frontend DB access"
    infrastructure:
      - "Existing App/Shell mode navigation"
  known_entrypoints:
    - "apps/web/src/App.tsx"
    - "apps/web/src/components/Shell.tsx"
    - "apps/web/src/api/workflowApi.ts"
    - "apps/web/src/index.css"
  known_existing_patterns:
    - "Horus currently uses appMode for sidebar surfaces."
    - "Feature folders are allowed under apps/web/src/features."
    - "API clients live under apps/web/src/api."
    - "Use React Query for async project/runtime screens."
```

# 4. Scope

```yaml
scope:
  in_scope:
    - "Add first-class Arquivos navigation surface."
    - "Create modular project-files frontend feature."
    - "Render project selector, file tree, search, open file tabs, read-only editor, and top tabs."
    - "Render SPEC and User Stories context for selected project using existing or backend-provided APIs."
    - "Handle loading, empty, error, forbidden, binary, truncated, and stale project states."
    - "Validate layout in desktop and responsive widths."
  out_of_scope:
    - "File editing."
    - "Diff editor."
    - "Terminal or command execution."
    - "Creating/deleting/renaming files."
    - "Replacing existing UserStories screen."
    - "Copying zup CSS/classes directly."
```

# 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "Consumes spec/features/33-project-file-browser-backend.md"
    services:
      - "ProjectFileBrowserService"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "apps/web/src/api/projectFilesApi.ts"
      - "apps/web/src/features/project-files/ProjectFilesPage.tsx"
      - "apps/web/src/features/project-files/components/FileTree.tsx"
      - "apps/web/src/features/project-files/components/FileTabs.tsx"
      - "apps/web/src/features/project-files/components/CodeViewer.tsx"
      - "apps/web/src/features/project-files/components/ProjectFilesToolbar.tsx"
      - "apps/web/src/features/project-files/components/ProjectSpecPanel.tsx"
      - "apps/web/src/features/project-files/components/ProjectStoriesPanel.tsx"
      - "apps/web/src/features/project-files/hooks/useProjectFilesState.ts"
      - "apps/web/src/features/project-files/utils/buildProjectFileTree.ts"
      - "apps/web/src/features/project-files/styles/project-files.css"
      - "apps/web/src/App.tsx"
      - "apps/web/src/components/Shell.tsx"
      - "apps/web/package.json"
    components:
      - "ProjectFilesPage"
      - "FileTree"
      - "CodeViewer"
      - "FileTabs"
      - "ProjectSpecPanel"
      - "ProjectStoriesPanel"
    routes:
      - "appMode === 'files' or equivalent route"
  workflow:
    graph_nodes: []
    agents: []
  tests:
    unit:
      - "buildProjectFileTree tests"
      - "ProjectFilesPage state tests"
    integration:
      - "API client type integration"
    e2e:
      - "Browser smoke of files screen"
```

# 6. Integration Context Map

```yaml
integration_context:
  summary: |
    The frontend depends on the read-only file API from spec 33 and existing Horus navigation/project context.
    It exposes a user-facing Files screen that other workflows can deep-link into using project/run/file state.

  depends_on:
    - name: "Project file browser backend"
      type: "api"
      owner: "backend project-files"
      direction: "this_spec_consumes_dependency"
      contract_used: "ProjectFiles shared schemas from spec 33"
      required_for: "Load project list, tree, file content and display metadata."
      assumptions:
        - "Backend spec 33 is implemented first or mocked with exact contract."
      failure_modes:
        - "Screen cannot list projects or open files."
      fallback_or_recovery: "Show actionable error and empty-state guidance."
      verification:
        - "Frontend typecheck against shared contracts."
        - "Browser smoke with real backend."

    - name: "Shell navigation"
      type: "frontend_component"
      owner: "web shell"
      direction: "this_spec_consumes_dependency"
      contract_used: "appMode and sidebar button selection"
      required_for: "Expose Arquivos as first-class screen."
      assumptions:
        - "Current app uses mode state rather than router path."
      failure_modes:
        - "User cannot find the screen."
      fallback_or_recovery: "Add visible sidebar entry with stable label."
      verification:
        - "Browser check: sidebar Arquivos button appears and activates."

    - name: "Existing workflow/user story APIs"
      type: "api"
      owner: "workspace/user stories"
      direction: "this_spec_consumes_dependency"
      contract_used: "Folder/story/spec APIs or new project-linked projections"
      required_for: "Populate SPEC and User Stories tabs."
      assumptions:
        - "A project can be mapped back to workspaceFolderId or latest run context."
      failure_modes:
        - "SPEC/User Stories tabs empty despite files existing."
      fallback_or_recovery: "Show honest empty state with project context missing."
      verification:
        - "Integration smoke on a project with known user stories/spec."

  depended_on_by:
    - name: "Users inspecting project output"
      type: "external_consumer"
      owner: "product user"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Stable Files screen UX"
      compatibility_obligation: "Must preserve navigation and ability to open files."
      expected_consumer_behavior: "Select project, open files, inspect specs/stories."
      migration_or_notification_required: false
      verification:
        - "Manual browser validation."

    - name: "Preview and agent flow screens"
      type: "frontend_component"
      owner: "web app"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Deep link shape to files screen"
      compatibility_obligation: "May extend; do not break once added."
      expected_consumer_behavior: "Can link to files screen for selected project/file."
      migration_or_notification_required: false
      verification:
        - "Smoke deep link project/file query after implementation."

  bidirectional_integrations:
    - name: "ProjectFilesPage <-> URL state"
      participants:
        - "ProjectFilesPage"
        - "Browser URL/appMode state"
      shared_contract: "projectId/runId/file/view query or app state"
      consistency_rule: "Changing project resets tabs/search safely; opening file updates active file without losing project."
      verification:
        - "State test and browser manual check."

  data_flow:
    inbound:
      - source: "Backend"
        payload_or_state: "projects, tree entries, file content"
        validation: "Shared TypeScript/Zod types"
    outbound:
      - target: "Backend"
        payload_or_state: "project id, optional run id, relative file path"
        compatibility: "Frontend never sends absolute path as authority"

  sequencing_dependencies:
    - dependency: "Backend spec 33"
      reason: "Frontend must consume real contracts, not invented shapes."
      validation: "Backend route smoke returns expected schema before final frontend verification."

  integration_risks:
    - risk: "UI copied from zup but inconsistent with Horus visual system."
      severity: "medium"
      mitigation: "Reuse Horus shell colors/components and isolate CSS with project-files prefix."
    - risk: "Monaco dependency increases bundle size."
      severity: "medium"
      mitigation: "Lazy-load editor and keep first render lightweight."
```

# 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Keep data fetching separate from presentational components."
    - "Avoid god components."
    - "Do not introduce circular dependencies."
  project_specific:
    - "Feature must live under apps/web/src/features/project-files."
    - "API client must live under apps/web/src/api/projectFilesApi.ts."
    - "CSS must be isolated with .project-files-* prefix."
    - "Do not depend on zup global CSS classes."
    - "Do not put file system rules in frontend; backend owns safety."
    - "Use lazy loading for Monaco or any heavy editor."
```

# 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read App/Shell patterns before editing."
    - "Keep components small and named by responsibility."
    - "Handle loading/error/empty states in every async panel."
  frontend:
    - "No text overflow in sidebar, tabs, tree rows, or editor shell."
    - "Use accessible labels for close buttons, project select, search input, and tree rows."
    - "Use stable dimensions: left panel width, tab bar height, editor min-height."
    - "Do not use viewport-scaled font sizes."
    - "Do not create nested decorative cards."
    - "Use icons for folder/file/search/close/play where appropriate."
    - "Use dark professional operational UI consistent with Horus."
    - "Use React Query stale/refetch settings intentionally."
  tests:
    - "Test tree builder sorting/filtering."
    - "Test state reset when switching project."
    - "Test query disabled states when no project/file selected."
```

# 9. Contracts and Invariants

```yaml
contracts:
  api_contracts:
    - name: "Project files API client"
      producer: "apps/web/src/api/projectFilesApi.ts"
      consumers:
        - "ProjectFilesPage"
      request_shape: "projectId, optional runId, optional file path"
      response_shape: "Shared ProjectFiles schemas"
      compatibility: "Must match backend spec 33 exactly."

  ui_contracts:
    - name: "Project selector"
      producer: "ProjectFilesToolbar"
      consumers:
        - "User"
      requirement: "Changing project clears file tabs, active file, search, and stale errors."

    - name: "File tree"
      producer: "FileTree"
      consumers:
        - "User"
      requirement: "Folders expand/collapse; files open in tabs; active file is highlighted."

    - name: "File tabs"
      producer: "FileTabs"
      consumers:
        - "User"
      requirement: "Multiple files remain open; closing active tab selects nearest previous tab."

    - name: "Code viewer"
      producer: "CodeViewer"
      consumers:
        - "User"
      requirement: "Read-only editor with language detection, line numbers, scroll, binary/truncated states."

  data_contracts:
    - name: "Tree hierarchy"
      producer: "buildProjectFileTree"
      consumers:
        - "FileTree"
      migration_required: false
      compatibility_notes: "Flat backend entries become nested UI nodes; directories sort before files."
```

# 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current Horus shell and API patterns"
    agent: "repo_explorer"
    action: "Read App.tsx, Shell.tsx, workflowApi.ts, index.css, and existing feature folders."
    expected_output: "Frontend integration map and exact mode/navigation pattern."

  - step: 2
    name: "Add dependency and editor wrapper"
    agent: "frontend_specialist"
    action: "Add @monaco-editor/react if not present; create lazy CodeViewer with fallback."
    expected_output: "Read-only editor component with language mapping."

  - step: 3
    name: "Create typed API client"
    agent: "frontend_specialist"
    action: "Create projectFilesApi consuming shared backend contracts."
    expected_output: "API functions for listProjects, getTree, getFile."

  - step: 4
    name: "Create tree utilities and tests"
    agent: "frontend_specialist"
    action: "Implement buildProjectFileTree, sorting, filtering, path normalization."
    expected_output: "Deterministic tree builder and tests."

  - step: 5
    name: "Implement ProjectFilesPage"
    agent: "frontend_specialist"
    action: "Compose toolbar, side tree, tabs, editor area, SPEC panel, stories panel, and states."
    expected_output: "Feature complete page."

  - step: 6
    name: "Wire navigation"
    agent: "frontend_specialist"
    action: "Add Shell sidebar button and App mode rendering."
    expected_output: "User can open Arquivos from sidebar."

  - step: 7
    name: "Validate UX and integration"
    agent: "qa_specialist"
    action: "Run typecheck/build/tests and browser smoke with real backend."
    expected_output: "Validation evidence and screenshot/description."
```

# 11. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Ensure frontend follows Horus design system and backend contract."
    inputs:
      - "Backend spec 33"
      - "Zup CodePage reference"
    outputs:
      - "Approved component boundaries"

  - agent_name: "frontend_specialist"
    responsibility: "Implement project files UI, interactions, state, API client, and styles."
    inputs:
      - "Backend API contracts"
      - "Existing Shell/App patterns"
    outputs:
      - "Frontend diff"
      - "Frontend tests"

  - agent_name: "qa_specialist"
    responsibility: "Validate desktop/mobile layout, file interactions, and API states."
    inputs:
      - "Frontend diff"
      - "Acceptance criteria"
    outputs:
      - "Validation report"
```

# 12. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Sidebar has visible Arquivos entry."
    - "Files screen shows project selector and selected project label."
    - "Tree loads folders and files from backend."
    - "User can expand/collapse folders."
    - "User can search files by name/path."
    - "Clicking a file opens it in a tab and renders read-only content."
    - "User can open multiple files and close tabs."
    - "Switching project clears stale file state and reloads tree."
    - "SPEC tab shows selected project/run SPEC or clear empty state."
    - "User Stories tab shows selected project stories or clear empty state."
    - "Binary/truncated files display explicit states."
  integration:
    - "Frontend only sends relative paths from backend tree entries."
    - "Frontend uses shared contracts from backend spec."
    - "No existing UserStories, Preview, Agents, or Chat surface breaks."
  architectural:
    - "Project file feature is modular under features/project-files."
    - "CSS is scoped and does not leak global styles."
    - "Monaco/editor dependency is lazy-loaded."
  quality:
    - "Web typecheck passes."
    - "Web build passes."
    - "Relevant tests pass."
  observability:
    - "Errors are visible and actionable; no blank screens."
```

# 13. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/web type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend TypeScript."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate production bundle."
      success_condition: "Exit code 0."
    - command: "pnpm test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Run regression tests."
      success_condition: "Exit code 0 or documented unrelated failures with evidence."

  runtime_checks:
    - name: "Open files screen"
      method: "browser"
      expected: "Sidebar Arquivos opens the file browser without blank screen."
    - name: "Open a code file"
      method: "browser"
      expected: "File appears in tab and editor displays syntax-highlighted content."
    - name: "Switch project"
      method: "browser"
      expected: "Tree reloads and previous tabs are cleared without stale content."
    - name: "Resize"
      method: "browser"
      expected: "No overlapping text or unusable controls at desktop and narrow widths."

  integration_checks:
    - name: "Backend contract"
      surfaces:
        - "projectFilesApi"
        - "ProjectFileBrowserService"
      method: "real API smoke"
      expected: "Projects/tree/file calls return expected JSON."
    - name: "Existing screens"
      surfaces:
        - "UserStories"
        - "Preview"
        - "Agents"
      method: "browser navigation smoke"
      expected: "Screens still render."

  manual_checks:
    - "Compare visual density and flow against user image: left explorer, top tabs, file tabs, editor."
    - "Confirm no marketing/landing layout was introduced."
```

# 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent backend responses; implement against spec 33."
    - "Do not assume Monaco exists; check package.json."
    - "Do not claim browser validation without running it."
  read_before_write:
    - "Read Shell/App before adding navigation."
    - "Read existing CSS before creating project-files styles."
    - "Read zup CodePage only as reference, not as code to paste."
  failure_handling:
    - "If the page goes blank, inspect console/runtime error and fix before continuing."
    - "If backend endpoint is unavailable, use a contract mock only for component tests and mark integration blocked."
  state_consistency:
    - "Changing project must clear active file/open tabs/search/story selection."
    - "Closing active tab must select a deterministic remaining tab."
  scope_control:
    - "Do not refactor unrelated Shell/UserStories/Preview code."
```

# 15. Recovery and Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "Dev server port conflict"
    - "Temporary backend unavailable"
    - "Lazy editor load delay"
  non_retryable_failures:
    - "Backend contract mismatch"
    - "Missing project root"
    - "Security error from forbidden path"
  rollback_rules:
    - "Rollback only files created or changed for this feature."
    - "Do not revert unrelated dirty work."
  escalation_rules:
    - "Escalate if user asks for file editing or terminal execution in this screen."
    - "Escalate if project-to-user-story mapping cannot be inferred from current data model."
```

# 16. Observability Requirements

```yaml
observability:
  logs:
    - event: "project_files_screen_loaded"
      fields:
        - "project_id"
        - "run_id"
        - "tree_entry_count"
    - event: "project_file_open_failed"
      fields:
        - "project_id"
        - "path"
        - "error_code"
  audit_trail:
    required: true
    must_capture:
      - "files read"
      - "files changed"
      - "commands executed"
      - "browser validation"
  user_visible_failures:
    - "Não foi possível carregar projetos."
    - "Não foi possível carregar árvore."
    - "Não foi possível ler arquivo."
    - "Arquivo binário não pode ser pré-visualizado."
    - "Conteúdo truncado pelo limite de segurança."
```

# 17. Risks and Unknowns

```yaml
risks:
  - risk: "Large editor bundle slows first paint."
    severity: "medium"
    mitigation: "Lazy-load editor after file selection."
  - risk: "The UI copies zup too literally and clashes with Horus."
    severity: "medium"
    mitigation: "Use Horus shell/nav language, colors, and spacing; copy interaction model, not styling verbatim."
  - risk: "SPEC/User Stories cannot map to project."
    severity: "high"
    mitigation: "Use latest run/workspaceFolderId mapping; otherwise show explicit empty state and document backend gap."
  - risk: "Tree with many files overwhelms layout."
    severity: "medium"
    mitigation: "Search, partial tree notice, entry limits, and scroll containers."

unknowns:
  - question: "Will backend expose projectId or workspaceId as primary key?"
    resolution_strategy: "Follow backend spec 33 after implementation."
  - question: "Should this screen deep-link with query params or existing appMode state only?"
    resolution_strategy: "Prefer query params for project/file if current App supports it without broad routing refactor."
```

# 18. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Recreate the zup interaction model in Horus with cleaner boundaries: backend owns file safety and root resolution,
    frontend owns display state and interactions. Use a feature folder, scoped CSS, lazy editor, and shared contracts.
    Preserve the image's information architecture: global sidebar, project explorer, top tabs, file tabs, editor.

  alternatives_considered:
    - option: "Embed files into UserStories page."
      tradeoff: "Rejected because the image and workflow require a first-class Files screen."
    - option: "Use plain textarea/pre."
      tradeoff: "Acceptable fallback, but inferior to IDE-like Monaco; use only if Monaco causes unacceptable build/runtime issues."
    - option: "Copy zup CodePage directly."
      tradeoff: "Rejected due to different stack, CSS tokens, route model, and requirement not to copy bad patterns."

  migration_notes:
    - "Add dependency only if approved by package policy and lockfile is updated intentionally."
  backward_compatibility:
    required: true
    notes:
      - "Existing app modes must remain intact."
      - "Existing user story/spec editing must not regress."
```

# 19. Deliverables

```yaml
deliverables:
  code:
    - "apps/web/src/features/project-files/*"
    - "apps/web/src/api/projectFilesApi.ts"
    - "apps/web/src/App.tsx integration"
    - "apps/web/src/components/Shell.tsx integration"
    - "apps/web/src/index.css or scoped project-files.css import"
  tests:
    - "Tree builder tests"
    - "Component/state tests if current test setup supports React"
  docs:
    - "This SPEC"
  validation_evidence:
    - "Typecheck output"
    - "Build output"
    - "Browser screenshot/description"
```

# 20. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Shell/App mode pattern was read."
    - "Existing API client patterns were read."
    - "Backend spec 33 contract was followed."
    - "Zup reference was analyzed but not copied blindly."
  implementation:
    - "Arquivos is visible in sidebar."
    - "Project selector works."
    - "Tree/search/tabs/editor work."
    - "SPEC/User Stories tabs have honest states."
    - "No unrelated refactor was introduced."
  validation:
    - "Typecheck passed."
    - "Build passed."
    - "Browser smoke passed."
    - "Existing critical screens still render."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

# 21. Minimal Output Contract For Executing Agents

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
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```
