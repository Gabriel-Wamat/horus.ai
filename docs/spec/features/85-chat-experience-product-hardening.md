---
format_version: "agentic_sdd.v1"
task_id: "feature-85-chat-experience-product-hardening"
title: "Chat Experience Product Hardening"
created_at_utc: "2026-05-28T16:13:58Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.6.2"
status: "in_progress"
depends_on:
  - "spec/features/18-preview-chat-horus-contract.md"
  - "spec/features/19-preview-chat-frontend-horus-ui.md"
  - "spec/features/50-preview-chat-command-streaming.md"
  - "spec/features/65-event-sourced-chat-and-progress-streaming.md"
  - "spec/features/68-preview-chat-durable-workflow-recovery.md"
  - "spec/features/73-workflow-chat-memory-contract-spine.md"
  - "spec/features/75-monolith-decomposition.md"
---

# 85 - Chat Experience Product Hardening

## 1. Original User Request

```yaml
raw_user_request: |
  use a skill de criar spec e divide essa lista de problemas em 3 a 7 fases para você resolver, avalie
```

Related audit context:

```yaml
source_problem_list: |
  The chat UX audit found critical and high-priority problems:
  - no real idempotency on frontend chat submits;
  - no physical cancellation for chat generation/action execution;
  - race conditions in chat message sequence persistence;
  - VisualPreviewConsole acting as a god component;
  - chat hidden inside Preview instead of being a first-class Horus surface;
  - fragile heuristic scope binding between project, workspace folder and user story;
  - evidence/grounding metadata disappearing after reload;
  - confusing progress UX that overwrites assistant messages;
  - streaming, polling and EventSource competing for the same state;
  - chat memory/context growing without a proper lifecycle;
  - code retrieval being expensive and lexical;
  - no retry/resend affordance;
  - weak composer;
  - plain text response rendering;
  - inconsistent copy;
  - incomplete accessibility;
  - regex-only UX tests instead of behavior tests.
```

## 2. System Interpretation

```yaml
system_translation: |
  Create an executable, phased remediation SPEC for turning the current Horus chat from a Preview-attached
  technical panel into a product-grade conversational command surface. The plan must sequence the work into
  3 to 7 phases, evaluate the right number of phases, and make each phase implementable without overengineering
  or breaking existing agent/runtime contracts.

expected_user_visible_result: |
  The user should experience Horus chat as a fast, reliable, understandable product surface:
  messages submit instantly, actions are clearly represented, failures are retryable, progress is not confusing,
  sources persist across reloads, and the chat can be used without mentally reverse-engineering Preview state.

expected_engineering_result: |
  The codebase should gain a durable chat turn model, a smaller frontend architecture, clear scope contracts,
  one normalized chat event pipeline, persistent evidence metadata, better context selection, accessible UI states,
  and behavior-level tests.
```

## 3. Phase Count Evaluation

```yaml
phase_count_options:
  three_phases:
    verdict: "rejected"
    reason: |
      Three phases would force safety contracts, frontend decomposition, UX redesign, memory, retrieval and tests
      into oversized buckets. That increases regression risk and makes validation too coarse.
  four_phases:
    verdict: "acceptable_but_tight"
    reason: |
      Four phases could work if memory/retrieval and validation were folded into the final UX phase, but this would
      hide important backend quality work behind presentation changes.
  five_phases:
    verdict: "selected"
    reason: |
      Five phases keeps the first slice focused on correctness and safety, then separates architecture, product UX,
      context quality and validation. This is the smallest plan that still gives each high-risk area its own tests
      and acceptance criteria.
  six_or_seven_phases:
    verdict: "rejected_for_now"
    reason: |
      Six or seven phases would be useful for a large team, but for this local-first project it would create planning
      overhead and too many partially-complete milestones. Additional phases can be split later if a phase proves too large.

selected_phase_count: 5
```

## 4. Product and Technical Context

