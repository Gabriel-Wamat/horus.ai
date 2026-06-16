# SPEC 30 - Postgres Persistence and Repository Layer

```yaml
format_version: "agentic_sdd.v1"
task_id: "30-postgres-persistence-repositories"
title: "Postgres persistence and repository layer"
created_at_utc: "2026-05-26T16:48:55Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
```

## 1. Original User Request

```yaml
raw_user_request: |
  tá na hora de criar o banco de dados postegres, já passamos da hora na verdade. faça todo o desenho dele e crie. baixe as dependências que precisar, cria uma pasta de repository. deixe tudo estritamente amarrado. crie uma spec para essa tarefa, mapeie todas as entendidades, relacionamentos, atributos, contratos, regras de negócios, cardinalidade, unicidade, integridade
```

## 2. System Interpretation

```yaml
system_translation: |
  Introduce PostgreSQL as the canonical persistence foundation for Horus without
  breaking the current file-backed behavior. Design and implement the database
  schema, repository contracts, repository folder, connection/migration
  infrastructure, env wiring, and validation tests.

expected_user_visible_result: |
  The app can be configured to use Postgres-backed repositories through env
  without losing the current user story, spec, chat, workflow, or preview
  contracts.

expected_engineering_result: |
  A versioned SQL schema exists, database dependencies are installed, repository
  interfaces and Postgres implementations are created under a repository folder,
  and server composition can select file or Postgres persistence by env.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "File persistence is no longer enough for isolated, versioned, agent-consumable workspace data."
  target_user: "Horus users creating user stories, specs, preview chats, and agent execution workflows."
  expected_outcome: "Durable, queryable, relational persistence with strict integrity."
  product_surface:
    - "UserStories screen"
    - "Spec generation workflow"
    - "Preview chat and Horus/Odin executor"
    - "Workflow status and artifacts"
    - "Preview runtime sessions"

technical_context:
  repository_root: "<repo-root>"
  relevant_stack:
    backend:
      - "Node.js ESM"
      - "Express"
      - "TypeScript"
      - "Zod shared schemas"
      - "LangGraph"
    frontend:
      - "React/Vite"
    database:
      - "PostgreSQL"
      - "node-postgres pg"
      - "raw SQL migrations"
    infrastructure:
      - "dotenv env configuration"
  known_entrypoints:
    - "apps/server/src/main.ts"
    - "apps/server/src/infrastructure/http/server.ts"
  known_existing_patterns:
    - "Application/usecase layer receives persistence dependencies by constructor."
    - "Infrastructure layer owns concrete adapters."
    - "Shared Zod entities are the API/domain contract."
    - "Current file stores preserve artifact revision history."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Install Postgres client dependencies."
    - "Create SQL migrations for all currently persisted entities."
    - "Create repository folder and repository interfaces."
    - "Implement Postgres repositories for workspace artifacts, chat memory, workflow snapshots, frontend projects, and preview sessions."
    - "Add database connection, transaction, and migration runner utilities."
    - "Wire server composition to choose file or Postgres persistence via env."
    - "Keep file stores available as fallback/default unless DB env explicitly enables Postgres."
    - "Add validation tests for schema SQL and repository selection."
  out_of_scope:
    - "Do not remove file stores in this task."
    - "Do not build a migration importer from existing JSON files unless explicitly requested later."
    - "Do not change frontend contracts."
    - "Do not change agent behavior beyond persistence wiring."
    - "Do not create cloud database infrastructure."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/package.json"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/repositories/**"
      - "apps/server/src/infrastructure/database/**"
      - "apps/server/src/infrastructure/workspace/FileWorkspaceStore.ts"
      - "apps/server/src/infrastructure/chat/FileChatMemoryStore.ts"
      - "apps/server/src/infrastructure/adapters/JsonStorageAdapter.ts"
      - "apps/server/src/infrastructure/preview/FilePreviewSessionStore.ts"
    services:
      - "StartWorkflowUseCase"
      - "SubmitHorusChatTurnUseCase"
      - "WorkflowOrchestrator"
      - "PreviewRuntimeManager"
    database:
      migrations_required: true
      tables:
        - "workspace_folders"
        - "user_stories"
        - "user_story_revisions"
        - "specs"
        - "spec_revisions"
        - "workflow_states"
        - "chat_sessions"
        - "chat_messages"
        - "frontend_projects"
        - "preview_sessions"
        - "preview_events"
        - "visual_instruction_drafts"
  frontend:
    files: []
    components: []
    routes: []
  workflow:
    graph_nodes:
      - "specAgent"
      - "odinAgent"
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
    agents:
      - "SpecAgent"
      - "Horus/Odin"
      - "FrontAgent"
      - "QAAgent"
      - "CuratorAgent"
  tests:
    unit:
      - "repository composition selection"
      - "migration SQL structure"
    integration:
      - "optional Postgres repository smoke when DATABASE_URL is present"
    e2e: []
```

