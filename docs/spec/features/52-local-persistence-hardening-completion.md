# SPEC 52: Local Persistence Hardening Completion

```yaml
format_version: "agentic_sdd.v1"
task_id: "52-local-persistence-hardening-completion"
title: "Complete local persistence hardening after SPEC 51"
created_at_utc: "2026-05-27T03:28:29Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
```

## 1. Original User Request

```yaml
raw_user_request: |
  use a skill de criar spec para planejar essa implementação de ajuste e após isso inicie a implementação
```

Context:

```yaml
previous_answer_remaining_items:
  - "File-mode LangGraph checkpointing still uses MemorySaver."
  - "File-backed JSON writes are not atomic."
  - "Legacy ./data migration/import behavior is not implemented."
  - "Historical local specs still mention machine-local paths."
  - "Windows/Linux validation has not run in an actual OS matrix."
```

## 2. System Interpretation

```yaml
system_translation: |
  Create an executable SDD for the remaining SPEC 51 persistence gaps, then begin implementation immediately.
  The first implementation pass should prioritize changes with clear local evidence and low architectural uncertainty: atomic JSON writes, safe legacy data detection, and tests.
  Durable file-mode LangGraph checkpointing must be designed only after inspecting supported LangGraph checkpointer APIs; do not invent an unsafe checkpoint saver.

expected_user_visible_result: |
  Local file-mode persistence becomes more robust against interrupted writes and the app makes legacy ./data behavior explicit.
  Full file-mode HITL resume remains either implemented with a verified durable checkpointer or clearly documented as a follow-up if blocked by dependency/API uncertainty.

expected_engineering_result: |
  A shared atomic JSON file helper is introduced and applied to file-backed stores.
  Critical JSON stores use temp-file plus rename writes.
  Tests cover atomic helper behavior and representative repository writes.
  Runtime docs/spec logs identify any remaining checkpoint and OS-matrix work.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "The app can now choose a portable data root, but local file persistence still risks corruption or unclear restart behavior."
  target_user: "Developers running Horus locally without Postgres."
  expected_outcome: "File-mode local data is safer, migration behavior is explicit, and remaining durability limitations are not hidden."
  product_surface:
    - "Local startup"
    - "Workflow resume"
    - "Workspace/story/spec persistence"
    - "Chat memory"
    - "Preview sessions"
    - "Project construction records"

technical_context:
  repository_root: "<repo-root>"
  relevant_stack:
    backend:
      - "Node.js"
      - "TypeScript"
      - "Express"
      - "LangGraph"
    database:
      - "File-backed JSON"
      - "Optional Postgres"
  known_entrypoints:
    - "apps/server/src/infrastructure/config/runtimeConfig.ts"
    - "apps/server/src/infrastructure/repositories/createRepositories.ts"
    - "apps/server/src/infrastructure/langgraph/checkpointer.ts"
  known_existing_patterns:
    - "File repositories validate persisted data with Zod schemas."
    - "File-mode is default; Postgres mode is optional and durable."
    - "SPEC 51 already centralizes HORUS_DATA_DIR."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add shared atomic JSON read/write helper."
    - "Apply helper to file-backed stores that persist JSON state."
    - "Add tests for atomic writes and repository compatibility."
    - "Add safe legacy ./data detection or documentation hook without moving/deleting user data."
    - "Inspect LangGraph checkpointer API before attempting file-mode durable checkpointing."
    - "Record implementation status and remaining blockers in this spec."
  out_of_scope:
    - "Making Postgres mandatory."
    - "Deleting or auto-moving existing ./data."
    - "Rewriting all persistence to a new database."
    - "Normalizing historical local spec paths unless explicitly requested as documentation hygiene."
    - "Claiming Windows/Linux validation without CI or real OS execution."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/storage/JsonFileStore.ts"
      - "apps/server/src/infrastructure/adapters/JsonStorageAdapter.ts"
      - "apps/server/src/infrastructure/chat/FileChatMemoryStore.ts"
      - "apps/server/src/infrastructure/workspace/FileWorkspaceStore.ts"
      - "apps/server/src/infrastructure/preview/FileFrontendProjectRegistry.ts"
      - "apps/server/src/infrastructure/preview/FilePreviewSessionStore.ts"
      - "apps/server/src/infrastructure/repositories/FileCodeChangeSetRepository.ts"
      - "apps/server/src/infrastructure/repositories/FileWorkflowEventLogRepository.ts"
      - "apps/server/src/infrastructure/repositories/FileProjectConstructionRepository.ts"
      - "apps/server/src/infrastructure/project/ProjectConfigService.ts"
      - "apps/server/src/infrastructure/project/ProjectManifestService.ts"
    services:
      - "File-backed repositories"
      - "Runtime config"
      - "Workflow checkpointer"
  tests:
    unit:
      - "JsonFileStore atomic read/write tests"
      - "Representative file repository tests"
    integration:
      - "pnpm test"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This change sits under existing repository contracts and must not change API route behavior.
    It changes how file repositories write JSON, not what they return to consumers.

  depends_on:
    - name: "Zod schemas"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "schema.parse(value)"
      required_for: "Validate data before and after JSON writes."
      assumptions: []
      failure_modes:
        - "Invalid migrated/corrupt JSON throws clear error."
      fallback_or_recovery: "Do not silently overwrite invalid JSON."
      verification:
        - "Existing repository tests continue passing."

    - name: "Node fs rename semantics"
      type: "external_dependency"
      owner: "Node.js"
      direction: "this_spec_consumes_dependency"
      contract_used: "write temp file, rename over target"
      required_for: "Atomic-ish JSON replacement across supported OSes."
      assumptions:
        - "Rename-over-existing is acceptable for local files on supported platforms."
      failure_modes:
        - "Windows file handle locks can make rename fail."
      fallback_or_recovery: "Clean up temp file on failure and surface the error."
      verification:
        - "Unit tests for temp cleanup and successful replacement."

  depended_on_by:
    - name: "WorkflowOrchestrator and HTTP routes"
      type: "backend_service"
      owner: "domain/http"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Repository interfaces unchanged"
      compatibility_obligation: "must preserve all existing route/use-case behavior"
      expected_consumer_behavior: "No consumer needs to know about atomic file writes."
      migration_or_notification_required: false
      verification:
        - "pnpm test"

  data_flow:
    inbound:
      - source: "Repository save calls"
        payload_or_state: "validated domain objects"
        validation: "Zod parse before write"
    outbound:
      - target: "JSON files under HORUS_DATA_DIR"
        payload_or_state: "pretty JSON with trailing newline where existing code expects it"
        compatibility: "same data shape as before"

  integration_risks:
    - risk: "Changing write helpers breaks subtle repository formatting assumptions."
      severity: "medium"
      mitigation: "Keep JSON shape identical and preserve tests."
    - risk: "Durable file checkpoint implementation is attempted without verified LangGraph APIs."
      severity: "high"
      mitigation: "Inspect APIs first; if not clear, defer and document."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Do not change repository interfaces unless required."
    - "Keep file persistence implementation in infrastructure."
    - "Keep shared package free of Node fs dependencies."
  project_specific:
    - "File repositories must validate data before writing."
    - "Atomic helper must not hide parse errors."
    - "Do not auto-delete legacy ./data."
    - "Do not claim file-mode workflow checkpoint durability until tested."
```

