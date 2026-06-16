# SPEC 16 - Backend Runtime for Visual Preview Sessions

## 1. Metadata

```yaml
format_version: "agentic_sdd.v1"
task_id: "16-visual-preview-backend-runtime"
title: "Backend runtime for visual preview sessions"
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
  Build the backend foundation required for a visual preview interface similar to the provided reference UI, integrated with the existing Horus.AI workspace, workflow, SSE, storage, and shared-contract architecture.

  The backend must introduce a separate preview-session bounded context without mixing it with the current spec-generation workflow. It must support frontend-project discovery/registration, isolated project-folder context, preview session lifecycle, timeline events, device viewport selection, route tracking, DOM/screenshot inspection contracts, and a non-executing visual instruction draft endpoint that prepares future chat/agent integration but does not implement chat behavior now.

  In scope: shared types, backend routes, application use cases, preview runtime service interfaces, file-backed session/timeline storage, SSE event model, folder isolation rules, and integration points with the existing Express app.

  Out of scope: implementing autonomous visual edits, live chat, applying patches, real browser automation if the required adapter is not yet installed, broad changes to the existing LangGraph workflow, and replacing the current user-story/spec workflow.

  Expected user-visible result: the frontend can list/select a frontend project, start/stop/reload a preview session, see session status/timeline, select viewport, view route/status metadata, and render a disabled/ready visual-instruction composer backed by a draft endpoint.

  Expected engineering result: a typed, testable backend module whose contracts can be consumed by the separate frontend SPEC without guessing.
```

---

## 4. Business / Product Context

```yaml
business_context:
  user_problem: "Users need a visual operational console for previewing and eventually directing UI changes, while preserving the existing spec-generation workflow."
  target_user: "Developers/operators using Horus.AI to manage user stories, specs, generated artifacts, and future visual frontend iterations."
  expected_outcome: "A backend runtime can safely host preview-session state and expose it to a visual UI without cross-contaminating workspace folders or workflow context."
  product_surface:
    - "Visual preview backend API"
    - "Preview session SSE/timeline"
    - "Workspace/project selection"
    - "Future visual instruction composer"
    - "Existing workflow/spec orchestration integration"
```

---

## 5. Technical Context

```yaml
technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "Node.js"
      - "TypeScript"
      - "Express"
      - "Zod"
      - "LangGraph currently used for workflow"
      - "LangChain model adapters for existing agents"
    frontend:
      - "React 19"
      - "Vite"
      - "Tailwind CSS v4 import pipeline plus custom CSS tokens"
    database:
      - "File-backed JSON storage under ./data"
      - "No relational database"
    infra:
      - "pnpm workspace"
      - "Turbo build"
      - "SSE for workflow events"
  known_entrypoints:
    - "apps/server/src/main.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/infrastructure/http/routes/workflowRoutes.ts"
    - "apps/server/src/infrastructure/http/routes/workspaceRoutes.ts"
    - "apps/server/src/infrastructure/http/routes/eventRoutes.ts"
  known_existing_patterns:
    - "Shared Zod schemas live in packages/shared/src/entities"
    - "HTTP routes call application use cases"
    - "Use cases delegate to domain/infrastructure services"
    - "File stores validate data through shared schemas before writing"
    - "Workflow events are typed in packages/shared/src/ports/IEventStream.ts"
    - "Runtime evidence is persisted under ./data and surfaced to UI"
```

Agents must verify these from the real repository before editing.

---

## 6. Scope

