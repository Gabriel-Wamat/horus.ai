---
format_version: "agentic_sdd.v1"
task_id: "feature-61-agent-skill-catalog-frontend"
title: "Agent Skill Catalog And Builder Frontend"
created_at_utc: "2026-05-27T07:09:34Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "planned"
depends_on:
  - "spec/features/60-agent-skill-registry-backend.md"
---

# 61 - Agent Skill Catalog And Builder Frontend

## 1. Original User Request

```yaml
raw_user_request: |
  em seguida, quero que crie uma tela nova onde o usuário pode ver todas as skills do projeto, além disso criar novas skills de forma que os agentes possam usar. exatamente como funciona no codex ou claude code. pesquise na internet como isso é feito, em seguida use a skill de criar spec para planejar essa tarefa, crie primeiro a spec de back(incluindo BD) e depois a de front. garanta que ambas estarão versionadas em /Users/wamat/Desktop/horus.ai/spec/features
```

## 2. Research Basis

```yaml
research_summary: |
  Codex and Claude Code present skills as manageable capability bundles: users can create, manage,
  share/import, and invoke skills explicitly or let agents load them automatically based on metadata.
  The core authoring shape is a SKILL.md playbook with name/description, required inputs, workflow steps,
  output format, quality checks, and optional resources/scripts/references. Claude Code also exposes
  skill locations, live detection, direct slash invocation, support files, frontmatter configuration,
  arguments, dynamic context, and subagent execution. The Horus frontend should translate these ideas into
  a project-native screen: catalog, detail, revision history, validation report, agent bindings, and a
  guided builder that writes SKILL.md safely.

sources:
  - "OpenAI Codex app: dedicated interface to create and manage skills; skills extend Codex beyond code generation."
  - "OpenAI Academy: skills can be created, reviewed, installed, auto-used, explicitly selected, shared, and combined."
  - "Claude Code Docs: skills live in directories with SKILL.md, optional support files, arguments, and invocation controls."
  - "Claude Agent SDK Docs: metadata is discovered first and full content loads when triggered."
  - "arXiv 2605.11418: skill registries must guard against semantic supply-chain risks."
```

## 3. System Interpretation

```yaml
system_translation: |
  Build a new Horus UI surface where the user can view all project skills, inspect each skill's
  SKILL.md/revisions/files/validation/bindings, create a new skill through a guided editor, validate it,
  publish it, and bind it to one or more agents so Horus agents can use it in future runs.

expected_user_visible_result: |
  A new "Skills" screen in the Horus shell with a calm, project-consistent dark UI. The user sees existing
  skills, can filter by agent/source/status, can open a detail drawer/page, can create a skill with a
  SKILL.md editor and quality checklist, and can publish/bind it only when validation passes.

expected_engineering_result: |
  New frontend route/mode, API client functions, components, state management, loading/error/empty states,
  accessibility, tests, and visual regression guards that consume the backend contracts from spec 60.
```

## 4. Product And Technical Context

