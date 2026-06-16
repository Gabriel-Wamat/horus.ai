---
format_version: "agentic_sdd.v1"
task_id: "feature-48-frontend-architecture-remediation-plan"
title: "Frontend Architecture Remediation Plan"
created_at_utc: "2026-05-26T00:00:00Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "spec/features/34-project-file-browser-frontend.md"
  - "spec/features/36-user-stories-accessibility-visual-load.md"
  - "spec/features/46-agent-progress-ux-evidence.md"
---

# 48 - Frontend Architecture Remediation Plan

## 1. Original User Request

```yaml
raw_user_request: |
  crie um plano de spec para ajustar todos os pontos listados negativamente
```

## 2. System Interpretation

```yaml
system_translation: |
  Transformar o mapeamento negativo do frontend em um plano de specs executáveis, priorizadas e
  independentes o suficiente para implementação incremental. O objetivo é reduzir componentes gigantes,
  centralizar estado e live data, modularizar CSS, estabilizar a tela de arquivos/editor e reforçar
  a UX do mapa de agentes sem quebrar funcionalidades já validadas.

expected_user_visible_result: |
  Após a execução das specs derivadas, o usuário deve perceber menos piscadas, navegação mais estável,
  telas visualmente consistentes, editor de código natural, árvore de arquivos/pastas sem colapsos
  inesperados e painéis de agentes/user stories mais previsíveis.

expected_engineering_result: |
  O frontend deve deixar de depender de App.tsx e StorySpecWorkspace como god components, passar a ter
  boundaries por feature, hooks de estado específicos, primitives de design compartilhadas, política única
  para SSE/polling/cache e testes focados em regressões de interação.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "A experiência do Horus sofre regressões frequentes porque telas grandes e acopladas tornam qualquer ajuste arriscado."
  target_user: "Usuário operador do Horus que alterna entre User Stories, Arquivos, Preview e Agentes."
  expected_outcome: "Frontend mais estável, previsível e fácil de evoluir."
  product_surface:
    - "User Stories / SPEC workspace"
    - "Project Files code screen"
    - "Agent Flow map"
    - "Preview console"
    - "Global shell/navigation"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
      - "@tanstack/react-query"
      - "@xyflow/react"
      - "Shiki/dynamic syntax highlighter"
    backend:
      - "Express API consumed by frontend"
    database:
      - "Not directly changed by this frontend remediation plan"
  known_entrypoints:
    - "apps/web/src/App.tsx"
    - "apps/web/src/main.tsx"
  known_existing_patterns:
    - "Feature folders exist for agent-flow-map and project-files."
    - "Shared contracts are exported from @u-build/shared."
    - "Project files screen already uses React Query locally."
    - "Agent Flow has isolated CSS and component folders."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Plan refactor specs for App.tsx state extraction."
    - "Plan componentization of StorySpecWorkspace."
    - "Plan a minimal design system and CSS modularization."
    - "Plan Project Files/editor architecture corrections."
    - "Plan shared live data/SSE/polling utilities."
    - "Plan Agent Flow interaction policy hardening."
    - "Plan frontend regression guardrails."
  out_of_scope:
    - "Changing backend persistence models."
    - "Replacing the app framework."
    - "Rebuilding all screens visually from scratch."
    - "Introducing Redux/Zustand before proving local hooks are insufficient."
    - "Implementing the specs in this planning task."
```

## 5. Current Problem Inventory