```yaml
scope:
  in_scope:
    - "Create shared preview contracts in packages/shared."
    - "Create backend preview bounded context with session lifecycle APIs."
    - "Create file-backed preview session and timeline storage."
    - "Create project registry/discovery contracts with strict root-folder isolation."
    - "Create preview event SSE stream or extend event streaming with typed PreviewEvent without breaking WorkflowEvent."
    - "Create non-chat visual instruction draft endpoint for the future chat UI."
    - "Wire preview routes into apps/server/src/infrastructure/http/server.ts."
    - "Add unit tests for schema validation, folder isolation, session lifecycle, and event/timeline persistence."
  out_of_scope:
    - "Do not implement actual conversational chat behavior."
    - "Do not apply source-code patches from visual instructions."
    - "Do not modify the existing LangGraph workflow nodes unless required for type integration."
    - "Do not replace workspace user-story folders with frontend project folders."
    - "Do not allow arbitrary filesystem access outside explicitly registered project roots."
    - "Do not run destructive project commands from preview sessions."
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
      - "packages/shared/src/index.ts"
      - "packages/shared/src/ports/IPreviewEventStream.ts"
      - "apps/server/src/application/usecases/ListFrontendProjectsUseCase.ts"
      - "apps/server/src/application/usecases/CreatePreviewSessionUseCase.ts"
      - "apps/server/src/application/usecases/StartPreviewSessionUseCase.ts"
      - "apps/server/src/application/usecases/StopPreviewSessionUseCase.ts"
      - "apps/server/src/application/usecases/ReloadPreviewSessionUseCase.ts"
      - "apps/server/src/application/usecases/GetPreviewSessionUseCase.ts"
      - "apps/server/src/application/usecases/SetPreviewDeviceUseCase.ts"
      - "apps/server/src/application/usecases/CreateVisualInstructionDraftUseCase.ts"
      - "apps/server/src/infrastructure/preview/FileFrontendProjectRegistry.ts"
      - "apps/server/src/infrastructure/preview/FilePreviewSessionStore.ts"
      - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
      - "apps/server/src/infrastructure/preview/NoopBrowserPreviewAdapter.ts"
      - "apps/server/src/infrastructure/http/routes/previewRoutes.ts"
      - "apps/server/src/infrastructure/http/server.ts"
    services:
      - "Preview session lifecycle"
      - "Frontend project registry"
      - "Preview timeline/event persistence"
      - "Device viewport state"
      - "Visual instruction draft preparation"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "apps/web/src/api/previewApi.ts"
      - "apps/web/src/components visual-preview files defined in frontend SPEC"
    components:
      - "VisualPreviewConsole"
      - "PreviewToolbar"
      - "PreviewTimeline"
      - "VisualInstructionComposer"
    routes:
      - "Existing Vite root route"
  tests:
    unit:
      - "packages/shared/test/preview.test.mjs"
      - "apps/server/test/previewSessionStore.test.mjs"
      - "apps/server/test/previewRoutes.test.mjs"
      - "apps/server/test/frontendProjectRegistry.test.mjs"
    integration:
      - "apps/server/test/previewLifecycle.test.mjs"
    e2e:
      - "Manual smoke through frontend after frontend SPEC is implemented"
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
    - "Preview session state must not be stored inside WorkflowState."
    - "Workspace user-story folders and frontend project roots are different contexts."
    - "Every preview session must reference exactly one FrontendProject by projectId."
    - "Every filesystem operation must be resolved against the registered project root and must reject path traversal."
    - "Preview events must be independently auditable and persisted."
    - "Visual instruction draft support must not call LLMs or apply patches in this SPEC."
    - "Existing /api/workflow routes and LangGraph behavior must remain backward compatible."
    - "New shared contracts must be exported from packages/shared/src/index.ts."
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
    - "Never execute arbitrary commands supplied directly by the frontend."
    - "Resolve and validate project paths before every filesystem operation."
    - "Persist timeline events before emitting success responses for lifecycle actions."

  frontend:
    - "Keep layout stable across loading, empty, error, and success states."
    - "Use reusable components for repeated UI patterns."
    - "Do not let text overflow containers."
    - "Use accessible labels for icon-only controls."
    - "Avoid deeply nested card layouts."

  tests:
    - "Add tests proportional to risk."
    - "Cover success, failure, and edge cases."
    - "Do not mark work complete without running relevant validation."
```

---

## 10. Constraints

