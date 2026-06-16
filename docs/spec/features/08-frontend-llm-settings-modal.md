# SDD: Frontend LLM Settings Modal

## 1. Metadata

```yaml
format_version: "agentic_sdd.v1"
task_id: "horus-frontend-llm-settings-modal"
title: "Frontend LLM Settings Modal"
created_at_utc: "2026-05-26T10:28:19Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
```

## 2. Original User Request

```yaml
raw_user_request: |
  no botão de configuração que está na side bar do front deve abrir um modal quando o usuário clicar, de forma que ele consiga instanciar sua chave api e o seu modelo. use a skill de spec par gerar a spec dessa tarefa
```

## 3. System Interpretation

```yaml
system_translation: |
  Add a frontend settings modal opened by the existing sidebar configuration button. The modal must allow the user to choose/configure the LLM provider, API key, and model used by workflow execution.

  The expected user-visible result is that clicking the settings button opens a focused modal with provider/model/API-key controls, validation feedback, save/cancel actions, and a clear configured/unconfigured state.

  The expected engineering result is a narrow frontend change plus the minimum backend/shared contract change required for workflows to use user-provided LLM settings. API keys must not be persisted into workflow JSON state or exposed through status/events.

  In scope:
    - Reuse the sidebar settings button in `Shell.tsx`.
    - Add modal UI and state flow in the React app.
    - Define a typed LLM settings contract.
    - Wire settings into workflow start/runtime safely.
    - Validate provider/model/key input.
    - Add relevant tests or validation commands.

  Out of scope:
    - User accounts, encrypted remote secret storage, or multi-user credential vaulting.
    - Provider billing validation.
    - Live provider smoke tests unless explicitly approved.
    - Frontend provider management beyond OpenAI, OpenRouter, and Groq.
    - Persisting API keys to Git-tracked files or workflow artifacts.
```

## 4. Business / Product Context

```yaml
business_context:
  user_problem: "Operators should not need to edit server environment variables to choose a provider, API key, or model for a workflow run."
  target_user: "Horus.AI users running local or private workflow executions."
  expected_outcome: "The app can be configured from the visible UI before starting a workflow."
  product_surface:
    - "Frontend sidebar"
    - "LLM configuration modal"
    - "Workflow start flow"
    - "Backend LLM runtime configuration"
```

## 5. Technical Context

```yaml
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "Zod"
      - "LangGraph"
      - "LangChain provider wrappers"
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
      - "CSS in apps/web/src/index.css"
    database:
      - "No database"
      - "Workflow state persisted as JSON files by storage provider"
    infra:
      - "pnpm workspace"
      - "Turbo"
  known_entrypoints:
    - "apps/web/src/App.tsx"
    - "apps/web/src/components/Shell.tsx"
    - "apps/web/src/api/workflowApi.ts"
    - "apps/server/src/application/usecases/StartWorkflowUseCase.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/llm/providerConfig.ts"
    - "apps/server/src/infrastructure/llm/createChatModel.ts"
  known_existing_patterns:
    - "Shell owns sidebar layout and currently renders the settings button without click behavior."
    - "App owns workflow start state and passes `handleStart` to `UserStoryInputPage`."
    - "workflowApi.start currently posts only `{ userStories }`."
    - "StartWorkflowInputSchema currently validates only user stories."
    - "LLM provider resolution currently supports OpenAI, OpenRouter, and Groq from server env."
    - "Spec folder is local-only and ignored by Git."
```

Agents must verify these paths before editing.

## 6. Scope

