---
format_version: "agentic_sdd.v1"
task_id: "36-user-stories-accessibility-visual-load"
title: "User Stories accessibility and visual load correction"
created_at_utc: "2026-05-26T22:39:57Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "ID_VISUAL.md"
  - "apps/web/src/components/StorySpecWorkspace.tsx"
  - "apps/web/src/components/UserStoryInputPage.tsx"
  - "apps/web/src/App.tsx"
  - "apps/web/src/index.css"
---

# 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec para implementar esses ajustes
```

# 2. System Interpretation

```yaml
system_translation: |
  Criar uma SPEC executavel para corrigir falhas de acessibilidade e sobrecarga visual identificadas na tela
  User Stories, incluindo modal de criacao, arvore de pastas/user stories, tabs User Story/SPEC, estados de
  carregamento/erro/sucesso, foco de teclado, contraste, densidade visual e relacoes ARIA.

expected_user_visible_result: |
  A tela de User Stories permanece com a mesma identidade visual do Horus, mas fica menos carregada,
  mais legivel, navegavel por teclado, clara para leitores de tela e com estados ativos/carregando/erro
  anunciados corretamente. Nenhum fluxo funcional deve ser removido.

expected_engineering_result: |
  O frontend passa a expor semantica acessivel correta para modal, formularios, tabs, arvore/lista de pastas,
  progresso e mensagens de status. O CSS passa a ter foco visivel consistente, contraste minimo seguro e
  densidade visual reduzida sem alterar contratos de backend, APIs, schemas ou persistencia.
```

# 3. Product and Technical Context

```yaml
business_context:
  user_problem: "A interface de User Stories esta visualmente sobrecarregada e possui falhas de acessibilidade que prejudicam uso por teclado, leitor de tela e leitura rapida."
  target_user: "Usuario operador do Horus que cria user stories, gera specs e inicia construcao por agentes."
  expected_outcome: "Fluxo de criacao e acompanhamento de user stories mais claro, acessivel e confiavel sem perder capacidade operacional."
  product_surface:
    - "Tela User Stories"
    - "Modal Criar user-stories"
    - "Arvore/lista de pastas e user stories"
    - "Painel de detalhe User Story/SPEC"
    - "Acoes Gerar specs e Iniciar projeto"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "Out of scope"
    frontend:
      - "React"
      - "TypeScript"
      - "Vite"
      - "CSS global em apps/web/src/index.css"
    database:
      - "Out of scope"
    infrastructure:
      - "Local dev server on <HORUS_PUBLIC_HOST>:5174"
      - "Visual verification through browser/Chrome or Browser plugin when available"
  known_entrypoints:
    - "apps/web/src/App.tsx"
    - "apps/web/src/components/StorySpecWorkspace.tsx"
    - "apps/web/src/components/UserStoryInputPage.tsx"
    - "apps/web/src/components/Shell.tsx"
    - "apps/web/src/index.css"
  known_existing_patterns:
    - "Visual identity is governed by ID_VISUAL.md."
    - "Main action buttons should follow icon + name."
    - "User Stories screen is a two-pane operational workspace."
    - "Creating user stories is modal-based and must stay modal-based."
    - "Specs and user stories remain editable through existing UI."
```

# 4. Scope

```yaml
scope:
  in_scope:
    - "Add programmatic label associations for modal form controls using id/htmlFor or equivalent accessible names."
    - "Add focus management for the create-user-stories modal: initial focus, Escape close, backdrop behavior preservation, focus return, and focus trap."
    - "Add accessible relationship between folders and their nested story lists using aria-controls and stable ids."
    - "Add explicit selected/current state for selected folder and selected story."
    - "Complete tab semantics for User Story/SPEC with id, aria-controls, role=tabpanel, aria-labelledby and keyboard navigation where appropriate."
    - "Expose progress as role=progressbar with aria-valuemin, aria-valuemax and aria-valuenow."
    - "Expose construction notice/error and validation errors through role=status or role=alert."
    - "Add focus-visible styling for sidebar, tabs, folder items, story items, workflow action buttons, form controls and modal close/action buttons."
    - "Improve contrast for secondary text, metadata, chips and disabled states to meet at least WCAG AA for normal text where practical."
    - "Reduce visual load by lowering competing borders/glows, simplifying chip density and clarifying hierarchy without removing existing workflow actions."
    - "Respect reduced motion preferences for spinners, pulse dots and list entrance animations."
    - "Validate keyboard-only operation for creating stories, selecting folders/stories, switching tabs, editing and deleting."
  out_of_scope:
    - "Backend API changes."
    - "Database/schema changes."
    - "Changing user story/spec persistence contracts."
    - "Changing agent orchestration behavior."
    - "Removing existing buttons or workflows."
    - "Redesigning Preview, Files or Agents screens."
    - "Introducing a UI component library."
    - "Changing visual identity away from ID_VISUAL.md."
