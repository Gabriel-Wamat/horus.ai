# SPEC 23 - Chat-Triggered Project Execution

```yaml
format_version: "agentic_sdd.v1"
task_id: "23-chat-triggered-project-execution"
title: "Allow Horus chat to execute preview project lifecycle actions"
created_at_utc: "2026-05-26T14:00:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
```

## 1. Original User Request

```yaml
raw_user_request: |
  caso o usuário peça para o Horus(orquestrador) executar o projeto(ele precisa fazer isso).
```

## 2. System Interpretation

```yaml
system_translation: |
  Add support for chat commands that start, stop, reload, or inspect the selected preview project through Horus/Odin and the existing PreviewRuntimeManager. This must use explicit project/session ids and return status to the same chat.

expected_user_visible_result: |
  The user can type "rode o projeto" or similar in the preview chat and Horus starts the preview project, then reports the result in the chat.

expected_engineering_result: |
  Bridge run_project intent to preview runtime lifecycle actions without shelling out arbitrarily or leaking state between projects.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Map run/start/stop/reload project intents to PreviewRuntimeManager actions."
    - "Create a preview session if the selected project has none."
    - "Start the selected frontend project through existing preview runtime."
    - "Append assistant status/result messages to the chat session."
    - "Expose action status to the frontend via Horus chat response and preview SSE."
  out_of_scope:
    - "Do not support arbitrary shell commands from chat."
    - "Do not execute projects outside registered FrontendProject roots."
    - "Do not change deployment behavior."
```

## 4. Integration Context

```yaml
integration_context:
  depends_on:
    - name: "PreviewRuntimeManager"
      type: "backend_service"
      contract_used: "create/start/stop/reload/get session"
      required_for: "Project lifecycle execution."
    - name: "FileFrontendProjectRegistry"
      type: "backend_service"
      contract_used: "Registered project root and dev command"
      required_for: "Safe project execution."
    - name: "Horus/Odin intent router"
      type: "backend_service"
      contract_used: "run_project intent"
      required_for: "Trigger execution only when requested."
  depended_on_by:
    - name: "Preview chat UI"
      type: "frontend_component"
      contract_exposed: "Assistant run status and active preview session"
      compatibility_obligation: "Must keep toolbar start/stop/reload buttons working."
  integration_risks:
    - risk: "Arbitrary command execution"
      severity: "critical"
      mitigation: "Only run registered devCommand from validated FrontendProject records."
    - risk: "Starting wrong project"
      severity: "critical"
      mitigation: "Require selected projectId and validate previewSession.projectId match."
```

## 5. Acceptance Criteria

```yaml
acceptance_criteria:
  - "Chat request 'rode o projeto' starts only the selected preview project."
  - "If no preview session exists, Horus creates one for the selected project."
  - "If a preview session exists for another project, the request is rejected."
  - "Run status is appended as an assistant message."
  - "Toolbar and chat stay in sync after start/stop/reload."
  - "Arbitrary commands are rejected with a clear message."
```

## 6. Validation

```yaml
validation_protocol:
  tests:
    - "run_project intent creates/starts the selected preview session."
    - "project mismatch is rejected."
    - "arbitrary command text does not execute shell."
  runtime_checks:
    - "Send 'rode o projeto' from preview chat."
    - "Verify preview iframe starts and assistant message reports success or actionable error."
    - "Send reload/stop from chat and verify toolbar state changes."
```

## 7. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-26T15:03:00Z"
  summary:
    - "Connected run_project chat intent to PreviewRuntimeManager lifecycle actions."
    - "Created preview sessions automatically when a selected project has no active preview session."
    - "Mapped start, stop, and reload requests to safe preview runtime methods only."
    - "Rejected arbitrary shell/terminal command requests from chat."
    - "Added previewSessionId/projectId to chat message context snapshots so preview state can be restored from chat context."
    - "Improved Ask vs Action detection with a robust Horus routing policy prompt, greeting handling, verification asks, and safer ambiguous fallback."
  validation:
    passed:
      - "pnpm test"
      - "Runtime API smoke: 'Rode o projeto.' returns project_execution_started with status=completed and previewSessionId."
      - "Runtime API smoke: arbitrary command request is blocked and does not change preview runtime."
      - "Runtime API smoke: 'olá' returns a normal Horus greeting in chat mode."
      - "Chrome visual check: live chat-triggered project start updates preview status to Rodando, disables Iniciar, enables Parar/Recarregar, and renders the preview canvas."
```
