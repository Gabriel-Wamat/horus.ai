# SPEC 17 - Frontend Visual Preview Console

## 1. Metadata

```yaml
format_version: "agentic_sdd.v1"
task_id: "17-visual-preview-frontend-console"
title: "Frontend visual preview console"
created_at_utc: "2026-05-26T12:06:53Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
source_skill: "creating-sdd-specs"
spec_version: "0.2.0"
status: "implemented"
```

---

## 2. Original User Request

```yaml
raw_user_request: |
  agora use a skill de criar spec para criar uma spec desse projeto. Construa a spec para o back e uma separa para o front, deixe as duas bem amarradas entre si e com todo o resto do projeto, integração é fundamental, unicidade, isolamento(especialmente de contexto de pastas; não se envolva em chat agora, apenas deixe a UI de chat pronta)
```

Rules:

- Preserve the original wording.
- Do not “improve” or reinterpret it silently.
- If the request is ambiguous, record the ambiguity later in `unknowns`.

---

## 3. System Interpretation

```yaml
system_translation: |
  Build the frontend surface for a visual preview console matching the provided reference interface, while integrating tightly with the existing Horus.AI shell, workspace/spec UI, backend workflow, and the backend preview contracts defined in spec/features/16-visual-preview-backend-runtime.md.

  The frontend must expose a project selector, preview status controls, device switcher, route display, central preview area, left-side session/timeline panel, and a visual-instruction composer UI that is ready but does not implement chat behavior. It must consume typed shared contracts and backend /api/preview endpoints. It must keep user-story workspace folders isolated from frontend project contexts.

  In scope: React components, API client, hooks, state model, visual states, disabled/ready composer, timeline rendering, preview iframe shell, responsive behavior, and integration with existing Shell/settings/spec workspace navigation.

  Out of scope: real chat behavior, LLM visual edit execution, patch application, browser DOM inspection implementation beyond rendering backend-provided states, replacing the existing specs workspace, and adding a marketing/landing page.

  Expected user-visible result: a dark operational UI where the user can select a frontend project, start/stop/reload preview, switch viewport, see timeline/status, and see a ready visual-instruction input that is disabled or draft-only until backend editing is implemented.

  Expected engineering result: isolated frontend modules that consume backend preview contracts without duplicating business rules or conflating project folders with user-story workspace folders.
```

---

## 4. Business / Product Context

```yaml
business_context:
  user_problem: "Users need a visual operational console to preview frontend surfaces and prepare future visual edit workflows without losing the current user-story/spec workflow."
  target_user: "Developers/operators managing Horus.AI specs, generated UI artifacts, and future visual preview/edit sessions."
  expected_outcome: "A usable preview console appears as a first-class product surface, integrated but isolated from existing spec-generation workflows."
  product_surface:
    - "Visual preview console"
    - "Project selector"
    - "Preview canvas"
    - "Device switcher"
    - "Timeline panel"
    - "Visual instruction composer UI"
    - "Existing Shell navigation"
```

---

## 5. Technical Context

```yaml
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Express API"
      - "SSE"
      - "Shared Zod contracts"
      - "Preview backend defined by companion SPEC"
    frontend:
      - "React 19"
      - "Vite"
      - "TypeScript"
      - "Custom CSS tokens from apps/web/src/index.css"
      - "Existing Shell, StorySpecWorkspace, LlmSettingsModal"
    database:
      - "No frontend database"
      - "Backend file-backed preview/session stores"
    infra:
      - "pnpm workspace"
      - "Vite dev server on apps/web"
  known_entrypoints:
    - "apps/web/src/main.tsx"
    - "apps/web/src/App.tsx"
    - "apps/web/src/api/workflowApi.ts"
    - "apps/web/src/hooks/useEventStream.ts"
    - "apps/web/src/index.css"
  known_existing_patterns:
    - "API clients live under apps/web/src/api"
    - "SSE hooks live under apps/web/src/hooks"
    - "Reusable panels use custom classes from index.css"
    - "Shell owns sidebar/topbar/status chips/settings entry"
    - "StorySpecWorkspace owns user-story/spec workspace, not preview project runtime"
```

Agents must verify these from the real repository before editing.

---

## 6. Scope