```yaml
business_context:
  user_problem: "The current chat feels unreliable, confusing and unfinished even though major backend pieces exist."
  target_user: "Horus operator using chat to ask about a generated project, run preview actions and request controlled agent changes."
  expected_outcome: "Chat becomes the main operational command surface, not an incidental Preview sidebar."
  product_surface:
    - "Horus chat"
    - "Preview chat panel"
    - "Preview action lifecycle"
    - "Workflow progress projection"
    - "Project/code context evidence"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph"
      - "LangChain"
      - "File/Postgres repositories"
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
    database:
      - "Postgres migrations"
      - "file-mode local stores"
    infrastructure:
      - "pnpm"
      - "Turborepo"
  known_entrypoints:
    - "packages/shared/src/entities/HorusChat.ts"
    - "packages/shared/src/entities/ChatMemory.ts"
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
    - "apps/server/src/infrastructure/repositories/PostgresChatMemoryRepository.ts"
    - "apps/server/src/infrastructure/chat/FileChatMemoryStore.ts"
    - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
    - "apps/server/src/infrastructure/agents/HorusChatAgentImpl.ts"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/components/VisualInstructionComposer.tsx"
    - "apps/web/src/features/visual-preview/previewChatMessages.ts"
    - "apps/web/src/api/horusChatApi.ts"
  known_existing_patterns:
    - "Shared contracts are Zod schemas in packages/shared."
    - "Frontend API clients live under apps/web/src/api."
    - "Preview and workflow streams already use typed SSE/event contracts."
    - "ID_VISUAL.md is the visual source of truth: dark operational shell, dense panels, chat + workflow + inspector."
    - "spec/ is local-only and indexed through spec/README.md plus spec/CHANGELOG.md."
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Make chat turns idempotent, cancellable and sequence-safe."
    - "Persist user-visible assistant state, evidence sources, grounding status and retry metadata."
    - "Split the frontend chat runtime out of VisualPreviewConsole into focused hooks/components."
    - "Normalize chat/assistant/action/workflow progress into a single UI timeline model."
    - "Add first-class retry/resend/stop affordances."
    - "Improve composer, response rendering, copy, accessibility and mobile behavior."
    - "Add context budget assembly for chat memory and code evidence without building a full vector DB."
    - "Replace regex-only guard coverage with behavior-level tests for the critical chat flows."
  out_of_scope:
    - "Rewriting the full agent graph."
    - "Adding voice, image input or collaborative multi-user chat."
    - "Introducing a heavy external chat framework as the owner of Horus semantics."
    - "Building full semantic vector retrieval in this spec; only lightweight indexed/ranked retrieval is allowed."
    - "Changing unrelated User Stories, Project Files or Agent Flow behavior except where chat integration requires it."
    - "Changing local spec files unrelated to this SPEC."
```

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/HorusChat.ts"
      - "packages/shared/src/entities/ChatMemory.ts"
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
      - "apps/server/src/infrastructure/repositories/PostgresChatMemoryRepository.ts"
      - "apps/server/src/infrastructure/chat/FileChatMemoryStore.ts"
      - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
      - "apps/server/src/infrastructure/agents/HorusChatAgentImpl.ts"
    services:
      - "SubmitHorusChatTurnUseCase"
      - "ChatMemoryRepository"
      - "ReadOnlyCodeContextService"
      - "HorusChatAgentImpl"
      - "HorusOdinIntentRouter"
    database:
      migrations_required: true
      tables:
        - "chat_messages"
        - "chat_sessions"
  frontend:
    files:
      - "apps/web/src/api/horusChatApi.ts"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/components/VisualInstructionComposer.tsx"
      - "apps/web/src/features/visual-preview/previewChatMessages.ts"
      - "apps/web/src/styles/preview-conversation.css"
      - "apps/web/src/styles/preview-chat-message.css"
      - "apps/web/src/styles/visual-composer.css"
    components:
      - "VisualPreviewConsole"
      - "PreviewConversationPanel"
      - "VisualInstructionComposer"
      - "new ChatTimeline"
      - "new ChatTurnCard"
      - "new ChatComposer"
      - "new ChatScopeBar"
    routes:
      - "Preview mode"
      - "Potential new Chat mode only if phase 3 proves it is necessary and low-risk"
  workflow:
    graph_nodes:
      - "No topology change planned."
    agents:
      - "Horus chat responder"
      - "Horus/Odin intent router"
      - "Chat-triggered Front/QA/Curator workflow handoff"
  tests:
    unit:
      - "apps/server/test/horusChatTurn.test.mjs"
      - "apps/server/test/chatMemoryStore.test.mjs"
      - "apps/server/test/readOnlyCodeContextService.test.mjs"
      - "apps/web/test/frontendRegressionGuards.test.mjs"
    integration:
      - "new chat stream reducer tests"
      - "new chat timeline behavior tests"
      - "new chat idempotency/cancellation server tests"
    e2e:
      - "Playwright/browser smoke for send, stream, cancel, retry, reload evidence persistence"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    Chat sits at the boundary between user intent, isolated memory, project/code context, preview runtime,
    workflow execution and frontend rendering. This SPEC must preserve existing action semantics while making
    the turn lifecycle durable and the UI understandable.

  depends_on:
    - name: "Shared Horus chat schemas"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "HorusChatTurnInputSchema, HorusChatStreamEventSchema, HorusChatOutcomeSchema"
      required_for: "Type-safe client/server chat turn lifecycle."
      assumptions: []
      failure_modes:
        - "Frontend and backend disagree about event shape."
        - "Reload loses status/evidence because metadata is not in the contract."
      fallback_or_recovery: "Version events additively and keep old fields compatible."
      verification:
        - "packages/shared schema tests"
        - "server stream tests"

    - name: "ChatMemoryRepository"
      type: "backend_service"
      owner: "apps/server/infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "createSession, appendMessage, listMessages, buildAgentContext"
      required_for: "Persist and replay chat turns, status and evidence."
      assumptions:
        - "Postgres is the only production-safe concurrent driver."
      failure_modes:
        - "Duplicate sequence numbers."
        - "Evidence disappears after reload."
        - "Failed turns cannot be retried cleanly."
      fallback_or_recovery: "Use transactional append in Postgres and file locks in local mode."
      verification:
        - "concurrent append test"
        - "reload evidence persistence test"

    - name: "Preview runtime"
      type: "backend_service"
      owner: "apps/server/infrastructure/preview"
      direction: "this_spec_consumes_dependency"
      contract_used: "createSession, startSession, stopSession, reloadSession, getSession"
      required_for: "Run/stop/reload actions from chat."
      assumptions: []
      failure_modes:
        - "Chat says preview started while preview failed."
      fallback_or_recovery: "Action turn emits failed status and retry affordance."
      verification:
        - "controlled preview action lifecycle tests"

    - name: "Workflow progress stream"
      type: "event_stream"
      owner: "apps/server/domain + apps/web/features/visual-preview"
      direction: "this_spec_consumes_dependency"
      contract_used: "workflow progress events with threadId, status, filePaths and terminal states"
      required_for: "Show action progress without overwriting assistant text."
      assumptions: []
      failure_modes:
        - "Progress appears as noisy chat messages."
        - "Multiple EventSources create duplicate events."
      fallback_or_recovery: "Normalize into turn timeline events and dedupe by event id."
      verification:
        - "frontend stream reducer tests"

    - name: "ReadOnlyCodeContextService"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "buildContext(project, chatContext, query)"
      required_for: "Ground chat answers in selected project files."
      assumptions: []
      failure_modes:
        - "Slow lexical scan harms perceived chat latency."
        - "Irrelevant files pollute the answer."
      fallback_or_recovery: "Use bounded candidates, lightweight index and explicit partial grounding."
      verification:
        - "retrieval relevance and budget tests"

  depended_on_by:
    - name: "PreviewConversationPanel"
      type: "frontend_component"
      owner: "apps/web/components"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Chat timeline props, composer actions, scope state, error/retry state"
      compatibility_obligation: "Preserve Preview mode while extracting chat responsibilities."
      expected_consumer_behavior: "Render normalized turns instead of managing backend transport."
      migration_or_notification_required: false
      verification:
        - "component behavior tests"

    - name: "VisualPreviewConsole"
      type: "frontend_component"
      owner: "apps/web/components"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Slim container that wires selected project/session to chat hooks and preview canvas."
      compatibility_obligation: "Must not keep growing as god component."
      expected_consumer_behavior: "Own Preview layout only; delegate chat runtime to hooks/services."
      migration_or_notification_required: false
      verification:
        - "line budget and import boundary guard"

    - name: "Horus operator"
      type: "external_consumer"
      owner: "product"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Visible chat behavior: send, stream, stop, retry, inspect sources, follow action progress."
      compatibility_obligation: "No silent action, no hidden failure, no lost user input."
      expected_consumer_behavior: "Use chat as operational command surface."
      migration_or_notification_required: false
      verification:
        - "browser smoke"

  bidirectional_integrations:
    - name: "Chat turn lifecycle"
      participants:
        - "apps/web chat client"
        - "apps/server SubmitHorusChatTurnUseCase"
      shared_contract: "HorusChatStreamEventSchema and persisted ChatMessage metadata"
      consistency_rule: "Every submitted turn must reach exactly one terminal UI state: completed, failed, cancelled or accepted-running."
      verification:
        - "stream lifecycle tests"
        - "reload replay test"

    - name: "Chat action to workflow progress"
      participants:
        - "SubmitHorusChatTurnUseCase"
        - "WorkflowOrchestrator"
        - "Chat timeline UI"
      shared_contract: "workflowThreadId + durable progress event projection"
      consistency_rule: "Progress events are attached to the originating turn and must not overwrite assistant text."
      verification:
        - "chat code-change orchestration tests"
        - "frontend progress timeline tests"

  data_flow:
    inbound:
      - source: "User composer"
        payload_or_state: "message, chatSessionId, projectId, workspaceFolderId, userStoryId, previewSessionId, idempotencyKey"
        validation: "HorusChatTurnInputSchema plus client-side non-empty and scope readiness checks"
      - source: "Backend stream"
        payload_or_state: "typed chat events with sequence, event type, message/status/evidence/action payload"
        validation: "HorusChatStreamEventSchema"
    outbound:
      - target: "Chat memory"
        payload_or_state: "ChatMessage with deliveryStatus, eventType, metadata, contextSnapshot"
        compatibility: "Additive fields only; old messages must still parse."
      - target: "Chat timeline"
        payload_or_state: "Normalized ChatTurnViewModel"
        compatibility: "Component owns presentation only, not backend transport."

  sequencing_dependencies:
    - dependency: "Phase 1 must land before UI redesign"
      reason: "A prettier chat on top of non-idempotent, non-cancellable turns would hide correctness bugs."
      validation: "server tests for idempotency, cancellation and sequence safety pass."
    - dependency: "Phase 2 must land before major composer/timeline redesign"
      reason: "The current god component blocks reliable UX changes."
      validation: "VisualPreviewConsole loses transport/state responsibilities."
    - dependency: "Phase 4 must land before claiming grounding quality"
      reason: "Evidence UI is only trustworthy when context selection is budgeted and persisted."
      validation: "retrieval and evidence persistence tests pass."

  integration_risks:
    - risk: "Changing event contracts can break Preview and Agent Flow consumers."
      severity: "high"
      mitigation: "Additive schemas, shared projection tests and replay fixtures."
    - risk: "Cancelling a turn could leave orphaned workflow progress."
      severity: "high"
      mitigation: "Terminal cancellation event, backend abort propagation and persisted cancelled state."
    - risk: "Extracting components can accidentally change Preview project/session selection."
      severity: "medium"
      mitigation: "Lock existing Preview behavior with targeted tests before extraction."
