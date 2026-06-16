# SPEC 18 - Preview Chat to Horus Contract

```yaml
format_version: "agentic_sdd.v1"
task_id: "18-preview-chat-horus-contract"
title: "Create isolated preview chat contract for Horus/Odin"
created_at_utc: "2026-05-26T13:55:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented"
```

## 1. Original User Request

```yaml
raw_user_request: |
  agora precisamos conectar o chat ao agente do Horus(orquestrador). Atualizei a arquitetura, leia ela([Image #1] )/analise a imagem, gere um relatório curto para você explicando para si mesmo como tá funcionando todos os fluxos. Tem um ponto que coloquei que é o seguinte, o chat ficará na tela de preview, ele deve se comunicar direto com o Horus(orquestrador), motivo: caso o usuário envia uma mensagem para o agente de Spec, vai ocorrer o erro dele sempre gerar uma Spec para a mensagem do usuário, algo que é totalmente desncessário. O usuário irá enviar uma mensagem para o chat e ele se comunicará com o odin. Nesse cenário, se o usuário pedir para alterar algo no código, o odin deve ajustar a mensagem e enviar os agentes, caso o usuário queira saber algo do código, o Horus(orquestrador) deve acessar os arquivos de código ou memória do chat(isso tem que tá estritamente isolado para não haver vazamentos), caso o usuário peça para o Horus(orquestrador) executar o projeto(ele precisa fazer isso). Quebre esse promtp em tarefas, analise eles rigorosamente e compreenda os cenários de uso, a lógica de código deve contemplar todos os casos, é preciso ter isolamento para não fazer problemas de integridade ou vazamento de contexto de um chat para outro ou projeto para outro. ao fim, use a skill de criar spec para criar a spec de cada tarefa
```

## 2. System Interpretation

```yaml
system_translation: |
  Define the shared backend/frontend contract for a preview chat that sends user messages directly to Horus/Odin instead of the Spec Agent. The contract must support isolated chat sessions, optional workspace story context, active preview project/session context, intent outcomes, assistant responses, and streamed status events.

expected_user_visible_result: |
  The user can send messages from the preview chat and receive Horus responses without unintentionally generating specs.

expected_engineering_result: |
  Add shared Zod schemas and backend API routes for Horus chat turns, preserving strict context isolation and compatibility with existing /api/chat and /api/preview contracts.
```

## 3. Product and Technical Context

```yaml
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Express"
      - "LangGraph orchestrator"
      - "FileChatMemoryStore"
      - "PreviewRuntimeManager"
      - "Shared Zod contracts"
    frontend:
      - "React"
      - "Vite"
      - "TypeScript"
  known_entrypoints:
    - "packages/shared/src/entities/ChatMemory.ts"
    - "packages/shared/src/entities/Preview.ts"
    - "apps/server/src/infrastructure/http/routes/chatRoutes.ts"
    - "apps/server/src/infrastructure/http/routes/previewRoutes.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/web/src/api/previewApi.ts"
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add shared Horus chat request/response schemas."
    - "Add a backend route for submitting preview chat turns to Horus/Odin."
    - "Persist user and assistant messages through FileChatMemoryStore."
    - "Require explicit context identifiers; reject ambiguous context."
    - "Return structured action outcomes: answer, code_change_started, project_execution_started, spec_requested, clarification_required, error."
  out_of_scope:
    - "Do not implement the full intent router here."
    - "Do not implement code mutation here."
    - "Do not change existing workflow start contracts."
    - "Do not remove existing /api/chat routes."
```

## 5. Contract Proposal

```yaml
horus_chat_turn_input:
  chatSessionId: "uuid"
  message: "string"
  previewSessionId: "uuid | optional"
  projectId: "uuid | optional"
  workspaceFolderId: "uuid | optional"
  userStoryId: "uuid | optional"
  workflowThreadId: "uuid | optional"

horus_chat_turn_response:
  userMessage: "ChatMessage"
  assistantMessage: "ChatMessage | optional"
  intent:
    kind: "answer_question | code_change | run_project | generate_spec | clarify | unsupported"
    confidence: "number"
  outcome:
    status: "completed | accepted | running | blocked | failed"
    summary: "string"
    workflowThreadId: "uuid | optional"
    previewSessionId: "uuid | optional"
```

