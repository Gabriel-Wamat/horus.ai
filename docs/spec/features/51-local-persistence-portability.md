# SPEC 51: Local Persistence Portability

```yaml
format_version: "agentic_sdd.v1"
task_id: "51-local-persistence-portability"
title: "Make local persistence portable across macOS, Windows, and Linux"
created_at_utc: "2026-05-27T02:44:58Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
```

## 1. Original User Request

```yaml
raw_user_request: |
  use a skill de criar spec para criar um plano para ajustar todos esse pontos listados
```

Context from the immediately preceding request:

```yaml
preceding_user_request: |
  analise o projeto inteiro, identifique todos os problemas que envolvam persistência local e crie um plano para ajustar isso. esse projeto deve poder rodar em qualquer máquina, ele não deve depender desse computador e nem de nenhum sistema operacional, deve rodar em MacOS, Windows e linux
```

## 2. System Interpretation

```yaml
system_translation: |
  Create an implementation-ready Software Design Document for fixing all local persistence and portability issues identified in docs/local-persistence-plan.md.
  The implementation must make Horus.AI's default local/file mode portable across macOS, Windows, and Linux, while preserving the existing optional Postgres persistence mode.

expected_user_visible_result: |
  A developer can clone the repo on macOS, Windows, or Linux, configure documented environment variables, run the app, and have all local Horus state written under a predictable portable data directory.
  Restarting the server must not leave stale preview sessions presented as controllable, and file-mode workflow recovery behavior must be explicit and tested.

expected_engineering_result: |
  File-backed persistence is rooted under a single runtime config.
  Machine-specific absolute paths are removed or migrated.
  JSON persistence becomes safer.
  Preview runtime state is separated from durable state.
  File-mode workflow checkpoint behavior is made durable or explicitly recoverable.
  Tests and docs prove the cross-platform contract.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "The project currently risks depending on this checkout, this machine, or OS-specific behavior through local persistence and runtime paths."
  target_user: "Developers running Horus.AI locally on macOS, Windows, or Linux."
  expected_outcome: "Fresh clones and moved checkouts remain usable with predictable local state and no hidden dependency on /<USER_HOME>/wamat or process cwd."
  product_surface:
    - "Local development startup"
    - "Workflow execution and resume"
    - "Workspace/user story/spec persistence"
    - "Chat memory"
    - "Preview sessions"
    - "Project construction workspaces"
    - "Agent skill metadata"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "Node.js >=20"
      - "Express"
      - "TypeScript ESM"
      - "LangGraph"
    frontend:
      - "React"
      - "Vite"
    database:
      - "File-backed JSON repositories"
      - "Optional Postgres repositories"
      - "Postgres migrations in apps/server/src/infrastructure/database/migrations"
    infrastructure:
      - "pnpm workspace"
      - "Turbo"
      - "local dev servers"
  known_entrypoints:
    - "apps/server/src/main.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/infrastructure/repositories/createRepositories.ts"
    - "apps/web/vite.config.ts"
  known_existing_patterns:
    - "Repository interfaces in apps/server/src/infrastructure/repositories/contracts.ts"
    - "createApp() accepts injected repositories and env for tests"
    - "Postgres mode is selected with PERSISTENCE_DRIVER=postgres"
    - "File mode is the default persistence driver"
    - "Preview commands are moving toward commandCatalog but still keep legacy devCommand"
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Introduce a centralized runtime config for local persistence paths."
    - "Wire all file-backed repositories to paths under HORUS_DATA_DIR."
    - "Move generated project workspace defaults under HORUS_DATA_DIR."
    - "Remove machine-specific repository_root values from local skill metadata."
    - "Migrate built-in frontend project root storage away from checkout-specific absolute paths."
    - "Make preview processId/runtime evidence explicitly ephemeral and normalize stale sessions after restart."
    - "Replace or supplement MemorySaver in file mode so human-in-the-loop workflow resume is durable, or implement an explicit recoverable/unrecoverable file-mode contract with tests."
    - "Add an atomic JSON helper and apply it to file-backed stores that write shared JSON collections or manifests."
    - "Document file-mode and Postgres-mode startup contracts."
    - "Add tests proving portability, path configuration, migration behavior, and restart behavior."
  out_of_scope:
    - "Removing Postgres support."
    - "Replacing every file-backed repository with Postgres."
    - "Changing the product workflow semantics beyond persistence/recovery requirements."
    - "Broad UI redesign."
    - "Changing LLM provider behavior."
    - "Changing generated frontend agent prompts except to remove machine-specific path metadata."
    - "Destructive migration of existing local data without backup or compatibility path."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/repositories/createRepositories.ts"
      - "apps/server/src/infrastructure/adapters/JsonStorageAdapter.ts"
      - "apps/server/src/infrastructure/workspace/FileWorkspaceStore.ts"
      - "apps/server/src/infrastructure/chat/FileChatMemoryStore.ts"
      - "apps/server/src/infrastructure/preview/FileFrontendProjectRegistry.ts"
      - "apps/server/src/infrastructure/preview/FilePreviewSessionStore.ts"
      - "apps/server/src/infrastructure/preview/SeedFrontendProject.ts"
      - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
      - "apps/server/src/infrastructure/preview/ProcessBrowserPreviewAdapter.ts"
      - "apps/server/src/infrastructure/preview/PreviewCommandResolver.ts"
      - "apps/server/src/infrastructure/repositories/FileCodeChangeSetRepository.ts"
      - "apps/server/src/infrastructure/repositories/FileWorkflowEventLogRepository.ts"
      - "apps/server/src/infrastructure/repositories/FileProjectConstructionRepository.ts"
      - "apps/server/src/infrastructure/project/ProjectWorkspaceService.ts"
      - "apps/server/src/infrastructure/langgraph/checkpointer.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/main.ts"
    services:
      - "Repository creation"
      - "File persistence stores"
      - "Workflow graph checkpointer"
      - "Preview runtime manager"
      - "Project workspace service"
    database:
      migrations_required: true
      tables:
        - "No migration required for file-mode root config."
        - "Postgres migrations only if preview/process metadata schema changes."
  frontend:
    files:
      - "apps/web/vite.config.ts"
      - "apps/web/src/components/PreviewProjectPanel.tsx"
      - "apps/web/src/app/useProjectConstructionAction.ts"
    components:
      - "Preview project display"
      - "Project construction status display"
    routes:
      - "Existing frontend routes only; no new route required unless exposing settings/status."
  workflow:
    graph_nodes:
      - "hitlCheckpoint"
      - "retryCheckpoint"
      - "specAgent"
      - "odinAgent"
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
    agents:
      - "Spec Agent"
      - "Front Agent"
      - "QA Agent"
      - "Curator Agent"
  tests:
    unit:
      - "runtime config path resolution"
      - "file repository root injection"
      - "frontend project root migration"
      - "preview command migration"
      - "JSON atomic writer"
    integration:
      - "createApp with temporary HORUS_DATA_DIR"
      - "file-mode workflow resume/recovery after app recreation"
      - "preview stale session normalization after app recreation"
      - "generated project workspace under HORUS_DATA_DIR"
    e2e:
      - "local file-mode smoke run on clean data dir"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This change sits below almost every Horus workflow because local file persistence stores workflow state, workspace artifacts, chat memory, preview session data, code change sets, workflow event logs, and project construction records.
    The implementation must preserve public repository contracts while changing construction/configuration and persisted path representation.

  depends_on:
    - name: "createRepositories"
      type: "backend_service"
      owner: "infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "createRepositories(env) returns PersistenceRepositories"
      required_for: "Central place to construct file and Postgres persistence."
      assumptions:
        - "Can extend signature to createRepositories(env, config) or load config inside function."
      failure_modes:
        - "Partial path injection leaves some state under ./data."
      fallback_or_recovery: "Add tests that assert all file repositories use configured roots."
      verification:
        - "Unit test with temporary HORUS_DATA_DIR and repository write checks."

    - name: "LangGraph checkpointer"
      type: "external_dependency"
      owner: "LangGraph"
      direction: "this_spec_consumes_dependency"
      contract_used: "BaseCheckpointSaver used by createWorkflowGraph"
      required_for: "Durable HITL workflow resume in file and Postgres modes."
      assumptions:
        - "PostgresSaver remains available and already wired for Postgres mode."
        - "File-mode durable checkpointer may require a custom saver or a conservative recovery contract."
      failure_modes:
        - "Workflow JSON exists but graph checkpoint is gone after restart."
      fallback_or_recovery: "If durable file saver is not feasible, persist explicit unrecoverable/recoverable state with actionable API response."
      verification:
        - "Integration test recreates app after HITL interrupt and attempts resume."

    - name: "FrontendProjectSchema"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "Preview project rootPath, devCommand, previewCommandId, commandCatalog"
      required_for: "Portable project registry and preview startup."
      assumptions:
        - "Schema can be extended with rootPathKind without breaking existing persisted values."
      failure_modes:
        - "Old absolute root paths break after moving checkout."
      fallback_or_recovery: "Migration converts internal absolute paths to repo-relative values."
      verification:
        - "Schema and registry tests with old and new project records."

    - name: "ProjectWorkspaceService"
      type: "backend_service"
      owner: "infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "HORUS_PROJECT_WORKSPACE_ROOT and HORUS_PROJECT_RUN_WORKSPACE_ROOT defaults"
      required_for: "Generated project files must live under configured local data root unless explicitly external."
      assumptions:
        - "Managed generated workspaces can be relocated under HORUS_DATA_DIR without product behavior change."
      failure_modes:
        - "Generated projects continue writing to cwd-relative data/."
      fallback_or_recovery: "Allow explicit env override while defaulting under HORUS_DATA_DIR."
      verification:
        - "Project construction integration test asserts rootPath starts with temp HORUS_DATA_DIR."

  depended_on_by:
    - name: "WorkflowOrchestrator"
      type: "backend_service"
      owner: "domain/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "IStorageProvider, WorkflowEventLogRepository, CodeChangeSetRepository, checkpointer"
      compatibility_obligation: "must preserve existing workflow start/status/resume APIs"
      expected_consumer_behavior: "Uses injected repositories and graph without knowing physical storage paths."
      migration_or_notification_required: false
      verification:
        - "Existing workflow tests pass."
        - "New restart/recovery tests pass."

    - name: "HTTP routers"
      type: "api"
      owner: "infrastructure/http"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Existing /api/workflow, /api/workspace, /api/chat, /api/preview, /api/project-construction routes"
      compatibility_obligation: "must preserve request/response shapes unless adding optional fields"
      expected_consumer_behavior: "Routes continue using use cases backed by configured repositories."
      migration_or_notification_required: false
      verification:
        - "Route tests and typecheck pass."

    - name: "React frontend"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Preview project/session and project construction API responses"
      compatibility_obligation: "may extend fields; must not remove fields without migration"
      expected_consumer_behavior: "Displays project paths and preview status without assuming stale processId means controllable runtime."
      migration_or_notification_required: false
      verification:
        - "Frontend typecheck and targeted component tests pass."

    - name: "Agent skill loader"
      type: "agent"
      owner: "infrastructure/agentSkills"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Project-local SKILL.md metadata and prompt-visible context"
      compatibility_obligation: "must not expose machine-specific /<USER_HOME>/wamat path"
      expected_consumer_behavior: "Skills rely on runtime cwd/repo root, not a hardcoded local path."
      migration_or_notification_required: false
      verification:
        - "rg '/<USER_HOME>/wamat|repository_root: \"/Users' skills apps packages returns no project-local hits."

  bidirectional_integrations:
    - name: "Preview session runtime"
      participants:
        - "PreviewRuntimeManager"
        - "PreviewSessionRepository"
        - "ProcessBrowserPreviewAdapter"
        - "apps/web preview UI"
      shared_contract: "PreviewSession status, previewUrl, processId, runtime evidence, timeline events"
      consistency_rule: "Durable session state must not imply the current server owns an OS process unless the adapter has that process in memory."
      verification:
        - "Server restart normalizes stale running sessions and emits/records a recovery event."

    - name: "Project construction workspace"
      participants:
        - "StartProjectConstructionUseCase"
        - "ProjectWorkspaceService"
        - "FrontendProjectRepository"
        - "ProjectFileBrowserService"
      shared_contract: "ProjectWorkspace.rootPath, run workspace path, project manifest/config"
      consistency_rule: "Managed workspace paths must be either data-root-relative or safely resolved under configured roots; external repositories must be marked external."
      verification:
        - "Project construction smoke test creates and browses a managed workspace under temporary HORUS_DATA_DIR."

  data_flow:
    inbound:
      - source: "Environment"
        payload_or_state: "PERSISTENCE_DRIVER, HORUS_DATA_DIR, DATABASE_URL, CORS_ORIGIN, HORUS_WEB_PREVIEW_*, HORUS_PROJECT_*"
        validation: "runtimeConfig parser validates non-empty values and resolves paths"
      - source: "User workflow/API requests"
        payload_or_state: "workspace folders, stories, specs, chat messages, preview session commands"
        validation: "zod schemas in packages/shared and repository validation"
    outbound:
      - target: "File system"
        payload_or_state: "JSON state and generated project files under HORUS_DATA_DIR"
        compatibility: "atomic writes and migrations must preserve existing local data"
      - target: "Postgres"
        payload_or_state: "Existing repository rows and LangGraph checkpoints"
        compatibility: "Postgres mode remains supported and documented"
      - target: "Frontend"
        payload_or_state: "API responses with project/session/workflow state"
        compatibility: "existing fields preserved; new fields optional"

  sequencing_dependencies:
    - dependency: "Runtime config before store rewiring"
      reason: "All file repositories need one source of truth for paths."
      validation: "Unit tests for config and createRepositories."
    - dependency: "Atomic JSON helper before migrations"
      reason: "Migrations should not risk corrupting existing local state."
      validation: "Corruption and backup tests."
    - dependency: "Schema extension before registry migration"
      reason: "New rootPath representation must be parseable before persisted values change."
      validation: "Shared schema tests."

  integration_risks:
    - risk: "Partial migration leaves some state in ./data and some in .horus/data."
      severity: "high"
      mitigation: "Add exhaustive test that writes one record through each file repository and asserts all files are under HORUS_DATA_DIR."
    - risk: "Workflow resume claims durability but checkpoint is missing."
      severity: "critical"
      mitigation: "Restart/resume integration test and explicit API error states."
    - risk: "Changing project root representation breaks existing preview/project browser consumers."
      severity: "high"
      mitigation: "Compatibility migration and optional fields; keep resolved absolute path available at runtime only."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository interfaces before introducing new abstractions."
    - "Preserve application/domain/infrastructure boundaries."
    - "Prefer dependency injection over direct construction of concrete stores."
    - "Do not introduce circular dependencies between packages/shared and apps/server."
    - "Do not duplicate path resolution rules across stores."
    - "Do not make Postgres mandatory for local development."
  project_specific:
    - "File-mode persistence must be rooted under HORUS_DATA_DIR."
    - "Postgres-mode persistence must keep using existing Postgres repositories and PostgresSaver."
    - "Runtime-only absolute paths may exist in memory, but built-in persisted records must not store checkout-specific absolute paths."
    - "Agent skill files must not include machine-specific repository_root values."
    - "Preview process ownership is runtime state, not durable business state."
    - "Generated project roots managed by Horus must default under HORUS_DATA_DIR."
```