```

## 8. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Keep shared schemas as the source of truth for frontend/backend contracts."
    - "Separate transport, domain turn lifecycle, view-model mapping and presentation."
    - "Prefer hooks/services with narrow responsibilities over god components."
    - "Do not hide backend failures behind optimistic UI."
    - "Do not introduce circular dependencies."
    - "Do not add a heavy framework for basic chat state unless the local contracts cannot support the requirement."
  project_specific:
    - "Preserve the ID_VISUAL.md dark operational shell and dense technical UI language."
    - "Keep chat isolated by workspaceFolderId, userStoryId, projectId and chatSessionId."
    - "Controlled actions must go through Horus/Odin and existing workflow/preview capabilities, never arbitrary shell."
    - "Evidence and grounding shown in the UI must be reload-safe."
    - "Every turn must have a terminal state."
    - "Frontend tests must cover behavior; regex guard tests are not enough for new chat UX."
```

## 9. Phased Execution Plan

### Phase 1 - Turn Safety, Persistence and Cancellation

```yaml
phase:
  id: "85.1"
  title: "Durable chat turn lifecycle"
  priority: "p0"
  goal: |
    Make each chat turn safe before improving presentation: idempotent submit, sequence-safe persistence,
    cancellation propagation, durable terminal state and reload-safe evidence metadata.
  in_scope:
    - "Add a stable client-generated idempotencyKey for every submitted turn."
    - "Persist turn status/metadata/evidence in ChatMessage metadata or a narrow additive schema."
    - "Add cancellation support from frontend AbortController through route request close to responder/workflow action where feasible."
    - "Fix Postgres sequence allocation with transaction/lock or insert-side sequence strategy."
    - "Add a file-mode lock or explicit single-process guard for local chat message append."
    - "Ensure failed/cancelled turns persist a visible assistant/system record with retryability."
  affected_files:
    - "packages/shared/src/entities/HorusChat.ts"
    - "packages/shared/src/entities/ChatMemory.ts"
    - "apps/web/src/api/horusChatApi.ts"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/infrastructure/repositories/PostgresChatMemoryRepository.ts"
    - "apps/server/src/infrastructure/chat/FileChatMemoryStore.ts"
  acceptance:
    - "Duplicate submit with the same key does not create duplicate user messages or duplicate workflow starts."
    - "Concurrent appends in the same session do not duplicate sequence."
    - "User can cancel an in-flight response from the UI and receives a cancelled terminal state."
    - "Evidence/grounding on assistant answer survives reload."
  validation:
    - "pnpm --filter @u-build/shared test -- --run"
    - "pnpm --filter @u-build/server test -- --run horusChatTurn"
    - "pnpm --filter @u-build/server test -- --run chatMemoryStore"
```