## 6. Integration Context

```yaml
integration_context:
  depends_on:
    - name: "FileChatMemoryStore"
      type: "backend_service"
      contract_used: "create/list/append/buildAgentContext"
      required_for: "Persist isolated chat messages and retrieve memory."
      verification:
        - "Existing chatMemoryStore tests plus new Horus chat turn tests."
    - name: "PreviewRuntimeManager"
      type: "backend_service"
      contract_used: "PreviewSession and FrontendProject ids"
      required_for: "Bind chat messages to the active preview project/session."
      verification:
        - "Preview session id mismatch is rejected."
  depended_on_by:
    - name: "PreviewConversationPanel"
      type: "frontend_component"
      contract_exposed: "POST /api/horus/chat/turn"
      compatibility_obligation: "Additive endpoint; existing preview endpoints remain unchanged."
  data_flow:
    inbound:
      - source: "Preview chat composer"
        payload_or_state: "HorusChatTurnInput"
        validation: "Shared Zod schema"
    outbound:
      - target: "Preview chat UI"
        payload_or_state: "HorusChatTurnResponse"
        compatibility: "Typed response imported from packages/shared"
  integration_risks:
    - risk: "Context leakage across projects or chat sessions"
      severity: "critical"
      mitigation: "Require explicit ids and verify all ids belong together before appending or answering."
```

## 7. Acceptance Criteria

```yaml
acceptance_criteria:
  - "A chat turn cannot be submitted without a valid chatSessionId."
  - "If previewSessionId is provided, it must belong to the same projectId."
  - "If workspaceFolderId/userStoryId are provided, they must match the chat session scope."
  - "The route appends the user message before orchestration and appends an assistant/system message after outcome."
  - "No request path calls SpecAgent by default."
  - "Existing /api/chat and /api/preview tests continue passing."
```

## 8. Validation

```yaml
validation_protocol:
  static_checks:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
  tests:
    - "Add shared schema tests for Horus chat input/output."
    - "Add server tests for mismatched chat/project/story ids."
    - "Run pnpm test."
  runtime_checks:
    - "POST a valid chat turn and verify user/assistant messages are stored under the same chat session."
```

## 9. Implementation Log

```yaml
implemented_version: "0.2.0"
implemented_at_utc: "2026-05-26T14:09:00Z"
status: "implemented"
scope_completed:
  - "Added shared Horus chat schemas for turn input, intent, outcome, and response."
  - "Added SubmitHorusChatTurnUseCase to validate chat/workspace/story/preview/project context before appending messages."
  - "Added /api/horus/chat/turn backend route."
  - "Wired the Horus chat route into the Express app without changing existing /api/chat, /api/preview, or /api/workflow contracts."
  - "Persisted both user and Horus assistant messages through FileChatMemoryStore."
  - "Added conservative intent detection for answer_question, code_change, run_project, generate_spec, and clarify."
  - "Kept SpecAgent out of this request path; spec generation is only represented as an explicit intent outcome."
validation:
  commands:
    - command: "pnpm --filter @u-build/shared build"
      result: "passed"
    - command: "pnpm --filter @u-build/server build"
      result: "passed"
    - command: "pnpm test"
      result: "passed, 64 tests"
  runtime_checks:
    - "GET /health returned ok."
    - "POST /api/chat/sessions created an isolated chat session for a real workspace folder/story."
    - "POST /api/preview/sessions created a preview session for the registered frontend project."
    - "POST /api/horus/chat/turn persisted user and assistant messages and returned run_project intent with previewSessionId."
compatibility_notes:
  - "This feature implements the contract bridge only; real code answering, code mutation, and project execution remain scoped to specs 21, 22, and 23."
  - "Existing preview instruction draft endpoint remains available for compatibility but is no longer the intended Horus chat contract."
```