## 6. Entity and Relationship Model

### Workspace and Versioned Artifacts

```yaml
workspace_folders:
  primary_key: "id uuid"
  attributes:
    id: "uuid, not null"
    name: "text, not null, 1..80 chars"
    slug: "text, not null, slug regex compatible"
    created_at: "timestamptz, not null"
    story_count: "integer, not null, >= 0, denormalized cache"
  uniqueness:
    - "slug unique"
  cardinality:
    - "one workspace_folder has many user_stories"
  integrity:
    - "story_count >= 0"

user_stories:
  primary_key: "id uuid"
  foreign_keys:
    folder_id: "workspace_folders.id on delete cascade"
  attributes:
    id: "uuid, not null"
    folder_id: "uuid, not null"
    title: "text, not null"
    description: "text, not null"
    acceptance_criteria: "jsonb array of strings, not null"
    priority: "text enum low|medium|high|critical"
    labels: "jsonb array of strings, not null default []"
    created_at: "timestamptz, not null"
    updated_at: "timestamptz, not null"
    active_revision: "integer, not null, >= 1"
  uniqueness:
    - "folder_id, id"
  cardinality:
    - "one user_story has many user_story_revisions"
    - "one user_story has many specs"
    - "one user_story has many chat_sessions"
  integrity:
    - "active_revision >= 1"
    - "priority constrained to known values"

user_story_revisions:
  primary_key: "id uuid"
  foreign_keys:
    story_id: "user_stories.id on delete cascade"
    folder_id: "workspace_folders.id on delete cascade"
  attributes:
    revision: "integer, not null, >= 1"
    story: "jsonb, not null, full UserStorySchema snapshot"
    saved_at: "timestamptz, not null"
  uniqueness:
    - "story_id, revision"
  cardinality:
    - "many revisions belong to one user_story"
  integrity:
    - "snapshot story.id must match story_id at repository validation layer"

specs:
  primary_key: "id uuid"
  foreign_keys:
    story_id: "user_stories.id on delete cascade"
    folder_id: "workspace_folders.id on delete cascade"
  attributes:
    id: "uuid, not null"
    story_id: "uuid, not null"
    folder_id: "uuid, not null"
    version: "integer, not null, >= 1"
    summary: "text, not null"
    technical_approach: "text, not null"
    components: "jsonb, not null"
    api_endpoints: "jsonb, not null default []"
    data_models: "jsonb, not null default []"
    acceptance_criteria: "jsonb, not null"
    generated_at: "timestamptz, not null"
    approved_at: "timestamptz, nullable"
    approved_by: "text enum human|auto, nullable"
    active_revision: "integer, not null, >= 1"
  uniqueness:
    - "story_id, id"
  cardinality:
    - "one user_story has many specs"
    - "one spec has many spec_revisions"
  integrity:
    - "spec.userStoryId must match story_id at repository validation layer"
    - "approved_by nullable or constrained to human|auto"

spec_revisions:
  primary_key: "id uuid"
  foreign_keys:
    spec_id: "specs.id on delete cascade"
    story_id: "user_stories.id on delete cascade"
    folder_id: "workspace_folders.id on delete cascade"
  attributes:
    revision: "integer, not null, >= 1"
    spec: "jsonb, not null, full SpecSchema snapshot"
    saved_at: "timestamptz, not null"
  uniqueness:
    - "spec_id, revision"
  cardinality:
    - "many revisions belong to one spec"
```

