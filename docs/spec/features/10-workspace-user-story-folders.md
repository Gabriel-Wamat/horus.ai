# SDD: Workspace User Story Folders

## 1. Metadata

```yaml
format_version: "agentic_sdd.v1"
task_id: "horus-workspace-user-story-folders"
title: "Workspace User Story Folders"
created_at_utc: "2026-05-26T14:20:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
source_skill: "creating-sdd-specs"
```

## 2. Original User Request

```yaml
raw_user_request: |
  outro ponto, quero que cada user-stories seja salva dentro de uma pasta dentro do workspace, todas precisam sempre ter seu próprio diretório. analise com muito cuidado o
    que já foi feito, para você fazer as alterações de forma cirúrgica, use a skill de criar spec para planejar e implementar essa tarefa. lembre-se que dentro do modal é preciso ter um select indicando para qual pasta o usuário irá direcionar a user stories. caso não haja uma pasta, tem que ter um botão para inciar uma pasta do zero e ele poder nomear a pasta
```

## 3. System Interpretation

```yaml
system_translation: |
  Add workspace folders for user stories. Before a workflow starts, the user must choose a workspace folder in the user-story creation modal. If no folder exists, the modal must let the user create and name a folder.

  When the user starts generation, each user story must be saved to the selected workspace folder, and every user story must have its own directory. This must be implemented surgically without changing LLM, agent, LangGraph, or unrelated UI behavior.

  The safest engineering result is a small shared contract for workspace folders, a server-side file storage adapter under data/workspace, API routes to list/create folders, a required workspaceFolderId in workflow start input, and frontend modal controls for selecting/creating the target folder.
```

## 4. Business / Product Context

```yaml
business_context:
  user_problem: "User stories are currently transient payloads tied to a workflow run; they are not organized as workspace assets."
  target_user: "Operators creating batches of user stories grouped by project/module/context."
  expected_outcome: "Each story is traceable in a user-selected workspace folder, with its own directory."
  product_surface:
    - "User-story creation modal"
    - "Workspace folder selector"
    - "Workflow start API"
    - "Local filesystem workspace storage"
```

## 5. Technical Context

```yaml
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Express"
      - "TypeScript"
      - "Zod"
      - "Node fs"
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
    shared:
      - "packages/shared Zod entities"
    database:
      - "No database"
      - "JSON files under data/"
  known_entrypoints:
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/infrastructure/http/routes/workflowRoutes.ts"
    - "apps/server/src/application/usecases/StartWorkflowUseCase.ts"
    - "apps/web/src/api/workflowApi.ts"
    - "apps/web/src/App.tsx"
    - "apps/web/src/components/UserStoryInputPage.tsx"
  known_existing_patterns:
    - "Workflow state is persisted as JSON through JsonStorageAdapter."
    - "StartWorkflowInputSchema currently validates userStories and optional llmSettings."
    - "Frontend start API currently posts userStories and optional llmSettings."
    - "UserStoryInputPage owns the current story draft form and submission."
```

## 6. Scope

```yaml
scope:
  in_scope:
    - "Add workspace folder shared types/schemas."
    - "Add server-side local workspace folder storage."
    - "Add API to list workspace folders."
    - "Add API to create a workspace folder by name."
    - "Require workspaceFolderId when starting a workflow."
    - "Save each submitted user story under its own directory inside the selected workspace folder."
    - "Add modal folder select and folder creation action."
    - "Preserve existing story draft controls and workflow start behavior."
    - "Add focused tests for schema/use-case/storage behavior."
  out_of_scope:
    - "Full workspace browser/editor."
    - "Renaming/deleting folders."
    - "Moving stories between folders."
    - "Authentication or multi-user permissions."
    - "Changing agent prompts, LLM provider runtime, LangGraph topology, or workflow status schema beyond optional metadata if required."
    - "Chat/preview dedicated screen."
```