```yaml
verified_negative_findings:
  app_root:
    file: "apps/web/src/App.tsx"
    evidence:
      - "876 lines."
      - "Owns navigation, folders, SSE, workflow, modal, preview/files/agents routing and derived fake workflow states."
    risks:
      - "One feature change can regress unrelated screens."
      - "Terminal statuses and new workflow states require multiple manual patches."

  story_spec_workspace:
    file: "apps/web/src/components/StorySpecWorkspace.tsx"
    evidence:
      - "1376 lines."
      - "Owns folder tree, story list, story editor, spec editor, HITL spec review, tabs, detail panes and loading states."
    risks:
      - "Folder expansion and selection behavior is fragile."
      - "Component is too large for safe visual iteration."

  global_css:
    file: "apps/web/src/index.css"
    evidence:
      - "2562 lines."
      - "Generic classes are shared by unrelated screens."
    risks:
      - "Style collision."
      - "Hard to keep Horus visual identity consistent."

  project_files:
    files:
      - "apps/web/src/features/project-files/ProjectFilesPage.tsx"
      - "apps/web/src/features/project-files/components/CodeViewer.tsx"
      - "apps/web/src/features/project-files/components/FileTree.tsx"
    evidence:
      - "Dirty state is page-level boolean, not per-tab."
      - "Editor switches highlight layer and textarea."
      - "Tree auto-expansion is effect-driven and not governed by user-intent policy."
    risks:
      - "Cursor/scroll glitches."
      - "Tabs can lose precise dirty state."
      - "Polling/refetch can still produce rough updates."

  live_data:
    files:
      - "apps/web/src/hooks/useEventStream.ts"
      - "apps/web/src/hooks/usePreviewEvents.ts"
      - "apps/web/src/features/agent-flow-map/hooks/useRunFlowEvents.ts"
      - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
    evidence:
      - "Multiple SSE merge/dedup/retry implementations."
    risks:
      - "Duplicated bugs and inconsistent reconnect/merge semantics."

  agent_flow_interactions:
    files:
      - "apps/web/src/features/agent-flow-map/components/AgentFlowCanvas.tsx"
      - "apps/web/src/features/agent-flow-map/components/FlowEdge.tsx"
      - "apps/web/src/features/agent-flow-map/utils/buildHorusFlowGraph.ts"
    evidence:
      - "Graph position preservation exists but competes with focus/fitView policies."
      - "Graph builder mixes topology/status/layout data."
    risks:
      - "Dragging and live updates can regress again."
      - "Hard to test interaction policy."
```

## 6. Spec Decomposition

### Spec 49 - App Shell And Runtime State Boundaries

```yaml
task_id: "feature-49-app-shell-runtime-state-boundaries"
priority: "p0"
risk_level: "critical"
goal: |
  Extrair responsabilidades de App.tsx em hooks/providers pequenos, preservando comportamento atual.
in_scope:
  - "Create useAppNavigation for mode/url sync."
  - "Create useWorkspaceFolders for folders, selected folder and artifact loading."
  - "Create useWorkflowRuntime for threadId, workflow state, SSE event processing, pending spec and pending retry."
  - "Move story creation modal focus trap into reusable Modal or StoryCreationDialog component."
  - "Keep App.tsx as composition-only shell under ~250 lines."
out_of_scope:
  - "Changing backend workflow semantics."
  - "Changing visual layout."
affected_files:
  - "apps/web/src/App.tsx"
  - "apps/web/src/hooks/useEventStream.ts"
  - "apps/web/src/components/UserStoryInputPage.tsx"
new_files:
  - "apps/web/src/app/useAppNavigation.ts"
  - "apps/web/src/app/useWorkspaceFolders.ts"
  - "apps/web/src/app/useWorkflowRuntime.ts"
  - "apps/web/src/components/StoryCreationDialog.tsx"
acceptance:
  - "App.tsx no longer owns direct SSE event switch logic."
  - "URL mode sync has one owner."
  - "Workflow pending spec/retry behavior remains unchanged."
  - "pnpm --filter @u-build/web type-check passes."
```

### Spec 50 - User Stories Workspace Componentization