## 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Use Node path APIs only; never concatenate path separators manually."
    - "Use fileURLToPath/URL only for locating repository source files, not local user data."
    - "Use schemas for persisted shape changes."
    - "Add migrations for persisted shape changes."
    - "Avoid silent fallback from configured paths to ./data."
  backend:
    - "Keep createApp repository injection working for tests."
    - "Keep createRepositories as the production composition root for persistence."
    - "Validate env config once and pass typed config downward."
    - "Use atomic writes for shared JSON collection files."
    - "Do not use shell=true for preview commands."
  frontend:
    - "Do not assume rootPath is always absolute."
    - "Display machine-local/external path warnings only if backend marks a project external."
    - "Do not use processId as proof that a preview session is controllable."
  tests:
    - "Add regression tests before or with each migration."
    - "Use mkdtemp(tmpdir()) for path tests."
    - "Use path assertions that work on Windows, macOS, and Linux."
```

## 9. Contracts and Invariants

```yaml
contracts:
  api_contracts:
    - name: "Persistence driver config"
      producer: "runtimeConfig/createRepositories"
      consumers:
        - "createApp"
        - "server startup"
      request_shape: "env with PERSISTENCE_DRIVER=file|postgres and optional HORUS_DATA_DIR"
      response_shape: "typed persistence config and PersistenceRepositories"
      compatibility: "must preserve existing PERSISTENCE_DRIVER=postgres behavior"

    - name: "Preview project contract"
      producer: "FrontendProjectRepository"
      consumers:
        - "PreviewRuntimeManager"
        - "ReadOnlyCodeContextService"
        - "frontend preview UI"
      request_shape: "FrontendProject"
      response_shape: "FrontendProject extended only with optional root path metadata"
      compatibility: "can extend, must not remove rootPath until all consumers migrate"

  domain_contracts:
    - name: "Single local data root"
      producer: "runtimeConfig"
      consumers:
        - "all file repositories"
        - "ProjectWorkspaceService"
      invariant: "All Horus-managed local state is stored under HORUS_DATA_DIR unless explicitly marked external."

    - name: "Durable workflow resume"
      producer: "Workflow checkpointer"
      consumers:
        - "WorkflowOrchestrator"
        - "ResumeWorkflowUseCase"
      invariant: "If API reports a workflow as resumable, the graph checkpoint needed for resume must exist."

    - name: "Preview process ephemerality"
      producer: "PreviewRuntimeManager"
      consumers:
        - "PreviewSessionRepository"
        - "frontend preview UI"
      invariant: "Persisted processId must never be treated as proof of current process ownership after server restart."

  ui_contracts:
    - name: "Preview status"
      producer: "preview API"
      consumers:
        - "Preview UI"
      requirement: "Stale running sessions are shown as stopped/recoverable/unknown with an actionable restart option."

  data_contracts:
    - name: "File repository JSON"
      producer: "file-backed repositories"
      consumers:
        - "same repository on later process runs"
        - "migration code"
      migration_required: true
      compatibility_notes: "Existing ./data records must be readable or migratable with backup."

    - name: "Project-local skill metadata"
      producer: "skills/agents/*/SKILL.md"
      consumers:
        - "loadAgentSkill"
        - "agent prompts"
      migration_required: false
      compatibility_notes: "Replace machine-specific path with placeholder or remove field."
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Confirm current persistence map"
    agent: "repo_explorer"
    action: "Read all file-backed repositories, createRepositories, checkpointer, preview manager, project workspace service, shared schemas, and tests."
    expected_output: "Updated map of stores, paths, schemas, consumers, and existing tests."

  - step: 2
    name: "Introduce runtime config"
    agent: "backend_specialist"
    action: "Add runtimeConfig module that resolves PERSISTENCE_DRIVER, HORUS_DATA_DIR, repositoryRoot, Postgres settings, preview settings, and project workspace roots."
    expected_output: "Typed config module plus unit tests for default and overridden paths."

  - step: 3
    name: "Wire file repositories to HORUS_DATA_DIR"
    agent: "backend_specialist"
    action: "Update createRepositories file mode to pass explicit subdirectories to every file-backed repository."
    expected_output: "No production file repository uses implicit ./data defaults through createRepositories."

  - step: 4
    name: "Move generated project roots under data root"
    agent: "backend_specialist"
    action: "Update ProjectWorkspaceService defaults so managed project-workspaces and project-run-worktrees resolve under HORUS_DATA_DIR unless explicitly overridden."
    expected_output: "Generated workspaces are created under configured data root in tests."

  - step: 5
    name: "Remove machine-specific skill metadata"
    agent: "backend_specialist"
    action: "Replace or remove repository_root values containing /<USER_HOME>/wamat from project-local skill files."
    expected_output: "No project-local skill contains this machine path."

  - step: 6
    name: "Add portable project root representation"
    agent: "backend_specialist"
    action: "Extend shared preview/project schemas and repositories to support repo-relative roots for built-in projects while preserving old absolute records."
    expected_output: "Migration-capable registry and tests for moved checkout."

  - step: 7
    name: "Normalize preview runtime after restart"
    agent: "backend_specialist"
    action: "Add startup or repository recovery step that clears processId and marks stale running/starting/applying/inspecting sessions as stopped or unknown."
    expected_output: "Preview sessions no longer falsely claim current process ownership after server recreation."

  - step: 8
    name: "Make file-mode workflow checkpoint behavior durable or explicit"
    agent: "backend_specialist"
    action: "Implement durable file checkpointer or explicit recoverability state and API errors for file mode."
    expected_output: "Restart/resume tests define and prove the file-mode behavior."

  - step: 9
    name: "Add atomic JSON store helper"
    agent: "backend_specialist"
    action: "Create shared file JSON helper and migrate high-risk shared collection stores first."
    expected_output: "Atomic writes for collection-style JSON files and manifests."

  - step: 10
    name: "Documentation and env examples"
    agent: "technical_writer"
    action: "Document file mode, Postgres mode, HORUS_DATA_DIR, generated project paths, backup/migration, and cross-platform startup."
    expected_output: "README/.env.example/local persistence docs updated."

  - step: 11
    name: "Validate"
    agent: "qa_specialist"
    action: "Run typecheck, tests, and targeted smoke checks with temporary HORUS_DATA_DIR."
    expected_output: "Validation evidence with commands, exit codes, and any remaining risks."
