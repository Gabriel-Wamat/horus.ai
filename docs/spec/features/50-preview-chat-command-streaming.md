# SPEC 50: Preview Chat Command Center With Real Streaming

```yaml
format_version: "agentic_sdd.v1"
task_id: "50-preview-chat-command-streaming"
title: "Preview chat command center with real streaming"
created_at_utc: "2026-05-27T02:29:49Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
```

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec detalhada para você de fato resolver esse problema, pesquise como isso é feito, quais as melhores práticas
```

Context from the immediately preceding bug report:

```yaml
related_user_report: |
  quando digito e dou enter a mensagem não entra logo no chat. além disso, a resposta do llm deve ser animada(como se fosse streaming, com os caracteres aparecendo em sequência assim como ocorre em chats como gpt, claude, gemini)
```

## 2. System Interpretation

```yaml
system_translation: |
  Replace the current preview chat request/response interaction with a production-grade conversational command center. The user message must appear immediately on Enter, the assistant turn must stream real response deltas from backend to frontend, and executable intents must expose action lifecycle state instead of pretending to be plain text.

expected_user_visible_result: |
  In the Preview screen, the chat behaves like a modern LLM chat: Enter submits instantly, the user bubble appears immediately, Horus shows a responsive thinking/streaming state, assistant text appears progressively from real backend chunks, and action requests such as "rode o projeto", "recarregue", "gere a spec" or "implemente..." show clear execution cards with status.

expected_engineering_result: |
  Add a streamed Horus chat endpoint, typed stream events, backend persistence/finalization rules, frontend stream consumer state, optimistic UI reconciliation, action cards, error/abort handling, regression tests and browser smoke validation.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "The preview chat feels broken because Enter waits for backend completion before the message appears, and assistant output is currently simulated rather than truly streamed."
  target_user: "Horus user operating a generated frontend preview and asking Horus questions or requesting controlled actions."
  expected_outcome: "The chat becomes the natural control surface for conversation, code questions and safe project actions."
  product_surface:
    - "Preview mode chat panel"
    - "Preview lifecycle controls"
    - "Agent execution handoff"
    - "Project file/code context evidence"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph"
      - "LangChain chat model adapter"
      - "File/Postgres repositories"
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
    database:
      - "Postgres optional persistence"
      - "File repositories for local mode"
    infrastructure:
      - "SSE already used for preview/workflow events"
  known_entrypoints:
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/components/VisualInstructionComposer.tsx"
    - "apps/web/src/api/horusChatApi.ts"
    - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
    - "apps/server/src/infrastructure/agents/HorusChatAgentImpl.ts"
    - "packages/shared/src/entities/HorusChat.ts"
  known_existing_patterns:
    - "Input validation uses shared Zod schemas."
    - "Frontend API clients live under apps/web/src/api."
    - "SSE stream consumption exists in apps/web/src/hooks/useSseStream.ts."
    - "Preview events and workflow events already model long-running state."
```

## 4. Research Findings and Best Practices

```yaml
researched_principles:
  - "Use real server-to-client streaming for perceived and actual latency improvement instead of waiting for the full model output."
  - "Represent stream lifecycle explicitly: start, text delta, metadata/evidence, action status, completion and error."
  - "Keep optimistic user messages separate from persisted server messages, then reconcile by stable ids."
  - "Do not confuse 'stream connected' with 'assistant text available'; show a thinking state until the first text delta arrives."
  - "For agent/tool/action workflows, stream typed events rather than only plain text so UI can render action cards, evidence and status."
  - "Persist final messages and enough stream metadata for reload/resume safety."
  - "Handle abort, retry and late backend failure without losing the user's submitted text."
  - "Moderate or validate final output before persistence when required; partial streaming has different safety tradeoffs than single-response completion."