```yaml
scope:
  in_scope:
    - "Make the existing sidebar settings button open a modal."
    - "Add provider select for openai, openrouter, and groq."
    - "Add API key input with masked display and show/hide affordance."
    - "Add model input/select strategy that allows user-entered model IDs."
    - "Persist non-secret user preferences in browser state if appropriate."
    - "Keep API key only in memory/session scope unless user explicitly requests persistence."
    - "Pass selected LLM config into backend workflow runtime."
    - "Ensure backend uses the user-provided config for the workflow run."
    - "Prevent API key leakage through workflow status, events, artifacts, logs, or Git-tracked docs."
    - "Add tests or focused validation covering modal behavior and backend config contract."
  out_of_scope:
    - "Credential vaulting."
    - "Backend database migration."
    - "Provider account validation endpoint."
    - "Changing workflow graph routing."
    - "Changing prompts."
    - "Adding Anthropic or providers outside OpenAI/OpenRouter/Groq."
    - "Redesigning unrelated sidebar/navigation UI."
```

## 7. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/LlmSettings.ts"
      - "packages/shared/src/index.ts"
      - "apps/server/src/application/usecases/StartWorkflowUseCase.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/llm/providerConfig.ts"
      - "apps/server/src/infrastructure/llm/createChatModel.ts"
      - "apps/server/src/infrastructure/langgraph/graph.ts"
      - "apps/server/src/infrastructure/langgraph/state.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/specAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    services:
      - "StartWorkflowUseCase"
      - "WorkflowOrchestrator"
      - "LLM provider config"
      - "LangGraph agent node invocation"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "apps/web/src/App.tsx"
      - "apps/web/src/components/Shell.tsx"
      - "apps/web/src/components/LlmSettingsModal.tsx"
      - "apps/web/src/api/workflowApi.ts"
      - "apps/web/src/index.css"
    components:
      - "Shell"
      - "LlmSettingsModal"
      - "UserStoryInputPage integration"
    routes:
      - "Single-page app root"
  tests:
    unit:
      - "packages/shared/test/llmSettings.test.mjs"
      - "apps/server/test/providerConfig.test.mjs"
    integration:
      - "apps/server/test/startWorkflowInput.test.mjs"
    e2e:
      - "Optional browser check for opening/saving modal if frontend test tooling exists"
```

## 8. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Keep application, domain, infrastructure, and presentation concerns separated."
    - "Prefer typed contracts over loose request bodies."
    - "Avoid god classes, god components, and state objects with unrelated responsibilities."
    - "Do not introduce circular dependencies."
    - "Do not duplicate provider validation rules across frontend and backend without a shared schema."

  project_specific_rules:
    - "Shared contracts belong in `packages/shared/src/entities` and must be exported from `packages/shared/src/index.ts`."
    - "Frontend API calls belong in `apps/web/src/api/workflowApi.ts`."
    - "Sidebar layout stays in `Shell.tsx`; modal internals should live in a dedicated component."
    - "Backend request validation belongs in application use cases or shared Zod schemas."
    - "Provider package imports must remain centralized in `apps/server/src/infrastructure/llm/createChatModel.ts`."
    - "Shared package must not depend on provider SDKs."
    - "API keys must not be written into persisted `WorkflowState` JSON."
```

## 9. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Prefer small, cohesive functions."
    - "Keep public API compatibility unless explicitly required."
    - "Use typed data structures instead of unstructured dictionaries."
    - "Handle errors explicitly with actionable messages."
    - "Avoid silent fallbacks unless intentional and documented."

  backend:
    - "Validate LLM settings with Zod."
    - "Treat frontend-provided API key as secret."
    - "Do not log API key values."
    - "Do not include API key in SSE events, status responses, artifacts, or stored workflow JSON."
    - "Use env fallback only when no UI-provided config exists."
    - "Keep provider resolution centralized."

  frontend:
    - "Settings button must remain accessible with `aria-label` and keyboard activation."
    - "Modal must use dialog semantics, focus management, Escape close, overlay click behavior, and accessible labels."
    - "Do not let text or inputs overflow on mobile."
    - "Use stable dimensions and existing visual language from `index.css`."
    - "API key input must default to password type and support temporary reveal."
    - "Save button must be disabled or error visibly when provider/model/key is invalid."

  tests:
    - "Add tests proportional to risk."
    - "Cover valid config, missing key, missing model, and unsupported provider."
    - "Do not mark work complete without running relevant validation."
