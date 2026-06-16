---
format_version: "agentic_sdd.v1"
task_id: "feature-49-project-files-ide-experience"
title: "Project Files IDE Experience"
created_at_utc: "2026-05-27T02:12:02Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "spec/features/33-project-file-browser-backend.md"
  - "spec/features/34-project-file-browser-frontend.md"
  - "spec/features/37-project-file-editing-persistence.md"
  - "spec/features/48-frontend-architecture-remediation-plan.md"
---

# 49 - Project Files IDE Experience

## 1. Original User Request

```yaml
raw_user_request: |
  cara, eu quero visualizar e editar esse código e ver esses arquivos como se fosse numa IDE, analise o que é preciso e use a skill de criar spec para planejar isso, a forma atual tá uma bosta
```

## 2. System Interpretation

```yaml
system_translation: |
  Planejar a transformação da tela Project Files de um navegador/editor simples para uma experiência de IDE
  embutida no Horus. A tela deve permitir ver, navegar e editar código com qualidade profissional:
  editor real, syntax highlighting enquanto edita, cursor natural, seleção/cópia corretas, abas confiáveis,
  árvore de arquivos ergonômica, atalhos previsíveis, salvamento seguro, status claro e integração com o
  backend atual de arquivos/projetos sem perder proteção de path, versionamento e conflito.

expected_user_visible_result: |
  O usuário deve sentir que está em uma IDE leve dentro do Horus: clica no arquivo e o código abre rápido;
  digita diretamente; usa Cmd/Ctrl+S para salvar; vê linha/coluna, linguagem, dirty state e conflitos de forma
  discreta; alterna entre arquivos sem a árvore piscar ou recolher; copia/seleciona normalmente; visualiza cores
  de código enquanto edita; usa busca e abas sem ruído visual.

expected_engineering_result: |
  A feature Project Files deve ter componentes e hooks separados para layout IDE, árvore, abas, editor, status bar,
  keybindings, dirty buffers, autosave/opcional, conflict resolution e data queries. O editor não deve depender de
  textarea improvisado com highlight separado; deve usar uma engine adequada, preferencialmente Monaco Editor,
  com fallback controlado se a dependência falhar.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "A tela de arquivos ainda parece um visualizador parcial, não um ambiente confiável para edição de código."
  target_user: "Usuário do Horus que inspeciona e ajusta projetos gerados pelos agentes."
  expected_outcome: "Editar código gerado sem sair do Horus, com sensação de IDE e segurança de persistência."
  product_surface:
    - "Project Files screen"
    - "Generated project source browser"
    - "Project file editor"
    - "Project file write/persistence layer"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Express routes under apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
      - "ProjectFileBrowserService for safe tree/read/save operations"
      - "Shared ProjectFiles schemas in packages/shared/src/entities/ProjectFiles.ts"
    frontend:
      - "React"
      - "Vite"
      - "@tanstack/react-query"
      - "Current project-files feature under apps/web/src/features/project-files"
      - "Current editor is CodeViewer.tsx using a textarea and custom gutter"
    database:
      - "No new migration required for basic IDE behavior"
      - "Optional future persistence for user IDE layout/session can use localStorage first"
    infrastructure:
      - "Generated project files live on local workspace/project roots resolved by backend"
  known_entrypoints:
    - "apps/web/src/features/project-files/ProjectFilesPage.tsx"
    - "apps/web/src/features/project-files/components/CodeViewer.tsx"
    - "apps/web/src/features/project-files/components/FileTree.tsx"
    - "apps/web/src/features/project-files/components/FileTabs.tsx"
    - "apps/web/src/features/project-files/hooks/useProjectFilesState.ts"
    - "apps/web/src/api/projectFilesApi.ts"
  known_existing_patterns:
    - "React Query owns project/tree/file fetches."
    - "Backend already exposes listProjects, getTree, getFile and saveFile."
    - "Save uses baseVersion/hash conflict protection."
    - "Tree expansion state should not collapse on file switch."
    - "Dirty state is already path-scoped in ProjectFilesPage."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Replace textarea-based CodeViewer with a real code editor component."
    - "Adopt Monaco Editor or an equivalent editor engine that supports editing, syntax highlighting, selection, cursor, line/column, search and keyboard shortcuts."
    - "Keep safe backend persistence through existing PUT /api/project-files/projects/:projectId/file."
    - "Add IDE-like layout: activity/toolbar area, file explorer, tabs, editor, status bar and notification area."
    - "Implement reliable Cmd/Ctrl+S save behavior."
    - "Preserve Ctrl/Cmd+C as copy, not save."
    - "Add unsaved-file protection per open buffer."
    - "Add conflict handling for changed-on-disk files."
    - "Keep file tree open/expanded while switching files."
    - "Improve tab behavior, dirty indicators and close confirmation."
    - "Improve loading/perceived speed with prefetch and stale cache policies."
    - "Add focused unit/guard tests and at least one browser smoke path."
  out_of_scope:
    - "Building a full VSCode clone."
    - "Terminal, Git commit UI, extensions marketplace or LSP server integration in this phase."
    - "Changing backend root-resolution security rules."
    - "Removing path/version/binary/truncated safeguards."
    - "Changing generated project filesystem layout."
    - "Adding multi-user collaborative editing."
```