```

Applied to Horus:

- The current simulated character animation is acceptable as a transitional UI effect, but the final implementation must stream real assistant deltas from the backend.
- Horus should not adopt a generic chat SDK as the orchestration core. The project already has intent routing, code context, preview runtime and agent execution; a thin custom SSE/data-stream layer better preserves those contracts.
- If a library is introduced later, it should be treated as UI transport only, not as the owner of Horus intent/action semantics.

## 5. Scope

```yaml
scope:
  in_scope:
    - "Add a streamed Horus chat turn endpoint."
    - "Define shared stream event schemas."
    - "Stream real answer_question text deltas from the LLM responder."
    - "Stream intent classification and action lifecycle events."
    - "Keep immediate optimistic user message behavior."
    - "Reconcile optimistic local messages with persisted server messages."
    - "Render assistant text progressively from stream chunks."
    - "Render action cards for run_project, code_change, generate_spec, clarify and unsupported outcomes."
    - "Render evidence/source metadata after it is available."
    - "Handle errors, aborts, duplicate submission and retry affordances."
    - "Add backend, frontend and guard tests."
    - "Run browser smoke validation in Preview mode."
  out_of_scope:
    - "Replacing the whole chat subsystem with Vercel AI SDK."
    - "Changing the LangGraph orchestration graph unrelated to chat actions."
    - "Changing project file editor behavior."
    - "Changing provider configuration beyond enabling stream support in the Horus chat responder."
    - "Adding multi-user collaboration."
    - "Adding voice, image input or visual region selection."