```

## 11. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm path model, migration strategy, checkpoint strategy, and compatibility boundaries."
    inputs:
      - "This SPEC"
      - "docs/local-persistence-plan.md"
      - "repository persistence files"
    outputs:
      - "approved architecture notes"

  - agent_name: "backend_specialist"
    responsibility: "Implement runtime config, repository wiring, migrations, checkpoint/recovery behavior, and JSON helper."
    inputs:
      - "affected backend files"
      - "contracts and invariants"
    outputs:
      - "backend diff"
      - "unit/integration tests"

  - agent_name: "frontend_specialist"
    responsibility: "Adjust UI only where path metadata or stale preview status changes require display behavior."
    inputs:
      - "preview/project API changes"
    outputs:
      - "minimal frontend diff"
      - "typecheck/tests"

  - agent_name: "qa_specialist"
    responsibility: "Validate cross-platform path assumptions and restart behavior."
    inputs:
      - "diff"
      - "acceptance criteria"
    outputs:
      - "test report"
      - "remaining risks"
```

## 12. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "With PERSISTENCE_DRIVER=file and HORUS_DATA_DIR set to a temp directory, all Horus-managed local persistence is written under that directory."
    - "With no HORUS_DATA_DIR, development defaults to a repo-local .horus/data path, not cwd-dependent ./data."
    - "No project-local skill metadata contains /<USER_HOME>/wamat or another developer-specific path."
    - "Built-in frontend project records remain valid after moving the repository checkout."
    - "Server restart does not leave preview sessions falsely marked as controllable by current process."
    - "File-mode workflow resume behavior after restart is durable or explicitly reported as unrecoverable with actionable detail."
  integration:
    - "Existing APIs keep backward-compatible response shapes or add optional fields only."
    - "Postgres mode still runs migrations and uses Postgres repositories/checkpointer."
    - "Preview commandCatalog remains authoritative while devCommand compatibility is preserved during migration."
  architectural:
    - "Path resolution is centralized in runtime config."
    - "File repositories do not independently decide production storage roots."
    - "Runtime-only absolute paths are not persisted for built-in repo-managed projects."
  quality:
    - "pnpm build passes."
    - "node --test packages/shared/test/*.test.mjs apps/server/test/*.test.mjs passes or failures are documented with cause."
    - "Relevant new tests cover temp HORUS_DATA_DIR, project root migration, preview restart normalization, and workflow checkpoint behavior."
  observability:
    - "Server startup logs resolved persistence driver and data dir without secrets."
    - "Recovery/migration actions are logged or recorded in event timelines where user-visible."