```

## 10. Constraints

```yaml
technical_constraints:
  - "Supported providers must match spec 07: openai, openrouter, groq."
  - "User-entered model IDs must be accepted because provider model catalogs change frequently."
  - "API key must not be persisted in Git-tracked source, local spec, workflow JSON, or browser localStorage by default."
  - "A running workflow must use a stable config snapshot from workflow start."
  - "Existing workflows started before this feature should still work through environment fallback."
  - "No live provider calls should be made by tests."

operational_constraints:
  - "Do not run destructive commands."
  - "Do not overwrite unrelated user changes."
  - "Do not claim live provider validation unless real credentials were used with approval."
  - "Keep `spec/` ignored by Git."
```

## 11. Data / Contract Requirements

```yaml
contracts:
  api_contracts:
    - name: "StartWorkflowInput"
      current_shape: "{ userStories: UserStory[] }"
      target_shape: "{ userStories: UserStory[], llmSettings?: LlmSettings }"
      rules:
        - "llmSettings is optional for env fallback."
        - "If llmSettings exists, provider/model/apiKey are required."
        - "API key is used for runtime only and never returned."

  domain_contracts:
    - name: "LlmProvider"
      invariant: "Provider must be one of openai, openrouter, groq."
    - name: "LlmSettings"
      invariant: "provider, model, and apiKey must be present before starting a UI-configured workflow."
    - name: "Workflow runtime LLM config"
      invariant: "Config snapshot is bound to a thread at start and used by all agent nodes for that thread."
    - name: "Secret handling"
      invariant: "API key cannot be serialized into WorkflowState or sent through status/events."

  ui_contracts:
    - name: "Settings button"
      invariant: "Clicking the sidebar settings button opens the modal."
    - name: "Settings modal"
      invariant: "User can configure provider, model, and API key, then save or cancel."
    - name: "Workflow start"
      invariant: "If UI settings are required and missing, user receives actionable feedback before workflow start."
```

## 12. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current frontend and backend contracts"
    agent: "repo_explorer"
    action: "Read Shell, App, workflowApi, StartWorkflowUseCase, WorkflowOrchestrator, providerConfig, createChatModel, and LangGraph nodes."
    expected_output: "Confirmed UI entry point and runtime config path."

  - step: 2
    name: "Add shared LLM settings schema"
    agent: "backend"
    action: "Create shared `LlmSettingsSchema` with provider enum, model string, and apiKey string; export it."
    expected_output: "Single source of truth for provider/model/key request validation."

  - step: 3
    name: "Extend workflow start contract"
    agent: "backend"
    action: "Update StartWorkflowInputSchema and workflowApi.start to accept optional llmSettings."
    expected_output: "Frontend can submit settings; env fallback remains valid."

  - step: 4
    name: "Bind runtime config without persisting secrets"
    agent: "backend"
    action: "Add an in-memory runtime config store or LangGraph configurable path so agent nodes can resolve UI-provided settings by thread without writing the API key into WorkflowState."
    expected_output: "All agent nodes can use the same thread-scoped LLM config."

  - step: 5
    name: "Adapt LLM factory"
    agent: "backend"
    action: "Allow createChatModel/providerConfig to accept explicit settings overrides in addition to env fallback."
    expected_output: "Spec, Front, QA, and Curator can use UI settings through the existing factory."

  - step: 6
    name: "Implement modal UI"
    agent: "frontend"
    action: "Add LlmSettingsModal and wire Shell settings button through App state."
    expected_output: "Accessible modal opens from sidebar and saves provider/model/key into frontend session state."

  - step: 7
    name: "Integrate workflow start"
    agent: "frontend"
    action: "Pass saved settings to workflowApi.start and show configured status in UI without revealing secret."
    expected_output: "User can configure before starting a workflow."

  - step: 8
    name: "Add focused tests"
    agent: "qa"
    action: "Add shared/backend tests for schema, start input, provider override, and secret non-serialization."
    expected_output: "Offline coverage for the risky contract and secret handling."

  - step: 9
    name: "Validate"
    agent: "qa"
    action: "Run pnpm type-check, pnpm test, pnpm build, and optional browser verification if dev server is started."
    expected_output: "Validation evidence with commands, cwd, exit codes, and result."
```

