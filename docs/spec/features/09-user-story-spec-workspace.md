# SDD: User Story And Spec Workspace

## 1. Metadata

```yaml
format_version: "agentic_sdd.v1"
task_id: "horus-user-story-spec-workspace"
title: "User Story And Spec Workspace"
created_at_utc: "2026-05-26T13:20:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
source_skill: "creating-sdd-specs"
secondary_skill: "front-design-frontend"
```

## 2. Original User Request

```yaml
raw_user_request: |
  quero ajustar o front, quero 2 interfaces. Uma dedicada exclusivamente para criação de user-stories e gerar a spec, tome essa imagem apenas como inspiração([Image #1] ), mas continue seguindo a risca a ID visual do projeto. Crie um planejamento de experiência do usuário, pense em cenários de uso, em seguida desenhe como deve ser o front de forma que o usuário consiga ver as specs das suas respectivas user-stories, analise na imagem que estou enviando de exemplo que há um toggle que serve para o usuário ver a spec de cada user storie. além disso, mantenha a mesma praticidade atual de criar userstories e gerar critérios etc. em suma, você não deve remover nada, apenas acrescentar e ajustar. use a skill de spec para planejar essa tarefa e depois a skill de frontend para planejar o design da interface seguindo a risca os princípios da ID Visual
```

## 3. System Interpretation

```yaml
system_translation: |
  Adjust the React frontend into two first-class interfaces while preserving all current user-story creation and spec-generation behavior.

  Interface 1 must be dedicated to creating user stories, editing titles/descriptions/priorities/acceptance criteria, and starting spec generation.

  Interface 2 must let the user inspect each user story together with its generated SPEC/SDD. The screenshot is inspiration only: keep the idea of a story list plus a per-story toggle between "User Story" and "SPEC (SDD)", but adapt the implementation to the Horus.AI visual identity in ID_VISUAL.md.

  Do not remove current functionality. The work should add structure, navigation, and clearer viewing affordances around the existing workflow.

  This document is planning only. Implementation must happen in a later step after the UX and frontend design plan are accepted.
```

## 4. Business / Product Context

```yaml
business_context:
  user_problem: "The current UI is practical for creating user stories but mixes authoring, execution, HITL review, workflow progress, artifacts, and technical inspection in a single operational view."
  target_user: "A Horus.AI operator creating multiple product user stories and reviewing the generated SDD specs for each one."
  expected_outcome: "The user can quickly author stories, generate specs, and then browse each story/spec pair without losing the current workflow practicality."
  product_surface:
    - "User story authoring workspace"
    - "Spec review workspace"
    - "Workflow execution panels"
    - "Spec HITL approval"
```

## 5. Technical Context

```yaml
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
      - "CSS in apps/web/src/index.css"
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph"
    shared:
      - "packages/shared UserStory, Spec, WorkflowState contracts"
  known_entrypoints:
    - "apps/web/src/App.tsx"
    - "apps/web/src/components/UserStoryInputPage.tsx"
    - "apps/web/src/components/SpecReview.tsx"
    - "apps/web/src/components/UserStoryList.tsx"
    - "apps/web/src/components/WorkflowProgress.tsx"
    - "apps/web/src/components/Shell.tsx"
    - "apps/web/src/index.css"
    - "ID_VISUAL.md"
  known_existing_patterns:
    - "App owns workflow state, thread id, pending spec, retry approval, LLM settings, and SSE processing."
    - "When no workflow is running, App renders UserStoryInputPage plus WorkflowBlueprint and WorkflowInspector."
    - "When a workflow is running, App renders pending SpecReview, retry/cancel/artifact panels, UserStoryList, WorkflowProgress, and WorkflowInspector."
    - "UserStoryInputPage already supports multiple story drafts, criteria creation/removal, priority selection, validation, and submit."
    - "SpecReview already supports editing generated spec summary and technical approach before approval."
    - "ID_VISUAL.md defines a dark, operational, technical UI with green accents, compact panels, fixed sidebar, and dense information layout."
```

Agents must verify these paths before editing because the UI is actively changing.

## 6. Scope