```

# 5. Affected Entities

```yaml
affected_entities:
  backend:
    files: []
    services: []
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "apps/web/src/App.tsx"
      - "apps/web/src/components/StorySpecWorkspace.tsx"
      - "apps/web/src/components/UserStoryInputPage.tsx"
      - "apps/web/src/components/Shell.tsx"
      - "apps/web/src/index.css"
    components:
      - "StorySpecWorkspace"
      - "UserStoryInputPage"
      - "Create user-stories modal in App"
      - "Shell sidebar buttons, only if focus-visible or aria-current requires adjustment"
    routes:
      - "User Stories default screen at http://<HORUS_PUBLIC_HOST>:5174/"
  workflow:
    graph_nodes: []
    agents: []
  tests:
    unit:
      - "No mandatory unit test unless existing frontend test harness is present"
    integration:
      - "No backend integration test required"
    e2e:
      - "Manual/browser keyboard and visual accessibility smoke"
      - "Optional Playwright accessibility smoke if available in the repo"
```

# 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This change is a frontend accessibility and visual hierarchy correction over existing User Stories data and
    workflow state. It consumes existing props and callbacks from App and must not alter backend contracts.

  depends_on:
    - name: "ID_VISUAL.md"
      type: "internal_documentation"
      owner: "design system"
      direction: "this_spec_consumes_dependency"
      contract_used: "dark technical UI, compact controls, icon + name buttons, green/teal accent, restrained panels"
      required_for: "Keep the correction visually consistent with Horus."
      assumptions: []
      failure_modes:
        - "Accessibility correction becomes visually inconsistent or too generic."
      fallback_or_recovery: "Re-read ID_VISUAL.md before implementation and revise CSS to match tokens."
      verification:
        - "Manual screenshot comparison against current Horus identity."

    - name: "StorySpecWorkspace props"
      type: "frontend_component"
      owner: "web app"
      direction: "this_spec_consumes_dependency"
      contract_used: "stories, workspaceFolders, selectedWorkspaceFolderId, selectedStoryId, activeTab, workflowState, pendingSpec and callbacks"
      required_for: "Render selected folder/story, actions and detail pane without changing data flow."
      assumptions: []
      failure_modes:
        - "A visual/a11y change breaks selection, spec generation or project start."
      fallback_or_recovery: "Keep prop names and callback signatures unchanged."
      verification:
        - "TypeScript build."
        - "Keyboard smoke selecting folder/story and switching tabs."

    - name: "Create story modal state in App"
      type: "frontend_component"
      owner: "web app"
      direction: "this_spec_consumes_dependency"
      contract_used: "isStoryModalOpen, setIsStoryModalOpen, UserStoryInputPage callbacks"
      required_for: "Add focus management without changing modal open/close behavior."
      assumptions: []
      failure_modes:
        - "Focus trap blocks modal close or loses focus after closing."
      fallback_or_recovery: "Use a small local focus-management hook or inline effect scoped to the modal."
      verification:
        - "Keyboard smoke: open modal, tab through controls, Shift+Tab, Escape close, focus returns to Criar."

  depended_on_by:
    - name: "User operator workflow"
      type: "workflow"
      owner: "product UI"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Accessible User Stories UI with same actions: create, generate specs, start project, edit, delete, switch view/edit"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "User can complete all current tasks with mouse or keyboard."
      migration_or_notification_required: false
      verification:
        - "Manual browser walkthrough."

    - name: "Existing frontend state and API consumers"
      type: "internal_module"
      owner: "web app"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "No changed API request/response shape and no changed shared schema"
      compatibility_obligation: "breaking change forbidden"
      expected_consumer_behavior: "Existing backend and workflow state continue to render unchanged."
      migration_or_notification_required: false
      verification:
        - "pnpm --filter @u-build/web build"
        - "No changed files under packages/shared or apps/server for this task."

  bidirectional_integrations: []

  data_flow:
    inbound:
      - source: "App state and backend-loaded stories/folders/specs"
        payload_or_state: "Existing UserStory, WorkspaceFolder, WorkflowState and Spec objects"
        validation: "No schema change; TypeScript build validates prop usage."
    outbound:
      - target: "Existing App callbacks"
        payload_or_state: "Existing user actions only"
        compatibility: "Callback signatures must remain unchanged."

  sequencing_dependencies:
    - dependency: "Read ID_VISUAL.md and current rendered UI before editing"
      reason: "Avoid repeating overcorrection or changing unrelated screens."
      validation: "Implementation notes list visual constraints used."

  integration_risks:
    - risk: "Accessibility markup accidentally changes layout or event flow."
      severity: "medium"
      mitigation: "Make semantic additions first, then CSS-only visual adjustments; run build and browser smoke."
    - risk: "Focus trap breaks modal interaction."
      severity: "medium"
      mitigation: "Keep trap scoped to story modal only and support Escape/backdrop close."
```