## 13. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Define safe frontend-backend LLM settings flow and secret handling boundary."
    inputs:
      - "This SDD"
      - "Spec 07 multiprovider implementation"
      - "Current workflow start/runtime code"
    outputs:
      - "Architecture decision notes"

  - agent_name: "backend_specialist"
    responsibility: "Implement shared schema, start contract, and thread-scoped runtime config without persisted secrets."
    inputs:
      - "packages/shared"
      - "StartWorkflowUseCase"
      - "WorkflowOrchestrator"
      - "providerConfig/createChatModel"
      - "LangGraph nodes"
    outputs:
      - "Backend diff"
      - "Backend tests"

  - agent_name: "frontend_specialist"
    responsibility: "Implement accessible settings modal and start-flow integration."
    inputs:
      - "Shell"
      - "App"
      - "workflowApi"
      - "index.css"
    outputs:
      - "Frontend diff"
      - "Browser validation notes"

  - agent_name: "qa_specialist"
    responsibility: "Validate type safety, tests, build, and secret leakage constraints."
    inputs:
      - "Diff"
      - "Acceptance criteria"
    outputs:
      - "Test report"
      - "Remaining risks"
```

## 14. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Clicking the sidebar settings button opens an LLM settings modal."
    - "The modal lets the user configure provider, model, and API key."
    - "The modal supports openai, openrouter, and groq."
    - "Saved settings are used when starting a workflow."
    - "Existing env-based config still works when no UI settings are provided."
    - "User can cancel the modal without changing current settings."
    - "User can update settings before starting a new workflow."

  architectural:
    - "Provider SDK imports remain centralized in infrastructure/llm."
    - "LLM settings schema is shared or otherwise centrally validated."
    - "API key is not added to WorkflowState, SSE events, status responses, artifacts, or console logs."
    - "Frontend modal is a dedicated component, not embedded as a large block inside Shell."
    - "No unrelated workflow graph routing changes are introduced."

  quality:
    - "pnpm type-check passes."
    - "pnpm test passes."
    - "pnpm build passes."
    - "Focused tests cover request validation and provider override behavior."

  accessibility:
    - "Settings button has an accessible label."
    - "Modal has dialog semantics and a clear title."
    - "Escape closes modal."
    - "Focus is managed when the modal opens/closes."
    - "Inputs have visible labels."
```

## 15. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate TypeScript contracts across workspace."
      success_condition: "Exit code 0."

    - command: "pnpm test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Run offline regression tests."
      success_condition: "Exit code 0 and all tests pass."

    - command: "pnpm build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate production build output."
      success_condition: "Exit code 0."

  runtime_checks:
    - name: "Open modal"
      method: "browser/manual or automated browser"
      expected: "Clicking settings opens the modal and focuses the first control."
    - name: "Save settings"
      method: "browser/manual or automated browser"
      expected: "Provider/model/key can be saved and UI indicates configured state without showing the key."
    - name: "Start workflow with settings"
      method: "mock/offline where possible"
      expected: "Start payload includes llmSettings and backend binds it to runtime config."
    - name: "Secret leak check"
      method: "test/code search"
      expected: "API key is not stored in workflow JSON or emitted in status/events."

  manual_checks:
    - "Optional: run one live workflow with a real key only after explicit user approval."