```yaml
business_context:
  user_problem: "Users cannot see, understand, or extend the skills that influence Horus agents."
  target_user: "A Horus operator who wants Codex/Claude-like project skill management inside Horus."
  expected_outcome: "Skill authoring becomes visible, controlled, auditable, and safe enough for non-code direct use."
  product_surface:
    - "Horus shell navigation"
    - "Skill catalog screen"
    - "Skill detail/revision inspector"
    - "Skill builder/editor"
    - "Agent binding controls"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Spec 60 agent skill registry APIs"
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
      - "Existing Horus Shell, Button, Panel, StatusPill components"
    database:
      - "Consumed through backend APIs only"
    infrastructure:
      - "SSE/workflow not required for first UI release, except future usage visibility"
  known_entrypoints:
    - "apps/web/src/App.tsx"
    - "apps/web/src/app/useAppNavigation.ts"
    - "apps/web/src/components/Shell.tsx"
    - "apps/web/src/api/workflowApi.ts"
    - "apps/web/src/components/ui/*"
    - "apps/web/src/index.css"
  known_existing_patterns:
    - "App mode is controlled by URL query mode and Shell navigation."
    - "Feature pages live under apps/web/src/features/* when they are complex."
    - "API modules wrap fetch with typed responses."
    - "Existing visual identity uses dark gray surfaces, restrained green accents, subtle borders, compact controls, and no high-highlight color flooding."
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Add a new Shell mode/navigation item for Skills."
    - "Create a feature page under apps/web/src/features/agent-skills."
    - "List all skills with search, filters, status/source/agent badges, and concise metadata."
    - "Open skill details showing SKILL.md preview, frontmatter, revision history, support files, validation report, and agent bindings."
    - "Create a guided skill builder with fields for name, description, target agents, invocation mode, SKILL.md body, and support-file metadata."
    - "Validate before publish and show actionable issues."
    - "Publish and bind only when backend validation passes."
    - "Preserve existing Horus visual identity and avoid excessive frames/highlight colors."
    - "Add frontend tests for navigation, catalog rendering, create flow, validation errors, and API contracts."
  out_of_scope:
    - "Implement backend routes or database. Covered by spec 60."
    - "Public marketplace or remote skill install."
    - "Executing support scripts from the UI."
    - "Collaborative realtime editing."
    - "Full markdown syntax highlighting package unless already available."
```

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "Spec 60 route/API contracts only"
    services:
      - "AgentSkillRegistryService via HTTP"
    database:
      migrations_required: false
      tables:
        - "agent_skills"
        - "agent_skill_revisions"
        - "agent_skill_files"
        - "agent_skill_bindings"
        - "agent_skill_validation_reports"
  frontend:
    files:
      - "apps/web/src/App.tsx"
      - "apps/web/src/app/useAppNavigation.ts"
      - "apps/web/src/components/Shell.tsx"
      - "apps/web/src/api/agentSkillsApi.ts"
      - "apps/web/src/features/agent-skills/AgentSkillsPage.tsx"
      - "apps/web/src/features/agent-skills/SkillCatalog.tsx"
      - "apps/web/src/features/agent-skills/SkillDetailPanel.tsx"
      - "apps/web/src/features/agent-skills/SkillBuilder.tsx"
      - "apps/web/src/features/agent-skills/useAgentSkills.ts"
      - "apps/web/src/index.css"
    components:
      - "Shell"
      - "AgentSkillsPage"
      - "SkillCatalog"
      - "SkillDetailPanel"
      - "SkillBuilder"
      - "ValidationReport"
      - "AgentBindingSelector"
    routes:
      - "?mode=skills"
  workflow:
    graph_nodes: []
    agents:
      - "Spec"
      - "Odin"
      - "Front"
      - "QA"
      - "Curator"
  tests:
    unit:
      - "apps/web/test/agentSkillsPage.test.mjs"
      - "apps/web/test/frontendRegressionGuards.test.mjs"
    integration:
      - "Mocked API create/validate/publish flow"
    e2e:
      - "Browser smoke: open Skills, create draft, see validation, publish button state"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    The Skills frontend consumes the spec 60 backend API and shared schemas. It integrates with Shell
    navigation, the existing dark visual system, and agent profile concepts. It must never duplicate
    backend validation logic; instead it previews common checks and treats backend validation as source
    of truth.

  depends_on:
    - name: "Spec 60 skill registry APIs"
      type: "api"
      owner: "apps/server/infrastructure/http/routes/agentSkillRoutes.ts"
      direction: "this_spec_consumes_dependency"
      contract_used: "GET/POST /api/agent-skills endpoints and shared AgentSkill schemas"
      required_for: "Catalog, detail, create, validate, publish, archive, and bind actions."
      assumptions:
        - "Spec 60 must land before or alongside this spec."
      failure_modes:
        - "Skills page can only show an unavailable-state placeholder."
      fallback_or_recovery: "Show backend-unavailable state with retry and no fake sample data in production."
      verification:
        - "API mock tests and runtime smoke against local backend."

    - name: "Shell navigation"
      type: "frontend_component"
      owner: "apps/web/src/components/Shell.tsx"
      direction: "this_spec_consumes_dependency"
      contract_used: "ShellMode union, activeMode, onChangeMode"
      required_for: "Add Skills as first-class app screen."
      assumptions: []
      failure_modes:
        - "Mode query does not route to new page."
      fallback_or_recovery: "Add type-safe mode and default route handling."
      verification:
        - "Navigation test and manual browser smoke."

    - name: "Existing Horus visual identity"
      type: "frontend_component"
      owner: "apps/web/src/index.css and UI components"
      direction: "this_spec_consumes_dependency"
      contract_used: "Dark gray surfaces, restrained green accents, compact panels, subtle strokes"
      required_for: "User explicitly requested consistency and disliked high-highlight colors."
      assumptions: []
      failure_modes:
        - "New screen looks like a separate product."
      fallback_or_recovery: "Reuse existing Panel/Button/StatusPill primitives and CSS tokens."
      verification:
        - "Visual regression guard and browser screenshot."

    - name: "Agent profiles"
      type: "backend_service"
      owner: "AgentProfileRegistry"
      direction: "this_spec_consumes_dependency"
      contract_used: "agent profile ids, labels, allowed tools"
      required_for: "Agent binding selector must show real target agents."
      assumptions:
        - "Spec 60 exposes agent binding options or includes profiles in skill detail response."
      failure_modes:
        - "User binds skills to non-existent agents."
      fallback_or_recovery: "Fetch binding options from backend; do not hardcode agent list except as typed fallback in tests."
      verification:
        - "Binding selector test."

  depended_on_by:
    - name: "Horus operator workflow"
      type: "user_workflow"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Skills screen for catalog and skill authoring"
      compatibility_obligation: "must preserve existing modes stories/files/preview/agents"
      expected_consumer_behavior: "User can inspect and create skills without leaving Horus."
      migration_or_notification_required: false
      verification:
        - "Browser smoke across all modes."

    - name: "Future agent-run UI"
      type: "frontend_component"
      owner: "apps/web/features/agent-flow-map"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Skill ids/revision labels and usage links"
      compatibility_obligation: "may extend later; do not block current agent map"
      expected_consumer_behavior: "Future run events can deep-link to skill detail."
      migration_or_notification_required: false
      verification:
        - "No regression in agent flow map tests."

  bidirectional_integrations:
    - name: "Skill editor and validation endpoint"
      participants:
        - "SkillBuilder"
        - "POST /api/agent-skills/:id/validate"
      shared_contract: "Draft SKILL.md + support files -> validation report"
      consistency_rule: "Frontend preview checks are advisory; backend validation is final."
      verification:
        - "Validation report rendering test with failed and passed states."

    - name: "Skill detail and publish/binding endpoints"
      participants:
        - "SkillDetailPanel"
        - "publish/bind APIs"
      shared_contract: "revision hash, active revision id, binding ids"
      consistency_rule: "Publish must include expected revision hash and refresh detail after success."
      verification:
        - "Stale revision conflict test."

  data_flow:
    inbound:
      - source: "GET /api/agent-skills"
        payload_or_state: "AgentSkillSummary[]"
        validation: "Shared type import and runtime response guard if available."
      - source: "GET /api/agent-skills/:skillId"
        payload_or_state: "Skill detail with revisions/files/bindings/validation reports"
        validation: "API client schema parse or typed narrowing."
    outbound:
      - target: "POST /api/agent-skills"
        payload_or_state: "CreateAgentSkillInput"
        compatibility: "Must preserve backend field names."
      - target: "POST /api/agent-skills/:skillId/validate"
        payload_or_state: "Skill draft body/support files"
        compatibility: "No publish side effect."
      - target: "publish/bind APIs"
        payload_or_state: "expectedRevisionHash and binding updates"
        compatibility: "Atomic backend operation."

  sequencing_dependencies:
    - dependency: "Spec 60 shared schemas"
      reason: "Frontend must use typed contracts instead of inventing local shapes."
      validation: "apps/web build/typecheck."
    - dependency: "Shell mode update before page routing"
      reason: "The page must be reachable from the app shell."
      validation: "Navigation test."
    - dependency: "Validation endpoint before publish UI"
      reason: "Publish button state depends on validation result."
      validation: "Create flow test."

  integration_risks:
    - risk: "Frontend duplicates backend validation and diverges."
      severity: "medium"
      mitigation: "Use lightweight client hints only; final validation report comes from backend."
    - risk: "Skill creation UI encourages huge prompt bodies."
      severity: "medium"
      mitigation: "Show character/file limits, progressive support-file guidance, and warnings."
    - risk: "New screen violates current visual identity."
      severity: "medium"
      mitigation: "Reuse existing components/tokens and add CSS guard against high-highlight palettes."