```yaml
technical_constraints:
  - "No database migration system exists; use file-backed JSON storage consistent with existing adapters."
  - "SSE currently supports workflow events only; preview events must be separate or safely unioned without breaking existing consumers."
  - "Browser automation dependency may not be installed; provide an adapter interface and a NoopBrowserPreviewAdapter fallback that reports unsupported inspection clearly."
  - "The current server process should not spawn unsafe commands unless command allowlisting is implemented."
  - "Preview project roots must be explicit, canonicalized absolute paths or repo-relative paths resolved inside repository root."

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
    - name: "ListFrontendProjects"
      request_shape: "GET /api/preview/projects"
      response_shape: "{ projects: FrontendProject[] }"
      compatibility: "can extend"

    - name: "CreatePreviewSession"
      request_shape: "{ projectId: string, route?: string, device?: PreviewDeviceName }"
      response_shape: "{ session: PreviewSession }"
      compatibility: "can extend"

    - name: "StartPreviewSession"
      request_shape: "POST /api/preview/sessions/:sessionId/start"
      response_shape: "{ session: PreviewSession, event: PreviewEvent }"
      compatibility: "can extend"

    - name: "StopPreviewSession"
      request_shape: "POST /api/preview/sessions/:sessionId/stop"
      response_shape: "{ session: PreviewSession, event: PreviewEvent }"
      compatibility: "can extend"

    - name: "ReloadPreviewSession"
      request_shape: "POST /api/preview/sessions/:sessionId/reload"
      response_shape: "{ session: PreviewSession, event: PreviewEvent }"
      compatibility: "can extend"

    - name: "SetPreviewDevice"
      request_shape: "{ device: PreviewDeviceName }"
      response_shape: "{ session: PreviewSession, event: PreviewEvent }"
      compatibility: "can extend"

    - name: "PreviewEvents"
      request_shape: "GET /api/preview/events/:sessionId"
      response_shape: "text/event-stream with PreviewEvent payloads"
      compatibility: "can extend"

    - name: "CreateVisualInstructionDraft"
      request_shape: "{ sessionId: string, mode: 'visual_edits' | 'build', message: string }"
      response_shape: "{ draft: VisualInstructionDraft, event: PreviewEvent }"
      compatibility: "can extend"

  domain_contracts:
    - name: "PreviewSession"
      invariant: "A session belongs to exactly one projectId and all operations must remain inside that project root."
    - name: "FrontendProject"
      invariant: "A project root must be canonicalized and must not overlap with unrelated workspace folders unless explicitly registered."
    - name: "PreviewTimelineEntry"
      invariant: "Every state-changing preview action must create a timeline entry with sessionId, projectId, eventType, timestamp, and status."
    - name: "ContextIsolation"
      invariant: "User-story workspace folders cannot be interpreted as frontend project roots unless separately registered as FrontendProject."

  ui_contracts:
    - name: "PreviewConsole"
      requirement: "Frontend can render selected project, session status, route, device, timeline, and disabled/ready instruction composer from backend contracts."
```

Suggested shared schemas:

```yaml
shared_contracts:
  PreviewDeviceName: "'pc' | 'phone' | 'tablet'"
  PreviewStatus: "'waiting' | 'stopped' | 'starting' | 'running' | 'inspecting' | 'applying' | 'error'"
  FrontendProject:
    id: "uuid"
    name: "string"
    slug: "string"
    rootPath: "string"
    defaultRoute: "string"
    devCommand: "string | null"
    previewUrl: "string | null"
    createdAt: "datetime"
  PreviewSession:
    id: "uuid"
    projectId: "uuid"
    status: "PreviewStatus"
    route: "string"
    device: "PreviewDevice"
    previewUrl: "string | null"
    processId: "number | null"
    startedAt: "datetime | null"
    stoppedAt: "datetime | null"
    updatedAt: "datetime"
    errorMessage: "string | null"
  PreviewEvent:
    type: "preview_created | preview_started | preview_ready | preview_stopped | preview_reloaded | device_changed | route_changed | dom_snapshot_unavailable | visual_instruction_drafted | preview_error"
    sessionId: "uuid"
    projectId: "uuid"
    timestamp: "datetime"
    status: "PreviewStatus"
    message: "string"
    data: "record<string, unknown>"
  VisualInstructionDraft:
    id: "uuid"
    sessionId: "uuid"
    projectId: "uuid"
    mode: "'visual_edits' | 'build'"
    message: "string"
    status: "'drafted'"
    createdAt: "datetime"
```