```yaml
scope:
  in_scope:
    - "Create a UX plan for two interfaces: story authoring and spec workspace."
    - "Preserve current story creation speed: add/remove story, add/remove criteria, priority, validation, and one-click spec generation."
    - "Add or plan a top-level interface switch between creation and spec review."
    - "Add or plan a per-story detail view with a toggle between User Story and SPEC (SDD)."
    - "Keep generated specs visibly linked to their corresponding user story."
    - "Keep pending HITL approval behavior accessible and compatible with the new spec workspace."
    - "Use ID_VISUAL.md as the visual source of truth."
    - "Use the screenshot only as structural inspiration, not as a visual style source."
    - "Plan responsive behavior for desktop and mobile."
    - "Plan validation through typecheck, tests, build, and browser visual verification."
  out_of_scope:
    - "Removing any existing user-story creation capability."
    - "Replacing the backend workflow engine."
    - "Changing agent prompts or spec generation semantics."
    - "Changing LLM provider settings."
    - "Adding authentication, persistence database, or remote project storage."
    - "Copying the screenshot's purple visual treatment."
    - "Turning the app into a marketing/landing page."
```

## 7. Affected Entities

```yaml
affected_entities:
  backend:
    files: []
    services: []
    database:
      migrations_required: false
      tables: []
    notes:
      - "No backend change is planned unless frontend implementation proves a data-contract gap."

  frontend:
    files:
      - "apps/web/src/App.tsx"
      - "apps/web/src/components/UserStoryInputPage.tsx"
      - "apps/web/src/components/SpecReview.tsx"
      - "apps/web/src/components/UserStoryList.tsx"
      - "apps/web/src/components/WorkflowProgress.tsx"
      - "apps/web/src/components/Shell.tsx"
      - "apps/web/src/index.css"
    possible_new_files:
      - "apps/web/src/components/WorkspaceSwitcher.tsx"
      - "apps/web/src/components/StorySpecWorkspace.tsx"
      - "apps/web/src/components/StoryStatusRail.tsx"
      - "apps/web/src/components/StorySpecToggle.tsx"
      - "apps/web/src/components/SelectedStoryDetail.tsx"
    components:
      - "App"
      - "UserStoryInputPage"
      - "SpecReview"
      - "UserStoryList"
      - "WorkflowProgress"
      - "Shell"
    routes:
      - "Single-page app root"

  tests:
    unit:
      - "Existing node:test suite when affected contracts are touched."
    integration:
      - "Existing workflow/start tests if App/API contracts change."
    e2e:
      - "Browser smoke check for story authoring and specs workspace."
```

## 8. UX Planning

### 7.1 Primary User Scenarios

```yaml
ux_scenarios:
  - id: "ux-01"
    name: "First authoring session"
    user_goal: "Create the first user story with acceptance criteria and generate a spec."
    expected_flow:
      - "User lands in the Story Authoring interface."
      - "The first draft card is already available."
      - "User fills title, description, priority, and criteria."
      - "User clicks the existing generation action."
      - "The app moves or offers a clear transition to the Spec Workspace."

  - id: "ux-02"
    name: "Batch story authoring"
    user_goal: "Create several user stories quickly before starting generation."
    expected_flow:
      - "User adds multiple story cards."
      - "Each card keeps the current compact title, description, priority, and criteria controls."
      - "The interface shows queue count and validation state."
      - "Invalid stories are visible without blocking edits to valid stories."

  - id: "ux-03"
    name: "Spec generated for one story"
    user_goal: "Review the generated SDD for the story that is awaiting human approval."
    expected_flow:
      - "User enters the Spec Workspace."
      - "A story rail/list shows story status."
      - "The pending story is selected automatically."
      - "The detail panel has a two-option toggle: User Story and SPEC (SDD)."
      - "SPEC (SDD) view exposes the existing editable HITL fields and approve/reject actions."

  - id: "ux-04"
    name: "Browse story/spec pairs"
    user_goal: "Inspect which spec belongs to which user story."
    expected_flow:
      - "User selects a story in the list."
      - "The detail panel shows story metadata, criteria, and status."
      - "Toggling to SPEC (SDD) shows generated spec content when available."
      - "If no spec exists yet, the SPEC tab shows a clear waiting/empty state."

  - id: "ux-05"
    name: "Workflow failure or cancellation"
    user_goal: "Understand what happened and restart without losing context."
    expected_flow:
      - "Failed/cancelled statuses remain visible in the story list."
      - "Existing cancel/retry/new attempt controls remain available."
      - "Authoring history from lastSubmittedStories remains usable for restart."

  - id: "ux-06"
    name: "Mobile inspection"
    user_goal: "Use the same flow on a narrow viewport without overlapping text or controls."
    expected_flow:
      - "Interface switch remains accessible."
      - "Story list stacks above detail or becomes a compact selector."
      - "The User Story/SPEC toggle stays close to the selected story heading."
      - "Long titles and file-like metadata truncate safely."
```