```

## 8. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Keep API access in apps/web/src/api."
    - "Keep complex feature UI under apps/web/src/features/agent-skills."
    - "Prefer small presentational components plus one data hook."
    - "Do not store backend source of truth in localStorage."
  project_specific:
    - "Add ShellMode 'skills' without breaking existing URL modes."
    - "Use restrained Horus visual identity: gray surfaces, subtle strokes, limited green accents."
    - "Avoid high-highlight color floods, excessive nested frames, and large explanatory text blocks."
    - "All icon-only controls need accessible labels and title/tooltips."
    - "Empty/loading/error states must preserve layout stability."
```

## 9. Coding Rules

```yaml
coding_rules:
  general:
    - "Read Shell/App/navigation/API patterns before editing."
    - "Use shared AgentSkill types from @u-build/shared."
    - "Keep components focused; do not create a god page with all logic inline."
    - "Handle fetch errors with user-visible, actionable messages."
  frontend:
    - "Use existing Button, Panel, StatusPill, and CSS conventions where possible."
    - "Design dense operational UI, not a marketing landing page."
    - "Use tabs or segmented controls for Overview, SKILL.md, Files, Revisions, Bindings, Validation."
    - "Use icons for actions like validate, publish, archive, copy, add file, and bind."
    - "Prevent text overflow in cards, buttons, badges, code previews, and side panels."
    - "Keep card radius at or below existing project standard unless reused components define otherwise."
  tests:
    - "Mock API calls deterministically."
    - "Cover loading, empty, error, validation failed, validation passed, publish blocked, publish success."
```

