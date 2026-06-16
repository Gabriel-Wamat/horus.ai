# SPEC 11 - User Story Folder Tree UI

```yaml
format_version: "agentic_sdd.v1"
task_id: "11-user-story-folder-tree-ui"
title: "Indent user stories under their workspace folders"
created_at_utc: "2026-05-26T11:45:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
source_skill: "creating-sdd-specs"
spec_version: "0.1.0"
status: "implemented"
```

## 1. Original User Request

```yaml
raw_user_request: |
  as user-stories precisam estar identadas dentro da sua pasta, verifique de forma down-up se tudo está implementado.
```

## 2. System Interpretation

```yaml
system_translation: |
  The User Stories screen must visually represent the workspace hierarchy as folder -> nested user stories, instead of showing a flat story list.

expected_user_visible_result: |
  The user sees each workspace folder as a parent item and sees the selected folder's user stories indented beneath it.

expected_engineering_result: |
  The frontend consumes the existing workspace folder and folder-story APIs without changing backend persistence contracts.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Render workspace folders in the User Stories rail."
    - "Indent the selected folder's user stories under the folder row."
    - "Allow selecting another folder from the rail."
    - "Keep selected story detail and SPEC toggle behavior."
  out_of_scope:
    - "Changing disk persistence layout."
    - "Adding chat memory."
    - "Changing agent prompts."
```

## 4. Affected Entities

```yaml
affected_entities:
  frontend:
    files:
      - "apps/web/src/App.tsx"
      - "apps/web/src/components/StorySpecWorkspace.tsx"
      - "apps/web/src/index.css"
    components:
      - "StorySpecWorkspace"
  backend:
    files:
      - "apps/server/src/infrastructure/http/routes/workspaceRoutes.ts"
    services:
      - "FileWorkspaceStore"
  tests:
    static:
      - "pnpm type-check"
    runtime:
      - "Visual check in Chrome at http://<HORUS_PUBLIC_HOST>:5174"
```

## 5. Integration Context

```yaml
depends_on:
  - name: "GET /api/workspace/folders"
    contract_used: "{ folders: WorkspaceFolder[] }"
  - name: "GET /api/workspace/folders/:folderId/user-stories"
    contract_used: "{ userStories: UserStory[] }"
depended_on_by:
  - name: "User Stories UI"
    compatibility_obligation: "Must preserve story selection and spec tab behavior."
data_flow:
  - "Backend folders -> workflowApi.listWorkspaceFolders -> App state -> StorySpecWorkspace folder tree"
  - "Selected folder id -> workflowApi.listWorkspaceUserStories -> nested story list"
```

## 6. Acceptance Criteria

```yaml
acceptance_criteria:
  - "Folders are shown as parent rows."
  - "User stories are visually indented beneath the selected folder."
  - "Changing folder reloads the visible user stories."
  - "Existing selected story detail still renders."
  - "The UI no longer presents persisted stories as a flat global list."
```

## 7. Validation Protocol

```yaml
validation_protocol:
  static_checks:
    - command: "pnpm type-check"
      cwd: "<REPOSITORY_ROOT>"
      required: true
  runtime_checks:
    - command: "Open http://<HORUS_PUBLIC_HOST>:5174 in Chrome"
      expected: "Folder row visible with nested user stories under it."
```

## 8. Implementation Log

```yaml
implementation_log:
  - version: "0.1.0"
    date: "2026-05-26"
    changes:
      - "Added folder tree props and rendering to StorySpecWorkspace."
      - "Nested selected folder user stories beneath the folder row."
      - "Added CSS for folder groups and nested story indentation."
    validation:
      - "pnpm type-check passed."
      - "pnpm test passed with 36 passing tests."
      - "Chrome visual validation passed at http://<HORUS_PUBLIC_HOST>:5174: userstories folder renders with three indented user stories."
  - version: "0.2.0"
    date: "2026-05-26"
    changes:
      - "Refined the folder tree UI using the reference image structure: primary generate button, folder cards, metrics pills, progress bar, and clearer nested story rows."
      - "Added visible Editar and Excluir action buttons with icons to the selected story header."
    validation:
      - "pnpm type-check passed."
      - "pnpm test passed with 37 passing tests."
      - "Chrome visual validation passed: folder cards, nested stories, Gerar specs, Editar, and Excluir are visible."
```