```

## 13. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Verify TypeScript build across workspace."
      success_condition: "Exit code 0."
    - command: "node --test packages/shared/test/*.test.mjs apps/server/test/*.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Run shared and backend regression tests."
      success_condition: "Exit code 0 or documented unrelated pre-existing failures."
    - command: "rg -n '/<USER_HOME>/wamat|repository_root: \"/Users' skills apps packages"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Prove machine-specific paths were removed from project-controlled files."
      success_condition: "No project-local matches except docs describing the removed issue, if intentionally kept."
    - command: "rg -n 'constructor\\(.*= \"\\./data|data/project-workspaces|data/project-run-worktrees' apps/server/src"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Detect remaining production defaults that bypass HORUS_DATA_DIR."
      success_condition: "No production construction path bypasses runtimeConfig; test fixtures may remain."

  runtime_checks:
    - name: "File-mode temp data dir smoke"
      method: "test or script"
      expected: "Create app with temp HORUS_DATA_DIR, perform workspace/chat/preview/project-construction actions, assert all generated files are under temp dir."
    - name: "Preview restart recovery"
      method: "integration test"
      expected: "Persist running session, recreate app/runtime, session is normalized and processId cleared."
    - name: "Workflow HITL restart behavior"
      method: "integration test"
      expected: "After app recreation, resume either succeeds with durable checkpoint or fails with explicit recoverability error matching documented behavior."

  integration_checks:
    - name: "Postgres mode contract"
      surfaces:
        - "createRepositories"
        - "createWorkflowCheckpointer"
      method: "unit/integration test with mocked or test pool where available"
      expected: "Postgres path still constructs Postgres repositories and PostgresSaver."
    - name: "Frontend project path migration"
      surfaces:
        - "FileFrontendProjectRegistry"
        - "FrontendProjectSchema"
      method: "unit test"
      expected: "Old absolute internal root converts to repo-relative or resolves correctly under a new fake repo root."

  manual_checks:
    - "Review README/.env.example for file and Postgres startup clarity."
    - "Review final git diff for unrelated refactors."
```