### Phase 2 - Chat Runtime Decomposition and Unified Event Model

```yaml
phase:
  id: "85.2"
  title: "Extract chat runtime from Preview god component"
  priority: "p1"
  goal: |
    Reduce VisualPreviewConsole to layout/orchestration wiring and move chat session loading,
    stream handling, progress replay and message normalization into focused modules.
  in_scope:
    - "Create useChatSessionScope for project/workspace/user-story binding."
    - "Create useChatTurnStream for submit/stream/cancel/retry state."
    - "Create useChatTimeline or chatTimelineReducer for normalized turn events."
    - "Deduplicate streaming, polling and workflow EventSource paths into a single view-model pipeline."
    - "Keep Preview canvas and toolbar behavior unchanged."
  affected_files:
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/features/visual-preview/previewChatMessages.ts"
    - "apps/web/src/features/visual-preview/workflowProgress.ts"
    - "apps/web/src/features/visual-preview/projectSelection.ts"
    - "apps/web/src/api/horusChatApi.ts"
  acceptance:
    - "VisualPreviewConsole no longer owns raw chat stream parsing, polling and turn mutation logic."
    - "Workflow progress events attach to a turn timeline and do not overwrite assistant text."
    - "Existing Preview project selection and canvas controls keep working."
    - "Component boundaries are testable without reading giant source strings."
  validation:
    - "pnpm --filter @u-build/web test:guards"
    - "new reducer/hook tests for chat timeline event ordering"
```