### 7.2 Information Architecture

```yaml
information_architecture:
  app_shell:
    sidebar:
      - "Keep current fixed sidebar and settings affordance."
      - "Do not add noisy labels or marketing copy."
    topbar:
      - "Add a compact workspace switch or segmented control when useful."
      - "Expose current workflow status chips."

  interface_1_authoring:
    name: "Criar histórias"
    responsibility:
      - "Own draft creation and editing."
      - "Own validation feedback before workflow start."
      - "Own the generate spec call-to-action."
    core_components:
      - "UserStoryInputPage"
      - "Queue/validation summary"
      - "Optional compact workflow blueprint"
    must_preserve:
      - "Multiple draft cards"
      - "Acceptance criteria controls"
      - "Priority selector"
      - "Submit validation"
      - "Initial stories for restart"

  interface_2_specs:
    name: "Specs"
    responsibility:
      - "Show every submitted user story."
      - "Show per-story generation/review/completion state."
      - "Show matching generated spec by selected story."
      - "Host pending HITL review without disconnecting it from the story."
    core_components:
      - "Story status rail/list"
      - "Story detail header"
      - "User Story / SPEC (SDD) toggle"
      - "Spec detail/approval panel"
      - "Workflow progress and technical inspector as secondary panels"
```

## 9. Frontend Design Plan

This section applies the project frontend/design skill and `ID_VISUAL.md`.

### 8.1 Visual Direction

```yaml
visual_direction:
  source_of_truth: "ID_VISUAL.md"
  screenshot_usage: "Structural inspiration only: story rail, status indicators, and per-story User Story/SPEC toggle."
  must_keep:
    - "Dark operational console."
    - "Green primary accent from --p / --spark."
    - "Graphite surfaces from --s1 / --s2 / --s3."
    - "Compact Inter typography and JetBrains Mono for IDs/metadata."
    - "Bordered panels with radius 12px and subtle inset depth."
    - "Fixed narrow sidebar and dense scanning layout."
  must_avoid:
    - "Purple/blue active tab styling from the screenshot."
    - "Decorative gradient blobs or orbs."
    - "Nested card-on-card compositions."
    - "Oversized hero sections."
    - "Instructional text that explains the UI instead of enabling action."
```

### 8.2 Proposed Desktop Layout

```yaml
desktop_layout:
  shell:
    grid: "Fixed sidebar + main work area."
    main:
      - "Topbar with title/status and compact interface switch."
      - "Content area changes by selected interface."

  authoring_interface:
    layout:
      - "Primary wide column: UserStoryInputPage with current story cards."
      - "Secondary narrow column: workflow blueprint, LLM status, and compact technical state."
    changes:
      - "Retitle the page around authoring, not generic workflow."
      - "Keep form density and current add/generate controls."
      - "Improve validation/status summary without adding a new dependency."

  specs_interface:
    layout:
      - "Left rail: submitted story list with status chips, progress, and compact title truncation."
      - "Main panel: selected story header and toggle."
      - "Right/secondary stack: workflow progress and inspector when useful."
    selected_story_header:
      - "Title."
      - "Short user story id."
      - "Status chips: draft, generating, awaiting review, approved, running, failed, completed."
      - "Optional file-like slug if available or derived."
    toggle:
      labels:
        - "User Story"
        - "SPEC (SDD)"
      behavior:
        - "User Story view shows description, priority, and acceptance criteria."
        - "SPEC (SDD) view shows generated spec content or waiting state."
        - "If selected story has the pendingSpec, SPEC view embeds the existing SpecReview behavior."
```