## 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent file repositories; search for existing File*Repository and store classes."
    - "Do not assume LangGraph has a file checkpointer without verifying package APIs."
    - "Do not claim Windows compatibility without avoiding POSIX-only assumptions or marking them tested/abstracted."
  read_before_write:
    - "Read createRepositories and every target repository before editing."
    - "Read shared schemas before changing persisted shapes."
    - "Find all rootPath/devCommand/processId consumers before changing those fields."
  failure_handling:
    - "If path tests fail on separator assumptions, rewrite assertions with path.relative/path.resolve."
    - "If durable file checkpointer is blocked, implement explicit recoverability contract and document the limitation."
    - "If migrations encounter corrupt JSON, back up and surface actionable errors instead of dropping data."
  state_consistency:
    - "Do not update only file mode or only Postgres mode when shared schemas change."
    - "Do not change producer schema without updating consumers and tests."
    - "Do not persist runtime-only process ownership after restart."
  scope_control:
    - "Do not redesign the app."
    - "Do not replace repository architecture."
    - "Do not clean unrelated dirty files."
```

## 15. Recovery and Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary dev server startup timeout"
    - "file lock contention during atomic write"
    - "test order dependency caused by shared temp path"
  non_retryable_failures:
    - "invalid HORUS_DATA_DIR path points to a file"
    - "DATABASE_URL missing when PERSISTENCE_DRIVER=postgres"
    - "corrupt persisted JSON without backup"
    - "workflow checkpoint missing when API promised resumability"
  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only files changed by this task if needed."
    - "Before any data migration, write backup files or provide dry-run tests."
  escalation_rules:
    - "Ask before deleting or rewriting real local data."
    - "Escalate if a breaking schema migration is unavoidable."
    - "Escalate if durable file-mode workflow resume requires an external dependency not already acceptable."
```