### Phase 3 - Product UX: Composer, Timeline, Retry and Rendering

```yaml
phase:
  id: "85.3"
  title: "Make chat feel like a product surface"
  priority: "p1"
  goal: |
    Replace the current sidebar-like chat with an operational, readable interaction model:
    clear scope, clear intent, clear action progress, retry/stop affordances and rich technical rendering.
  in_scope:
    - "Build ChatScopeBar showing selected project, user story, preview status and grounding state."
    - "Build ChatComposer with send, stop, retry, keyboard behavior, disabled reasons and intent preview copy."
    - "Build ChatTimeline/ChatTurnCard separating assistant text from action/progress/tool events."
    - "Render code blocks, diffs, file references, evidence sources and terminal errors safely."
    - "Normalize copy into Portuguese product language consistent with Horus and ID_VISUAL.md."
    - "Add accessibility labels, live regions, focus recovery and mobile layout checks."
  affected_files:
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/components/VisualInstructionComposer.tsx"
    - "apps/web/src/styles/preview-conversation.css"
    - "apps/web/src/styles/preview-chat-message.css"
    - "apps/web/src/styles/visual-composer.css"
    - "apps/web/src/index.css"
  acceptance:
    - "Empty state explains exactly what is missing and how to proceed."
    - "User can see whether Horus is answering, executing, blocked, failed, cancelled or done."
    - "Failed turns expose retry/copy-details behavior without losing the original input."
    - "Long technical answers remain readable and do not overflow the panel."
    - "Mobile layout remains coherent."
  validation:
    - "behavior tests for send, stop, retry, failed turn and evidence rendering"
    - "Playwright/browser screenshots for desktop and mobile Preview chat"
```

### Phase 4 - Context Quality, Memory Budget and Retrieval Efficiency

```yaml
phase:
  id: "85.4"
  title: "Bounded context for reliable answers"
  priority: "p2"
  goal: |
    Improve answer quality and cost without overengineering a full RAG platform. Add bounded chat context
    assembly, lightweight project indexing and relevance ranking that makes evidence trustworthy.
  in_scope:
    - "Create ChatContextAssembler to select recent messages, summaries and workflow snippets under a token/byte budget."
    - "Persist or reuse compact conversation summaries instead of passing raw growing history."
    - "Add lightweight per-project file index metadata to avoid scanning every file for every answer."
    - "Improve ReadOnlyCodeContextService ranking with explicit path/symbol hints and capped concurrency."
    - "Expose retrieval status and partial grounding clearly to the UI."
  affected_files:
    - "packages/shared/src/entities/CodeContext.ts"
    - "packages/shared/src/entities/HorusChat.ts"
    - "apps/server/src/application/services/ChatContextAssembler.ts"
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/infrastructure/agents/HorusChatAgentImpl.ts"
    - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
    - "apps/server/src/application/services/AgentMemoryService.ts"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/features/visual-preview/chatTurnStream.ts"
    - "apps/web/src/features/visual-preview/previewChatMessages.ts"
    - "apps/web/src/styles/preview-chat-message.css"
  acceptance:
    - "Chat responder never receives unbounded full history."
    - "Grounded answers cite persisted evidence that reloads correctly."
    - "No-match/partial retrieval is visible and honest."
    - "Retrieval latency does not scale linearly with every source file for common repeated questions."
  validation:
    - "readOnlyCodeContextService relevance tests"
    - "chat context budget tests"
    - "HorusChatAgent prompt assembly tests"
```

### Phase 5 - Behavioral QA, Visual Evidence and Regression Gates

```yaml
phase:
  id: "85.5"
  title: "Prove the chat works"
  priority: "p1"
  goal: |
    Replace fragile regex-only confidence with executable behavioral proof for the chat experience.
  in_scope:
    - "Add server tests for stream lifecycle, cancellation, duplicate submit and reload replay."
    - "Add frontend reducer/component tests for streaming, progress, retry and evidence rendering."
    - "Add browser smoke for Preview chat send/stream/cancel/retry/reload."
    - "Keep regex guards only for architectural invariants such as line budgets and import boundaries."
    - "Document a manual runbook for validating chat UX after large runtime changes."
  affected_files:
    - "apps/server/test/horusChatTurn.test.mjs"
    - "apps/server/test/chatMemoryStore.test.mjs"
    - "apps/server/test/readOnlyCodeContextService.test.mjs"
    - "apps/web/test/frontendRegressionGuards.test.mjs"
    - "new apps/web tests for chat timeline behavior"
    - "new browser/playwright validation script if local project supports it"
  acceptance:
    - "All critical chat flows have behavior-level tests."
    - "Browser smoke captures evidence for desktop and mobile states."
    - "A future refactor cannot pass by merely preserving source-code strings."
  validation:
    - "pnpm test"
    - "pnpm --filter @u-build/web test:guards"
    - "browser validation command documented by implementation"
```