### 8.3 Proposed Mobile Layout

```yaml
mobile_layout:
  authoring_interface:
    - "Single-column story cards."
    - "Sticky or bottom-visible primary action only if it does not cover content."
    - "Criteria controls remain full-width and readable."
  specs_interface:
    - "Story rail becomes a compact selector/list above the detail panel."
    - "Toggle remains directly below selected story metadata."
    - "Workflow progress moves below the story/spec detail."
  overflow_rules:
    - "Use min-width: 0 on flex children."
    - "Truncate long story titles in lists."
    - "Wrap body copy in detail panels."
    - "Keep icon buttons at stable dimensions."
```

### 8.4 Component Plan

```yaml
component_plan:
  reuse:
    - component: "UserStoryInputPage"
      plan: "Preserve as the core authoring component; refactor only if needed to fit the new workspace."
    - component: "SpecReview"
      plan: "Reuse inside SPEC (SDD) view when the selected story is pending human approval."
    - component: "UserStoryList"
      plan: "Either adapt or replace with a focused story rail if its current shape cannot support per-story toggling cleanly."
    - component: "WorkflowProgress"
      plan: "Keep as secondary operational context."
    - component: "WorkflowInspector"
      plan: "Keep as technical secondary context, not the main product surface."

  possible_new_components:
    - name: "WorkspaceSwitcher"
      responsibility: "Switch between Criar histórias and Specs."
    - name: "StorySpecWorkspace"
      responsibility: "Coordinate story selection, status rail, and detail toggle."
    - name: "StoryStatusRail"
      responsibility: "List submitted stories with compact status and progress metadata."
    - name: "StorySpecToggle"
      responsibility: "Stable two-tab control for User Story vs SPEC (SDD)."
    - name: "SelectedStoryDetail"
      responsibility: "Render User Story view or SPEC view for one selected story."
```

### 8.5 State Model Plan

```yaml
state_model:
  required_state:
    - name: "workspaceMode"
      type: "'authoring' | 'specs'"
      owner: "App"
      purpose: "Controls which top-level interface is visible."
    - name: "selectedStoryId"
      type: "string | null"
      owner: "App or StorySpecWorkspace"
      purpose: "Controls selected story/spec pair."
    - name: "selectedDetailTab"
      type: "'story' | 'spec'"
      owner: "StorySpecWorkspace"
      purpose: "Controls per-story toggle."

  derived_data:
    - name: "submittedStories"
      source: "workflowState.userStories or lastSubmittedStories"
    - name: "specByStoryId"
      source: "workflowState.specs plus pendingSpec"
    - name: "storyStatus"
      source: "workflowState, currentUSIndex, pendingSpec, pendingRetry, completion/cancel/error state"

  invariants:
    - "A selected story must always come from submittedStories."
    - "If a pendingSpec event arrives, workspace may switch to specs or highlight Specs, but must not lose authoring data."
    - "pendingSpec must remain the source of truth for approve/reject actions."
    - "workflowState.specs must be used for already generated specs when the workflow status has been fetched."
```

## 10. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "Follow existing React component boundaries first."
    - "Keep App as orchestration state owner, but avoid turning it into a rendering god component."
    - "Move reusable workspace rendering into focused components if App grows too large."
    - "Keep domain contracts in packages/shared unchanged unless backend evidence proves a contract gap."
    - "Avoid circular imports between components."
    - "Do not duplicate workflow status derivation in multiple components; centralize helper logic if repeated."

  visual_identity_rules:
    - "Use CSS tokens and patterns from ID_VISUAL.md."
    - "Use active green states, not purple."
    - "Keep panels dense, bordered, and operational."
    - "Prefer icon buttons with accessible labels for small actions."
    - "Cards are allowed for repeated story items, but do not put cards inside decorative cards."
