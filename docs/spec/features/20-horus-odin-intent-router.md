# SPEC 20 - Horus/Odin Chat Intent Router

```yaml
format_version: "agentic_sdd.v1"
task_id: "20-horus-odin-intent-router"
title: "Route preview chat messages through Horus/Odin intent decisions"
created_at_utc: "2026-05-26T13:57:00Z"
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
  O usuário irá enviar uma mensagem para o chat e ele se comunicará com o odin. Nesse cenário, se o usuário pedir para alterar algo no código, o odin deve ajustar a mensagem e enviar os agentes, caso o usuário queira saber algo do código, o Horus(orquestrador) deve acessar os arquivos de código ou memória do chat
```

## 2. System Interpretation

```yaml
system_translation: |
  Add an Odin/Horus intent-routing layer for chat messages. This router must decide whether the message is a code question, code-change request, project execution request, explicit spec request, or clarification. It must not call the Spec Agent unless the user explicitly asks for spec generation/update.

expected_user_visible_result: |
  Normal questions receive answers, code-change requests start agent work, run requests execute preview/runtime actions, and only explicit spec requests generate specs.

expected_engineering_result: |
  Add a typed router service with deterministic guardrails and LLM-assisted interpretation only behind validated contracts.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Create a Horus/Odin chat intent schema."
    - "Implement intent classification with guardrails."
    - "Add deterministic keyword/command handling for run/start/reload/stop and explicit spec generation."
    - "Use LLM classification only after assembling isolated context."
    - "Return a structured routing decision for downstream use cases."
  out_of_scope:
    - "Do not mutate files in this spec."
    - "Do not implement frontend UI changes here."
    - "Do not replace existing Odin spec-routing for normal workflow runs."
```

## 4. Intent Contract

```yaml
intent_kinds:
  answer_question:
    description: "User asks about code, project state, previous chat, or artifacts."
  code_change:
    description: "User asks Horus to modify code or UI."
  run_project:
    description: "User asks Horus to run, start, stop, reload, or inspect project execution."
  generate_spec:
    description: "User explicitly asks to create/update/generate a spec."
  clarify:
    description: "More context is required before acting."
  unsupported:
    description: "Request is outside current capabilities."
```

## 5. Integration Context

```yaml
integration_context:
  depends_on:
    - name: "FileChatMemoryStore.buildAgentContext"
      type: "backend_service"
      contract_used: "ChatAgentContextBundle"
      required_for: "Classify with isolated memory and artifact context."
    - name: "LLM provider factory"
      type: "internal_module"
      contract_used: "createChatModel runtime settings"
      required_for: "Optional LLM classification."
    - name: "Existing Odin decideRouting"
      type: "internal_module"
      contract_used: "Downstream agent names for spec workflows"
      required_for: "Compatibility with current agent naming and routing conventions."
  depended_on_by:
    - name: "Horus chat turn use case"
      type: "backend_service"
      contract_exposed: "HorusChatIntentDecision"
      compatibility_obligation: "Must be additive and not change existing workflow graph."
  integration_risks:
    - risk: "Spec Agent invoked for normal chat"
      severity: "critical"
      mitigation: "Spec intent requires explicit user wording like 'gere uma spec', 'crie uma SDD', or selected spec action."
```

## 6. Acceptance Criteria

```yaml
acceptance_criteria:
  - "A message like 'o que esse arquivo faz?' routes to answer_question."
  - "A message like 'ajuste esse botão' routes to code_change."
  - "A message like 'rode o projeto' routes to run_project."
  - "A message like 'crie uma spec para essa feature' routes to generate_spec."
  - "Generic chat messages never call SpecAgent."
  - "Router returns confidence and rationale for audit logs."
```

## 7. Validation

```yaml
validation_protocol:
  tests:
    - "Unit tests for deterministic examples."
    - "Regression test: ordinary chat message does not route to specAgent."
    - "Regression test: explicit spec request routes to generate_spec."
  commands:
    - "pnpm --filter @u-build/server build"
    - "pnpm test"
```

## 8. Implementation Log

```yaml
implemented_at_utc: "2026-05-26T14:25:00Z"
status: "completed"
files_changed:
  - "packages/shared/src/entities/HorusChat.ts"
  - "packages/shared/test/horusChat.test.mjs"
  - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
  - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
  - "apps/server/src/infrastructure/http/server.ts"
  - "apps/server/test/horusChatTurn.test.mjs"
  - "apps/server/test/horusOdinIntentRouter.test.mjs"
summary:
  - "Added explicit Horus chat modes: chat and executor."
  - "Extracted intent classification into a dedicated Horus/Odin router service."
  - "Mapped answer_question/clarify to chat mode and code_change/run_project/generate_spec to executor mode."
  - "Kept explicit spec generation guarded by create/generate/update spec wording."
  - "SubmitHorusChatTurnUseCase now consumes the router instead of embedding intent rules."
validation:
  passed:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "pnpm test"
    - "Runtime API smoke: POST /api/horus/chat/turn returned code_change with mode executor."
```
