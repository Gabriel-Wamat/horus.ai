# SPEC 13 - Agent Workspace Context Consumption

```yaml
format_version: "agentic_sdd.v1"
task_id: "13-agent-workspace-context-consumption"
title: "Make agents consume workspace-scoped user stories and specs"
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
  lembre-se que isso é consumido pelos os agentes irão consumir essas user stories para construir elas.
```

## 2. System Interpretation

```yaml
system_translation: |
  Agents must receive the workspace-scoped, current active user-story revisions and approved/current spec revisions. Agent execution must be traceable back to the folder and artifact revisions that produced it.

expected_user_visible_result: |
  When the user asks agents to build or alter a story, the system uses the correct story/spec from the selected folder.

expected_engineering_result: |
  Workflow start and future chat-triggered changes include workspaceFolderId, userStoryId, and revision identifiers in the execution context.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Add workspace context to workflow execution metadata."
    - "Ensure Spec, Front, QA, and Curator agents receive selected story/spec context."
    - "Record which artifact revisions each agent consumed."
    - "Prevent agents from consuming stale flat in-memory stories when a folder revision exists."
  out_of_scope:
    - "Changing provider/model configuration."
    - "Replacing LangGraph orchestration."
```

## 4. Integration Context

```yaml
depends_on:
  - name: "Workspace artifact store"
    contract_used: "folderId, storyId, active revision, spec active revision"
  - name: "WorkflowOrchestrator.start"
    contract_used: "StartWorkflowOptions"
depended_on_by:
  - name: "SpecAgent"
    expected_consumer_behavior: "Generate specs from active story revision."
  - name: "FrontAgent"
    expected_consumer_behavior: "Build frontend from approved/current spec and story context."
  - name: "QaAgent"
    expected_consumer_behavior: "Test frontend against the same story/spec revision."
  - name: "CuratorAgent"
    expected_consumer_behavior: "Compare outputs against the same traceable context."
```

## 5. Acceptance Criteria

```yaml
acceptance_criteria:
  - "Workflow state stores workspaceFolderId."
  - "Each agent result records consumed userStoryRevisionId and specRevisionId when available."
  - "Changing a story before generation changes the story revision consumed by SpecAgent."
  - "Changing a spec before build changes the spec revision consumed by FrontAgent and QAAgent."
```

## 6. Validation Protocol

```yaml
validation_protocol:
  tests:
    - "StartWorkflowUseCase loads active story revisions from the selected folder."
    - "Agent result metadata includes consumed revision ids."
    - "A stale story payload cannot override the selected folder's active revision without an explicit save."
```

## 7. Implementation Log

```yaml
implemented_version: "0.2.0"
implemented_at_utc: "2026-05-26T12:35:00Z"
status: "implemented"
scope_completed:
  - "Workflow start now resolves active user-story revisions from the selected workspace folder."
  - "Submitted stories that do not exist in the folder are persisted as revision 1 before execution."
  - "Existing active workspace stories take precedence over stale flat request payloads."
  - "Workflow state carries workspaceArtifactContext by userStoryId."
  - "Spec, Front, QA, and Curator agent results record workspaceFolderId, userStoryRevisionId, and specRevisionId when available."
  - "HITL-approved edited specs refresh the consumed specRevisionId before build/test/curation."
validation:
  commands:
    - command: "pnpm type-check"
      result: "passed"
    - command: "pnpm test"
      result: "passed, 43 tests"
  runtime_checks:
    - "Restarted backend on http://<HORUS_PUBLIC_HOST>:3000 from compiled dist."
    - "GET /health returned ok."
    - "GET /api/workspace/folders/:folderId/artifacts returned artifact metadata."
    - "GET /api/workspace/folders/:folderId/user-stories kept the existing userStories contract."
    - "Chrome visual validation confirmed the User Stories screen still renders folder cards, nested stories, selected story detail, and edit/delete actions."
compatibility_notes:
  - "The workflow start request still accepts the existing userStories payload but resolves canonical active stories from the selected folder."
  - "AgentResult metadata fields are optional, preserving compatibility with older stored workflow states."
  - "WorkflowState workspaceArtifactContext defaults to an empty object for older saved states."
```