## 7. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/application/usecases/StartWorkflowUseCase.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/http/routes/workspaceRoutes.ts"
      - "apps/server/src/infrastructure/workspace/FileWorkspaceStore.ts"
    services:
      - "StartWorkflowUseCase"
      - "Workspace storage"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "apps/web/src/api/workflowApi.ts"
      - "apps/web/src/App.tsx"
      - "apps/web/src/components/UserStoryInputPage.tsx"
      - "apps/web/src/index.css"
    components:
      - "UserStoryInputPage"
      - "User story creation modal"
    routes:
      - "Single-page app root"
  shared:
    files:
      - "packages/shared/src/entities/Workspace.ts"
      - "packages/shared/src/index.ts"
  tests:
    unit:
      - "packages/shared/test/workspace.test.mjs"
      - "apps/server/test/workspaceStore.test.mjs"
      - "apps/server/test/startWorkflowInput.test.mjs"
    integration: []
    e2e: []
```

## 8. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "Use typed Zod contracts for workspace folders."
    - "Keep workspace persistence outside LangGraph agent nodes."
    - "Do not alter UserStorySchema unless required."
    - "Do not store API keys or LLM settings in workspace story files."
    - "Use path-safe slugs and never trust raw folder names as filesystem paths."
    - "Preserve existing workflow payload behavior except adding workspaceFolderId."
    - "Existing workflow JSON files must remain loadable."
  project_specific_rules:
    - "Shared schemas belong in packages/shared/src/entities."
    - "HTTP routes belong in apps/server/src/infrastructure/http/routes."
    - "Filesystem adapters belong under apps/server/src/infrastructure."
    - "Frontend API helpers belong in apps/web/src/api/workflowApi.ts."
```

## 9. Coding Rules

```yaml
coding_rules:
  backend:
    - "Validate folder IDs and names."
    - "Create directories recursively."
    - "Each user story directory must be unique and stable enough for a single submission."
    - "Write user-story.json into each story directory."
    - "Expose actionable HTTP errors for missing folder IDs."
  frontend:
    - "Modal must show a folder select before generation."
    - "If no folders exist, show a create-folder control."
    - "Allow creating a folder without leaving the modal."
    - "Disable generation until a folder is selected."
    - "Do not remove current story/criteria/prioridade controls."
  tests:
    - "Test schema validation for folder IDs/names."
    - "Test workspace store creates folder and one directory per story."
    - "Test StartWorkflowInputSchema requires workspaceFolderId."
```

## 10. Constraints

```yaml
technical_constraints:
  - "No database exists; use local JSON/filesystem storage."
  - "The workspace storage path must stay under data/workspace."
  - "Existing UserStory objects should not receive presentation-only fields."
  - "Start workflow must not proceed without a selected workspace folder."
  - "Tests must not require network or live LLM calls."
operational_constraints:
  - "Do not revert unrelated user changes."
  - "Do not touch ignored spec folder in Git."
```

## 11. Data / Contract Requirements

```yaml
contracts:
  WorkspaceFolder:
    shape:
      id: "uuid"
      name: "non-empty string"
      slug: "path-safe string"
      createdAt: "datetime"
      storyCount: "integer >= 0"
  StartWorkflowInput:
    new_required_field:
      workspaceFolderId: "uuid"
    unchanged_fields:
      userStories: "UserStory[]"
      llmSettings: "optional LlmSettings"
  Filesystem:
    folder_index: "data/workspace/folders.json"
    story_file: "data/workspace/<folder-slug>/<story-slug>-<short-id>/user-story.json"
```