---

## 12. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current backend contracts"
    agent: "repo_explorer"
    action: "Read shared entities, server.ts, workflowRoutes, workspaceRoutes, eventRoutes, storage adapters, and tests."
    expected_output: "Implementation map confirming route and storage patterns."

  - step: 2
    name: "Add shared preview contracts"
    agent: "backend"
    action: "Create packages/shared/src/entities/Preview.ts and export it from packages/shared/src/index.ts."
    expected_output: "Typed Zod schemas and TypeScript types consumed by both backend and frontend."

  - step: 3
    name: "Implement project registry"
    agent: "backend"
    action: "Create FileFrontendProjectRegistry with canonical path validation, optional seed project for apps/web, and listProjects()."
    expected_output: "Project listing API can return stable FrontendProject records."

  - step: 4
    name: "Implement preview session store"
    agent: "backend"
    action: "Create FilePreviewSessionStore for session JSON and timeline JSON under ./data/preview-sessions."
    expected_output: "Sessions and timeline entries persist independently from WorkflowState."

  - step: 5
    name: "Implement preview runtime manager"
    agent: "backend"
    action: "Create PreviewRuntimeManager with create/start/stop/reload/setDevice/createInstructionDraft methods using injected registry/store/browser adapter."
    expected_output: "Use cases can operate without direct filesystem or process logic."

  - step: 6
    name: "Add preview routes"
    agent: "backend"
    action: "Create previewRoutes.ts and wire it in server.ts under /api/preview."
    expected_output: "Frontend SPEC can consume stable endpoints."

  - step: 7
    name: "Add tests"
    agent: "qa"
    action: "Add shared schema tests, registry isolation tests, store tests, and route lifecycle tests."
    expected_output: "Validation evidence covering contracts, folder isolation, and lifecycle behavior."

  - step: 8
    name: "Validate"
    agent: "qa"
    action: "Run pnpm --filter @u-build/server build, pnpm --filter @u-build/web build if shared types changed, and pnpm test."
    expected_output: "Validation evidence with commands, cwd, exit codes, and result."
```

Each step must be independently auditable.

---

## 13. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm preview context boundaries and shared contracts."
    inputs:
      - "Backend SDD"
      - "Frontend SDD"
      - "repository structure"
    outputs:
      - "architecture decision notes"

  - agent_name: "backend_specialist"
    responsibility: "Implement shared contracts, backend routes, use cases, stores, and runtime manager."
    inputs:
      - "affected backend files"
      - "contracts"
    outputs:
      - "backend diff"
      - "tests"

  - agent_name: "frontend_specialist"
    responsibility: "Consume the preview contracts defined here in the frontend SPEC."
    inputs:
      - "Preview contracts"
      - "Frontend SDD"
    outputs:
      - "frontend diff"
      - "visual/runtime validation"

  - agent_name: "qa_specialist"
    responsibility: "Validate backend behavior and integration contract compatibility."
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
    - "GET /api/preview/projects returns typed FrontendProject records."
    - "POST /api/preview/sessions creates a PreviewSession for exactly one project."
    - "Start, stop, reload, and device-change actions update session state and append timeline events."
    - "GET /api/preview/sessions/:sessionId returns the latest persisted session."
    - "GET /api/preview/sessions/:sessionId/timeline returns ordered PreviewEvent records."
    - "GET /api/preview/events/:sessionId streams PreviewEvent records without breaking /api/events/:threadId."
    - "POST /api/preview/instructions/draft stores a VisualInstructionDraft and does not call chat/LLM/patch application."

  architectural:
    - "PreviewSession state is not stored inside WorkflowState."
    - "FrontendProject root isolation prevents path traversal and cross-folder context leaks."
    - "Workspace folders remain user-story/spec storage only."
    - "Shared contracts are the only source of truth between backend and frontend."
    - "No new god service owns routes, storage, process management, and browser inspection at once."

  quality:
    - "Server build passes."
    - "Shared package build/typecheck passes."
    - "Relevant tests pass."
    - "Route errors include actionable messages for invalid session, invalid project, unavailable preview runtime, and folder isolation failure."

  observability:
    - "Every lifecycle action writes a timeline event."
    - "Preview errors include projectId, sessionId, operation, and safe error message."
```