```

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/HorusChat.ts"
      - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      - "apps/server/src/infrastructure/agents/HorusChatAgentImpl.ts"
      - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
      - "apps/server/src/infrastructure/http/server.ts"
    services:
      - "SubmitHorusChatTurnUseCase"
      - "HorusOdinIntentRouter"
      - "HorusChatAgentImpl"
      - "ChatMemoryRepository"
      - "PreviewRuntimeReader"
      - "ChatCodeChangeExecutor"
      - "SpecGenerationExecutor"
    database:
      migrations_required: false
      tables:
        - "chat sessions/messages if Postgres mode already persists them"
  frontend:
    files:
      - "apps/web/src/api/horusChatApi.ts"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/components/VisualInstructionComposer.tsx"
      - "apps/web/src/index.css"
      - "apps/web/src/hooks/useSseStream.ts"
    components:
      - "PreviewConversationPanel"
      - "VisualInstructionComposer"
      - "new PreviewChatActionCard"
      - "new StreamingAssistantMessage"
    routes:
      - "mode=preview"
  workflow:
    graph_nodes:
      - "frontAgentNode"
      - "qaAgentNode"
      - "curatorAgentNode"
      - "specAgentNode"
    agents:
      - "Horus chat router"
      - "Spec Agent"
      - "Front Agent"
      - "QA Agent"
      - "Curator Agent"
  tests:
    unit:
      - "apps/server/test/horusChatTurn.test.mjs"
      - "apps/server/test/horusOdinIntentRouter.test.mjs"
      - "apps/web/test/frontendRegressionGuards.test.mjs"
    integration:
      - "new server streamed chat route test"
      - "new frontend stream reducer test if test harness exists"
    e2e:
      - "Playwright/browser smoke in Preview mode"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    The preview chat sits between user input, isolated chat memory, code context retrieval, preview runtime actions and LangGraph agent execution. This spec changes the transport and UI state model while preserving existing intent and action semantics.

  depends_on:
    - name: "ChatMemoryRepository"
      type: "backend_service"
      owner: "server/infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "buildAgentContext(chatSessionId), appendMessage(chatSessionId, input)"
      required_for: "Load isolated context and persist final user/assistant messages."
      assumptions: []
      failure_modes:
        - "Messages stream to UI but are not persisted."
        - "Reload loses assistant answer."
      fallback_or_recovery: "Emit stream error event and preserve local user message for retry."
      verification:
        - "Server test proves persisted user and assistant messages after stream completion."

    - name: "HorusOdinIntentRouter"
      type: "backend_service"
      owner: "application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "classify({ message, context }) -> HorusChatIntent"
      required_for: "Separate conversation from controlled actions."
      assumptions: []
      failure_modes:
        - "Action requests are answered as plain text."
        - "Questions accidentally mutate state."
      fallback_or_recovery: "Emit classification/error event and block unsafe execution."
      verification:
        - "Existing and new intent router tests for answer_question, run_project, code_change and unsupported."

    - name: "HorusChatAgentImpl"
      type: "backend_service"
      owner: "infrastructure/agents"
      direction: "this_spec_consumes_dependency"
      contract_used: "answer(...) currently returns Promise<string>; must extend with streamAnswer(...) or async iterable."
      required_for: "Stream real assistant text deltas."
      assumptions:
        - "createChatModel supports streaming or can be wrapped with LangChain streaming APIs."
      failure_modes:
        - "Provider lacks streaming support."
        - "Stream starts but no text deltas arrive."
      fallback_or_recovery: "Fallback to non-stream response only with explicit stream event marking degraded mode."
      verification:
        - "Unit test with fake streaming responder."

    - name: "PreviewRuntimeReader"
      type: "backend_service"
      owner: "application/usecases"
      direction: "this_spec_consumes_dependency"
      contract_used: "createSession/startSession/stopSession/reloadSession/getSession"
      required_for: "Execute run_project intents safely."
      assumptions: []
      failure_modes:
        - "Preview action succeeds but UI does not update session."
      fallback_or_recovery: "Emit action_failed with reason and preserve chat state."
      verification:
        - "Route test for start/reload/stop stream events."

    - name: "frontend stream consumer"
      type: "frontend_component"
      owner: "apps/web"
      direction: "this_spec_consumes_dependency"
      contract_used: "ReadableStream or EventSource parser for typed HorusChatStreamEvent"
      required_for: "Update UI progressively as events arrive."
      assumptions: []
      failure_modes:
        - "Duplicated messages."
        - "Never-ending pending state."
        - "Lost evidence metadata."
      fallback_or_recovery: "Client timeout and retry button."
      verification:
        - "Frontend reducer tests and browser smoke."

  depended_on_by:
    - name: "PreviewConversationPanel"
      type: "frontend_component"
      owner: "apps/web/components"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "chatMessages with pending/streaming/action states"
      compatibility_obligation: "must preserve existing ability to render persisted chat history"
      expected_consumer_behavior: "Render user message immediately, assistant deltas progressively, action cards by event status."
      migration_or_notification_required: false
      verification:
        - "Manual browser check in Preview mode."

    - name: "Agent Flow screen"
      type: "frontend_component"
      owner: "apps/web/features/agent-flow-map"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "workflowThreadId/run identifiers surfaced from action events"
      compatibility_obligation: "may extend, must not break current agent flow route"
      expected_consumer_behavior: "Can navigate users from action card to the related agent execution."
      migration_or_notification_required: false
      verification:
        - "Action card includes thread id when code_change/spec generation starts."

  bidirectional_integrations:
    - name: "Chat stream and persistence"
      participants:
        - "SubmitHorusChatTurnUseCase"
        - "ChatMemoryRepository"
      shared_contract: "HorusChatStreamEvent + ChatMessage"
      consistency_rule: "The final persisted assistant message body must equal concatenated text deltas plus final outcome summary."
      verification:
        - "Server test concatenates stream deltas and compares persisted message."

    - name: "Chat stream and preview runtime"
      participants:
        - "SubmitHorusChatTurnUseCase"
        - "PreviewRuntimeReader"
        - "VisualPreviewConsole"
      shared_contract: "previewSessionId and action lifecycle events"
      consistency_rule: "If stream emits preview_session_updated, frontend session state must match getSession result."
      verification:
        - "Integration test or browser smoke for 'rode o projeto'."

  data_flow:
    inbound:
      - source: "VisualInstructionComposer"
        payload_or_state: "chatSessionId, message, projectId, workspaceFolderId, userStoryId, previewSessionId"
        validation: "HorusChatTurnInputSchema"
    outbound:
      - target: "PreviewConversationPanel"
        payload_or_state: "HorusChatStreamEvent sequence"
        compatibility: "Typed events must be append-only and versioned."

  sequencing_dependencies:
    - dependency: "Shared stream schemas before backend/frontend implementation"
      reason: "Both sides must agree on event names and payloads."
      validation: "Typecheck shared, server and web packages."
    - dependency: "Backend stream route before frontend transport switch"
      reason: "Frontend needs stable event protocol."
      validation: "Server route test with fake responder."

  integration_risks:
    - risk: "Partial streamed text conflicts with final stored answer."
      severity: "high"
      mitigation: "Use final event as source of truth and reconcile by assistantMessageId."
    - risk: "Action events and answer text interleave unpredictably."
      severity: "medium"
      mitigation: "Emit monotonically increasing sequence numbers and deterministic event reducer."
    - risk: "User sends duplicate turns while stream is active."
      severity: "medium"
      mitigation: "Allow or block explicitly. For first implementation, block duplicate submission per chat session while stream active, with visible disabled state."
```

