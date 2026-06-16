# SPEC 22 - Chat-Driven Agent Code Change Loop

```yaml
format_version: "agentic_sdd.v1"
task_id: "22-chat-driven-agent-code-change-loop"
title: "Route chat code-change requests to Front, QA, and Curator agents"
created_at_utc: "2026-05-26T13:59:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
```

## 1. Original User Request

```yaml
raw_user_request: |
  se o usuário pedir para alterar algo no código, o odin deve ajustar a mensagem e enviar os agentes
```

## 2. System Interpretation

```yaml
system_translation: |
  Implement a chat-initiated code-change workflow where Horus/Odin transforms the user message into an execution brief and routes it to the appropriate agents without requiring a new Spec Agent run. Front Agent performs code changes, QA Agent validates, and Curator Agent reviews. Retry loops must stay scoped to the same chat/project context.

expected_user_visible_result: |
  The user asks for a code/UI change in chat and sees progress/results in the same preview chat.

expected_engineering_result: |
  Add a chat-change orchestration path that reuses existing agents where possible while preserving context isolation and auditability.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Create a chat code-change execution brief from the user's message."
    - "Route to Front Agent and QA Agent through Horus/Odin."
    - "Run Curator Agent over front/QA outputs."
    - "Persist result messages and artifact metadata back to the same chat session."
    - "Emit progress events consumable by the preview chat UI."
  out_of_scope:
    - "Do not generate a new spec unless the user explicitly requested it."
    - "Do not alter workspace story/spec revisions unless the change is explicitly tied to them."
    - "Do not modify unrelated projects."
```

## 4. Integration Context

```yaml
integration_context:
  depends_on:
    - name: "FrontAgentImpl"
      type: "agent"
      contract_used: "Agent execution over implementation brief and artifact context"
      required_for: "Code/UI changes."
    - name: "QaAgentImpl"
      type: "agent"
      contract_used: "Validation/test generation and execution brief"
      required_for: "Quality gate after code changes."
    - name: "CuratorAgentImpl"
      type: "agent"
      contract_used: "Review front and QA outputs"
      required_for: "Final gate and retry target."
    - name: "FileChatMemoryStore"
      type: "backend_service"
      contract_used: "appendMessage/buildAgentContext"
      required_for: "Persist progress and outcome in the same chat."
  depended_on_by:
    - name: "Preview chat UI"
      type: "frontend_component"
      contract_exposed: "chat progress and assistant messages"
      compatibility_obligation: "Must not require full workflow spec approval UI."
  integration_risks:
    - risk: "Agents act without enough context"
      severity: "high"
      mitigation: "Execution brief must include selected project id, code context summary, chat history summary, and allowed files/root."
    - risk: "Change loop mutates code outside selected project"
      severity: "critical"
      mitigation: "Agent file-write layer must enforce selected root and report changed files."
```

## 4.1 Architecture Decision

```yaml
decision: "Use a two-mode Horus/Odin boundary: chat mode for answer/clarify/read-only context, executor mode for action handoff."
selected_approach: |
  The preview chat remains the conversational surface. It classifies a user turn into a typed intent with mode=chat or mode=executor. Chat mode may read isolated chat/project context and answer without mutating state. Executor mode is only entered through an explicit action handoff, then Horus/Odin starts the workflow with a structured execution brief, source chat session id, source message id, active user story, active spec, selected project, and artifact revision context.
why_this_approach: |
  This keeps ordinary conversation from accidentally becoming a spec or code execution request, while still allowing action requests to reuse the existing LangGraph Front/QA/Curator workflow. It mirrors tool-calling/handoff practice: the chat model/router decides when action is required, but the backend validates the tool/action arguments before invoking the executor.
compatibility_rules:
  - "Chat questions that mention code changes must stay in mode=chat unless phrased as an imperative action request."
  - "Executor handoff must fail closed when project, active spec, or executor wiring is missing."
  - "SpecAgent must not run for chat-originated code-change requests."
  - "All agent results from the handoff must include chatSessionId/sourceMessageId when available."
  - "Progress and terminal errors must be appended back to the same chat session."
```

## 5. Acceptance Criteria

```yaml
acceptance_criteria:
  - "A code-change chat request does not call SpecAgent."
  - "Front, QA, and Curator outputs are tied to the same chatSessionId."
  - "Progress messages appear in the preview chat."
  - "Changed files are recorded in the assistant outcome."
  - "Curator retry feedback routes only to the necessary agent(s)."
  - "A failed run produces an actionable chat error and does not mark success."
```

## 6. Validation

```yaml
validation_protocol:
  tests:
    - "Router test: code-change intent invokes chat-change orchestration."
    - "Isolation test: project mismatch is rejected before agents run."
    - "Result persistence test: agent outcome appends to the same chat."
  runtime_checks:
    - "Send a small UI change in preview chat."
    - "Verify changed file list and QA result appear in chat."
    - "Open browser preview and confirm visible change."
```

## 7. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-26T14:48:28Z"
  summary:
    - "Added workflowMode=chat_code_change and chat/source execution metadata to WorkflowState."
    - "Added chatSessionId/sourceMessageId artifact metadata for agent results."
    - "Added WorkflowOrchestrator.startChatCodeChange() to build a scoped executor handoff from active story/spec context."
    - "Changed the LangGraph start route so chat_code_change starts at Odin and bypasses SpecAgent/HITL."
    - "Passed executionBrief into Front, QA, and Curator prompts so agents act on the chat request without generating a new spec."
    - "Persisted executor progress and terminal errors back into the same chat session."
    - "Tightened Horus/Odin routing so imperative change requests enter executor mode and code-change questions remain chat mode."
  files_changed:
    - "packages/shared/src/entities/WorkflowState.ts"
    - "packages/shared/src/entities/AgentResult.ts"
    - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/langgraph/graph.ts"
    - "apps/server/src/infrastructure/langgraph/state.ts"
    - "apps/server/src/infrastructure/langgraph/artifactContext.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/odinAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/test/horusChatTurn.test.mjs"
    - "apps/server/test/horusOdinIntentRouter.test.mjs"
    - "packages/shared/test/getLatestSuccessfulAgentResult.test.mjs"
  validation:
    passed:
      - "pnpm --filter @u-build/shared build"
      - "pnpm --filter @u-build/server build"
      - "pnpm test"
      - "API smoke: /api/horus/chat/turn returns intent.mode=executor and action=code_change_started for imperative change request."
      - "Workflow smoke: /api/workflow/status/:threadId records workflowMode=chat_code_change, sourceChatSessionId, sourceChatMessageId, executionBrief, and chat-scoped agent metadata."
      - "Chat smoke: terminal executor failure is appended back to the originating chat session as an actionable agent message."
    known_runtime_note:
      - "The local smoke workflow reached the LLM-backed Front/QA step and failed because the current runtime provider execution was not available; this correctly surfaced as workflow status=error and a chat error message instead of false success."
  checklist:
    - "A code-change chat request does not call SpecAgent."
    - "Front, QA, and Curator receive the chat execution brief."
    - "Agent metadata is tied to the same chatSessionId/sourceMessageId."
    - "Progress/errors are persisted to the same preview chat."
    - "Informational code-change questions stay in chat mode."
```