Good criteria are testable. Avoid vague criteria like “make it better”.

---

## 15. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate backend TypeScript compilation."
      success_condition: "Command exits 0."

    - command: "pnpm --filter @u-build/web build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate frontend compatibility with shared preview contracts."
      success_condition: "Command exits 0."

    - command: "pnpm test"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate shared and server tests."
      success_condition: "All node --test suites pass."

  runtime_checks:
    - name: "Health check"
      method: "curl"
      expected: "GET /health returns { status: 'ok' }."
    - name: "Preview project list"
      method: "curl"
      expected: "GET /api/preview/projects returns at least the registered web project or an empty list with no server error."
    - name: "Preview session lifecycle"
      method: "curl"
      expected: "Create, start, stop, and timeline calls return valid JSON matching shared schemas."

  manual_checks:
    - "Verify no files are created outside ./data/preview-sessions and configured registry paths."
    - "Verify existing /api/workflow/start still behaves as before except for existing workspaceFolderId requirement."
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
    - "SSE client reconnect"
    - "preview adapter unavailable when using noop adapter"
    - "port unavailable when runtime manager has a configured fallback strategy"

  non_retryable_failures:
    - "schema mismatch"
    - "missing required dependency"
    - "invalid project root"
    - "path traversal attempt"
    - "project id not found"
    - "architecture conflict between workspace folder and frontend project root"

  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only changes introduced by this task."
    - "If rollback is unsafe, stop and report the state."

  escalation_rules:
    - "Escalate when requirements conflict."
    - "Escalate when required credentials/secrets are missing."
    - "Escalate when destructive action is needed."
    - "Escalate before enabling arbitrary command execution from user-supplied project configs."
```

---

## 18. Observability Requirements

```yaml
observability:
  logs:
    - event: "preview_session_lifecycle"
      fields:
        - "session_id"
        - "project_id"
        - "operation"
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
      - "preview session lifecycle actions"
      - "project root resolution decisions"
      - "visual instruction draft messages"

  user_visible_failures:
    - "Show the failed step."
    - "Show the failure reason."
    - "Show suggested next action."
```

---

## 19. Risks and Unknowns

```yaml
risks:
  - risk: "Preview runtime command execution could become unsafe if arbitrary commands are accepted."
    severity: "critical"
    mitigation: "Only support explicit allowlisted dev commands from registered project config; reject user-supplied commands."

  - risk: "Workspace folders and frontend project roots may be conflated."
    severity: "high"
    mitigation: "Use separate entities and route namespaces; require projectId for preview sessions and workspaceFolderId for spec workflows."

  - risk: "SSE event types may break current workflow subscribers."
    severity: "medium"
    mitigation: "Keep /api/events for WorkflowEvent and add /api/preview/events for PreviewEvent unless a safe discriminated union is implemented."

  - risk: "No browser automation dependency exists."
    severity: "medium"
    mitigation: "Define BrowserPreviewAdapter interface and Noop adapter first; add real adapter in a later SPEC."

unknowns:
  - question: "Should frontend projects be auto-discovered from package.json files or manually registered?"
    resolution_strategy: "infer conservatively: seed apps/web only and expose registry abstraction for later expansion."

  - question: "Should backend start dev servers or only attach to already-running URLs?"
    resolution_strategy: "implement attach/noop first unless explicit command allowlist exists."

  - question: "Where should preview session files live?"
    resolution_strategy: "use ./data/preview-sessions to match existing file-backed storage pattern."