## 5. Current Problem Inventory

```yaml
verified_negative_findings:
  editor_engine:
    file: "apps/web/src/features/project-files/components/CodeViewer.tsx"
    evidence:
      - "Current implementation is a textarea with custom gutter."
      - "Previous highlight layer was removed because it fought cursor and selection."
      - "Current editor lacks true syntax highlighting while editing."
    impact:
      - "Feels like a raw text box, not an IDE."
      - "No professional editor affordances: line/column, minimap/search, selection polish, command behavior."

  code_header:
    file: "apps/web/src/features/project-files/components/CodeViewer.tsx"
    evidence:
      - "Header still carries save status but no integrated IDE status bar."
    impact:
      - "Status and actions feel like form UI rather than editor chrome."

  project_files_page:
    file: "apps/web/src/features/project-files/ProjectFilesPage.tsx"
    evidence:
      - "Page owns queries, dirty state, save mutation, tab actions and layout."
    impact:
      - "Hard to evolve into IDE because state orchestration is still page-heavy."

  file_tree:
    file: "apps/web/src/features/project-files/components/FileTree.tsx"
    evidence:
      - "Tree is functional but minimal."
      - "No context menu, no keyboard navigation, no reveal-active-file command, no folder/file visual density tuned like IDE."
    impact:
      - "Explorer does not yet feel like IDE file explorer."

  tabs:
    file: "apps/web/src/features/project-files/components/FileTabs.tsx"
    evidence:
      - "Tabs exist with dirty dot support."
      - "No split, pinned, reorder, reopen, or strong active styling."
    impact:
      - "Useful but not yet IDE-grade."

  persistence_contract:
    files:
      - "packages/shared/src/entities/ProjectFiles.ts"
      - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
      - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
    evidence:
      - "Safe read and save contract exists."
      - "Save requires baseVersion and rejects conflicts."
    impact:
      - "Good foundation; frontend must respect it instead of hiding conflicts."
```

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
      - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
      - "packages/shared/src/entities/ProjectFiles.ts"
    services:
      - "ProjectFileBrowserService"
    database:
      migrations_required: false
      tables: []
    expected_backend_changes:
      - "No mandatory backend change for phase 1."
      - "Optional: add file metadata endpoint only if Monaco needs richer language/readonly metadata not already available."
  frontend:
    files:
      - "apps/web/src/features/project-files/ProjectFilesPage.tsx"
      - "apps/web/src/features/project-files/components/CodeViewer.tsx"
      - "apps/web/src/features/project-files/components/FileTree.tsx"
      - "apps/web/src/features/project-files/components/FileTabs.tsx"
      - "apps/web/src/features/project-files/components/ProjectFilesToolbar.tsx"
      - "apps/web/src/features/project-files/hooks/useProjectFilesState.ts"
      - "apps/web/src/features/project-files/styles/project-files.css"
      - "apps/web/src/api/projectFilesApi.ts"
    new_files:
      - "apps/web/src/features/project-files/components/IdeEditor.tsx"
      - "apps/web/src/features/project-files/components/IdeStatusBar.tsx"
      - "apps/web/src/features/project-files/components/IdeNotifications.tsx"
      - "apps/web/src/features/project-files/hooks/useProjectFileBuffers.ts"
      - "apps/web/src/features/project-files/hooks/useProjectFileQueries.ts"
      - "apps/web/src/features/project-files/hooks/useEditorKeybindings.ts"
      - "apps/web/src/features/project-files/utils/languageMapping.ts"
    routes:
      - "/?mode=files&projectId=...&file=..."
  workflow:
    graph_nodes: []
    agents: []
  tests:
    unit:
      - "apps/web/test/frontendRegressionGuards.test.mjs"
      - "new focused tests for buffer dirty/save/conflict reducers if extracted"
    integration:
      - "apps/server/test/projectFileRoutes.test.mjs should remain passing"
    e2e:
      - "Browser smoke: open project, open package.json, edit text, Cmd/Ctrl+S save, reload file, confirm persisted."
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    The IDE experience consumes the existing project-files backend contract and exposes a richer frontend
    editor surface to users. The backend remains the authority for filesystem safety, path validation,
    binary/truncated-file rejection and version conflicts. The frontend owns editor state, buffers, tabs,
    keybindings and user feedback.

  depends_on:
    - name: "ProjectFileBrowserService"
      type: "backend_service"
      owner: "project-files backend"
      direction: "this_spec_consumes_dependency"
      contract_used: "listProjects, getTree, getFileContent, saveFile"
      required_for: "Resolve project roots safely and persist file edits."
      assumptions: []
      failure_modes:
        - "Project not found."
        - "File not found."
        - "Binary/truncated file cannot be edited."
        - "Version conflict when file changed outside editor."
      fallback_or_recovery: "Show IDE notification and keep local buffer intact."
      verification:
        - "pnpm --filter @u-build/server test projectFileRoutes"
        - "Manual save conflict smoke."

    - name: "Shared ProjectFiles schemas"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "ProjectFileContentResponse, ProjectFileVersion, SaveProjectFileRequest"
      required_for: "Typed frontend/backend contract."
      assumptions: []
      failure_modes:
        - "Frontend sends stale/malformed baseVersion."
        - "Language mapping is too weak for editor mode."
      fallback_or_recovery: "Use plaintext language and block save if version is missing."
      verification:
        - "pnpm --filter @u-build/shared type-check"
        - "pnpm --filter @u-build/web type-check"

    - name: "Monaco Editor"
      type: "external_dependency"
      owner: "frontend dependency"
      direction: "this_spec_consumes_dependency"
      contract_used: "React wrapper or direct monaco-editor API"
      required_for: "Professional code editing, highlighting, cursor, selection, line/column, search and commands."
      assumptions:
        - "Dependency can be added to apps/web without unacceptable bundle cost."
      failure_modes:
        - "Bundle grows too much."
        - "Worker configuration breaks Vite build."
        - "Editor fails to mount in test/browser."
      fallback_or_recovery: "Fallback to controlled textarea only for mount failure, with explicit degraded status."
      verification:
        - "pnpm --filter @u-build/web build"
        - "Browser smoke open files screen."

  depended_on_by:
    - name: "ProjectFilesPage"
      type: "frontend_component"
      owner: "project-files frontend"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "IDE layout props and file buffer state"
      compatibility_obligation: "must preserve route query params projectId and file"
      expected_consumer_behavior: "URL can deep-link to an open file and restore active tab."
      migration_or_notification_required: false
      verification:
        - "Open /?mode=files&projectId=...&file=package.json"

    - name: "User workflow: inspect generated code"
      type: "workflow"
      owner: "Horus user"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Visual IDE screen"
      compatibility_obligation: "must remain usable for read-only/binary/truncated files"
      expected_consumer_behavior: "User can inspect and edit generated project source directly."
      migration_or_notification_required: false
      verification:
        - "Manual browser smoke across .gitignore, package.json, README.md, src/index.html"

  bidirectional_integrations:
    - name: "Editor buffer and save endpoint"
      participants:
        - "Frontend file buffer"
        - "ProjectFileBrowserService.saveFile"
      shared_contract: "path + content + baseVersion + expectedEncoding"
      consistency_rule: "A successful save must update buffer baseline to returned content/version and clear dirty state only for that path."
      verification:
        - "Unit test buffer reducer."
        - "Integration save route test."

  data_flow:
    inbound:
      - source: "GET /api/project-files/projects"
        payload_or_state: "ProjectFileListProjectsResponse"
        validation: "shared schema/backend route"
      - source: "GET /api/project-files/projects/:projectId/tree"
        payload_or_state: "ProjectFileTreeResponse"
        validation: "safe root collector"
      - source: "GET /api/project-files/projects/:projectId/file"
        payload_or_state: "ProjectFileContentResponse with version"
        validation: "safe path, maxBytes, binary/truncated flags"
    outbound:
      - target: "PUT /api/project-files/projects/:projectId/file"
        payload_or_state: "SaveProjectFileRequest"
        validation: "baseVersion hash/size/mtime; expectedEncoding utf-8"
