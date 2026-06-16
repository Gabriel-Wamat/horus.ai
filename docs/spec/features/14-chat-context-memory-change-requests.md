# SPEC 14 - Chat Context Memory for Change Requests

```yaml
format_version: "agentic_sdd.v1"
task_id: "14-chat-context-memory-change-requests"
title: "Preserve chat and project context for iterative changes"
created_at_utc: "2026-05-26T11:45:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p2"
risk_level: "high"
source_skill: "creating-sdd-specs"
spec_version: "0.1.0"
status: "implemented"
```

## 1. Original User Request

```yaml
raw_user_request: |
  para que eu possa abrir um chat e ir solicitando alterações(os agentes deverão acessar a memória do chat e do contexto do projeto sempre que eu pedir alterações).
```

## 2. System Interpretation

```yaml
system_translation: |
  The system needs a future chat/change-request layer tied to workspace folders, user stories, specs, previous agent outputs, and project context. Agents must use the chat memory and project context when applying requested changes.

expected_user_visible_result: |
  The user can open a chat for a story/spec and request changes without restating the full context.

expected_engineering_result: |
  Add persistent chat sessions and context snapshots linked to workspace artifact revisions and workflow executions.
```

## 3. Proposed Data Contract

```yaml
chat_session:
  id: "uuid"
  workspaceFolderId: "uuid"
  userStoryId: "uuid"
  activeUserStoryRevision: "number"
  activeSpecRevision: "number | null"
  createdAt: "datetime"
  updatedAt: "datetime"

chat_message:
  id: "uuid"
  sessionId: "uuid"
  role: "user | agent | system"
  body: "string"
  contextSnapshot:
    folderId: "uuid"
    userStoryRevision: "number"
    specRevision: "number | null"
    workflowThreadId: "uuid | null"
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Persist chat sessions per story/spec context."
    - "Persist messages with context snapshots."
    - "Expose APIs to list/create chat sessions and append messages."
    - "Provide agents a context bundle containing chat history and current project artifact revisions."
  out_of_scope:
    - "Full chat/preview screen implementation until explicitly started."
    - "Long-term vector memory."
```

## 5. Acceptance Criteria

```yaml
acceptance_criteria:
  - "A chat session is scoped to one workspace folder and story."
  - "Every change request records the active story/spec revisions at request time."
  - "Agents receive chat history plus active artifact context before generating changes."
  - "The system can explain which chat message caused which artifact revision."
```

## 6. Validation Protocol

```yaml
validation_protocol:
  tests:
    - "Creating a chat session for a missing story fails."
    - "Appending a message stores revision context."
    - "Agent context builder returns messages, active story, active spec, and previous outputs."
```

## 7. Implementation Log

```yaml
implemented_version: "0.2.0"
implemented_at_utc: "2026-05-26T12:25:00Z"
status: "implemented"
scope_completed:
  - "Added shared chat memory schemas for sessions, messages, snapshots, append inputs, and agent context bundles."
  - "Added a file-backed chat memory store with sessions scoped to workspaceFolderId and userStoryId."
  - "Every appended message records a context snapshot from the current workspace artifacts, not from client-provided revision data."
  - "Added agent context builder returning chat history, active user story, active spec when present, artifact context, and previous workflow outputs."
  - "Added /api/chat routes for listing/creating sessions, listing/appending messages, and fetching agent context."
  - "Chat session creation validates that the target story exists in the selected workspace folder."
validation:
  commands:
    - command: "pnpm type-check"
      result: "passed"
    - command: "pnpm test"
      result: "passed, 46 tests"
  runtime_checks:
    - "Restarted backend on http://localhost:3000 from compiled dist."
    - "POST /api/chat/sessions created a session scoped to a real workspace folder/story."
    - "POST /api/chat/sessions/:sessionId/messages persisted a user message with userStoryRevisionId."
    - "GET /api/chat/sessions/:sessionId/context returned session, message count, active user story, artifact context, and previous output count."
    - "Chrome visual validation confirmed the current User Stories screen still renders."
compatibility_notes:
  - "No chat UI was added; the future chat/preview screen remains out of scope."
  - "Existing workflow and workspace endpoints remain unchanged."
  - "Chat memory is stored locally under data/chat-memory and remains ignored with server data."
```
