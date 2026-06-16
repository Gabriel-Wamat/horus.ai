# SPEC 12 - Workspace Artifact Versioning

```yaml
format_version: "agentic_sdd.v1"
task_id: "12-workspace-artifact-versioning"
title: "Version and isolate user stories and specs in workspace folders"
created_at_utc: "2026-05-26T11:45:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "creating-sdd-specs"
spec_version: "0.3.0"
status: "implemented"
```

## 1. Original User Request

```yaml
raw_user_request: |
  garanta que irão ficar versionadas de isoladas
```

## 2. System Interpretation

```yaml
system_translation: |
  Workspace artifacts must be stored so each folder, user story, generated spec, and later edit has isolated version history. Agents must never consume ambiguous or overwritten context.

expected_user_visible_result: |
  A user can inspect a folder and understand which user stories and specs belong to it without cross-folder leakage.

expected_engineering_result: |
  Add a stable workspace artifact layout with per-story directories, version manifests, active revisions, and append-only history.
```

## 3. Proposed Disk Contract

```text
apps/server/data/workspace/
  folders.json
  <folder-slug>/
    folder.json
    user-stories/
      <story-id>/
        manifest.json
        active.json
        revisions/
          0001-user-story.json
          0002-user-story.json
        specs/
          <spec-id>/
            manifest.json
            active.json
            revisions/
              0001-spec.json
              0002-spec.json
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Define and implement append-only revisions for user stories."
    - "Define and implement append-only revisions for specs."
    - "Expose active revision metadata to API clients."
    - "Prevent story/spec writes outside their owning folder."
  out_of_scope:
    - "Remote Git commits for workspace data."
    - "Authentication/authorization."
```

## 5. Contract Requirements

```yaml
contracts:
  domain_invariants:
    - "A user story belongs to exactly one workspace folder."
    - "A spec belongs to exactly one user story."
    - "Edits create new revisions instead of overwriting prior revisions."
    - "The active revision is explicit and validated."
  api_contracts:
    - name: "List folder artifacts"
      compatibility: "Can extend current response with revision metadata."
    - name: "Update user story"
      compatibility: "New endpoint; must not break workflow/start."
    - name: "Update spec"
      compatibility: "New endpoint; must not break HITL approval."
```

## 6. Validation Protocol

```yaml
validation_protocol:
  tests:
    - "Store creates active.json and revisions/0001-user-story.json."
    - "Editing a story writes 0002-user-story.json without deleting 0001."
    - "Editing a spec writes a new spec revision."
    - "Cross-folder update attempts fail."
  runtime_checks:
    - "Create folder, create story, edit story, generate spec, edit spec, inspect disk."
```

## 7. Implementation Log

```yaml
implemented_version: "0.3.0"
implemented_at_utc: "2026-05-26T12:15:00Z"
status: "implemented"
scope_completed:
  - "User story directories now keep active.json, manifest.json, and append-only revisions/*.json."
  - "Legacy user-story.json remains as the active compatibility copy for existing readers."
  - "Editing a user story through the workspace API creates a new user-story revision."
  - "Cross-folder user-story updates are rejected by resolving the story only inside its owning folder."
  - "Generated SPEC artifacts are saved under the owning story directory with active.json, manifest.json, and append-only revisions/*.json."
  - "The workflow carries workspaceFolderId so specAgent and HITL edited specs can persist into the correct workspace folder."
  - "Revision metadata is exposed through /api/workspace/folders/:folderId/artifacts and as an additive artifacts field on the existing user-stories list response."
validation:
  commands:
    - command: "pnpm type-check"
      result: "passed"
    - command: "pnpm test"
      result: "passed, 40 tests"
  runtime_checks:
    - "Restarted backend on http://<HORUS_PUBLIC_HOST>:3000 from compiled dist."
    - "PATCH /api/workspace/folders/:folderId/user-stories/:storyId returned the unchanged UserStory contract."
    - "Inspected disk and confirmed active.json, manifest.json, revisions/0001-user-story.json, and user-story.json."
    - "GET /api/workspace/folders/:folderId/artifacts returned revision metadata."
    - "GET /api/workspace/folders/:folderId/user-stories kept userStories and added artifacts metadata."
compatibility_notes:
  - "No frontend payload shape was changed."
  - "No workflow/start request or response contract was changed."
  - "Existing legacy user-story.json files can be migrated lazily on first save/update."
```