## 10. Contracts And Invariants

```yaml
contracts:
  api_contracts:
    - name: "agentSkillsApi.listSkills"
      producer: "apps/web/src/api/agentSkillsApi.ts"
      consumers:
        - "useAgentSkills"
      request_shape: "AgentSkillListQuery"
      response_shape: "AgentSkillSummary[]"
      compatibility: "must match spec 60"

    - name: "agentSkillsApi.getSkill"
      producer: "apps/web/src/api/agentSkillsApi.ts"
      consumers:
        - "SkillDetailPanel"
      request_shape: "skillId"
      response_shape: "AgentSkillDetail"
      compatibility: "must match spec 60"

    - name: "agentSkillsApi.createSkill"
      producer: "apps/web/src/api/agentSkillsApi.ts"
      consumers:
        - "SkillBuilder"
      request_shape: "CreateAgentSkillInput"
      response_shape: "CreateAgentSkillResponse"
      compatibility: "must match spec 60"

    - name: "agentSkillsApi.validateDraft"
      producer: "apps/web/src/api/agentSkillsApi.ts"
      consumers:
        - "SkillBuilder"
      request_shape: "ValidateAgentSkillInput"
      response_shape: "AgentSkillValidationReport"
      compatibility: "backend result is authoritative"

  ui_contracts:
    - name: "Skills navigation"
      producer: "Shell"
      consumers:
        - "User"
        - "URL mode"
      requirement: "User can open ?mode=skills through sidebar and direct URL."

    - name: "Catalog cards/table"
      producer: "SkillCatalog"
      consumers:
        - "User"
      requirement: "Each skill shows name, description, source, status, active revision, target agents, validation state, and last updated."

    - name: "Create/publish flow"
      producer: "SkillBuilder"
      consumers:
        - "User"
        - "Backend"
      requirement: "Publish is disabled until backend validation passes; failures show exact issue list."

    - name: "Agent binding"
      producer: "AgentBindingSelector"
      consumers:
        - "User"
        - "Backend"
      requirement: "User can choose compatible agents and trigger mode without hardcoded fake options."

  data_contracts:
    - name: "Skill editor draft state"
      producer: "SkillBuilder"
      consumers:
        - "agentSkillsApi"
      migration_required: false
      compatibility_notes: "Draft state mirrors backend input schema and is reset/refreshed after publish."
```