## 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Use apply_patch for file edits."
    - "Read call sites before changing helper signatures."
    - "Preserve existing tests and add focused tests."
  backend:
    - "Use fs.mkdtemp-compatible temp filenames inside the target directory."
    - "Use randomUUID for temp filename uniqueness."
    - "Attempt temp cleanup on write failure."
    - "Use path.dirname and fs.mkdir recursive before writing."
```

## 9. Contracts and Invariants

```yaml
contracts:
  data_contracts:
    - name: "Atomic JSON file write"
      producer: "JsonFileStore"
      consumers:
        - "file-backed repositories"
      migration_required: false
      compatibility_notes: "Serialized JSON shape remains the same; only write mechanics change."
  domain_contracts:
    - name: "No silent legacy data migration"
      producer: "runtimeConfig/startup docs"
      consumers:
        - "local developers"
      invariant: "Legacy ./data is not deleted or moved without explicit user action."
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect LangGraph checkpoint API"
    agent: "repo_explorer"
    action: "Inspect installed @langchain/langgraph package exports and checkpointer types."
    expected_output: "Decision whether file durable checkpoint can be implemented safely now."
  - step: 2
    name: "Implement JsonFileStore"
    agent: "backend_specialist"
    action: "Add readJson, writeJsonAtomic, and optional text helpers."
    expected_output: "Reusable helper with tests."
  - step: 3
    name: "Apply helper to file stores"
    agent: "backend_specialist"
    action: "Replace direct JSON writes in high-risk file repositories."
    expected_output: "No behavior change, safer writes."
  - step: 4
    name: "Validate"
    agent: "qa_specialist"
    action: "Run build and relevant tests, then full test suite if feasible."
    expected_output: "Validation evidence."
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Representative file repositories still read old JSON shapes."
    - "New writes use temp-file plus rename."
    - "A write failure does not intentionally delete existing target data."
  quality:
    - "Focused JsonFileStore tests pass."
    - "pnpm build passes."
    - "pnpm test passes or any unrelated failure is documented."
  architectural:
    - "No API route contract changes."
    - "Checkpoint file-mode state is either safely implemented or explicitly deferred with evidence."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm build"
      cwd: "<repo-root>"
      purpose: "Verify TypeScript build."
      success_condition: "Exit code 0."
    - command: "node --test apps/server/test/jsonFileStore.test.mjs apps/server/test/*Store*.test.mjs"
      cwd: "<repo-root>"
      purpose: "Validate helper and file repositories."
      success_condition: "Exit code 0."
    - command: "pnpm test"
      cwd: "<repo-root>"
      purpose: "Regression suite."
      success_condition: "Exit code 0."