### Workflow, Chat, Preview

```yaml
workflow_states:
  primary_key: "thread_id uuid"
  attributes:
    thread_id: "uuid, not null"
    status: "text enum idle|running|awaiting_human|completed|cancelled|error"
    workflow_mode: "text enum standard|spec_generation|chat_code_change"
    workspace_folder_id: "uuid nullable references workspace_folders"
    state: "jsonb, not null, full WorkflowStateSchema"
    started_at: "timestamptz, not null"
    completed_at: "timestamptz nullable"
    error_message: "text nullable"
    updated_at: "timestamptz, not null"
  cardinality:
    - "one workflow may be referenced by many chat messages"
  integrity:
    - "state.threadId must match thread_id at repository validation layer"

chat_sessions:
  primary_key: "id uuid"
  foreign_keys:
    workspace_folder_id: "workspace_folders.id on delete cascade"
    user_story_id: "user_stories.id on delete cascade"
    workflow_thread_id: "workflow_states.thread_id on delete set null"
  attributes:
    active_user_story_revision_id: "text nullable"
    active_spec_revision_id: "text nullable"
    created_at: "timestamptz, not null"
    updated_at: "timestamptz, not null"
  uniqueness: []
  cardinality:
    - "one chat_session has many chat_messages"
  integrity:
    - "workspace_folder_id/user_story_id pair must reference an existing story in repository checks"

chat_messages:
  primary_key: "id uuid"
  foreign_keys:
    session_id: "chat_sessions.id on delete cascade"
  attributes:
    role: "text enum user|agent|system"
    body: "text, not null"
    context_snapshot: "jsonb, not null"
    created_at: "timestamptz, not null"
  cardinality:
    - "many messages belong to one chat_session"
  integrity:
    - "context_snapshot isolates workspace, story, spec, workflow, project and preview references per message"

frontend_projects:
  primary_key: "id uuid"
  attributes:
    name: "text, not null"
    slug: "text, not null unique"
    root_path: "text, not null"
    default_route: "text, not null"
    dev_command: "text nullable"
    preview_command_id: "text nullable"
    command_catalog: "jsonb, not null default []"
    preview_url: "text nullable"
    created_at: "timestamptz, not null"

preview_sessions:
  primary_key: "id uuid"
  foreign_keys:
    project_id: "frontend_projects.id on delete cascade"
  attributes:
    status: "text enum waiting|stopped|starting|running|inspecting|applying|error"
    route: "text, not null"
    device: "jsonb, not null"
    preview_url: "text nullable"
    process_id: "integer nullable"
    started_at: "timestamptz nullable"
    stopped_at: "timestamptz nullable"
    updated_at: "timestamptz, not null"
    error_message: "text nullable"
  cardinality:
    - "one preview_session has many preview_events"
    - "one preview_session has many visual_instruction_drafts"

preview_events:
  primary_key: "id uuid"
  foreign_keys:
    session_id: "preview_sessions.id on delete cascade"
    project_id: "frontend_projects.id on delete cascade"
  attributes:
    type: "text, not null"
    timestamp: "timestamptz, not null"
    status: "text, not null"
    message: "text, not null"
    data: "jsonb, not null default {}"

visual_instruction_drafts:
  primary_key: "id uuid"
  foreign_keys:
    session_id: "preview_sessions.id on delete cascade"
    project_id: "frontend_projects.id on delete cascade"
  attributes:
    mode: "text enum visual_edits|build"
    message: "text, not null"
    status: "text, not null, must be drafted"
    created_at: "timestamptz, not null"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    Postgres becomes a new persistence backend behind the same application
    contracts currently served by file stores. Existing HTTP routes, use cases,
    graph nodes, and frontend payloads must not change.

  depends_on:
    - name: "Shared Zod entity schemas"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "UserStorySchema, SpecSchema, WorkflowStateSchema, Chat schemas, Preview schemas"
      required_for: "Validate database reads and writes at repository boundaries."
      assumptions: []
      failure_modes:
        - "DB rows drift from API/domain contracts."
      fallback_or_recovery: "Reject invalid writes and fail reads loudly."
      verification:
        - "pnpm --filter @u-build/server type-check"
        - "node --test apps/server/test/*.test.mjs"

    - name: "Existing file stores"
      type: "backend_service"
      owner: "infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "current public methods on FileWorkspaceStore, FileChatMemoryStore, JsonStorageAdapter, FilePreviewSessionStore"
      required_for: "Preserve behavior while introducing Postgres implementations."
      assumptions: []
      failure_modes:
        - "Postgres repository misses a method or returns a different shape."
      fallback_or_recovery: "Keep file persistence selectable by env."
      verification:
        - "repository interface compile checks"

  depended_on_by:
    - name: "Workspace routes"
      type: "api_client"
      owner: "server/http"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "GET/POST/PATCH/DELETE /api/workspace/* payloads unchanged"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "Frontend continues consuming folders, userStories, artifacts, specs."
      migration_or_notification_required: false
      verification:
        - "workspace route smoke tests with selected repository"

    - name: "WorkflowOrchestrator"
      type: "workflow"
      owner: "domain"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "IStorageProvider plus WorkspaceArtifactStore"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "Workflow state and specs persist after graph execution."
      migration_or_notification_required: false
      verification:
        - "spec_generation workflow smoke"

    - name: "Horus chat memory"
      type: "backend_service"
      owner: "application/chat"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "chat session/message/context methods"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "Chat context remains isolated per workspace/user story/session."
      migration_or_notification_required: false
      verification:
        - "chat memory tests"

  bidirectional_integrations:
    - name: "Workspace artifact revisions and chat context snapshots"
      participants:
        - "workspace repositories"
        - "chat repositories"
      shared_contract: "WorkspaceArtifactContext"
      consistency_rule: "Chat message snapshots must point to the active story/spec revision visible at message creation time."
      verification:
        - "create chat session after updating story/spec and assert revision ids are captured"

  data_flow:
    inbound:
      - source: "HTTP routes/use cases"
        payload_or_state: "Zod-validated entity objects"
        validation: "Shared schemas before repository writes"
    outbound:
      - target: "Frontend and agents"
        payload_or_state: "Same JSON payload shape currently returned from file stores"
        compatibility: "No frontend contract changes"

  sequencing_dependencies:
    - dependency: "SQL schema before Postgres repository activation"
      reason: "Repositories require tables and indexes."
      validation: "migration runner records applied migrations"

  integration_risks:
    - risk: "Partial migration creates split-brain between file and DB stores."
      severity: "high"
      mitigation: "Single env switch selects all primary stores together; no mixed mode by default."
    - risk: "JSONB snapshots bypass relational integrity."
      severity: "medium"
      mitigation: "Relational parent rows carry identity/FK constraints; full snapshots are still schema-validated at repository boundaries."
```