## 11. UX Model

```yaml
ux_model:
  navigation:
    sidebar_item:
      label: "Skills"
      icon: "small tool/book/spark-like glyph consistent with existing line icons"
      mode: "skills"
  page_layout:
    structure:
      - "Header row: title 'Skills', count, primary action 'Nova skill'"
      - "Filter rail/toolbar: search, agent, source, status"
      - "Main area: catalog list/table with compact cards"
      - "Right drawer or split panel: selected skill detail"
      - "Modal or full-height panel: create/edit builder"
  visual_direction:
    - "Background remains Horus dark gray/near-black."
    - "Surfaces use subtle border and gray fills, not blue/purple highlights."
    - "Green is reserved for active/passed/publish primary actions."
    - "Validation failures use restrained red text/border, not full red panels."
    - "Code/SKILL.md preview uses monospace block with controlled max height and scroll."
  builder_steps:
    - "Basics: name, description, purpose, target agents"
    - "Instructions: SKILL.md body with starter template"
    - "Resources: optional files/references listed as metadata for backend upload"
    - "Validation: run backend validation, show issues"
    - "Publish: choose bindings and trigger mode"
```

## 12. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect frontend app shell and API patterns"
    agent: "repo_explorer"
    action: "Read App, useAppNavigation, Shell, API modules, UI components, and current CSS identity."
    expected_output: "Implementation map with exact files and reusable components."

  - step: 2
    name: "Add API client"
    agent: "frontend_specialist"
    action: "Create apps/web/src/api/agentSkillsApi.ts consuming shared types from spec 60."
    expected_output: "Typed functions for list/detail/create/validate/publish/archive/bind."

  - step: 3
    name: "Add navigation mode"
    agent: "frontend_specialist"
    action: "Extend ShellMode/useAppNavigation/App/Shell with mode=skills and icon."
    expected_output: "Skills screen reachable through sidebar and URL."

  - step: 4
    name: "Build catalog and detail page"
    agent: "frontend_specialist"
    action: "Implement AgentSkillsPage, SkillCatalog, SkillDetailPanel, filters, empty/loading/error states."
    expected_output: "User can inspect all project skills and details."

  - step: 5
    name: "Build skill creator"
    agent: "frontend_specialist"
    action: "Implement SkillBuilder with starter template, validation report, publish flow, and agent bindings."
    expected_output: "User can create and publish a backend-validated skill."

  - step: 6
    name: "Polish visual identity"
    agent: "frontend_specialist"
    action: "Add CSS scoped to agent-skills feature using existing color/stroke/density patterns."
    expected_output: "Screen feels native to Horus, minimal, operational, and not over-framed."

  - step: 7
    name: "Validate"
    agent: "qa_specialist"
    action: "Run build/tests and browser smoke for catalog, detail, validation failure, validation success, and publish blocked states."
    expected_output: "Validation evidence with screenshots if browser smoke is run."