```

## 13. Risks and Unknowns

```yaml
risks:
  - risk: "LangGraph file checkpointer requires nontrivial custom implementation."
    severity: "high"
    mitigation: "Do not implement blindly; prefer explicit follow-up if APIs are unclear."
  - risk: "Atomic rename behavior differs on locked files on Windows."
    severity: "medium"
    mitigation: "Surface errors and avoid deleting existing file."
unknowns:
  - question: "Can installed LangGraph support a durable local file checkpointer without custom internals?"
    resolution_strategy: "inspect package exports/types before implementation"
```

## 14. Implementation Log

```yaml
implementation_log:
  completed:
    - "Added JsonFileStore with schema-backed reads and temp-file-plus-rename JSON writes."
    - "Moved workflow, workspace, chat, preview, frontend project, event log, code change set, project construction, project config, and project manifest JSON writes onto the atomic helper."
    - "Added legacy ./data fallback when HORUS_DATA_DIR is not set and .horus/data does not exist."
    - "Added FileMemorySaver for file-mode LangGraph checkpoints under HORUS_DATA_DIR/langgraph-checkpoints."
    - "Encoded MemorySaver byte payloads as base64 in checkpoint JSON and decoded them on startup reload."
  validation:
    - command: "pnpm --filter @u-build/server build"
      result: "passed"
    - command: "node --test apps/server/test/jsonFileStore.test.mjs apps/server/test/fileMemorySaver.test.mjs apps/server/test/runtimeConfig.test.mjs apps/server/test/frontendProjectRegistry.test.mjs apps/server/test/previewSessionStore.test.mjs apps/server/test/processBrowserPreviewAdapter.test.mjs"
      result: "passed, 17 tests"
    - command: "pnpm test"
      result: "passed, 168 tests"
  remaining_risks:
    - "Cross-OS validation was not executed on Windows/Linux runners in this environment."
    - "FileMemorySaver is an adapter around LangGraph MemorySaver internals; future LangGraph internal shape changes should be caught by fileMemorySaver.test.mjs."
```

## 15. Minimal Output Contract for Executing Agents

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