# 7. Accessibility Findings To Fix

```yaml
findings:
  - id: "a11y-01-form-labels"
    severity: "high"
    finding: "Modal form labels are visual only and not programmatically associated with controls."
    affected_files:
      - "apps/web/src/components/UserStoryInputPage.tsx"
    expected_fix:
      - "Add stable ids to select/input/textarea controls."
      - "Use htmlFor on labels."
      - "For repeated story/criterion controls, derive ids from draft id and criterion index."

  - id: "a11y-02-modal-focus"
    severity: "high"
    finding: "Create-user-stories modal lacks initial focus, focus trap, Escape close and focus return."
    affected_files:
      - "apps/web/src/App.tsx"
      - "apps/web/src/index.css"
    expected_fix:
      - "Focus first meaningful field or modal title/close button on open."
      - "Trap Tab and Shift+Tab inside modal."
      - "Close on Escape."
      - "Return focus to the Criar button after close."

  - id: "a11y-03-folder-story-semantics"
    severity: "high"
    finding: "Folder/story navigation uses buttons without explicit selected/current semantics or controlled relationship."
    affected_files:
      - "apps/web/src/components/StorySpecWorkspace.tsx"
    expected_fix:
      - "Add aria-current or aria-selected for selected story and selected/expanded folder."
      - "Add aria-controls from folder button to nested story list."
      - "Add stable ids to nested story list containers."

  - id: "a11y-04-tab-panels"
    severity: "high"
    finding: "Tabs have role=tab but lack tabpanel relationships."
    affected_files:
      - "apps/web/src/components/StorySpecWorkspace.tsx"
    expected_fix:
      - "Add ids to tabs."
      - "Add role=tabpanel to rendered detail body or nested panel wrapper."
      - "Connect tabs and panels with aria-controls and aria-labelledby."
      - "Support arrow-key navigation if local pattern allows."

  - id: "a11y-05-live-regions"
    severity: "medium"
    finding: "Construction notice/error and validation errors are not reliably announced."
    affected_files:
      - "apps/web/src/components/StorySpecWorkspace.tsx"
      - "apps/web/src/components/UserStoryInputPage.tsx"
    expected_fix:
      - "Use role=status for non-critical progress/success."
      - "Use role=alert for errors."
      - "Use aria-live=polite/assertive intentionally, not everywhere."

  - id: "a11y-06-progressbar"
    severity: "medium"
    finding: "Folder progress is a visual bar without progressbar semantics."
    affected_files:
      - "apps/web/src/components/StorySpecWorkspace.tsx"
    expected_fix:
      - "Add role=progressbar."
      - "Add aria-valuemin=0, aria-valuemax=100, aria-valuenow."

  - id: "a11y-07-focus-visible"
    severity: "high"
    finding: "Keyboard focus is visually weak compared with hover/active states."
    affected_files:
      - "apps/web/src/index.css"
    expected_fix:
      - "Add consistent :focus-visible ring for sidebar buttons, panel-action, workflow-action-button, folder/story items, tabs, spec-mode buttons, icon buttons, ghost/primary buttons and form controls."
      - "Focus style must be visible against dark backgrounds and not rely on color alone."

  - id: "a11y-08-low-contrast-secondary-text"
    severity: "medium"
    finding: "Secondary text token --t3 can fall below WCAG AA contrast for normal text on dark panels."
    affected_files:
      - "apps/web/src/index.css"
    expected_fix:
      - "Raise metadata/chip text contrast or restrict very low contrast text to decorative/nonessential labels."
      - "Prefer explicit CSS adjustments over changing the entire design identity blindly."

  - id: "a11y-09-small-hit-targets"
    severity: "medium"
    finding: "Some interactive targets are 28-34px high and visually dense."
    affected_files:
      - "apps/web/src/index.css"
    expected_fix:
      - "Keep compact desktop style but ensure clickable/focusable controls have adequate spacing."
      - "Increase high-frequency controls to at least 36px where possible and preserve 44px on mobile."

  - id: "a11y-10-motion"
    severity: "low"
    finding: "Pulse/spinner/list animations do not respect reduced-motion preferences."
    affected_files:
      - "apps/web/src/index.css"
    expected_fix:
      - "Add @media (prefers-reduced-motion: reduce) to disable pulse, loading spin and list entrance animation."
```