## 16. Observability Requirements

```yaml
observability:
  logs:
    - event: "server_startup_persistence_config"
      fields:
        - "persistence_driver"
        - "data_dir"
        - "repository_root"
    - event: "local_data_migration"
      fields:
        - "migration_name"
        - "source_path"
        - "target_path"
        - "status"
        - "error_type"
    - event: "preview_session_recovered_after_restart"
      fields:
        - "session_id"
        - "previous_status"
        - "next_status"
        - "cleared_process_id"
    - event: "workflow_resume_recovery"
      fields:
        - "thread_id"
        - "checkpoint_found"
        - "status"
        - "error_type"
  audit_trail:
    required: true
    must_capture:
      - "files read"
      - "files changed"
      - "commands executed"
      - "test results"
      - "migration decisions"
  user_visible_failures:
    - "Show when a preview session must be restarted after server restart."
    - "Show when a workflow cannot resume because a file-mode checkpoint is missing."
    - "Show invalid data directory configuration with the exact env var to fix."
```

## 17. Risks and Unknowns

```yaml
risks:
  - risk: "File-mode durable LangGraph checkpoint may not have an off-the-shelf implementation."
    severity: "high"
    mitigation: "Inspect LangGraph checkpointer APIs; implement custom saver only if bounded, otherwise add explicit recoverability contract."
  - risk: "Existing local data under ./data may be orphaned after switching default to .horus/data."
    severity: "medium"
    mitigation: "Document migration and optionally auto-detect legacy ./data with clear log."
  - risk: "Repo-relative root migration can break external existing repositories."
    severity: "high"
    mitigation: "Only convert paths inside repository root; mark external absolute paths explicitly."
  - risk: "Atomic write rename behavior differs on Windows when destination is open."
    severity: "medium"
    mitigation: "Use conservative write-temp-then-rename pattern and test on Windows-compatible assumptions."
  - risk: "Postgres and file modes drift after schema changes."
    severity: "high"
    mitigation: "Shared schema tests plus repository contract tests for both modes."

unknowns:
  - question: "Which LangGraph file-checkpoint APIs are available in the installed dependency versions?"
    resolution_strategy: "inspect package docs/types in node_modules or official docs before implementing Phase 4"
  - question: "Should old ./data be auto-migrated or only documented?"
    resolution_strategy: "infer conservatively: read old data if present and log warning; ask before destructive moves"
  - question: "Do generated project workspaces need to be user-visible outside HORUS_DATA_DIR?"
    resolution_strategy: "inspect current UI/workflows; default managed workspaces under data root but allow explicit override"
```