```

## 13. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "frontend_specialist"
    responsibility: "Implement UI, API client, navigation, state, and visual polish."
    inputs:
      - "Spec 60 API/shared contracts"
      - "Existing Shell/UI patterns"
    outputs:
      - "Frontend diff"
      - "Frontend tests"
      - "Browser screenshots"

  - agent_name: "backend_specialist"
    responsibility: "Support frontend contract questions and route shape adjustments only if spec 60 implementation reveals mismatch."
    inputs:
      - "Frontend needs"
      - "Spec 60 routes"
    outputs:
      - "Contract adjustment notes"

  - agent_name: "qa_specialist"
    responsibility: "Validate UI states, route contracts, accessibility basics, and visual identity."
    inputs:
      - "Frontend diff"
      - "Acceptance criteria"
    outputs:
      - "Test and browser report"
```

## 14. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Sidebar exposes a Skills mode and direct ?mode=skills URL works."
    - "Catalog lists all backend-provided skills with search/filtering."
    - "Detail panel shows active revision, SKILL.md content, support files, validation report, and bindings."
    - "Create flow can submit a new skill draft."
    - "Validation report renders passed and failed checks clearly."
    - "Publish action is disabled until validation passes and uses expected revision hash."
    - "Binding selector writes compatible agent targets and trigger mode through backend contract."
  integration:
    - "Frontend uses shared AgentSkill types from spec 60."
    - "All API errors show actionable messages and do not fake success."
    - "Existing modes stories/files/preview/agents remain reachable."
  architectural:
    - "AgentSkillsPage is decomposed into focused components and a data hook."
    - "No backend validation logic is duplicated as authoritative frontend logic."
  quality:
    - "pnpm build passes."
    - "pnpm test passes."
    - "Frontend regression tests cover new mode and core states."
  observability:
    - "UI shows validation/publish/loading states with concise labels."
    - "User can see which revision is active and which agents can use it."
```

## 15. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Typecheck and build all frontend/backend/shared consumers."
      success_condition: "exit code 0"
    - command: "pnpm test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Run regression suite including new frontend tests."
      success_condition: "exit code 0 and all tests pass"
    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Focused web build if full build is too slow."
      success_condition: "exit code 0"
  runtime_checks:
    - name: "Skills page smoke"
      method: "browser"
      expected: "Open http://localhost:<port>/?mode=skills and see catalog or backend-unavailable state."
    - name: "Create skill validation smoke"
      method: "browser"
      expected: "Open builder, enter minimal SKILL.md, run validation, see backend validation result."
    - name: "Responsive check"
      method: "browser"
      expected: "No text overflow at desktop and mobile widths."
  integration_checks:
    - name: "Existing app modes"
      surfaces:
        - "Shell"
        - "useAppNavigation"
      method: "frontend test and browser navigation"
      expected: "stories/files/preview/agents/skills route correctly."
    - name: "API contract"
      surfaces:
        - "agentSkillsApi"
        - "Spec 60 routes"
      method: "mocked API tests plus local server smoke"
      expected: "Typed request/response shapes match."
  manual_checks:
    - "Inspect UI screenshots for Horus visual identity, minimal frames, restrained green, and readable density."
```

## 16. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent backend endpoints; inspect spec 60 implementation or block until it exists."
    - "Do not use fake catalog data in production code."
    - "Do not claim skill creation works unless a backend-backed flow was validated."
  read_before_write:
    - "Read Shell, App, useAppNavigation, existing feature pages, UI components, and CSS before editing."
    - "Read shared AgentSkill schemas before writing API client types."
  failure_handling:
    - "If backend is unavailable, render an unavailable state with retry, not blank UI."
    - "If validation fails, keep draft intact and show exact backend issues."
    - "If publish conflicts on revision hash, refresh detail and ask user to review latest revision."
  state_consistency:
    - "After create/validate/publish/bind, refresh catalog/detail from backend."
    - "Do not mark a skill active locally until backend confirms."
  scope_control:
    - "Do not implement backend schema in frontend spec."
    - "Do not redesign unrelated screens."
```

## 17. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary backend unavailable"
    - "SSE/dev server restart"
    - "transient route timeout"
  non_retryable_failures:
    - "missing spec 60 backend contract"
    - "shared schema mismatch"
    - "validation failed due to unsafe SKILL.md"
  rollback_rules:
    - "Rollback only files introduced by this frontend task if abandoned."
    - "Do not revert user changes or backend spec work."
  escalation_rules:
    - "Escalate if user wants public marketplace/import from remote URL in this same pass."
    - "Escalate if scripts must execute from the browser-created skill immediately."
```