## 10. Implementation Rules

```yaml
implementation_rules:
  - "Do not start with visual polish before Phase 1 correctness is fixed."
  - "Keep each phase independently reviewable and testable."
  - "Avoid introducing a generic chat SDK as the source of truth for Horus turn semantics."
  - "Do not remove existing Preview functionality while extracting chat modules."
  - "Do not widen mutable action permissions from chat."
  - "Never claim cancellation is complete unless the active backend work observes an AbortSignal or records a bounded uncancellable residual risk."
  - "Every new persisted field must be additive and backwards-compatible with old local data."
  - "Every user-visible error must be specific, retry-aware and non-secret."
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  product:
    - "Sending a message is immediate and cannot accidentally duplicate work."
    - "The user can stop a running turn."
    - "The user can retry failed turns without retyping."
    - "Action progress is visible but does not replace assistant text."
    - "Sources/evidence persist after reload."
    - "Disabled states explain exactly what is missing."
    - "The chat is readable on desktop and mobile."
  engineering:
    - "Chat turn lifecycle has exactly one terminal state."
    - "VisualPreviewConsole is no longer a god component for chat runtime."
    - "Chat memory context is budgeted."
    - "Code retrieval is bounded and tested."
    - "Tests cover behavior, not only source-code regex."
```

## 12. Output Contract for Executing Agent

```yaml
output_contract:
  after_each_phase:
    - "List files changed."
    - "List validation commands and exact results."
    - "State remaining risks and whether the next phase can safely start."
    - "Update this SPEC implementation log."
    - "Update spec/CHANGELOG.md only when the phase meaningfully changes the local spec record."
  final_completion:
    - "Show before/after architecture of chat runtime."
    - "Show evidence for browser UX validation."
    - "Confirm no critical chat UX findings remain open except explicitly accepted residual risks."
```

## 13. Implementation Log