```yaml
scope:
  in_scope:
    - "Create frontend preview API client for /api/preview endpoints."
    - "Create usePreviewEvents hook for PreviewEvent SSE."
    - "Create VisualPreviewConsole surface matching the reference UI structure."
    - "Add project selector fed by FrontendProject records."
    - "Add preview lifecycle controls: start, stop, reload."
    - "Add device switcher: pc, phone, tablet."
    - "Add central preview area with stopped/loading/running/error states."
    - "Add timeline panel from PreviewEvent records."
    - "Add visual instruction composer UI in draft-only mode; do not implement chat."
    - "Integrate preview console into App/Shell without removing StorySpecWorkspace."
  out_of_scope:
    - "Do not implement real chat behavior."
    - "Do not call LLM visual edit agents from the UI."
    - "Do not apply patches from the UI."
    - "Do not merge workspace folders and frontend project folders."
    - "Do not remove or rewrite existing user-story/spec workspace."
    - "Do not add landing-page sections."
```

Scope rules:

- Keep changes as narrow as possible.
- Do not refactor unrelated modules.
- Do not rename public APIs unless required.
- Do not change behavior outside the requested surface.

---

## 7. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/Preview.ts"
      - "apps/server/src/infrastructure/http/routes/previewRoutes.ts"
    services:
      - "Preview session lifecycle"
      - "Preview timeline SSE"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "apps/web/src/App.tsx"
      - "apps/web/src/api/previewApi.ts"
      - "apps/web/src/hooks/usePreviewEvents.ts"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/components/PreviewProjectPanel.tsx"
      - "apps/web/src/components/PreviewToolbar.tsx"
      - "apps/web/src/components/PreviewCanvas.tsx"
      - "apps/web/src/components/PreviewTimeline.tsx"
      - "apps/web/src/components/VisualInstructionComposer.tsx"
      - "apps/web/src/index.css"
    components:
      - "Shell"
      - "StorySpecWorkspace"
      - "VisualPreviewConsole"
      - "PreviewToolbar"
      - "PreviewCanvas"
      - "PreviewTimeline"
      - "VisualInstructionComposer"
    routes:
      - "Existing SPA root"
  tests:
    unit:
      - "frontend component state tests if the repo adds a frontend test runner"
    integration:
      - "Manual API-backed preview console smoke"
    e2e:
      - "Browser smoke for stopped, running, error, and draft composer states"
```

---

## 8. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Keep application, domain, infrastructure, and presentation concerns separated."
    - "Prefer dependency injection over direct construction of concrete services."
    - "Avoid god classes, god components, and state objects with unrelated responsibilities."
    - "Do not introduce circular dependencies."
    - "Do not duplicate business rules across layers."

  project_specific_rules:
    - "Preview UI state must be separate from StorySpecWorkspace state."
    - "The frontend must treat workspaceFolderId and projectId as different identifiers."
    - "Preview project selection must never overwrite selectedWorkspaceFolderId."
    - "VisualInstructionComposer must be UI-ready but draft-only; no chat loop."
    - "Preview API types must come from packages/shared contracts."
    - "The visual style must follow ID_VISUAL.md: dark operational tool, green primary action, dense but organized."
    - "The central preview area must be the primary visual focus."
    - "Timeline and composer must be contextual to previewSessionId, not workflow threadId."
```

Example:

```yaml
project_specific_rules:
  - "Workflow state must remain modular and validated."
  - "Frontend components must be split by responsibility."
  - "Services should expose use-case-oriented APIs instead of large generic facades."
  - "Runtime evidence must be persisted or surfaced when a workflow fails."
```

---

## 9. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Prefer small, cohesive functions."
    - "Keep public API compatibility unless the SPEC explicitly allows breaking changes."
    - "Use typed data structures instead of unstructured dictionaries when possible."
    - "Handle errors explicitly with actionable messages."
    - "Avoid silent fallbacks unless logged and intentional."

  backend:
    - "Validate external input with schemas."
    - "Do not bypass repository/service boundaries."
    - "Use transactions where state changes must be atomic."
    - "Add migrations for schema changes."
    - "Preserve async/sync conventions."

  frontend:
    - "Keep layout stable across loading, empty, error, and success states."
    - "Use reusable components for repeated UI patterns."
    - "Do not let text overflow containers."
    - "Use accessible labels for icon-only controls."
    - "Avoid deeply nested card layouts."
    - "Use icon buttons for preview controls and device controls where appropriate."
    - "Do not use visible in-app text to explain implementation internals."
    - "Do not introduce marketing copy, hero sections, or oversized typography."

  tests:
    - "Add tests proportional to risk."
    - "Cover success, failure, and edge cases."
    - "Do not mark work complete without running relevant validation."