## 18. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Start with runtimeConfig and repository path injection. This is the highest-leverage change because it gives every later migration a stable root.
    Then remove machine-specific skill paths and path persistence issues.
    Only after path ownership is centralized should the implementation touch JSON atomicity and file-mode checkpoint durability.

  alternatives_considered:
    - option: "Require Postgres for all persistence"
      tradeoff: "Would solve durability but violates the requirement that the project run easily on any machine without extra database setup."
    - option: "Keep ./data and only document cwd requirements"
      tradeoff: "Too fragile for services, Docker, moved checkouts, and packaged execution."
    - option: "Persist all project roots as absolute paths"
      tradeoff: "Works on one machine but fails the portability requirement."

  migration_notes:
    - "Existing ./data must not be deleted automatically."
    - "Internal absolute frontend project roots can be converted to repo-relative when they are inside the current repository root."
    - "External absolute roots must be preserved and marked machine-local."
    - "Legacy devCommand must remain readable until commandCatalog migration is complete."

  backward_compatibility:
    required: true
    notes:
      - "Existing route contracts should keep working."
      - "Existing file-mode JSON should be readable or produce clear migration errors."
      - "Existing Postgres deployments should keep working with PERSISTENCE_DRIVER=postgres."
```

## 19. Deliverables

```yaml
deliverables:
  code:
    - "runtime config module"
    - "updated createRepositories wiring"
    - "file repository path injection"
    - "project workspace root config"
    - "frontend project root migration"
    - "preview stale-session recovery"
    - "file-mode checkpoint recovery/durability implementation"
    - "atomic JSON helper and store migrations"
  tests:
    - "runtimeConfig tests"
    - "file repository configured-root tests"
    - "frontend project registry migration tests"
    - "preview restart recovery tests"
    - "workflow HITL restart/resume tests"
    - "JSON atomic writer tests"
    - "project construction data-root tests"
  docs:
    - "README or docs section for file mode"
    - ".env.example"
    - "Postgres mode setup notes"
    - "local data migration notes"
  validation_evidence:
    - "build output"
    - "test output"
    - "rg output proving no machine-specific paths"
    - "temp HORUS_DATA_DIR smoke evidence"