```

## 16. Error-Mitigation Rules for Agents

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent a secure storage claim for browser or in-memory secrets."
    - "Do not claim provider credentials were validated unless a real provider call was made."
    - "Do not invent model catalogs; allow free-form model IDs."

  read_before_write:
    - "Read Shell and App before editing modal state."
    - "Read StartWorkflowUseCase before changing API payload."
    - "Read WorkflowOrchestrator and LangGraph nodes before threading runtime config."
    - "Read providerConfig/createChatModel before changing LLM instantiation."

  failure_handling:
    - "If runtime config cannot be safely passed through LangGraph config, use a thread-scoped in-memory store."
    - "If tests reveal API key serialization, stop and redesign before proceeding."
    - "If frontend tooling lacks component tests, use typecheck/build plus browser/manual verification."

  state_consistency:
    - "All four LLM-backed agents must receive the same thread config snapshot."
    - "Changing settings must affect future workflows, not mutate an already-running workflow."
    - "Env fallback must remain available for server-only deployments."

  scope_control:
    - "Do not add user accounts or persistent credential storage."
    - "Do not redesign the whole sidebar."
    - "Do not change workflow routing or prompt content."
```

## 17. Recovery / Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "type mismatch in shared schema usage"
    - "modal CSS overflow or focus bug"
    - "backend validation mismatch between frontend payload and StartWorkflowInputSchema"

  non_retryable_failures:
    - "requirement to persist API keys securely without a secrets backend"
    - "live provider validation without credentials"

  rollback_rules:
    - "Do not rollback unrelated user changes."
    - "Rollback only changes introduced for this feature."
    - "If rollback would remove prior spec 07 work, stop and report."

  escalation_rules:
    - "Ask user before storing API keys beyond session memory."
    - "Ask user before live provider smoke tests."
    - "Ask user if they want this to support server-wide settings instead of per-workflow settings."
```

## 18. Observability Requirements

```yaml
observability:
  logs:
    - event: "llm_settings_configured"
      fields:
        - "provider"
        - "model"
        - "source"
      forbidden_fields:
        - "apiKey"
        - "raw Authorization header"
    - event: "llm_config_error"
      fields:
        - "provider"
        - "missing_field"
        - "error_type"
      forbidden_fields:
        - "apiKey"

  audit_trail:
    required: true
    must_capture:
      - "files read"
      - "files changed"
      - "commands executed"
      - "test results"
      - "secret handling decision"

  user_visible_failures:
    - "Missing provider/model/key should be shown in the modal before start."
    - "Backend validation failure should produce an actionable message."
```

## 19. Risks and Unknowns

```yaml
risks:
  - risk: "API key can leak if it is stored in WorkflowState or emitted in events."
    severity: "high"
    mitigation: "Keep key in frontend session state and backend thread-scoped runtime memory only; add tests/code search."
  - risk: "Workflow resume after server restart may fail for UI-configured secrets because the key is intentionally not persisted."
    severity: "medium"
    mitigation: "Document this limitation; env fallback remains available for restart-safe deployments."
  - risk: "Changing LangGraph state shape can accidentally serialize secrets."
    severity: "high"
    mitigation: "Do not add API key to graph state channels; pass via config or in-memory lookup."
  - risk: "Frontend-only validation may drift from backend validation."
    severity: "medium"
    mitigation: "Use shared schema/types where possible."

unknowns:
  - question: "Should API key be session-only, localStorage-backed, or server-memory-backed?"
    resolution_strategy: "Default to session/in-memory only for safety; ask before persistent storage."
  - question: "Should settings be global for the app session or attached per workflow start?"
    resolution_strategy: "Default to per-workflow snapshot created from current modal settings."
  - question: "Should the modal require configuration before first workflow or allow env fallback silently?"
    resolution_strategy: "Allow env fallback but show unconfigured state; if user saves modal settings, use them."