```

---

## 10. Constraints

```yaml
technical_constraints:
  - "Backend preview contracts must be implemented or mocked before full runtime behavior can work."
  - "No frontend test runner is currently configured; validation may initially rely on build and browser smoke."
  - "The visual instruction composer must not behave as chat yet."
  - "The UI must support empty project list and preview adapter unavailable states."
  - "The iframe preview must not assume generated artifact HTML; it must use PreviewSession.previewUrl when available."

operational_constraints:
  - "Do not run destructive commands."
  - "Do not overwrite user changes."
  - "Do not assume dependencies are installed without checking."
  - "Do not claim success without command output or runtime evidence."
```

---

## 11. Data / Contract Requirements

```yaml
contracts:
  api_contracts:
    - name: "PreviewApiClient"
      request_shape: "Frontend methods map 1:1 to backend /api/preview endpoints from backend SPEC."
      response_shape: "Frontend receives FrontendProject, PreviewSession, PreviewEvent, and VisualInstructionDraft."
      compatibility: "must preserve"

    - name: "PreviewEventsSse"
      request_shape: "EventSource('/api/preview/events/:sessionId')"
      response_shape: "PreviewEvent"
      compatibility: "can extend"

    - name: "VisualInstructionDraft"
      request_shape: "{ sessionId, mode, message }"
      response_shape: "{ draft, event }"
      compatibility: "can extend"

  domain_contracts:
    - name: "projectId_vs_workspaceFolderId"
      invariant: "projectId controls preview runtime; workspaceFolderId controls user-story/spec persistence."
    - name: "sessionId_vs_threadId"
      invariant: "sessionId controls preview timeline; threadId controls agentic spec workflow."
    - name: "composer_not_chat"
      invariant: "Composer can save/send draft instructions but must not render an assistant conversation or call chat endpoints."

  ui_contracts:
    - name: "StoppedPreviewState"
      requirement: "Show selected project, route, device, status, and primary start action."
    - name: "RunningPreviewState"
      requirement: "Render iframe with previewUrl and maintain toolbar/timeline."
    - name: "InstructionComposer"
      requirement: "Allow draft message input only when session exists; show clear disabled state if no running preview; no chat transcript."
```

Shared frontend type dependencies:

```yaml
required_shared_types:
  - "FrontendProject"
  - "PreviewSession"
  - "PreviewStatus"
  - "PreviewEvent"
  - "PreviewDeviceName"
  - "VisualInstructionDraft"
```

---

## 12. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current frontend implementation"
    agent: "repo_explorer"
    action: "Read App.tsx, Shell.tsx, StorySpecWorkspace.tsx, workflowApi.ts, useEventStream.ts, index.css."
    expected_output: "Frontend map with state ownership and styling conventions."

  - step: 2
    name: "Add preview API client"
    agent: "frontend"
    action: "Create apps/web/src/api/previewApi.ts using shared Preview contracts and existing requireOk pattern."
    expected_output: "Typed client for project list, session lifecycle, timeline, events, device, and instruction draft."

  - step: 3
    name: "Add preview SSE hook"
    agent: "frontend"
    action: "Create usePreviewEvents(sessionId) mirroring useEventStream without mixing WorkflowEvent and PreviewEvent."
    expected_output: "Preview timeline can subscribe independently from workflow thread events."

  - step: 4
    name: "Create visual preview component family"
    agent: "frontend"
    action: "Build VisualPreviewConsole, PreviewProjectPanel, PreviewToolbar, PreviewCanvas, PreviewTimeline, VisualInstructionComposer."
    expected_output: "Component ownership is clear and does not create a monolithic App."

  - step: 5
    name: "Integrate into App shell"
    agent: "frontend"
    action: "Add a UI mode or navigation entry for Preview while preserving existing StorySpecWorkspace mode."
    expected_output: "User can move between Specs workspace and Preview console without state contamination."

  - step: 6
    name: "Style against ID_VISUAL.md"
    agent: "frontend"
    action: "Add CSS classes/tokens for preview layout, left timeline panel, toolbar, central canvas, device switcher, empty/error states."
    expected_output: "UI matches dark operational reference and existing identity."

  - step: 7
    name: "Validate"
    agent: "qa"
    action: "Run web build and browser smoke for empty/stopped states; run backend build if shared contracts changed."
    expected_output: "Validation evidence with commands, cwd, exit codes, and visual notes."
```