## 8. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Separate application, domain, infrastructure, and presentation concerns."
    - "Prefer dependency injection over direct construction of concrete services."
    - "Do not introduce circular dependencies."
    - "Do not duplicate business rules across layers."
  project_specific:
    - "Shared chat contracts must live in packages/shared/src/entities/HorusChat.ts or a sibling shared entity."
    - "Backend route must validate inputs through shared Zod schemas."
    - "Intent routing remains the source of truth for ASK vs ACTION."
    - "Chat frontend must not infer dangerous actions purely from local string matching."
    - "Preview chat must use project/userStory/chat scope provided by VisualPreviewConsole."
    - "Agent execution must continue through existing controlled executors, not direct shell commands."
```

## 9. Coding Rules

```yaml
coding_rules:
  general:
    - "Read current implementation before editing."
    - "Keep public APIs backward compatible where practical."
    - "Use typed schemas for every stream event."
    - "Handle errors explicitly and visibly."
    - "Do not silently drop late stream events."
  backend:
    - "Create a streaming route separate from the existing non-stream submit route for compatibility."
    - "Use SSE or fetch ReadableStream with newline-delimited JSON; prefer SSE if consistent with existing event infrastructure."
    - "Flush lifecycle events in deterministic order."
    - "Persist final message only once."
    - "If streaming provider fails after partial output, emit error and persist a failure assistant message only if product policy requires it."
  frontend:
    - "Render user message optimistically before network roundtrip."
    - "Show thinking state until first assistant text delta."
    - "Render text deltas progressively from backend, not from a completed string."
    - "Reconcile optimistic and persisted ids without duplicate bubbles."
    - "Keep scroll sticky only when user is near the bottom."
    - "Respect prefers-reduced-motion: reduce."
  tests:
    - "Cover success, action, failure and duplicate/reconciliation cases."
    - "Do not mark complete without browser runtime verification."
```

## 10. Contracts and Invariants

```yaml
contracts:
  api_contracts:
    - name: "POST /api/horus/chat/turn/stream"
      producer: "createHorusChatRouter"
      consumers:
        - "apps/web/src/api/horusChatApi.ts"
      request_shape: "HorusChatTurnInput"
      response_shape: "text/event-stream of HorusChatStreamEvent"
      compatibility: "new endpoint; existing /api/horus/chat/turn must continue working"

    - name: "HorusChatStreamEvent"
      producer: "packages/shared/src/entities/HorusChat.ts"
      consumers:
        - "SubmitHorusChatTurnUseCase"
        - "horusChatApi stream client"
        - "VisualPreviewConsole stream reducer"
      request_shape: "not applicable"
      response_shape: |
        union:
          - turn_started { sequence, localClientTurnId?, chatSessionId }
          - user_message_persisted { sequence, message }
          - intent_classified { sequence, intent }
          - assistant_message_started { sequence, messageId, createdAt }
          - assistant_text_delta { sequence, messageId, delta }
          - evidence_sources { sequence, messageId, evidenceSources, groundingStatus }
          - action_started { sequence, action, label, workflowThreadId?, previewSessionId? }
          - action_updated { sequence, action, status, summary?, workflowThreadId?, previewSessionId? }
          - assistant_message_completed { sequence, message, outcome }
          - turn_completed { sequence, response }
          - turn_failed { sequence, errorCode, message, retryable }
      compatibility: "append-only event types; never repurpose existing fields"

  domain_contracts:
    - name: "ASK must not mutate state except chat messages"
      producer: "SubmitHorusChatTurnUseCase"
      consumers:
        - "Horus user"
        - "ChatMemoryRepository"
      invariant: "answer_question may read code context and persist chat but must not start preview or workflow."

    - name: "ACTION must be explicit and controlled"
      producer: "HorusOdinIntentRouter"
      consumers:
        - "SubmitHorusChatTurnUseCase"
      invariant: "run_project/code_change/generate_spec execute only through controlled services and emit action lifecycle events."

  ui_contracts:
    - name: "Enter submits immediately"
      producer: "VisualInstructionComposer"
      consumers:
        - "Preview chat user"
      requirement: "Pressing Enter without Shift adds the user bubble within the same tick and starts stream state."

    - name: "Shift+Enter newline"
      producer: "VisualInstructionComposer"
      consumers:
        - "Preview chat user"
      requirement: "Shift+Enter inserts a newline and does not submit."

    - name: "Real assistant streaming"
      producer: "PreviewConversationPanel"
      consumers:
        - "Preview chat user"
      requirement: "Assistant body grows from backend delta events; it must not wait for final HTTP completion."

  data_contracts:
    - name: "Stream reconciliation ids"
      producer: "backend stream route"
      consumers:
        - "frontend stream reducer"
      migration_required: false
      compatibility_notes: "Frontend local ids must be replaceable by persisted message ids without duplicate render."