# 8. Implementation Plan

```yaml
implementation_plan:
  phase_1_semantics:
    owner: "frontend_agent"
    steps:
      - "Add stable ids for modal fields and labels."
      - "Add aria-describedby only where helper/error text exists."
      - "Add role/status/alert to success and error banners."
      - "Add progressbar semantics to folder progress."
      - "Add selected/current semantics to selected folder/story."
      - "Add aria-controls/id connection for expanded folder to nested story list."
    completion_gate:
      - "TypeScript build passes."
      - "DOM/accessibility tree shows labels, selected state and live regions."

  phase_2_modal_keyboard:
    owner: "frontend_agent"
    steps:
      - "Store the trigger button ref for Criar."
      - "On open, focus the modal title, close button, or first required field."
      - "Trap Tab/Shift+Tab inside modal."
      - "Close modal on Escape."
      - "Return focus to Criar after close."
      - "Preserve backdrop click close behavior."
    completion_gate:
      - "Keyboard-only smoke passes: open, tab loop, Shift+Tab loop, Escape close, focus return."

  phase_3_tabs_and_detail:
    owner: "frontend_agent"
    steps:
      - "Give User Story and SPEC tabs stable ids."
      - "Wrap or mark detail body with role=tabpanel."
      - "Set aria-labelledby and aria-controls correctly."
      - "Optionally add ArrowLeft/ArrowRight tab switching if it does not conflict with existing behavior."
    completion_gate:
      - "Tab relationship is visible in DOM and keyboard switching works."

  phase_4_css_accessibility:
    owner: "frontend_agent"
    steps:
      - "Add a single reusable focus-visible rule group using box-shadow/outline compatible with dark UI."
      - "Improve contrast of workflow-meta, status-chip-label, t3-heavy text, disabled labels and tiny metadata."
      - "Reduce visual overload by lowering redundant borders/glows and consolidating chip emphasis."
      - "Add reduced-motion media query."
      - "Review mobile rules so compact controls do not become too small."
    completion_gate:
      - "Visual identity remains Horus-like and hierarchy is clearer."
      - "No text overlap or clipping in desktop and mobile viewport checks."

  phase_5_validation:
    owner: "qa_agent"
    steps:
      - "Run pnpm --filter @u-build/web build."
      - "Open <HORUS_PUBLIC_HOST>:5174 and verify the User Stories screen visually."
      - "Use keyboard-only navigation through sidebar, Create modal, folder/story list, tabs and actions."
      - "Check modal close via Escape and focus return."
      - "Check one mobile-sized viewport if browser tooling is available."
      - "Record any console errors/warnings if Browser/Playwright tooling is available."
    completion_gate:
      - "All acceptance criteria pass or failures are explicitly documented."
```

# 9. Contracts and Invariants

```yaml
contracts:
  preserved_frontend_props:
    - "StorySpecWorkspaceProps callback names and signatures must not change."
    - "UserStoryInputPageProps callback names and signatures must not change."
    - "Shell navigation activeMode behavior must not change."
  preserved_backend_contracts:
    - "No endpoint changes."
    - "No shared schema changes."
    - "No database migrations."
    - "No agent orchestration changes."
  accessibility_contracts:
    - "Every visible form label must be programmatically associated with its control."
    - "Every modal dialog must manage focus and expose a labelled dialog role."
    - "Every tab must control an associated tabpanel."
    - "Every progress indicator must expose numeric progress when the value is known."
    - "Every selected navigational item must expose selected/current state programmatically."
    - "Keyboard focus must be visible on every interactive element."
  visual_contracts:
    - "Preserve dark technical Horus identity."
    - "Use green/teal accent for functional active/success states."
    - "Do not introduce decorative cards, gradients, or marketing layout."
    - "Buttons keep icon + name when visible text exists."
    - "Do not remove existing actions."
```