Each step must be independently auditable.

---

## 13. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm state boundaries between specs workspace, preview sessions, workflow thread, and project folders."
    inputs:
      - "Frontend SDD"
      - "Backend SDD"
      - "repository structure"
    outputs:
      - "frontend architecture notes"

  - agent_name: "backend_specialist"
    responsibility: "Deliver backend preview contracts and routes consumed by this frontend."
    inputs:
      - "Backend SDD"
      - "Preview contracts"
    outputs:
      - "preview API"
      - "shared types"

  - agent_name: "frontend_specialist"
    responsibility: "Implement preview console UI and state flow."
    inputs:
      - "Preview contracts"
      - "ID_VISUAL.md"
      - "existing Shell and workspace components"
    outputs:
      - "frontend diff"
      - "visual/runtime validation"

  - agent_name: "qa_specialist"
    responsibility: "Validate UI states, API integration, accessibility, and responsive behavior."
    inputs:
      - "diff"
      - "acceptance criteria"
    outputs:
      - "test report"
      - "remaining risks"
```

---

## 14. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "The UI can list frontend projects from /api/preview/projects."
    - "The UI can create/select one preview session for one project."
    - "The UI can start, stop, reload, and reflect backend session status."
    - "The UI can switch device state among pc, phone, and tablet."
    - "The central preview area shows actionable stopped, starting, running, and error states."
    - "The running state renders PreviewSession.previewUrl in an isolated iframe."
    - "The timeline panel renders PreviewEvent entries for the current session only."
    - "The visual instruction composer can create a draft instruction when backend supports it, but does not render chat."

  architectural:
    - "Preview UI state is isolated from StorySpecWorkspace state."
    - "projectId never overwrites selectedWorkspaceFolderId."
    - "sessionId never overwrites workflow threadId."
    - "PreviewEvent and WorkflowEvent are handled by separate hooks."
    - "No component owns project selection, session lifecycle, iframe rendering, timeline, and composer logic all at once."

  quality:
    - "pnpm --filter @u-build/web build passes."
    - "pnpm --filter @u-build/server build passes when shared contracts change."
    - "No mobile or desktop text overflow in preview console."
    - "Icon-only controls have accessible labels."
    - "Disabled composer state is clear when no preview session is active."

  observability:
    - "Timeline shows event type, timestamp, status, and message."
    - "Errors from preview API are surfaced in the UI with actionable text."
```

Good criteria are testable. Avoid vague criteria like “make it better”.

---

## 15. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend TypeScript and Vite build."
      success_condition: "Command exits 0."

    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate backend/shared contract compatibility."
      success_condition: "Command exits 0."

    - command: "pnpm test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate shared/server test suite after contract changes."
      success_condition: "All tests pass."

  runtime_checks:
    - name: "Empty preview projects"
      method: "browser"
      expected: "UI shows empty project state and no crash."
    - name: "Stopped preview"
      method: "browser"
      expected: "UI shows selected project, route, device, and primary start CTA."
    - name: "Preview timeline"
      method: "browser"
      expected: "Timeline renders events for current preview session only."
    - name: "Composer ready but not chat"
      method: "browser"
      expected: "Composer is visible, contextual, and does not show assistant/user chat transcript."

  manual_checks:
    - "Desktop viewport around 1440px."
    - "Mobile viewport around 390px."
    - "Verify device switcher does not resize shell unexpectedly."
    - "Verify central preview canvas remains primary visual focus."
```

Example:

```yaml
validation_protocol:
  required_commands:
    - command: "uv run python -m pytest tests/path -q"
      cwd: "<repo root>"
      purpose: "Validate backend behavior."
      success_condition: "All selected tests pass."

    - command: "pnpm build"
      cwd: "frontend"
      purpose: "Validate frontend production build."
      success_condition: "Build completes without TypeScript or Vite errors."