```

## 8. Required UX Behavior

```yaml
ide_ux_contract:
  layout:
    - "Top toolbar keeps project selector, search, refresh and global file count."
    - "Left explorer behaves like an IDE file explorer, not a generic list."
    - "Center editor owns tabs, code editor and bottom status bar."
    - "Editor panel must use full available height."
    - "No form-like save/discard buttons in the editor header."

  editor:
    - "Code opens directly in editable mode when file is editable."
    - "Syntax highlighting must be visible while editing."
    - "Cursor, selection, copy, paste, undo and redo must behave naturally."
    - "Tab indentation must work."
    - "Cmd/Ctrl+S saves the active file."
    - "Cmd/Ctrl+C copies; it must never save."
    - "Line/column must be shown in a status bar."
    - "Language mode must be shown in a status bar."
    - "Readonly reason must be visible for binary/truncated/missing-version files."

  tabs:
    - "Dirty files show a dot."
    - "Closing dirty tabs prompts before losing changes."
    - "Switching files must not close folders or flicker the tree."
    - "Active file is revealed in tree without stealing user expansion intent."

  save_feedback:
    - "Successful save clears dirty state for that path only."
    - "Saving shows subtle status, not large buttons."
    - "Conflict keeps local buffer and offers clear choices: reload disk version or keep editing/copy local text."
    - "Errors are shown as IDE notifications/toasts or inline compact banners."

  performance:
    - "Opening small/medium cached files should feel instant."
    - "Hover/focus prefetch should remain."
    - "Large files must not lock the UI."
    - "Tree polling must not reset expansion or active scroll."
