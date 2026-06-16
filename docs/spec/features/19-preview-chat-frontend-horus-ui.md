# SPEC 19 - Preview Chat Frontend Horus UI

```yaml
format_version: "agentic_sdd.v1"
task_id: "19-preview-chat-frontend-horus-ui"
title: "Connect preview chat UI to Horus chat turns"
created_at_utc: "2026-05-26T13:56:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
```

## 1. Original User Request

```yaml
raw_user_request: |
  o chat ficará na tela de preview, ele deve se comunicar direto com o Horus(orquestrador)
```

## 2. System Interpretation

```yaml
system_translation: |
  Replace the preview composer draft behavior with a real Horus chat turn. The preview chat must create/select an isolated chat session, submit the user message to the Horus endpoint, render user and assistant messages, preserve a scrollable history, and keep project/story context explicit.

expected_user_visible_result: |
  The user types in the preview chat, sees the message appended as a chat bubble, and receives Horus responses in the same history.

expected_engineering_result: |
  Add frontend API client/hooks/state for Horus chat turns without coupling preview UI to Spec Agent or workflow start.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Add frontend API client for Horus chat turn endpoint."
    - "Load or create a chat session for the selected preview/project/story context."
    - "Render persisted chat messages in PreviewConversationPanel."
    - "Auto-scroll to latest message while preserving manual scroll when user reads older history."
    - "Show sending/error/blocked states inside the chat column."
  out_of_scope:
    - "Do not add Spec Agent generation behavior to the chat composer."
    - "Do not expose unused mode toggles."
    - "Do not introduce a separate chat page yet."
```

## 4. Affected Entities

```yaml
affected_entities:
  frontend:
    files:
      - "apps/web/src/api/horusChatApi.ts"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/components/VisualInstructionComposer.tsx"
      - "apps/web/src/index.css"
    components:
      - "PreviewConversationPanel"
      - "VisualInstructionComposer"
  backend:
    files:
      - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
```

## 5. Integration Context

```yaml
integration_context:
  depends_on:
    - name: "SPEC 18 Horus chat contract"
      type: "api"
      contract_used: "HorusChatTurnInput/HorusChatTurnResponse"
      required_for: "Submit chat messages safely."
      verification:
        - "Frontend imports shared types and does not duplicate schemas."
    - name: "FileChatMemoryStore"
      type: "backend_service"
      contract_used: "list/create sessions and messages"
      required_for: "Load persisted chat history."
  depended_on_by:
    - name: "Preview chat user workflow"
      type: "user_workflow"
      contract_exposed: "Message send and scrollable history UX"
      compatibility_obligation: "Must preserve current preview project controls."
  integration_risks:
    - risk: "Chat message visible but not persisted"
      severity: "high"
      mitigation: "Optimistic UI only after successful user-message response or with clear pending/retry state."
```

## 6. UX Rules

```yaml
ux_rules:
  - "The chat column remains on the preview screen."
  - "History is the main body and must be scrollable."
  - "Composer remains fixed at the bottom."
  - "Do not show Timeline/Eventos in the primary chat column."
  - "Do not show Visual edits until that feature exists."
  - "Use Horus naming, never Calangos."
  - "Use icon plus name for buttons where text is visible."
```

## 7. Acceptance Criteria

```yaml
acceptance_criteria:
  - "Sending a message calls the Horus chat endpoint, not /api/preview/instructions/draft."
  - "Messages survive page reload through backend chat memory."
  - "The chat history stays isolated when switching selected project/story."
  - "The UI clearly shows errors and does not silently drop messages."
  - "Visual verification confirms the chat resembles the reference structure while preserving Horus visual identity."
```

## 8. Validation

```yaml
validation_protocol:
  static_checks:
    - "pnpm --filter @u-build/web build"
  tests:
    - "pnpm test"
  runtime_checks:
    - "Start backend and frontend."
    - "Open /?mode=preview."
    - "Send a chat message and reload; message remains visible."
    - "Switch context and confirm prior chat does not leak."
```

## 9. Implementation Log

```yaml
implemented_at_utc: "2026-05-26T14:20:00Z"
status: "completed"
files_changed:
  - "apps/web/src/api/horusChatApi.ts"
  - "apps/web/src/App.tsx"
  - "apps/web/src/components/VisualPreviewConsole.tsx"
  - "apps/web/src/components/PreviewConversationPanel.tsx"
  - "apps/web/src/components/VisualInstructionComposer.tsx"
  - "apps/web/src/index.css"
  - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
  - "apps/server/test/horusChatTurn.test.mjs"
summary:
  - "Preview chat now loads or creates the isolated chat session for the selected workspace folder and user story."
  - "The composer submits to /api/horus/chat/turn and renders persisted user/Horus messages."
  - "Chat history is scrollable and preserved through the backend chat memory store."
  - "The visual composer keeps the Horus chat copy and the button pattern icon plus name."
  - "Intent detection was tightened so mentioning user story in a question does not trigger spec generation."
validation:
  passed:
    - "pnpm --filter @u-build/server build"
    - "pnpm --filter @u-build/web build"
    - "pnpm test"
    - "Chrome visual validation at http://<HORUS_PUBLIC_HOST>:5174/?mode=preview&v=horus-chat-ui-20260526"
    - "Sent a preview chat question and verified Horus answered as answer_question, not spec generation."
  notes:
    - "The old cached Chrome tab still showed stale Vite modules; validation used a new Chrome window with <HORUS_PUBLIC_HOST> cache-buster."
```