```

---

## 16. Error-Mitigation Rules for Agents

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent files, APIs, routes, or database fields."
    - "If unsure, inspect the repository before deciding."
    - "Never claim a command was run unless it was actually executed."

  read_before_write:
    - "Before editing a file, read the surrounding implementation."
    - "Before creating a new abstraction, search for an existing pattern."
    - "Before deleting code, identify all references."

  failure_handling:
    - "If a command fails, inspect stdout, stderr, and exit code."
    - "Fix the root cause when possible and rerun the relevant validation."
    - "If unable to fix, report the exact blocker and evidence."

  state_consistency:
    - "Do not update only one side of a contract."
    - "If changing schemas, update backend, frontend types, tests, and docs."
    - "If changing workflow state, update accessors, persistence, and event summaries."

  scope_control:
    - "Do not perform broad rewrites unless required."
    - "Do not clean unrelated files."
    - "Do not change formatting across unrelated modules."
```

---

## 17. Recovery / Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary dev server startup failure"
    - "SSE disconnect"
    - "preview reload failure"
    - "frontend API request timeout"

  non_retryable_failures:
    - "schema mismatch"
    - "missing required dependency"
    - "invalid project id"
    - "invalid session id"
    - "backend preview routes not implemented"
    - "architecture conflict between projectId and workspaceFolderId"

  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only changes introduced by this task."
    - "If rollback is unsafe, stop and report the state."

  escalation_rules:
    - "Escalate when requirements conflict."
    - "Escalate when required credentials/secrets are missing."
    - "Escalate when destructive action is needed."
```

---

## 18. Observability Requirements

```yaml
observability:
  logs:
    - event: "preview_ui_action"
      fields:
        - "session_id"
        - "project_id"
        - "step"
        - "status"
        - "error_type"
        - "duration_ms"

  audit_trail:
    required: true
    must_capture:
      - "files read"
      - "files changed"
      - "commands executed"
      - "test results"
      - "workflow decisions"
      - "preview API calls"
      - "selected project id"
      - "selected preview session id"

  user_visible_failures:
    - "Show the failed step."
    - "Show the failure reason."
    - "Show suggested next action."
```

---

## 19. Risks and Unknowns

```yaml
risks:
  - risk: "The UI could accidentally mix user-story folder context with frontend preview project context."
    severity: "critical"
    mitigation: "Use separate state names, separate API clients, and visible labels for project vs workspace."

  - risk: "Composer could be perceived as real chat before backend supports it."
    severity: "high"
    mitigation: "Label it as visual instruction draft, disable or draft-only, and do not render conversation history."

  - risk: "Preview event stream could conflict with workflow event stream."
    severity: "medium"
    mitigation: "Use usePreviewEvents and /api/preview/events/:sessionId separately from useEventStream."

  - risk: "Reference UI could lead to overbuilding inspection features."
    severity: "medium"
    mitigation: "Render controls and disabled states now; only activate features backed by backend contracts."

unknowns:
  - question: "Should Preview be a separate Shell nav mode or embedded next to Specs?"
    resolution_strategy: "infer conservatively: add a Shell nav mode while preserving current Specs as default."

  - question: "Should the composer send draft instructions immediately or remain disabled until running preview?"
    resolution_strategy: "infer conservatively: visible always, disabled without session, draft-only when session exists."

  - question: "Should Preview use iframe or screenshot canvas?"
    resolution_strategy: "use iframe with previewUrl now; screenshot/canvas can be added after browser adapter exists."
```

If an unknown blocks safe execution, the agent must stop and ask or inspect.

---

## 20. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Implement the preview UI as a new mode inside the existing Shell. Keep the current StorySpecWorkspace intact. Add a dedicated previewApi client and usePreviewEvents hook. Use the backend contracts from 16-visual-preview-backend-runtime.md as the only source of truth. Build the reference-like UI as a real operational surface, not a decorative mock: project panel, toolbar, preview canvas, timeline, and composer states must all be functional or explicitly disabled.

  alternatives_considered:
    - option: "Replace StorySpecWorkspace with PreviewConsole."
      tradeoff: "Rejected because the project still needs specs/user-story workflows."
    - option: "Build chat now."
      tradeoff: "Rejected because the user explicitly requested not to get involved in chat now."
    - option: "Use existing workflow threadId as preview session id."
      tradeoff: "Rejected because preview runtime and spec workflow have different lifecycles."

  migration_notes:
    - "Existing user stories and workflow state remain unchanged."
    - "New preview UI state can be introduced without changing existing data."
    - "CSS additions should extend current ID_VISUAL tokens, not replace them."

  backward_compatibility:
    required: true
    notes:
      - "Existing story/spec workflow remains usable."
      - "Existing settings modal remains usable."
      - "Existing artifacts panel remains usable."
      - "Existing workflow SSE remains usable."
```