```

If an unknown blocks safe execution, the agent must stop and ask or inspect.

---

## 20. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Implement preview as a new bounded context parallel to workflow. The backend should expose stable shared contracts first, then file-backed session/timeline stores, then route/use-case wiring. Do not modify the LangGraph workflow for preview. The only integration with the current workflow is shared project-wide UI navigation and reuse of style/contract patterns.

  alternatives_considered:
    - option: "Store preview session inside WorkflowState."
      tradeoff: "Rejected because preview sessions are project/runtime state, while WorkflowState is user-story/spec generation state."
    - option: "Immediately implement chat and patch application."
      tradeoff: "Rejected because user explicitly said not to get involved in chat now; UI should be ready only."
    - option: "Use workspaceFolderId as projectId."
      tradeoff: "Rejected because it breaks folder context isolation and would conflate user-story storage with executable frontend roots."

  migration_notes:
    - "No DB migration required."
    - "Existing workflow data remains valid."
    - "New preview files live under ./data/preview-sessions and project registry under ./data/preview-projects or ./data/frontend-projects."

  backward_compatibility:
    required: true
    notes:
      - "Existing /api/workflow and /api/workspace behavior must remain compatible."
      - "Existing WorkflowEvent SSE stream must remain compatible."
      - "Existing generated artifacts download must remain compatible."
```

---

## 21. Deliverables

```yaml
deliverables:
  code:
    - "packages/shared/src/entities/Preview.ts"
    - "packages/shared/src/ports/IPreviewEventStream.ts"
    - "apps/server/src/infrastructure/http/routes/previewRoutes.ts"
    - "apps/server/src/infrastructure/preview/*"
    - "apps/server/src/application/usecases/*Preview*UseCase.ts"
  tests:
    - "packages/shared/test/preview.test.mjs"
    - "apps/server/test/previewSessionStore.test.mjs"
    - "apps/server/test/frontendProjectRegistry.test.mjs"
    - "apps/server/test/previewRoutes.test.mjs"
  docs:
    - "This SDD"
    - "Frontend companion SDD: spec/features/17-visual-preview-frontend-console.md"
  validation_evidence:
    - "pnpm --filter @u-build/server build output"
    - "pnpm --filter @u-build/web build output"
    - "pnpm test output"
    - "curl smoke checks for /api/preview routes"
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
    - "Preview context remains isolated from workflow context."
    - "Folder/project root isolation is enforced."

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

## 23. Implementation Log

```yaml
implementation_log:
  - version: "0.2.0"
    date: "2026-05-26"
    changes:
      - "Added shared preview contracts in packages/shared/src/entities/Preview.ts."
      - "Added IPreviewEventStream as a dedicated preview event stream port."
      - "Added file-backed frontend project registry with repository-root isolation and seeded apps/web project."
      - "Added file-backed preview session store for sessions, timeline events, and visual instruction drafts."
      - "Added PreviewRuntimeManager with create/start/stop/reload/set-device/draft operations using a Noop browser adapter."
      - "Added /api/preview routes for projects, sessions, lifecycle actions, timeline, SSE events, and visual instruction drafts."
      - "Wired preview runtime into the Express app without storing preview state inside WorkflowState."
      - "Added shared, registry, store, and lifecycle regression tests."
    validation:
      - "pnpm --filter @u-build/shared build passed."
      - "pnpm --filter @u-build/server build passed."
      - "pnpm --filter @u-build/web build passed."
      - "pnpm test passed with 57 passing tests."
      - "Runtime smoke passed: GET /health returned ok."
      - "Runtime smoke passed: GET /api/preview/projects returned the seeded user_stories frontend project."
      - "Runtime smoke passed: create/start/device/draft/stop preview lifecycle calls returned valid JSON."
      - "Runtime smoke passed: preview session files were written under apps/server/data/preview-sessions."
    remaining_work:
      - "Frontend visual preview console is covered by spec 17."
      - "Real browser automation and patch application remain out of scope for this spec."
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