## 8. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing broad abstractions."
    - "Separate application/domain/infrastructure concerns."
    - "Prefer dependency injection over direct construction of concrete services."
    - "Avoid circular dependencies."
    - "Do not duplicate business rules across layers."
  project_specific:
    - "HTTP routes depend on repository interfaces, not concrete file or Postgres classes."
    - "Postgres repositories live under apps/server/src/infrastructure/repositories."
    - "Database utilities live under apps/server/src/infrastructure/database."
    - "Migrations live under apps/server/src/infrastructure/database/migrations."
    - "All persisted reads/writes pass through shared Zod schemas."
    - "Env controls persistence backend: PERSISTENCE_DRIVER=file|postgres."
    - "DATABASE_URL is required only when PERSISTENCE_DRIVER=postgres."
```

## 9. Business Rules and Integrity

```yaml
business_rules:
  - "A workspace folder slug must be unique."
  - "A user story always belongs to exactly one workspace folder."
  - "Every user story must have at least one active revision after creation."
  - "Specs cannot exist without a parent user story."
  - "Every spec must have at least one active revision after creation."
  - "Saving identical story/spec content should not create a duplicate revision."
  - "Workflow state is addressable by threadId."
  - "Chat memory must remain isolated by chatSessionId and snapshot workspace/story/spec context per message."
  - "Preview sessions must belong to a registered frontend project."
  - "Deleting a workspace folder cascades to its stories, specs, revisions, and chat sessions."
  - "Deleting a user story cascades to its specs, revisions, and story-scoped chats."