## 12. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Add shared workspace contract"
    action: "Create WorkspaceFolder schema/types and export them."
  - step: 2
    name: "Add local workspace store"
    action: "Implement folder list/create and story persistence with path-safe slugs."
  - step: 3
    name: "Add workspace API routes"
    action: "Expose GET /api/workspace/folders and POST /api/workspace/folders."
  - step: 4
    name: "Wire start use case"
    action: "Require workspaceFolderId and save submitted user stories before starting workflow."
  - step: 5
    name: "Wire frontend API"
    action: "Add list/create folder API helpers and include workspaceFolderId in workflow start."
  - step: 6
    name: "Update modal UX"
    action: "Add folder select, empty-folder create flow, and disabled generation guard."
  - step: 7
    name: "Validate"
    action: "Run type-check, build, tests, and inspect changed contract surfaces."
```

## 13. Acceptance Criteria

```yaml
acceptance_criteria:
  - "The user-story modal has a folder select."
  - "If no folders exist, the modal offers a button/control to create and name a folder."
  - "The user can create a folder from inside the modal and select it."
  - "Workflow generation cannot start without a selected folder."
  - "Starting a workflow saves every submitted user story under the selected workspace folder."
  - "Every saved user story has its own directory."
  - "Existing story fields, criteria controls, priority, LLM settings, HITL review, and spec view continue working."
  - "No LLM provider contracts or agent prompts are changed."
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
  manual_checks:
    - "Open modal and verify folder select/create controls."
    - "Start workflow payload includes workspaceFolderId."
    - "Confirm saved files under data/workspace/<folder>/<story>/user-story.json when workflow is started."
```

## 15. Risks And Mitigations

```yaml
risks:
  - risk: "Making workspaceFolderId required can break old clients."
    mitigation: "Only current frontend is expected client; tests must document the new requirement."
  - risk: "Unsafe names could escape workspace directory."
    mitigation: "Generate slugs server-side and only use slugs/UUIDs for filesystem paths."
  - risk: "User story context could be lost between modal and workflow start."
    mitigation: "Keep existing UserStoryInputPage draft mapping and only add selected folder metadata outside UserStory."
```

## 16. Final Quality Gate

```yaml
quality_gate:
  - "Shared and server tests pass."
  - "Typecheck passes."
  - "Build passes."
  - "No backend agent/LLM files changed."
  - "Workspace files are created through a bounded adapter."
  - "Spec log is updated."
```

## 17. Implementation Log

```yaml
implementation_log:
  - version: "0.1.0"
    date: "2026-05-26"
    changes:
      - "Created SDD spec for workspace user story folders."
    validation:
      - "Planning only."
  - version: "0.2.0"
    date: "2026-05-26"
    changes:
      - "Added shared WorkspaceFolder and CreateWorkspaceFolderInput schemas."
      - "Added local FileWorkspaceStore under data/workspace with one directory per saved user story."
      - "Added workspace folder list/create HTTP routes."
      - "Updated workflow start input to require workspaceFolderId and save user stories before orchestration starts."
      - "Updated frontend API and user-story modal with folder select plus create-folder control."
    validation:
      - "pnpm type-check passed."
      - "pnpm build passed."
      - "pnpm test passed with 36 passing tests."
      - "Runtime smoke passed: POST /api/workspace/folders created a folder and GET /api/workspace/folders returned it."
      - "Runtime smoke passed: POST /api/workflow/start saved user-story.json under apps/server/data/workspace/<folder>/<story>/ before orchestration."
  - version: "0.2.1"
    date: "2026-05-26"
    changes:
      - "Added workspace user-story listing from persisted story directories."
      - "Added GET /api/workspace/folders/:folderId/user-stories."
      - "Updated the frontend workspace screen to load persisted user stories from the selected folder when no current workflow state exists."
      - "Defaulted folder selection toward the folder with the highest story count so seeded or existing work appears immediately."
    validation:
      - "pnpm type-check passed."
      - "pnpm test passed with 36 passing tests."
      - "Runtime smoke passed: backend and Vite proxy returned 3 persisted user stories for the userstories folder."
      - "Visual validation passed in Chrome at http://localhost:5174: the screen showed TOTAL 3, the three persisted stories, and the selected story details."
```