# 10. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "User can create a new user story through the modal using keyboard only."
    - "User can create/select a workspace folder using keyboard only."
    - "User can select a folder and a nested user story using keyboard only."
    - "User can switch between User Story and SPEC tabs using keyboard."
    - "User can enter and leave SPEC visualizacao/edit mode using keyboard."
    - "Existing buttons Gerar specs, Iniciar projeto, Editar and Excluir remain available and functional."
  accessibility:
    - "All modal form controls have accessible names matching visible labels."
    - "The create modal traps focus and returns focus to the trigger after closing."
    - "Escape closes the create modal."
    - "Selected folder/story state is exposed through ARIA."
    - "Tabs expose tab/tablist/tabpanel relationships."
    - "Progress bar exposes numeric progress."
    - "Errors are role=alert and success/progress notices are role=status."
    - "Focus-visible outline/ring is obvious on dark backgrounds."
    - "Reduced-motion preference disables nonessential animations."
  visual:
    - "The screen looks less visually overloaded than the current version."
    - "Secondary metadata remains readable."
    - "Controls are visually grouped by task: create, generate specs, start project, edit/delete, tab mode."
    - "No text overlap, clipping, or page expansion occurs in desktop viewport."
  compatibility:
    - "No backend/shared/database files are changed."
    - "No API route or schema contract changes."
```

# 11. Validation Protocol

```yaml
validation_protocol:
  static_checks:
    - command: "pnpm --filter @u-build/web build"
      cwd: "<REPOSITORY_ROOT>"
      required: true
  tests:
    - command: "pnpm test"
      cwd: "<REPOSITORY_ROOT>"
      required: false
      run_when: "Only if implementation touches shared behavior or test suite is already passing quickly."
  runtime_checks:
    - command: "curl -s -o /tmp/horus_web_status.txt -w \"%{http_code}\" http://<HORUS_PUBLIC_HOST>:5174/"
      cwd: "<REPOSITORY_ROOT>"
      expected: "200"
    - command: "Open http://<HORUS_PUBLIC_HOST>:5174/ in browser"
      cwd: "<REPOSITORY_ROOT>"
      expected: "User Stories screen renders with no framework overlay."
  manual_checks:
    - "Keyboard: sidebar User Stories -> Criar -> modal focus loop -> Escape -> focus returns."
    - "Keyboard: select folder -> select story -> switch User Story/SPEC -> switch visualizacao/edit."
    - "Visual: desktop viewport screenshot after changes."
    - "Visual: modal screenshot after changes."
    - "Responsive: mobile viewport or narrow browser check if tooling is available."
  optional_tooling:
    - "Browser plugin accessibility tree/DOM snapshot if available."
    - "Playwright screenshot and console check if Playwright is configured."
```

# 12. Agent Error Mitigation

```yaml
agent_error_mitigation:
  scope_control:
    - "Do not redesign unrelated screens."
    - "Do not change backend code."
    - "Do not remove actions because they look crowded; reduce hierarchy instead."
    - "Do not change data contracts to solve UI semantics."
  anti_hallucination:
    - "Inspect ID_VISUAL.md and current files before editing."
    - "Do not invent a component library."
    - "Do not claim WCAG compliance without contrast/focus/manual checks."
  anti_regression:
    - "Keep existing callback signatures unchanged."
    - "Keep modal submit behavior unchanged."
    - "Keep folder/story selection behavior unchanged."
    - "Keep spec generation and project start buttons wired to existing callbacks."
  anti_false_validation:
    - "Build success alone is not enough."
    - "Must visually open the screen after implementation."
    - "Must keyboard-test the modal and tabs."
  dirty_worktree_safety:
    - "Do not revert unrelated existing changes."
    - "If files contain user changes, preserve and layer narrowly."
```

# 13. Execution Output Contract

```yaml
final_report_required:
  status: "completed | partially_completed | blocked"
  summary:
    - "What accessibility issues were fixed."
    - "What visual overload reductions were made."
  files_changed:
    - "Exact file paths."
  validation:
    commands_run:
      - command: "..."
        exit_code: "..."
        result: "passed | failed"
    browser_checks:
      - "Desktop User Stories screen checked."
      - "Create modal checked."
      - "Keyboard navigation checked."
  remaining_risks:
    - "Any unverified viewport, browser, or screen reader limitation."
```