## 18. Observability Requirements

```yaml
observability:
  logs:
    - event: "agent_skill_ui_validate_clicked"
      fields:
        - "skill_id"
        - "draft_revision_id"
    - event: "agent_skill_ui_publish_clicked"
      fields:
        - "skill_id"
        - "revision_id"
    - event: "agent_skill_ui_error"
      fields:
        - "operation"
        - "error_type"
  audit_trail:
    required: true
    must_capture:
      - "API operations attempted by UI"
      - "backend validation result"
      - "publish/bind success or failure"
  user_visible_failures:
    - "Backend unavailable."
    - "Validation failed."
    - "Publish conflict/stale revision."
    - "Binding rejected by backend."
```

## 19. Risks And Unknowns

```yaml
risks:
  - risk: "The UI makes unsafe skills feel safe before backend validation."
    severity: "high"
    mitigation: "Publish disabled until backend validation passes; warning copy remains concise but explicit."
  - risk: "The screen becomes noisy and over-framed."
    severity: "medium"
    mitigation: "Use split layout, compact badges, restrained panels, and progressive disclosure."
  - risk: "Backend contract changes during spec 60 implementation."
    severity: "medium"
    mitigation: "Generate API client from shared types and keep frontend tests mocked around final contract."
unknowns:
  - question: "Should Skills appear before or after Agents in sidebar?"
    resolution_strategy: "Default after Agents or before Settings; verify with product owner during implementation."
  - question: "Should skill creation use a modal, drawer, or full page?"
    resolution_strategy: "Default to full-height drawer/panel to preserve context and avoid a cramped modal."
```

## 20. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Implement Skills as a new feature route/mode with an operational split-view: catalog on the left/center,
    detail on the right, and a create/edit drawer. Keep it dense, calm, and consistent with Horus. The backend
    remains source of truth for validation and publishing.
  alternatives_considered:
    - option: "Settings modal tab"
      tradeoff: "Skills are too important and complex for a settings subpanel."
    - option: "Single giant form page"
      tradeoff: "Poor discoverability for existing skills and revision history."
    - option: "Markdown-only editor"
      tradeoff: "Too easy to create malformed skills; guided basics and validation improve quality."
  migration_notes: []
  backward_compatibility:
    required: true
    notes:
      - "Existing modes and query parameters must keep working."
      - "If backend spec 60 is not deployed, the UI must fail gracefully."
```

## 21. Deliverables

```yaml
deliverables:
  code:
    - "apps/web/src/api/agentSkillsApi.ts"
    - "apps/web/src/features/agent-skills/*"
    - "apps/web/src/App.tsx"
    - "apps/web/src/app/useAppNavigation.ts"
    - "apps/web/src/components/Shell.tsx"
    - "apps/web/src/index.css"
  tests:
    - "apps/web/test/agentSkillsPage.test.mjs"
    - "apps/web/test/frontendRegressionGuards.test.mjs additions"
  docs:
    - "None required unless implementation adds a user guide."
  validation_evidence:
    - "pnpm build"
    - "pnpm test"
    - "Browser screenshots for catalog, detail, builder, and validation states"
```

## 22. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Shell/App/navigation patterns were read."
    - "UI component and CSS identity patterns were read."
    - "Spec 60 API/shared contracts were read."
  implementation:
    - "Skills mode added."
    - "API client added."
    - "Catalog/detail/builder components added."
    - "Validation/publish/binding flows use backend state."
    - "Visual identity remains consistent."
  validation:
    - "Build/typecheck passes."
    - "Tests pass."
    - "Browser smoke validates route and core flows."
    - "No console errors in browser smoke."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Screenshots or exact browser observations are provided."
    - "Remaining risks are disclosed."
```

## Minimal Output Contract For Executing Agents

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