```

## 20. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Relevant file repositories were read."
    - "Postgres repositories and migrations were checked for compatibility."
    - "Preview and project construction consumers were mapped."
    - "Workflow checkpoint behavior was verified in code and tests."
  implementation:
    - "All file-mode stores use HORUS_DATA_DIR-derived paths."
    - "No production path defaults bypass runtimeConfig."
    - "Machine-specific skill paths are removed."
    - "Repo-managed project roots are portable."
    - "Preview process ownership is treated as ephemeral."
    - "File-mode workflow recovery is durable or explicitly contracted."
    - "Atomic JSON helper is used by high-risk stores."
  validation:
    - "Relevant tests were run."
    - "Build/typecheck was run."
    - "Searches for machine-specific paths and ./data defaults were run."
    - "Temp HORUS_DATA_DIR smoke validation was run."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

## Minimal Output Contract for Executing Agents

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

## Implementation Log

### 2026-05-27 - Initial portability implementation

- Added `apps/server/src/infrastructure/config/runtimeConfig.ts` with `HORUS_DATA_DIR`, repository root, persistence driver, and derived file-mode storage paths.
- Wired file-mode `createRepositories()` to inject configured paths into workflow state, workspace, chat memory, frontend projects, preview sessions, code change sets, workflow events, and project construction repositories.
- Moved generated project workspace defaults under the configured data root via `ProjectWorkspaceService`.
- Added `.horus/` to `.gitignore` and documented `HORUS_DATA_DIR`, `HORUS_PROJECT_WORKSPACE_ROOT`, and `HORUS_PROJECT_RUN_WORKSPACE_ROOT` in `.env.example`.
- Added startup logging for persistence driver, data dir, and repository root without secrets.
- Made file-backed frontend project registry persist repo-internal project roots as repo-relative paths while returning canonical absolute paths at runtime.
- Added preview-session recovery after server restart: stale `starting`, `running`, `inspecting`, and `applying` sessions are marked stopped, `processId` is cleared, and a `preview_recovered_after_restart` event is recorded.
- Added `listSessions()` to preview session repositories for file and Postgres implementations.
- Removed machine-specific `repository_root: "<REPOSITORY_ROOT>"` metadata from active project skills.
- Clarified workflow resume failure messaging for missing active checkpointer state, including file-mode and Postgres-mode behavior.
- Added tests for runtime config, repo-relative project persistence, preview session listing, and stale preview recovery.

Validation:

- `pnpm --filter @u-build/server type-check`: passed.
- `pnpm build`: passed.
- Focused preview/runtime persistence tests: passed, 23 tests.
- `pnpm test`: passed, 163 tests.

Remaining implementation risk:

- File-mode LangGraph checkpointing still uses `MemorySaver`; the current implementation makes the failure explicit and keeps Postgres as the durable checkpoint path. A custom durable file checkpointer remains a future phase if full restart-safe HITL resume is required without Postgres.
- JSON writes are still direct in several file stores. The data-root portability work is complete, but the atomic JSON helper/migration phase remains separate work.