```

## 9. Implementation Plan

### Phase 1 - Architecture Split

```yaml
steps:
  - "Create useProjectFileQueries to own projects/tree/file query setup and cache keys."
  - "Create useProjectFileBuffers to own open buffers, dirty state, baseline versions, conflicts and save state per path."
  - "Keep ProjectFilesPage as layout/composition only."
  - "Move save mutation side effects into a focused hook or adapter."
acceptance:
  - "ProjectFilesPage no longer owns raw dirty Set and save mutation details directly."
  - "Switching tabs uses buffer state rather than a single active file query state."
```

### Phase 2 - Real Editor Engine

```yaml
steps:
  - "Install and configure Monaco Editor for Vite, or choose a comparable editor only if Monaco proves incompatible."
  - "Create IdeEditor component."
  - "Map backend language values to Monaco languages."
  - "Use controlled model per open path, not one global textarea."
  - "Register Cmd/Ctrl+S command."
  - "Preserve copy/paste/undo/redo default behavior."
  - "Expose cursor line/column to status bar."
acceptance:
  - "package.json, src/index.html, README.md and .gitignore render in editor without visual mode switching."
  - "Syntax highlighting appears while editing for supported languages."
  - "Plaintext fallback appears for unsupported languages with no noisy warning."
```

### Phase 3 - IDE Shell Polish

```yaml
steps:
  - "Create IdeStatusBar showing line/column, language, encoding, file size, dirty/saved/conflict state."
  - "Move save state from header buttons to status bar and notification area."
  - "Remove remaining form-like editor controls."
  - "Tune explorer density, active row, folder indentation, icons and hover/focus states."
  - "Improve tabs to feel like IDE tabs with dirty dot, active strip and close affordance."