```yaml
task_id: "feature-50-user-stories-workspace-componentization"
priority: "p0"
risk_level: "critical"
goal: |
  Quebrar StorySpecWorkspace em componentes e hooks menores com política estável de seleção/expansão.
in_scope:
  - "Extract WorkspaceFolderRail."
  - "Extract StoryList and StoryListItem."
  - "Extract StoryDetail and StoryEditor."
  - "Extract SpecDetail and SpecEditor."
  - "Extract StorySpecHeader and StorySpecTabs."
  - "Create useFolderExpansionState where user-toggle state wins over auto-expansion."
  - "Keep existing a11y labels and keyboard tab behavior."
out_of_scope:
  - "Changing story/spec backend APIs."
  - "Redesigning visual hierarchy beyond component boundaries."
affected_files:
  - "apps/web/src/components/StorySpecWorkspace.tsx"
  - "apps/web/src/index.css"
new_files:
  - "apps/web/src/features/user-stories/components/WorkspaceFolderRail.tsx"
  - "apps/web/src/features/user-stories/components/StoryList.tsx"
  - "apps/web/src/features/user-stories/components/StoryDetail.tsx"
  - "apps/web/src/features/user-stories/components/StoryEditor.tsx"
  - "apps/web/src/features/user-stories/components/SpecDetail.tsx"
  - "apps/web/src/features/user-stories/components/SpecEditor.tsx"
  - "apps/web/src/features/user-stories/hooks/useFolderExpansionState.ts"
  - "apps/web/src/features/user-stories/styles/user-stories.css"
acceptance:
  - "No single user-stories component exceeds 350 lines unless justified."
  - "Switching folders does not collapse manually expanded folders unexpectedly."
  - "Selected story and active tab survive folder artifact refresh."
  - "Existing spec approval/reject flow still works."
```

### Spec 51 - Frontend Design System And CSS Modularization

```yaml
task_id: "feature-51-frontend-design-system-css-modularization"
priority: "p1"
risk_level: "high"
goal: |
  Criar primitives de UI e reduzir dependência do CSS global.
in_scope:
  - "Create Button, IconButton, Panel, Toolbar, StatusPill, EmptyState, InlineAlert, Tabs and Select primitives."
  - "Move reusable tokens to styles/tokens.css."
  - "Move global layout primitives to styles/layout.css."
  - "Move feature-specific CSS out of index.css."
  - "Replace generic class reuse in touched screens with component-owned classes or primitives."
out_of_scope:
  - "Introducing an external design system library."
  - "Full redesign."
affected_files:
  - "apps/web/src/index.css"
  - "apps/web/src/components/*.tsx"
  - "apps/web/src/features/**/styles/*.css"
new_files:
  - "apps/web/src/ui/Button.tsx"
  - "apps/web/src/ui/IconButton.tsx"
  - "apps/web/src/ui/Panel.tsx"
  - "apps/web/src/ui/StatusPill.tsx"
  - "apps/web/src/ui/EmptyState.tsx"
  - "apps/web/src/ui/Tabs.tsx"
  - "apps/web/src/styles/tokens.css"
  - "apps/web/src/styles/layout.css"
acceptance:
  - "index.css is materially smaller and no longer owns feature-specific blocks."
  - "Common buttons/status pills are rendered by shared primitives."
  - "Visual identity remains consistent with ID_VISUAL.md."
```

### Spec 52 - Project Files Editor And Tree Stability

```yaml
task_id: "feature-52-project-files-editor-tree-stability"
priority: "p0"
risk_level: "critical"
goal: |
  Corrigir a arquitetura da tela de arquivos para edição natural, dirty state por aba e árvore estável.
in_scope:
  - "Move file query/save orchestration into useProjectFileQueries."
  - "Track dirty state per open tab, not page-level boolean."
  - "Replace window.confirm with in-app unsaved changes dialog."
  - "Choose editor strategy: Monaco/CodeMirror or persistent textarea without highlight overlay during editing."
  - "Throttle/defer syntax highlight so typing remains responsive."
  - "Make tree expansion policy explicit: root auto-open once, active-path auto-open, user-collapse preserved."
  - "Avoid full file viewer empty/loading flicker when switching files with cached content."
out_of_scope:
  - "Backend save semantics, unless a frontend bug reveals missing API data."
affected_files:
  - "apps/web/src/features/project-files/ProjectFilesPage.tsx"
  - "apps/web/src/features/project-files/components/CodeViewer.tsx"
  - "apps/web/src/features/project-files/components/FileTree.tsx"
  - "apps/web/src/features/project-files/hooks/useProjectFilesState.ts"
  - "apps/web/src/features/project-files/styles/project-files.css"
new_files:
  - "apps/web/src/features/project-files/hooks/useProjectFileQueries.ts"
  - "apps/web/src/features/project-files/hooks/useDirtyTabs.ts"
  - "apps/web/src/features/project-files/hooks/useFileTreeExpansion.ts"
  - "apps/web/src/features/project-files/components/UnsavedChangesDialog.tsx"
acceptance:
  - "Typing in code editor does not move cursor unexpectedly."
  - "Switching cached files shows content immediately."
  - "Dirty state is accurate per tab."
  - "Folder expansion does not reset on polling/refetch."
  - "Save conflict keeps local draft and shows recoverable UI."
```