---

## 21. Deliverables

```yaml
deliverables:
  code:
    - "apps/web/src/api/previewApi.ts"
    - "apps/web/src/hooks/usePreviewEvents.ts"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/components/PreviewProjectPanel.tsx"
    - "apps/web/src/components/PreviewToolbar.tsx"
    - "apps/web/src/components/PreviewCanvas.tsx"
    - "apps/web/src/components/PreviewTimeline.tsx"
    - "apps/web/src/components/VisualInstructionComposer.tsx"
    - "apps/web/src/App.tsx"
    - "apps/web/src/index.css"
  tests:
    - "Manual browser smoke until a frontend test runner exists"
  docs:
    - "This SDD"
    - "Backend companion SDD: spec/features/16-visual-preview-backend-runtime.md"
  validation_evidence:
    - "pnpm --filter @u-build/web build output"
    - "browser screenshots or visual notes for stopped/running/error states"
    - "API smoke results when backend SPEC is implemented"
```

---

## 22. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Relevant files were read."
    - "Existing patterns were identified."

  implementation:
    - "Changes are scoped to the SPEC."
    - "Architecture rules were followed."
    - "No unrelated refactor was introduced."
    - "Preview UI context remains isolated from specs/workspace context."
    - "Composer UI is ready but not chat."

  validation:
    - "Relevant tests were run."
    - "Build/typecheck/lint were run when applicable."
    - "Runtime behavior was checked when applicable."

  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

---

# Minimal Output Contract for Agents

Every agent executing this SPEC must finish with:

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

---

# Golden Rule

A SPEC is complete only when another agent can execute it without guessing.

If an agent still needs to infer architecture, scope, contracts, validation, or safety rules from scratch, the SPEC is not detailed enough.

---

## 23. Implementation Log

```yaml
implementation_log:
  - implemented_at: "2026-05-26"
    implemented_by: "agent"
    summary:
      - "Added a dedicated frontend preview console mode inside the existing Shell."
      - "Added explicit sidebar navigation for User Stories and Preview using icon plus name buttons."
      - "Added typed preview API client for /api/preview."
      - "Added isolated usePreviewEvents hook for preview SSE events."
      - "Added VisualPreviewConsole with project selector, route display, preview lifecycle controls, device switcher, canvas iframe shell, timeline, and draft-only visual instruction composer."
      - "Kept preview state isolated from StorySpecWorkspace, workflow thread state, and workspace folder selection."
      - "Removed incorrect Calangos copy from the visual instruction composer and replaced it with Horus."
    files_changed:
      - "apps/web/src/App.tsx"
      - "apps/web/src/api/previewApi.ts"
      - "apps/web/src/hooks/usePreviewEvents.ts"
      - "apps/web/src/components/Shell.tsx"
      - "apps/web/src/components/PreviewIcons.tsx"
      - "apps/web/src/components/PreviewProjectPanel.tsx"
      - "apps/web/src/components/PreviewToolbar.tsx"
      - "apps/web/src/components/PreviewCanvas.tsx"
      - "apps/web/src/components/PreviewTimeline.tsx"
      - "apps/web/src/components/VisualInstructionComposer.tsx"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/index.css"
    validation:
      - command: "pnpm --filter @u-build/server build"
        result: "passed"
      - command: "pnpm --filter @u-build/web build"
        result: "passed"
      - command: "pnpm test"
        result: "passed: 57 tests"
      - command: "curl -s http://localhost:3000/health"
        result: "passed"
      - command: "curl -s http://localhost:3000/api/preview/projects"
        result: "passed"
      - command: "curl -s -o /tmp/horus_front_status.txt -w \"%{http_code}\" \"http://localhost:5174/?mode=preview\""
        result: "passed: 200"
      - command: "Chrome visual validation"
        result: "passed: Preview navigation, stopped state, start action, iframe render, SSE live state, and timeline events were visually confirmed"
    notes:
      - "Browser/IAB was unavailable in this session; Chrome via Computer Use was used for visual validation."
      - "Visual instruction composer remains draft-only as required; chat behavior was not implemented."
```