```

## 20. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Implement the modal as a dedicated React component and make Shell expose an `onOpenSettings` callback for the existing settings button. App owns the settings state because it also owns workflow start.

    Define `LlmSettingsSchema` in shared with provider/model/apiKey. Extend `workflowApi.start` and `StartWorkflowUseCase` to accept optional `llmSettings`.

    Do not put the API key in WorkflowState. Prefer binding the LLM settings to the thread at workflow start through a thread-scoped runtime config store or LangGraph config path that is not serialized. Agent nodes should obtain the config and pass it into the existing provider factory.

  alternatives_considered:
    - option: "Store API key in localStorage."
      tradeoff: "Convenient across reloads, but increases local secret exposure; not default."
    - option: "Store API key in WorkflowState JSON."
      tradeoff: "Makes resumes easy, but violates secret handling and artifact/status safety."
    - option: "Use only server env and make modal cosmetic."
      tradeoff: "Does not satisfy the user request to instantiate key/model from the UI."
    - option: "Create a dedicated backend settings endpoint."
      tradeoff: "Useful for server-wide config, but per-workflow start payload is narrower and avoids global mutable settings."

  migration_notes:
    - "No migration required."
    - "Existing env-based runs should keep working."
    - "UI-configured runs may not be restart-resumable unless user reconfigures the key after server restart."

  backward_compatibility:
    required: true
    notes:
      - "Existing start requests with only userStories must remain valid."
      - "Existing frontend workflow behavior must remain unchanged except for settings modal availability."
```

## 21. Deliverables

```yaml
deliverables:
  code:
    - "packages/shared/src/entities/LlmSettings.ts"
    - "packages/shared/src/index.ts"
    - "apps/server/src/application/usecases/StartWorkflowUseCase.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/llm/providerConfig.ts"
    - "apps/server/src/infrastructure/llm/createChatModel.ts"
    - "apps/web/src/components/Shell.tsx"
    - "apps/web/src/components/LlmSettingsModal.tsx"
    - "apps/web/src/App.tsx"
    - "apps/web/src/api/workflowApi.ts"
    - "apps/web/src/index.css"
  tests:
    - "packages/shared/test/llmSettings.test.mjs"
    - "apps/server/test/providerConfig.test.mjs"
    - "apps/server/test/startWorkflowInput.test.mjs"
  docs:
    - "spec/features/08-frontend-llm-settings-modal.md"
    - "spec/CHANGELOG.md"
    - "spec/README.md"
  validation_evidence:
    - "pnpm type-check output"
    - "pnpm test output"
    - "pnpm build output"
```

## 22. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Relevant frontend files were read."
    - "Relevant backend start/runtime files were read."
    - "Spec 07 LLM provider layer was understood."

  implementation:
    - "Settings button opens modal."
    - "Modal supports provider/model/API key."
    - "Workflow start sends settings when configured."
    - "Backend binds settings to runtime without persisting API key."
    - "All four LLM-backed agents use the configured runtime settings."
    - "Env fallback still works."

  validation:
    - "Shared schema tests pass."
    - "Backend config/start tests pass."
    - "Build/typecheck/test were run."
    - "Browser/manual modal behavior was checked if implementation proceeds."

  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

## Minimal Output Contract For Implementing Agent

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
  secret_handling:
    api_key_persisted: false
    api_key_returned_to_client: false
    notes: "<where the key lives during runtime>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```

## Implementation Log

- 2026-05-26: SDD created using `creating-sdd-specs`; implementation not started.
- 2026-05-26: Implemented shared `LlmSettingsSchema` and extended workflow start input with optional `llmSettings` while preserving env fallback.
- 2026-05-26: Added thread-scoped in-memory runtime LLM settings store. API keys are not added to LangGraph state, persisted workflow JSON, SSE events, status payloads, artifacts, or logs.
- 2026-05-26: Updated provider resolution and chat model factory to prefer runtime settings over env provider/model/key when present.
- 2026-05-26: Refactored Spec, Front, QA, and Curator runtime calls to consume the thread-scoped settings snapshot.
- 2026-05-26: Added `LlmSettingsModal`, wired the sidebar settings button, and integrated saved settings into `workflowApi.start`.
- 2026-05-26: Replaced the textual show/hide API-key control with an accessible eye icon toggle per user follow-up.
- 2026-05-26: Added offline tests for shared LLM settings validation, start payload validation, runtime provider override, and thread-scoped runtime settings.
- 2026-05-26: Added regression coverage confirming `StartWorkflowUseCase` forwards `llmSettings` to the orchestrator.
- 2026-05-26: Validation passed:
  - `pnpm type-check` from `/Users/wamat/Desktop/horus.ai`: exit 0.
  - `pnpm test` from `/Users/wamat/Desktop/horus.ai`: exit 0; build completed and 26 tests passed.
  - `pnpm build` from `/Users/wamat/Desktop/horus.ai`: exit 0.
  - Chrome visual check at `http://localhost:5174/`: settings button opens modal; provider/model/API-key fields render; API-key reveal control is an eye icon; API-key autofill was reduced with `autocomplete="new-password"` and stable field names.