```yaml
implementation_log:
  - version: "0.6.2"
    date: "2026-05-28"
    phase: "85.5-chat-incident-fix"
    changes:
      - "Changed the Horus local development backend default port from 3000 to 3001 and aligned the Vite API proxy default to 3001 so chat requests do not hit unrelated local apps on port 3000."
      - "Added stream-empty fallback in SubmitHorusChatTurnUseCase: if a provider opens a stream but emits no assistant text, the use case falls back to the non-stream responder before persisting a completed assistant message."
      - "Stopped loading code retrieval/evidence for direct conversational replies such as exact-response prompts and greetings, preventing useless source cards on simple chat answers."
      - "Updated .env.example to show PORT=3001 for local Horus backend execution."
    validation:
      - "pnpm --filter @u-build/server build: passed."
      - "pnpm --filter @u-build/web type-check: passed."
      - "node --test apps/server/test/horusChatTurn.test.mjs: passed, 21 tests."
      - "pnpm --filter @u-build/web test:guards: passed, 18 tests."
      - "curl http://<HORUS_PUBLIC_HOST>:3001/health: returned status ok."
      - "curl http://<HORUS_PUBLIC_HOST>:5173/api/preview/projects?visibility=visible: returned real project records through the Vite proxy."
      - "In-app browser real chat send: message 'diga exatamente: ok sem fontes' produced completed Horus reply 'ok sem fontes', composer returned to Pronto, no Failed to fetch text and no console errors."
    residual_risks:
      - "The in-app browser screenshot API timed out while capturing evidence, so this validation used DOM state, console logs and live API checks instead of a fresh screenshot artifact."
  - version: "0.6.1"
    date: "2026-05-28"
    phase: "85.5-no-mock-runtime-correction"
    changes:
      - "Removed the frontend runtime path that fabricated an idle Horus run with a zero UUID when no real run existed."
      - "Deleted the idle run snapshot helper so Agent Flow renders an explicit empty state until a real backend/local run is available."
      - "Stopped using a synthetic WorkflowState only to surface persisted specs in the UI; StorySpecWorkspace now receives persisted spec records directly from the real workspace state."
      - "Reaffirmed the project rule for phase 85: behavior validation must use real Horus API/runtime state or explicit empty/error UI, not fabricated IDs, chats, projects or events."
    validation:
      - "rg createIdleHorusRunSnapshot/zero UUID/visualPreviewBehavior/project-manager hardcoded runtime search: no runtime fake idle run or deleted mock test found; only live validation notes remain in this spec."
      - "pnpm --filter @u-build/web test:guards: passed, 18 tests."
      - "pnpm --filter @u-build/web type-check: passed."
  - version: "0.6.0"
    date: "2026-05-28"
    phase: "85.5"
    changes:
      - "Rejected mock-heavy frontend behavior tests for this phase and kept the new gate tied to real running Horus state instead of fabricated chat/project/event fixtures."
      - "Made the Vite API proxy target configurable through HORUS_API_PROXY_TARGET so local browser validation can run when port 3000 is owned by another project."
      - "Extended scripts/preview-browser-smoke.mjs to validate the real Preview chat surface: panel, composer, scope bar, settled status, enabled/disabled textarea state, horizontal overflow and screenshot evidence."
      - "Added desktop and mobile chat surface checks to the existing browser smoke, using real API projects/sessions and DOM state instead of mocked data."
      - "Validated that the live Horus stack is not accidentally pointed at the unrelated Next/BCAP process on port 3000."
    validation:
      - "node --check scripts/preview-browser-smoke.mjs: passed."
      - "pnpm --filter @u-build/web test:guards: passed, 18 tests."
      - "pnpm --filter @u-build/web type-check: passed."
      - "pnpm --filter @u-build/web build: passed."
      - "pnpm --filter @u-build/server build: passed."
      - "PORT=3001 HOST=<HORUS_PUBLIC_HOST> pnpm --filter @u-build/server dev: live backend started successfully."
      - "HORUS_API_PROXY_TARGET=http://<HORUS_PUBLIC_HOST>:3001 pnpm --filter @u-build/web dev -- --host <HORUS_PUBLIC_HOST> --port 5173: live web started successfully."
      - "HORUS_BASE_URL=http://<HORUS_PUBLIC_HOST>:5173 HORUS_API_BASE_URL=http://<HORUS_PUBLIC_HOST>:3001 HORUS_PREVIEW_SMOKE_ARTIFACT_DIR=/tmp/horus-phase5-preview-smoke pnpm preview:smoke: passed with real project project-manager-ui-generation, chat status Pronto, textarea enabled, desktop/mobile no horizontal overflow and screenshots written to /tmp/horus-phase5-preview-smoke."
      - "In-app browser DOM check at http://<HORUS_PUBLIC_HOST>:5173/?mode=preview: passed; title U-Build, project project-manager-ui-generation, status Pronto, textarea enabled, hasPanel=true, hasScope=true, messageCount=6, no horizontal overflow, no console errors."
    residual_risks:
      - "The phase 5 browser gate proves real local Preview/chat readiness, layout and evidence surfaces, but it intentionally does not submit a live LLM chat turn because that would spend provider quota and mutate user chat history."
      - "The current smoke still depends on the local data set having at least one visible frontend project."
  - version: "0.5.0"
    date: "2026-05-28"
    phase: "85.4"
    changes:
      - "Added ChatContextAssembler to build bounded Horus chat context from compact summaries plus recent visible messages under a byte budget."
      - "Connected SubmitHorusChatTurnUseCase to the assembler before intent classification and responder prompt assembly, reusing AgentMemoryService summaries through a narrow reader contract."
      - "Updated HorusChatAgentImpl to trust the pre-budgeted context instead of slicing arbitrary history at prompt time, and to include retrieval status/notes in the system prompt."
      - "Extended CodeContext and HorusChat shared schemas with retrievalStatus, retrievalNotes and retrievalStats so partial/no-match grounding is explicit and reload-safe."
      - "Improved ReadOnlyCodeContextService ranking with explicit path hints, path/symbol scoring, bounded content scans and capped concurrency instead of scanning every source file for every answer."
      - "Rendered retrieval status and retrieval notes in Preview chat evidence cards so weak grounding is visible rather than silently presented as authoritative."
      - "Added focused regression tests for chat context pruning/summary reuse, bounded responder context, retrieval scan caps, explicit path grounding and shared stream/outcome contracts."
    validation:
      - "pnpm --filter @u-build/shared build: passed."
      - "pnpm --filter @u-build/server build: passed."
      - "pnpm --filter @u-build/web type-check: passed."
      - "node --test packages/shared/test/horusChat.test.mjs apps/server/test/chatContextAssembler.test.mjs apps/server/test/horusChatTurn.test.mjs apps/server/test/readOnlyCodeContextService.test.mjs: passed, 32 tests."
      - "pnpm --filter @u-build/web test:guards: passed, 18 tests."
      - "pnpm --filter @u-build/web build: passed."
    residual_risks:
      - "This phase intentionally avoids a full vector DB/RAG platform; retrieval is now bounded and ranked but still lexical/path-based."
      - "Phase 85.5 still needs richer behavior/browser validation for chat flows beyond targeted backend/schema/source guards."
  - version: "0.4.0"
    date: "2026-05-28"
    phase: "85.3"
    changes:
      - "Added ChatScopeBar to expose selected project, isolated story scope, Preview status and latest grounding state."
      - "Reworked Preview chat messages into ChatTurnCard rendering with lifecycle status chips, retry/copy-details actions, terminal error codes, evidence rendering and safe code/file-reference parsing."
      - "Extended VisualInstructionComposer with explicit readiness/disabled state copy, stable submit/cancel controls and compact product styling aligned with ID_VISUAL."
      - "Threaded retryInstruction through the extracted Preview chat runtime so failed/cancelled assistant turns can resend the previous user request without retyping."
      - "Mapped persisted/streamed turnStatus, retryable, errorCode, action and cancellation metadata through previewChatMessages and chatTurnStream."
      - "Fixed a real render-loop bug where useProjectChatScope received a new inline onError callback every render, keeping the chat stuck on context loading."
      - "Fixed the intermediate/mobile Preview layout by stacking below 900px, using two-column scope metadata, preventing horizontal overflow and separating workflow activity from the composer."
    validation:
      - "pnpm --filter @u-build/web type-check: passed."
      - "pnpm --filter @u-build/web test:guards: passed, 18 tests."
      - "pnpm --filter @u-build/web build: passed."
      - "Browser validation at http://<HORUS_PUBLIC_HOST>:5173/?mode=preview: passed at 869px wide; composer status Pronto, input enabled, no horizontal overflow, no workflow/composer overlap."
      - "Playwright screenshots/checks: desktop 1440x900, narrow 863x954 and mobile 390x844 passed with no horizontal overflow and enabled composer."
    residual_risks:
      - "Phase 85.5 still needs real component/browser behavior tests beyond the strengthened source guards."
      - "Phase 85.4 still needs bounded context/retrieval work before answer quality and token cost can be considered production-grade."
  - version: "0.3.0"
    date: "2026-05-28"
    phase: "85.2"
    changes:
      - "Extracted chat scope resolution from VisualPreviewConsole into useProjectChatScope."
      - "Extracted chat session loading, polling, submit, cancel, replay hydration and instruction state into usePreviewChatRuntime."
      - "Extracted Horus stream event mutation into chatTurnStream so VisualPreviewConsole no longer owns raw assistant_text_delta/action/terminal event parsing."
      - "Extracted workflow progress SSE, replay, project-file refresh projection and activity timers into useWorkflowProgressRuntime."
      - "Added mapVisibleProjectChatMessages to keep server-message filtering/mapping in one feature utility."
      - "Reduced VisualPreviewConsole from 896 lines to 252 lines while preserving Preview toolbar/canvas behavior."
      - "Updated frontend guards to enforce the new boundaries and keep raw submitTurnStream/EventSource/setInterval parsing out of VisualPreviewConsole."
    validation:
      - "pnpm --filter @u-build/web type-check: passed."
      - "pnpm --filter @u-build/web test:guards: passed, 17 tests."
      - "pnpm --filter @u-build/web build: passed."
    residual_risks:
      - "The new tests still rely heavily on source guards; phase 85.5 must add richer browser/component behavior coverage."
      - "The chat remains embedded in the Preview surface; phase 85.3 decides whether to promote it to a stronger first-class product surface."
  - version: "0.2.0"
    date: "2026-05-28"
    phase: "85.1"
    changes:
      - "Implemented durable chat turn metadata with lifecycle status, idempotency keys, persisted intent/outcome, reload-safe evidence sources and grounding status."
      - "Added cooperative cancellation from frontend AbortController through HTTP route AbortSignal into chat responder/action execution, with a persisted cancelled terminal assistant record."
      - "Added duplicate-submit replay for idempotent turns so repeated requests do not create duplicate messages or duplicate workflow starts."
      - "Made local file chat appends single-session serialized and Postgres chat message sequence allocation transactional with session row locking."
      - "Added Postgres migration 014 with a per-session idempotency guard for Horus turn messages."
      - "Added a visible cancel affordance to the chat composer and mapped cancelled stream events in the Preview chat UI."
    validation:
      - "pnpm --filter @u-build/shared build: passed."
      - "pnpm --filter @u-build/server build: passed."
      - "pnpm --filter @u-build/web type-check: passed."
      - "node --test packages/shared/test/horusChat.test.mjs apps/server/test/horusChatTurn.test.mjs apps/server/test/chatMemoryStore.test.mjs apps/server/test/postgresSchema.test.mjs: passed, 36 tests."
      - "pnpm --filter @u-build/web test:guards: passed, 17 tests."
      - "pnpm --filter @u-build/web build: passed."
    residual_risks:
      - "Cancellation is cooperative: providers/tools that ignore AbortSignal may still finish their internal work, but the chat turn now records a terminal cancelled state when the server observes cancellation."
      - "The frontend chat runtime is still too concentrated in VisualPreviewConsole; this is intentionally reserved for phase 85.2."
  - version: "0.1.0"
    date: "2026-05-28"
    changes:
      - "Created phased remediation SPEC for Horus chat UX/product hardening."
      - "Selected five phases after evaluating 3 to 7 phase options."
    validation:
      - "Planning only; no runtime validation executed."
```