acceptance:
  - "Editor surface visually reads as code workspace, not form/card content."
```

### Phase 4 - Conflict and Readonly UX

```yaml
steps:
  - "On version_conflict, keep local buffer and show compact conflict notification."
  - "Offer Reload from disk action."
  - "Do not silently overwrite external changes."
  - "For binary/truncated/missing-version files, open readonly editor panel with reason."
acceptance:
  - "Conflict can be reproduced and does not lose local edits."
  - "Readonly files cannot be edited and clearly explain why."
```

### Phase 5 - Regression Guardrails

```yaml
steps:
  - "Update frontendRegressionGuards to assert no click-to-edit textarea preview returns."
  - "Add buffer reducer tests if buffer logic is extracted as pure functions."
  - "Add browser smoke steps for open/edit/save/reload."
acceptance:
  - "pnpm --filter @u-build/web type-check passes."
  - "pnpm --filter @u-build/web build passes."
  - "pnpm --filter @u-build/web test:guards passes."
```

## 10. Architecture Rules

```yaml
architecture_rules:
  - "Do not bypass ProjectFileBrowserService for writes."
  - "Do not save without baseVersion."
  - "Do not use Ctrl/Cmd+C for save."
  - "Do not add large editor state to App.tsx."
  - "Do not let tree polling reset user-expanded folders."
  - "Do not show noisy warnings for unsupported syntax highlight."
  - "Do not replace backend path safety with frontend-only checks."
  - "Do not introduce global CSS selectors outside project-files prefix for this feature."
  - "Do not fake persistence; save must call backend and update cache from response."
```

## 11. Validation Plan

```yaml
validation_commands:
  required:
    - "pnpm --filter @u-build/web type-check"
    - "pnpm --filter @u-build/web build"
    - "pnpm --filter @u-build/web test:guards"
  recommended_if_backend_touched:
    - "pnpm --filter @u-build/server build"
    - "node --test apps/server/test/projectFileRoutes.test.mjs"

manual_browser_smoke:
  - "Open http://localhost:5174/?mode=files&projectId=<id>&file=package.json."
  - "Confirm file tree remains expanded."
  - "Confirm package.json opens as editable code with syntax highlighting."
  - "Type a small harmless whitespace/comment change."
  - "Press Cmd/Ctrl+S and confirm saved state clears dirty dot."
  - "Reload or reopen file and confirm content persisted."
  - "Open .gitignore and README.md; confirm plaintext/markdown modes are usable."
  - "Switch between tabs and confirm no flicker/collapse."
  - "Copy text with Cmd/Ctrl+C and confirm it does not save."
```

## 12. Completion Criteria

```yaml
done_when:
  - "The files screen feels and behaves like an IDE-lite workspace."
  - "Editor is a real code editor, not a textarea pretending to be one."
  - "User can edit naturally and save with Cmd/Ctrl+S."
  - "Unsupported languages degrade quietly to plaintext."
  - "Dirty/conflict/readonly states are precise per file."
  - "Tree and tabs remain stable during file switching and refetching."
  - "Backend write contract remains protected by baseVersion."
  - "All required validation commands pass."
```

## 13. Agent Output Contract

```yaml
implementing_agent_must_report:
  files_changed:
    - "<path>"
  editor_engine:
    chosen: "<monaco | alternative>"
    reason: "<why>"
  behavior_confirmed:
    - "open file"
    - "edit"
    - "Cmd/Ctrl+S save"
    - "copy remains copy"
    - "dirty tab"
    - "conflict behavior if tested"
  validation:
    commands_run:
      - "<command>"
    results:
      - "<pass/fail summary>"
  known_limits:
    - "<remaining limitation, if any>"
```