### Spec 53 - Unified Frontend Live Data Layer

```yaml
task_id: "feature-53-unified-frontend-live-data-layer"
priority: "p1"
risk_level: "high"
goal: |
  Unificar SSE/polling merge semantics para workflow, preview and agent flow.
in_scope:
  - "Create generic useSseStream hook with status, retry, close and error state."
  - "Create mergeByIdAndSequence utility."
  - "Refactor useEventStream, usePreviewEvents and useRunFlowEvents to shared utility."
  - "Define consistent dedupe/sort policy."
  - "Expose reconnect state to UI without forcing remounts."
out_of_scope:
  - "Changing backend SSE endpoints."
affected_files:
  - "apps/web/src/hooks/useEventStream.ts"
  - "apps/web/src/hooks/usePreviewEvents.ts"
  - "apps/web/src/features/agent-flow-map/hooks/useRunFlowEvents.ts"
  - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
new_files:
  - "apps/web/src/lib/live/useSseStream.ts"
  - "apps/web/src/lib/live/mergeEvents.ts"
acceptance:
  - "Duplicate SSE messages do not duplicate UI rows."
  - "Out-of-order events render in stable order."
  - "Temporary SSE disconnect does not clear visible state."
```

### Spec 54 - Agent Flow Interaction Policy Hardening

```yaml
task_id: "feature-54-agent-flow-interaction-policy-hardening"
priority: "p1"
risk_level: "high"
goal: |
  Formalizar quando o grafo pode auto-focar, fitView, resetar layout ou preservar posições.
in_scope:
  - "Extract graph interaction policy from AgentFlowCanvas."
  - "Persist manual node positions per run/layout in memory during session."
  - "Prevent fitView/focus while user is dragging or after manual positioning unless user explicitly requests focus."
  - "Split buildHorusFlowGraph into topology, status projection and layout modules."
  - "Add tests for layout preservation in pure utils where possible."
out_of_scope:
  - "Changing graph topology."
  - "Replacing React Flow."
affected_files:
  - "apps/web/src/features/agent-flow-map/components/AgentFlowCanvas.tsx"
  - "apps/web/src/features/agent-flow-map/utils/buildHorusFlowGraph.ts"
  - "apps/web/src/features/agent-flow-map/utils/layoutGraph.ts"
new_files:
  - "apps/web/src/features/agent-flow-map/hooks/useGraphInteractionPolicy.ts"
  - "apps/web/src/features/agent-flow-map/utils/projectRunGraphStatus.ts"
  - "apps/web/src/features/agent-flow-map/utils/buildRunGraphTopology.ts"
acceptance:
  - "Dragging a node cannot be interrupted by polling/SSE."
  - "Manual positions survive incoming events for same run/layout."
  - "Focus active node only happens from explicit user action after manual movement."
```

### Spec 55 - Frontend Regression Guardrails