```

## 11. Coding Rules

```yaml
coding_rules:
  frontend:
    - "Do not remove existing authoring functionality."
    - "Keep controlled inputs and validation behavior in UserStoryInputPage intact."
    - "Use stable dimensions for toggles, status chips, rails, and icon buttons."
    - "Use min-width: 0 and text-overflow safeguards in story lists."
    - "Render empty/loading/error states for missing specs."
    - "Keep SPEC approval actions accessible from the selected story's SPEC tab."
    - "Preserve keyboard accessibility for tabs/buttons."
    - "Avoid inline style expansion where reusable CSS classes would be clearer."

  tests:
    - "Add focused tests only if existing frontend test setup supports them."
    - "At minimum, run typecheck, unit tests, build, and browser smoke/visual verification after implementation."

  safety:
    - "Do not modify backend workflow semantics unless necessary."
    - "Do not touch LLM provider/runtime code for this frontend-only task."
    - "Do not commit spec/ because it is local-only."
```

## 12. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current frontend state"
    agent: "front"
    action: "Read App, UserStoryInputPage, SpecReview, UserStoryList, WorkflowProgress, index.css, and ID_VISUAL.md."
    expected_output: "Confirmed component responsibilities and CSS patterns."

  - step: 2
    name: "Design workspace state"
    agent: "front"
    action: "Add a small workspace mode model and selected story/spec tab state."
    expected_output: "Authoring and Specs can be switched without losing workflow state."

  - step: 3
    name: "Preserve authoring interface"
    agent: "front"
    action: "Keep UserStoryInputPage behavior and only adapt surrounding layout/copy/classes if needed."
    expected_output: "Existing user-story creation remains as practical as before."

  - step: 4
    name: "Create specs workspace"
    agent: "front"
    action: "Add story rail/list, selected story detail, and User Story/SPEC toggle."
    expected_output: "User can browse each submitted story and its matching spec."

  - step: 5
    name: "Integrate HITL approval"
    agent: "front"
    action: "Render existing SpecReview in the selected story's SPEC tab when that story is pending approval."
    expected_output: "Approval/rejection flow remains functional."

  - step: 6
    name: "Apply visual identity"
    agent: "front"
    action: "Update CSS with ID_VISUAL.md-aligned classes for workspace switcher, rail, toggle, and detail panels."
    expected_output: "New UI reads as Horus.AI, not as the screenshot clone."

  - step: 7
    name: "Validate"
    agent: "qa"
    action: "Run static/build/test checks and browser verification across authoring and specs views."
    expected_output: "Evidence that creation, spec viewing, and HITL actions remain intact."
```

## 13. Acceptance Criteria

```yaml
acceptance_criteria:
  functionality:
    - "The frontend exposes two clear interfaces: one for user-story creation/spec generation and one for spec inspection."
    - "The current ability to add/remove user stories is preserved."
    - "The current ability to add/remove acceptance criteria is preserved."
    - "The current priority selector and validation behavior are preserved."
    - "The current workflow start/spec generation action is preserved."
    - "The Specs interface lists submitted user stories."
    - "Selecting a user story updates the detail panel."
    - "Each selected story has a visible toggle between User Story and SPEC (SDD)."
    - "User Story view shows title, description, priority, and criteria."
    - "SPEC (SDD) view shows the matching generated spec, pending review UI, or a clear waiting state."
    - "Existing approve/reject behavior for pending specs remains functional."

  visual:
    - "The screenshot is used only as inspiration for structure."
    - "New UI follows ID_VISUAL.md tokens, surfaces, spacing, and dark operational style."
    - "Active states use green accent, not purple."
    - "No decorative orbs, oversized gradients, or marketing hero layout are introduced."
    - "Text does not overlap or overflow incoherently on desktop or mobile."

  architecture:
    - "App does not become a large rendering-only component if new UI can be split cleanly."
    - "No backend workflow semantics change unless a verified frontend data gap requires it."
    - "No unrelated refactor is included."
```

## 14. Validation Protocol