```

## 11. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current chat and stream infrastructure"
    agent: "repo_explorer"
    action: "Read current chat route, use case, responder, frontend API, preview panel, SSE hook and tests."
    expected_output: "Confirmed integration map and final file list."

  - step: 2
    name: "Define shared stream event contract"
    agent: "backend_specialist"
    action: "Add Zod schemas and TypeScript types for HorusChatStreamEvent, preserving existing HorusChatTurnResponse."
    expected_output: "Shared typed event union exported from @u-build/shared."

  - step: 3
    name: "Add backend streaming use case path"
    agent: "backend_specialist"
    action: "Refactor SubmitHorusChatTurnUseCase so the core turn can emit events through an async generator while keeping the old execute() wrapper."
    expected_output: "executeStream(input) or stream(input) returns AsyncIterable<HorusChatStreamEvent>."

  - step: 4
    name: "Implement real LLM text streaming"
    agent: "backend_specialist"
    action: "Extend HorusChatResponder with streamAnswer or equivalent provider-neutral async iterable. Use fake responder in tests."
    expected_output: "answer_question emits assistant_text_delta chunks as provider text arrives."

  - step: 5
    name: "Stream controlled action lifecycle"
    agent: "backend_specialist"
    action: "Emit action_started/action_updated for run_project, code_change, generate_spec, clarify and unsupported."
    expected_output: "Action events are visible before final assistant message."

  - step: 6
    name: "Add HTTP streaming route"
    agent: "backend_specialist"
    action: "Add POST /api/horus/chat/turn/stream as text/event-stream or NDJSON stream; wire abort handling and errors."
    expected_output: "Frontend can consume typed events from a stable route."

  - step: 7
    name: "Add frontend stream client and reducer"
    agent: "frontend_specialist"
    action: "Implement horusChatApi.submitTurnStream and a deterministic reducer for optimistic, pending, streaming, evidence, action and final states."
    expected_output: "VisualPreviewConsole consumes real stream events and reconciles ids."

  - step: 8
    name: "Upgrade chat UI"
    agent: "frontend_specialist"
    action: "Render streaming assistant body, thinking state, action cards, evidence sources, retry state and reduced-motion behavior."
    expected_output: "PreviewConversationPanel looks and behaves like a modern LLM command chat."

  - step: 9
    name: "Validate"
    agent: "qa_specialist"
    action: "Run server tests, web typecheck/build/guards, and browser smoke in Preview mode."
    expected_output: "Validation evidence with commands and runtime screenshots/logs."
```

## 12. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm stream protocol, boundaries and compatibility with existing chat/action architecture."
    inputs:
      - "SDD"
      - "current route/usecase/component files"
    outputs:
      - "approved event contract"

  - agent_name: "backend_specialist"
    responsibility: "Implement stream schemas, backend async generator, real model streaming, route, persistence and backend tests."
    inputs:
      - "packages/shared/src/entities/HorusChat.ts"
      - "SubmitHorusChatTurnUseCase"
      - "HorusChatAgentImpl"
      - "horusChatRoutes"
    outputs:
      - "backend diff"
      - "server tests"

  - agent_name: "frontend_specialist"
    responsibility: "Implement stream transport, reducer, optimistic reconciliation, assistant streaming UI and action cards."
    inputs:
      - "horusChatApi"
      - "VisualPreviewConsole"
      - "PreviewConversationPanel"
      - "VisualInstructionComposer"
    outputs:
      - "frontend diff"
      - "browser validation"

  - agent_name: "qa_specialist"
    responsibility: "Validate behavior and detect regressions."
    inputs:
      - "diff"
      - "acceptance criteria"
    outputs:
      - "test report"
      - "remaining risks"