```yaml
task_id: "feature-55-frontend-regression-guardrails"
priority: "p1"
risk_level: "high"
goal: |
  Criar validação automatizada para impedir retorno dos problemas já observados.
in_scope:
  - "Add focused unit tests for pure state utilities."
  - "Add Playwright smoke checks for User Stories, Project Files and Agent Flow."
  - "Add screenshot/state checks for folder expansion and file switching."
  - "Add bundle/large-file warnings documented as non-blocking or blocking."
out_of_scope:
  - "Full visual regression service."
affected_files:
  - "apps/web/src/**/*.test.ts"
  - "apps/web/playwright.config.ts"
  - "package.json"
new_files:
  - "apps/web/test/userStoriesWorkspace.test.ts"
  - "apps/web/test/projectFilesState.test.ts"
  - "apps/web/e2e/project-files.spec.ts"
  - "apps/web/e2e/agent-flow.spec.ts"
acceptance:
  - "Tests fail if folder expansion resets after data refresh."
  - "Tests fail if dirty tab navigation loses draft silently."
  - "Tests fail if Agent Flow remounts/reset positions during event updates."
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    Este plano reorganiza apenas o frontend e contratos UI-facing. Backend APIs devem permanecer compatíveis.
    Cada spec derivada deve ser implementada separadamente, com validação antes da próxima.

  depends_on:
    - name: "@u-build/shared contracts"
      type: "internal_module"
      owner: "shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "WorkflowState, UserStory, Spec, HorusRunSnapshot, ProjectFile* schemas"
      required_for: "Manter tipos de UI alinhados com backend."
      failure_modes:
        - "UI compila mas renderiza estado incompatível."
      fallback_or_recovery: "Type-check and shared build before web build."
      verification:
        - "pnpm --filter @u-build/shared build"
        - "pnpm --filter @u-build/web type-check"

    - name: "Backend workspace/project/agent APIs"
      type: "api"
      owner: "server"
      direction: "this_spec_consumes_dependency"
      contract_used: "workflowApi, projectFilesApi, previewApi, horusChatApi, agentFlowApi"
      required_for: "Carregar dados reais sem mudar contratos backend."
      failure_modes:
        - "Frontend refactor quebra request shape ou estados de erro."
      fallback_or_recovery: "Keep API clients stable; refactor consumers only."
      verification:
        - "pnpm test"

  depended_on_by:
    - name: "User Stories workflow"
      type: "user_workflow"
      owner: "frontend"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Stable folder/story/spec selection, editing, approval and loading behavior"
      compatibility_obligation: "Must preserve existing user actions and keyboard accessibility."
      expected_consumer_behavior: "User can switch folders/stories without abrupt collapse or lost context."
      migration_or_notification_required: false
      verification:
        - "Manual browser check for folder switching and spec approval."

    - name: "Project Files workflow"
      type: "user_workflow"
      owner: "frontend"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Stable editable file tabs and safe save UX"
      compatibility_obligation: "Must preserve backend version/hash conflict flow."
      expected_consumer_behavior: "User can open, edit, switch, save and recover conflicts naturally."
      migration_or_notification_required: false
      verification:
        - "Project files e2e smoke."

    - name: "Agent Flow workflow"
      type: "user_workflow"
      owner: "frontend"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Graph interaction policy and evidence drawer"
      compatibility_obligation: "Must preserve graph topology and evidence contracts."
      expected_consumer_behavior: "User can drag nodes and inspect agents without live updates fighting interaction."
      migration_or_notification_required: false
      verification:
        - "Agent flow interaction smoke."

  bidirectional_integrations:
    - name: "URL state and application navigation"
      participants:
        - "App shell"
        - "Feature pages"
      shared_contract: "URL search params: mode, projectId, file"
      consistency_rule: "Exactly one owner should write each param for a given mode."
      verification:
        - "Navigation smoke across stories/files/preview/agents."

  data_flow:
    inbound:
      - source: "Backend API clients"
        payload_or_state: "WorkflowState, PreviewSession, ProjectFile responses, HorusRunSnapshot"
        validation: "TypeScript shared contracts and API client errors"
    outbound:
      - target: "User actions"
        payload_or_state: "Save file, update story, update spec, workflow start/resume/retry"
        compatibility: "Payload shape must not change unless backend spec exists."

  sequencing_dependencies:
    - dependency: "Spec 49 before 50"
      reason: "StorySpecWorkspace refactor should not happen while App owns tangled workflow/folder state."
      validation: "App shell state extraction passes before moving user-story components."
    - dependency: "Spec 51 before broad visual changes"
      reason: "Shared primitives prevent repeating style fixes across large components."
      validation: "Primitive components exist and are used in at least one screen."
    - dependency: "Spec 55 after 52 and 54"
      reason: "Guardrails should encode final intended behavior, not current bugs."
      validation: "E2E tests cover corrected interaction policy."

  integration_risks:
    - risk: "Large refactor breaks existing workflow actions."
      severity: "critical"
      mitigation: "One spec at a time; no visual redesign in state extraction specs."
    - risk: "CSS modularization changes visual identity unintentionally."
      severity: "high"
      mitigation: "Use ID_VISUAL.md and before/after screenshots."
    - risk: "Editor replacement introduces bundle/performance issues."
      severity: "high"
      mitigation: "Lazy-load editor and keep read-only fallback."
```

