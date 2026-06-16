# SPEC 15 - Story and Spec Generation/Edit Controls

```yaml
format_version: "agentic_sdd.v1"
task_id: "15-story-spec-generation-and-editing"
title: "Add explicit spec generation and editable stories/specs"
created_at_utc: "2026-05-26T11:45:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "creating-sdd-specs"
spec_version: "0.1.0"
status: "implemented"
```

## 1. Original User Request

```yaml
raw_user_request: |
  na tela de UserStories deve ter um botão para os agentes incialmente gerarem as specs quando o usuário pedir. além disso, tanto as specs quanto as userStories tem que ser editáveis, para caso o usuário queira fazer alterações
```

## 2. System Interpretation

```yaml
system_translation: |
  The User Stories screen must expose a clear user-triggered action for agents to generate specs from the selected folder. User stories and specs must also be editable through controlled UI paths, with edits persisted and consumed by subsequent agent runs.

expected_user_visible_result: |
  The user can click "Gerar specs" from the User Stories screen, edit a user story, edit a generated spec, save changes, and then ask agents to continue from the updated context.

expected_engineering_result: |
  Add explicit UI controls, persistence endpoints, revision-aware writes, and validation so edited stories/specs become the active context for future agent work.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Add a visible Gerar specs button on the User Stories screen."
    - "Disable generation when no folder or no stories are selected."
    - "Edit persisted user stories through the UI."
    - "Edit generated specs through the UI."
    - "Persist edits as new revisions."
    - "Ensure agents consume the edited active revisions."
  out_of_scope:
    - "Chat/preview screen."
    - "Provider/model changes."
```

## 4. Current Implementation Status

```yaml
current_status:
  implemented_now:
    - "Visible Gerar specs button on StorySpecWorkspace."
    - "Button starts existing workflow with the selected folder's visible stories."
    - "Button was visually validated on the User Stories screen."
    - "Visible Editar and Excluir buttons with icons were added to the selected user story header."
    - "Persisted PATCH and DELETE workspace user story endpoints were added."
    - "Persisted PATCH workspace spec endpoint was added."
    - "Generated specs are loaded from workspace artifacts and rendered in each user story's SPEC (SDD) tab."
    - "Persisted specs can be edited through the User Stories screen."
    - "Spec saves create active persisted revisions through the workspace store."
  already_existing:
    - "Pending HITL spec review allows editing summary and technical approach before approval."
  not_yet_complete:
    - "None for this spec. Agent context revision metadata is covered by spec 13 and consumed by the current active artifact context."
```

## 5. Acceptance Criteria

```yaml
acceptance_criteria:
  - "User can generate specs without reopening the creation modal."
  - "User can edit title, description, priority, and acceptance criteria for a saved user story."
  - "User can edit generated spec fields before agents consume the spec."
  - "Every save creates or points to an active persisted revision."
  - "The next agent run consumes the edited active revision."
  - "Visual validation confirms the button and edit affordances are visible."
```

## 6. Validation Protocol

```yaml
validation_protocol:
  static_checks:
    - command: "pnpm type-check"
      cwd: "<REPOSITORY_ROOT>"
      required: true
  tests:
    - "Workspace store update user story creates a new revision."
    - "Workspace store update spec creates a new revision."
    - "Workflow start consumes active revisions."
  visual_checks:
    - "Open User Stories screen and confirm Gerar specs button is visible."
    - "Open a story and confirm edit controls are visible."
    - "Open a spec and confirm edit controls are visible when a spec exists."
```

## 7. Implementation Log

```yaml
implementation_log:
  - version: "0.1.0"
    date: "2026-05-26"
    changes:
      - "Added visible Gerar specs button to the User Stories rail."
      - "Wired the button to start the existing workflow with the selected folder's current visible user stories."
    validation:
      - "pnpm type-check passed."
      - "pnpm test passed with 36 passing tests."
      - "Chrome visual validation passed: Gerar specs button is visible above workspace folders."
    remaining_work:
      - "Implement persisted editable user stories."
      - "Implement persisted editable specs."
      - "Implement revision-aware agent context consumption."
  - version: "0.2.0"
    date: "2026-05-26"
    changes:
      - "Added user story Editar and Excluir icon buttons."
      - "Added inline user-story editing form for title, description, priority, and acceptance criteria."
      - "Added backend PATCH and DELETE routes for workspace user stories."
      - "Added FileWorkspaceStore update/delete methods and regression coverage."
    validation:
      - "pnpm type-check passed."
      - "pnpm test passed with 37 passing tests."
      - "Runtime smoke passed: PATCH /api/workspace/folders/:folderId/user-stories/:storyId returned the updated persisted user story."
      - "Chrome visual validation passed: Editar and Excluir icon buttons are visible in the selected story header."
    remaining_work:
      - "Implement persisted editable specs outside the current HITL approval path."
      - "Implement append-only revision history for story/spec edits."
      - "Implement revision-aware agent context consumption."
  - version: "0.3.0"
    date: "2026-05-26"
    changes:
      - "Added persisted workspace spec PATCH route at /api/workspace/folders/:folderId/user-stories/:storyId/specs/:specId."
      - "Extended FileWorkspaceStore to expose active spec artifacts and update specs through the revisioned save path."
      - "Updated the frontend workspace API to load embedded active specs from folder user-story artifacts."
      - "Rendered saved specs in each story's SPEC (SDD) tab with a visible Editar spec action."
      - "Added editable persisted spec fields for summary, technical approach, acceptance criteria, and data models."
      - "Kept generated spec context tied to the selected workspace folder and active story directory."
    validation:
      - "pnpm type-check passed."
      - "pnpm test passed with 47 passing tests."
      - "Runtime smoke passed: PATCH /api/workspace/folders/:folderId/user-stories/:storyId/specs/:specId persisted the active spec."
      - "Runtime smoke passed: GET /api/workspace/folders/:folderId/user-stories returns artifacts[].specs[].spec for the selected story."
      - "Frontend API smoke passed through the Vite proxy and workflowApi.listWorkspaceStoryArtifacts."
      - "Chrome accessibility/visual validation passed for User Stories: folder metrics show 1 spec, the first story shows spec pronta, SPEC (SDD) exposes the saved spec, and Editar spec is present."
    remaining_work:
      - "None for spec 15."
```