```

## 13. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Pressing Enter inserts the user message into chat immediately, before backend response completes."
    - "Shift+Enter inserts a newline."
    - "The composer is disabled or guarded while a turn is actively streaming, with visible reason."
    - "Assistant text appears progressively from backend stream deltas."
    - "A thinking state is shown until the first assistant text delta or action event arrives."
    - "If the user asks a question about code, the final response shows evidence sources when available."
    - "If the user asks to run/reload/stop preview, the chat shows an action card and preview state updates."
    - "If the user asks for code change/spec generation, the chat shows accepted/blocked status and workflowThreadId when started."
    - "If backend fails mid-stream, the UI shows a failed assistant/action card and preserves the user's message."

  integration:
    - "Existing non-stream /api/horus/chat/turn remains compatible."
    - "Stream endpoint validates the same HorusChatTurnInput schema."
    - "Persisted chat messages match final streamed state."
    - "Preview session state is refreshed when stream emits previewSessionId."
    - "Workflow thread id is surfaced when action starts agents."

  architectural:
    - "Intent classification remains server-owned."
    - "Frontend does not execute project actions directly from string matching."
    - "No direct shell command path is introduced."
    - "Stream events are typed in shared contracts."

  quality:
    - "Server tests cover streamed answer, streamed preview action and stream failure."
    - "Web typecheck passes."
    - "Web build passes."
    - "Frontend regression guards cover immediate Enter behavior and no fake-only completed-string streaming."

  observability:
    - "Stream emits ordered lifecycle events with sequence numbers."
    - "Errors include retryable flag and user-safe message."
    - "Browser console has no feature-related errors."
```

## 14. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate shared stream schemas/types."
      success_condition: "exit code 0"

    - command: "pnpm --filter @u-build/server test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate backend chat streaming, route and action behavior."
      success_condition: "exit code 0"

    - command: "pnpm --filter @u-build/web type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate React/TypeScript integration."
      success_condition: "exit code 0"

    - command: "pnpm --filter @u-build/web test:guards"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend architectural guardrails."
      success_condition: "exit code 0"

    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate production bundle."
      success_condition: "exit code 0"

  runtime_checks:
    - name: "Immediate Enter submit"
      method: "browser"
      expected: "User bubble appears immediately and input clears while stream is active."

    - name: "Real assistant stream"
      method: "browser + network inspection"
      expected: "Response body receives multiple stream events before final completion."

    - name: "Action stream"
      method: "browser"
      expected: "A command like 'rode o projeto' shows action status and updates preview controls/session."

  integration_checks:
    - name: "persisted final state"
      surfaces:
        - "ChatMemoryRepository"
        - "PreviewConversationPanel"
      method: "submit streamed turn, reload messages"
      expected: "Reloaded history contains one user message and one assistant message without local duplicate."

  manual_checks:
    - "Verify reduced-motion mode does not force distracting character animation."
    - "Verify long answers keep scroll pinned only when user is already near bottom."
```

## 15. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent provider streaming APIs; inspect createChatModel and LangChain model capabilities first."
    - "Do not claim real streaming if the frontend only animates a completed string."
    - "Do not invent routes without registering them in server.ts."
  read_before_write:
    - "Read all current chat-related files before editing."
    - "Search for existing SSE helpers before creating transport code."
    - "Find all consumers of HorusChatTurnResponse before changing it."
  failure_handling:
    - "If stream parsing fails, inspect raw network payload and event schema."
    - "If provider streaming is unavailable, implement a typed degraded fallback and document it."
    - "If a command fails, rerun the smallest relevant validation after fixing."
  state_consistency:
    - "Do not update frontend event names without shared schema and backend route updates."
    - "Do not persist partial assistant text as completed."
    - "Do not lose local user message on backend failure."
  scope_control:
    - "Do not redesign the whole Preview page."
    - "Do not change Agent Flow graph unless needed to link workflowThreadId."
    - "Do not touch Project Files editor."
```

## 16. Recovery and Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary provider stream timeout"
    - "network interruption before final event"
    - "preview runtime start timeout"
  non_retryable_failures:
    - "invalid chatSessionId/userStoryId/projectId"
    - "context mismatch"
    - "unsupported command"
    - "missing active spec for code_change"
  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only changes introduced by this task."
    - "If a stream is interrupted, preserve user message and expose retry."
  escalation_rules:
    - "Escalate if provider lacks any streaming API."
    - "Escalate if schema migration is required unexpectedly."
    - "Escalate if action semantics conflict with existing safe tool boundaries."