## 8. Global Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Avoid god components and unrelated state objects."
    - "Prefer feature folders for feature-owned UI."
    - "Keep API clients thin and stable."
    - "Do not duplicate backend business rules in UI."
  project_specific:
    - "App.tsx should compose screens and providers only."
    - "Feature state belongs in feature hooks unless it is truly app-level."
    - "User interaction state must win over polling/SSE updates."
    - "URL search params must have a single owner per feature mode."
    - "CSS selectors should be feature-prefixed or primitive-owned."
    - "Do not introduce cards inside cards or broad visual redesign during architecture refactor."
```

## 9. Execution Order

```yaml
recommended_sequence:
  - spec: "49-app-shell-runtime-state-boundaries"
    reason: "Reduces blast radius before touching big screens."
    must_validate_before_next:
      - "Stories mode still works."
      - "Files/Preview/Agents navigation still works."
      - "Workflow SSE pending spec/retry still works."

  - spec: "50-user-stories-workspace-componentization"
    reason: "Largest god component and source of folder-switching regressions."
    must_validate_before_next:
      - "Folder expansion stable."
      - "Story/spec editing stable."
      - "Spec approval HITL stable."

  - spec: "52-project-files-editor-tree-stability"
    reason: "Directly affects code screen UX and editing confidence."
    must_validate_before_next:
      - "Cached file switch immediate."
      - "Cursor stable."
      - "Dirty state per tab."

  - spec: "53-unified-frontend-live-data-layer"
    reason: "Removes duplicated SSE behavior after main screens have clearer state boundaries."
    must_validate_before_next:
      - "Workflow, preview and agent events still stream."
      - "No duplicate event rows."

  - spec: "54-agent-flow-interaction-policy-hardening"
    reason: "Builds on shared live data and protects graph interactions."
    must_validate_before_next:
      - "Drag not interrupted by updates."
      - "Manual layout preserved."

  - spec: "51-frontend-design-system-css-modularization"
    reason: "Can be done after high-risk state refactors; minimizes visual churn during functional fixes."
    must_validate_before_next:
      - "Visual identity consistent."
      - "No global CSS regression."

  - spec: "55-frontend-regression-guardrails"
    reason: "Codifies corrected behavior after refactors are complete."
    must_validate_before_next:
      - "E2E smoke tests run locally."
      - "Interaction regressions are covered."
```

## 10. Validation Strategy

```yaml
per_spec_required_commands:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/web type-check"
  - "pnpm --filter @u-build/web build"
  - "pnpm test"

manual_checks:
  - "Switch between User Stories folders repeatedly; expanded folders must not collapse abruptly."
  - "Open file A, edit it, switch to file B with cached data, return to A; draft must be preserved or prompt must be explicit."
  - "Drag nodes in Agent Flow while run events arrive; positions must not snap back."
  - "Switch Stories/Files/Preview/Agents through shell; URL must reflect mode without losing current feature context unexpectedly."
  - "Inspect mobile/narrow width layout for overflow and clipped controls."
```

## 11. Completion Criteria

```yaml
done_when:
  - "Specs 49-55 have been created or implemented as separate tracked specs."
  - "App.tsx no longer exceeds composition responsibility."
  - "StorySpecWorkspace is split into feature-owned components and hooks."
  - "Project Files editor has stable cursor, per-tab dirty state and non-jarring file switches."
  - "SSE/live data behavior is centralized."
  - "Agent Flow interaction policy is explicit and testable."
  - "CSS global surface is reduced and feature CSS is isolated."
  - "Regression tests cover the interactions that previously broke."
```