```

## 10. Implementation Plan

```yaml
implementation_plan:
  - step: "Install dependencies"
    details:
      - "Add pg runtime dependency."
      - "Add @types/pg dev dependency if needed by TypeScript."
  - step: "Create database layer"
    details:
      - "Create Pool factory from DATABASE_URL."
      - "Create transaction helper."
      - "Create migration runner and migrations table."
      - "Create initial schema SQL."
  - step: "Create repository contracts"
    details:
      - "Define WorkspaceRepository interface matching existing workspace store methods."
      - "Define ChatMemoryRepository interface matching existing chat store methods."
      - "Define WorkflowStateRepository using IStorageProvider."
      - "Define PreviewSessionRepository and FrontendProjectRepository interfaces."
  - step: "Implement Postgres repositories"
    details:
      - "Use transactions for multi-table story/spec revision writes."
      - "Use Zod schemas on all returned entities."
      - "Preserve existing sort order and errors."
  - step: "Wire composition"
    details:
      - "Create repository factory in infrastructure/repositories."
      - "Server chooses file or postgres through PERSISTENCE_DRIVER."
      - "Postgres mode runs migrations on startup before route registration."
  - step: "Validate"
    details:
      - "Typecheck server."
      - "Build server."
      - "Run repository/migration tests."
      - "If local DATABASE_URL exists, run migrations against Postgres and smoke workspace routes."
```

## 11. Validation Protocol

```yaml
validation_protocol:
  static_checks:
    - command: "pnpm --filter @u-build/server type-check"
      cwd: "<repo-root>"
      required: true
    - command: "pnpm --filter @u-build/server build"
      cwd: "<repo-root>"
      required: true
  tests:
    - command: "node --test apps/server/test/*.test.mjs"
      cwd: "<repo-root>"
      required: true
    - command: "DATABASE_URL=<local-url> pnpm --filter @u-build/server db:migrate"
      cwd: "<repo-root>"
      required: false
  runtime_checks:
    - command: "PERSISTENCE_DRIVER=postgres pnpm --filter @u-build/server start"
      cwd: "<repo-root>"
      expected: "server starts only after migrations succeed"
  manual_checks:
    - "Open UserStories screen and confirm folders/user stories/specs render from selected persistence backend."
```

## 12. Completion Criteria

```yaml
acceptance_criteria:
  - "Spec file exists and documents entities, relationships, attributes, contracts, cardinality, uniqueness, and integrity."
  - "Postgres dependency is installed."
  - "SQL migration creates all mapped tables, constraints, indexes, and migration ledger."
  - "Repository folder exists with contracts and Postgres implementations."
  - "Server composition can select file or postgres persistence through env."
  - "No frontend API payload is changed."
  - "Typecheck and build pass."
  - "Postgres migration command is available and documented by script."
```

## 13. Agent Error Mitigation

```yaml
agent_error_mitigation:
  - "Do not hardcode DATABASE_URL."
  - "Do not remove existing file persistence."
  - "Do not silently change route response shapes."
  - "Do not skip Zod validation around DB rows."
  - "Do not create tables without FK and uniqueness constraints."
  - "Do not claim Postgres runtime validation unless a DATABASE_URL-backed command was run."
```
```