```yaml
validation_protocol:
  static_checks:
    - command: "pnpm type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      required: true
    - command: "pnpm build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      required: true

  tests:
    - command: "pnpm test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      required: true

  runtime_checks:
    - command: "pnpm dev"
      cwd: "/Users/wamat/Desktop/horus.ai"
      required: true
      expected: "Frontend loads locally and both interfaces are accessible."

  browser_checks:
    - "Open the local frontend."
    - "Verify Story Authoring interface still creates multiple stories and criteria."
    - "Start a workflow with a minimal valid story if provider/runtime credentials allow it."
    - "Verify Specs interface renders selected story and toggle states."
    - "Verify no text overlap at desktop width."
    - "Verify narrow viewport stacks rail/detail without broken controls."
```

If provider credentials are not available, browser validation must still cover static authoring/spec workspace states that do not require a live model call.

## 15. Risks And Mitigations

```yaml
risks:
  - risk: "Specs may only be present in pendingSpec events until workflow status is fetched."
    mitigation: "Derive specByStoryId from both pendingSpec and workflowState.specs."

  - risk: "Splitting the interface could hide the pending human approval action."
    mitigation: "When pendingSpec exists, auto-select or strongly highlight the matching story in Specs."

  - risk: "The new rail/detail layout could reduce the speed of story creation."
    mitigation: "Keep UserStoryInputPage as the authoring core and avoid adding required extra steps before generation."

  - risk: "Visual changes could drift toward the screenshot's purple style."
    mitigation: "Use ID_VISUAL.md tokens and green active states."

  - risk: "App.tsx may accumulate too much UI rendering logic."
    mitigation: "Extract StorySpecWorkspace and small helper components if implementation grows."
```

## 16. Final Quality Gate For Implementation

```yaml
quality_gate:
  before_marking_complete:
    - "All acceptance criteria are checked."
    - "pnpm type-check passes."
    - "pnpm test passes."
    - "pnpm build passes."
    - "Browser visual check confirms both interfaces."
    - "No current authoring control was removed."
    - "Spec folder remains ignored by Git."
    - "Final report includes files changed, commands run, and any validation not run."
```

## 17. Implementation Log

```yaml
implementation_log:
  - version: "0.1.0"
    date: "2026-05-26"
    changes:
      - "Created planning spec for the two-interface user story/spec workspace."
      - "Added UX scenarios and frontend design plan based on ID_VISUAL.md."
      - "Recorded creating-sdd-specs and front-design-frontend skill usage explicitly."
    validation:
      - "Planning only; implementation validation not run."
  - version: "0.2.0"
    date: "2026-05-26"
    changes:
      - "Implemented the two-interface frontend model with authoring and specs workspaces."
      - "Moved workspace navigation into the sidebar and removed the unused sidebar activity button."
      - "Added per-story spec workspace with story rail, selected story detail, and User Story/SPEC (SDD) toggle."
      - "Preserved existing user-story creation, criteria, priority, spec generation, and HITL approval flows."
      - "Kept the implementation frontend-only, without shared schema, API, or backend contract changes."
    validation:
      - "pnpm type-check passed."
      - "pnpm build passed."
      - "pnpm test passed with 29 passing tests."
      - "curl -I http://localhost:5174/ returned HTTP 200 during local dev smoke check."
  - version: "0.3.0"
    date: "2026-05-26"
    changes:
      - "Revised the frontend model after product clarification: story creation and story/spec visualization must live on the same screen."
      - "Removed the separate Specs navigation mode from the sidebar because it became redundant."
      - "Kept a single User Stories screen with authoring and per-story SPEC inspection visible together."
      - "Confirmed no shared contracts, API payloads, schemas, or backend workflow files were changed."
    validation:
      - "pnpm type-check passed."
      - "pnpm build passed."
      - "pnpm test passed with 29 passing tests."
  - version: "0.4.0"
    date: "2026-05-26"
    changes:
      - "Moved user-story creation into a large modal opened from the main User Stories workspace."
      - "Reworked the main screen around the reference image structure: left story rail, right selected story/spec detail, and top-level create action."
      - "Removed non-actionable workflow/inspector panels from the visible interface."
      - "Kept creation controls, spec generation, per-story toggle, and HITL approval behavior intact."
    validation:
      - "pnpm type-check passed."
      - "pnpm build passed."
      - "pnpm test passed with 29 passing tests."
```