## Implementation Result

```yaml
agent_result:
  status: "completed"
  summary: "The sidebar settings button now opens an LLM settings modal. Saved provider/model/API-key settings are submitted with new workflow starts and used by the backend runtime through a thread-scoped in-memory snapshot."
  files_read:
    - "apps/web/src/components/Shell.tsx"
    - "apps/web/src/App.tsx"
    - "apps/web/src/api/workflowApi.ts"
    - "apps/web/src/index.css"
    - "apps/server/src/application/usecases/StartWorkflowUseCase.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/llm/providerConfig.ts"
    - "apps/server/src/infrastructure/llm/createChatModel.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/specAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
  files_changed:
    - "packages/shared/src/entities/LlmSettings.ts"
    - "packages/shared/src/index.ts"
    - "apps/server/src/application/usecases/StartWorkflowUseCase.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/llm/providerConfig.ts"
    - "apps/server/src/infrastructure/llm/createChatModel.ts"
    - "apps/server/src/infrastructure/llm/runtimeLlmSettings.ts"
    - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/specAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/web/src/components/Shell.tsx"
    - "apps/web/src/components/LlmSettingsModal.tsx"
    - "apps/web/src/App.tsx"
    - "apps/web/src/api/workflowApi.ts"
    - "apps/web/src/index.css"
    - "packages/shared/test/llmSettings.test.mjs"
    - "apps/server/test/providerConfig.test.mjs"
    - "apps/server/test/runtimeLlmSettings.test.mjs"
    - "apps/server/test/startWorkflowInput.test.mjs"
    - "spec/features/08-frontend-llm-settings-modal.md"
    - "spec/CHANGELOG.md"
  commands_run:
    - command: "pnpm type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      exit_code: 0
      result: "TypeScript contracts passed across workspace."
    - command: "pnpm test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      exit_code: 0
      result: "Build completed and 26 offline tests passed."
    - command: "pnpm build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      exit_code: 0
      result: "Production build passed."
    - command: "pnpm dev"
      cwd: "/Users/wamat/Desktop/horus.ai"
      exit_code: "running"
      result: "Backend running at http://localhost:3000 and frontend at http://localhost:5174."
  validation:
    passed:
      - "Settings button opens modal."
      - "Modal supports provider/model/API key."
      - "API-key show/hide control is an icon button with accessible labels."
      - "Start payload accepts optional llmSettings and env fallback remains valid."
      - "Runtime provider settings override env credentials when present."
      - "Thread-scoped runtime settings are clearable."
      - "pnpm type-check passed."
      - "pnpm test passed with 26 tests."
      - "pnpm build passed."
    failed: []
  secret_handling:
    api_key_persisted: false
    api_key_returned_to_client: false
    notes: "The key lives in React state on the client and in an in-memory Map keyed by threadId on the server; it is cleared when a terminal status is persisted or execution errors."
  remaining_risks:
    - "UI-configured API keys are intentionally not restart-resumable after server process restart."
    - "No live provider smoke test was run because credentials/runtime spend were out of scope."
  next_recommended_action: "Use the modal with a real key only when ready to run a live workflow."
```