```

## 17. Observability Requirements

```yaml
observability:
  logs:
    - event: "horus_chat_stream_started"
      fields:
        - "chat_session_id"
        - "project_id"
        - "user_story_id"
        - "message_id"
    - event: "horus_chat_intent_classified"
      fields:
        - "chat_session_id"
        - "intent_kind"
        - "confidence"
        - "mode"
    - event: "horus_chat_stream_completed"
      fields:
        - "chat_session_id"
        - "assistant_message_id"
        - "duration_ms"
        - "delta_count"
    - event: "horus_chat_stream_failed"
      fields:
        - "chat_session_id"
        - "error_type"
        - "retryable"
        - "duration_ms"
  audit_trail:
    required: true
    must_capture:
      - "chat input metadata"
      - "intent decision"
      - "actions started"
      - "previewSessionId/workflowThreadId"
      - "final persisted messages"
      - "test results"
  user_visible_failures:
    - "Show failed step."
    - "Show failure reason."
    - "Show retry action when safe."
```

## 18. Risks and Unknowns

```yaml
risks:
  - risk: "Current LLM adapter may not expose streaming."
    severity: "high"
    mitigation: "Inspect createChatModel and LangChain support before implementation; use fake responder tests; implement degraded fallback only if necessary."

  - risk: "Streaming partial text can expose content before final safety checks."
    severity: "medium"
    mitigation: "Keep Horus chat scoped to project assistance; avoid streaming sensitive env values; preserve existing prompt rules; consider final-only streaming for blocked/high-risk outputs."

  - risk: "Optimistic UI duplicates persisted user messages."
    severity: "medium"
    mitigation: "Use localClientTurnId or replace local messages by server ids on user_message_persisted."

  - risk: "Action card state diverges from preview/workflow state."
    severity: "medium"
    mitigation: "Refresh authoritative session/run state after action_updated or final event."

unknowns:
  - question: "Does createChatModel expose a provider-neutral stream method in the current implementation?"
    resolution_strategy: "inspect"

  - question: "Should Horus allow a second message while one is streaming?"
    resolution_strategy: "infer conservatively: block per chat session for first implementation"

  - question: "Should final assistant message body be action summary or a separate action card plus short text?"
    resolution_strategy: "implement both: action card from outcome, assistant body as user-readable summary"
```

## 19. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Use a custom typed SSE stream because Horus already owns intent routing, preview runtime, code context and agent orchestration. The stream should carry domain events, not just text tokens. Keep the existing non-stream route for compatibility and implement the stream route as the primary frontend path.

  alternatives_considered:
    - option: "Client-only fake streaming animation"
      tradeoff: "Improves feel but does not solve latency, action lifecycle or real backend progress."
    - option: "Adopt Vercel AI SDK useChat as core"
      tradeoff: "Good chat transport, but would obscure Horus-specific intent/action semantics unless wrapped carefully."
    - option: "Only use existing preview/workflow SSE after submit"
      tradeoff: "Does not stream assistant text and still leaves initial chat turn feeling delayed."

  migration_notes:
    - "Add stream endpoint without removing existing JSON endpoint."
    - "Frontend can fallback to JSON endpoint only if stream route fails before user message is persisted."

  backward_compatibility:
    required: true
    notes:
      - "Existing chat history loading must keep working."
      - "Existing tests for SubmitHorusChatTurnUseCase must pass."
      - "Existing preview toolbar controls must keep working independently of chat."
```

## 20. Deliverables

```yaml
deliverables:
  code:
    - "shared HorusChatStreamEvent schemas/types"
    - "server streamed chat route"
    - "streaming use-case path"
    - "streaming HorusChatResponder path"
    - "frontend stream API client"
    - "frontend stream reducer"
    - "streaming assistant message UI"
    - "chat action card UI"
  tests:
    - "server streamed answer test"
    - "server streamed action test"
    - "server stream failure test"
    - "frontend regression guard for immediate Enter behavior"
    - "frontend regression guard against fake-only final-string streaming"
  docs:
    - "spec changelog entry"
  validation_evidence:
    - "typecheck output"
    - "test output"
    - "build output"
    - "browser smoke notes"
```

## 21. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Relevant files were read."
    - "Existing SSE and chat patterns were identified."
    - "Upstream dependencies and downstream consumers were mapped."
  implementation:
    - "Shared stream contract added."
    - "Backend emits ordered real stream events."
    - "Frontend consumes stream events and reconciles optimistic state."
    - "Action cards show controlled execution lifecycle."
    - "No unrelated refactor was introduced."
  validation:
    - "Relevant server tests were run."
    - "Web typecheck was run."
    - "Web guard tests were run."
    - "Web build was run."
    - "Browser runtime behavior was checked."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

## 22. Minimal Output Contract for Executing Agent

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
