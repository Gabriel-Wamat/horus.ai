---
format_version: "agentic_sdd.v1"
task_id: "feature-92-chat-planner-structural-intent-runtime-bridge"
title: "Chat Planner Structural Intent Runtime Bridge"
created_at_utc: "2026-05-28T22:30:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_2_repository_intelligence_layer"
depends_on:
  - "spec/features/87-coding-runtime-orchestrator-state-machine.md"
  - "spec/features/88-repository-scanner-and-text-retrieval.md"
  - "spec/features/89-tree-sitter-ast-analysis-spine.md"
  - "spec/features/90-ast-patch-planner-diff-safe-apply-rollback.md"
  - "spec/features/91-validation-runner-and-command-policy.md"
---

# 92 - Chat Planner Structural Intent Runtime Bridge

## 1. Original User Request

```yaml
raw_user_request: |
  crie a spec disso e inclua:

  Phase 2 — Repository Intelligence Layer: specs 92 a 96.
  Entrega inteligência real sobre o repositório: LSP, símbolos, grafo, embeddings, ranking e memória/index lifecycle.
  test, build, type-check, lint ou check
  ligar o chat/planner para gerar intents estruturais reais a partir do pedido do usuário, rodar o runtime automaticamente e devolver o diff/aplicação no chat.
```

## 2. System Interpretation

```yaml
system_translation: |
  Connect the user-facing Horus chat to the Phase 1 coding runtime. A natural-language chat request must be
  converted into validated StructuralPatchIntent objects, start the coding runtime automatically, stream task
  progress back to chat and return patch diffs/apply results as durable chat evidence.

expected_user_visible_result: |
  In Preview chat, the user can ask for a code change and receive a real response with planned files, generated
  diff, validation status and applied/failed result without fake IDs, mocks or silent runtime state.

expected_engineering_result: |
  Introduce a ChatCodingPlanner and bridge that produces structuralPatchIntents, starts CodingRuntimeOrchestrator,
  subscribes to task events and projects patch/validation/apply artifacts back to chat messages.
```

## 3. Product and Technical Context

```yaml
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Horus chat use cases"
      - "CodingRuntimeOrchestrator"
      - "StructuralPatchIntent"
      - "CodingValidation"
    frontend:
      - "PreviewConversationPanel"
      - "visual-preview chat hooks"
  known_entrypoints:
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/application/coding/CodingRuntimeOrchestrator.ts"
    - "apps/server/src/application/coding/AstPatchPlanner.ts"
    - "apps/server/src/application/coding/CodingValidationRunner.ts"
    - "apps/server/src/infrastructure/http/routes/horusChatRoutes.ts"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
  known_existing_patterns:
    - "Chat persists durable messages and lifecycle metadata."
    - "Coding runtime consumes task.metadata.structuralPatchIntents."
    - "Runtime validation only allows deterministic commands: test, build, type-check, lint or check."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create ChatCodingPlannerPort and implementation for generating StructuralPatchIntent[] from a chat request."
    - "Use repository retrieval, AST symbols and future Phase 2 index context as planner evidence."
    - "Automatically start and run CodingRuntimeOrchestrator when the intent is code-editing."
    - "Return patch plan, diff, validation and apply artifacts to chat with durable message metadata."
    - "Expose user-visible retry/copy-details for rejected, failed, timed_out or skipped validation states."
    - "Require validation through test, build, type-check, lint or check when available."
  out_of_scope:
    - "Building global project-wide rename."
    - "Adding embeddings/vector search; SPEC 95 owns that."
    - "Adding LSP references; SPEC 93 owns that."
    - "Browser visual validation; this remains a later visual gate."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/application/ports/ChatCodingPlannerPort.ts"
      - "apps/server/src/application/coding/ChatCodingPlanner.ts"
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      - "packages/shared/src/entities/HorusChat.ts"
      - "packages/shared/src/entities/StructuralPatch.ts"
    services:
      - "SubmitHorusChatTurnUseCase"
      - "CodingRuntimeOrchestrator"
      - "ChatCodingPlanner"
  frontend:
    files:
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/features/visual-preview/*"
  tests:
    unit:
      - "apps/server/test/chatCodingPlanner.test.mjs"
      - "apps/server/test/horusChatCodingRuntimeBridge.test.mjs"
      - "apps/web/test/frontendRegressionGuards.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec connects chat to the already implemented coding runtime. It does not bypass the runtime:
    chat creates structured intents and lets scanner/retriever/AST/patch/validation/apply steps own execution.

  depends_on:
    - name: "CodingRuntimeOrchestrator"
      type: "backend_service"
      direction: "this_spec_consumes_dependency"
      contract_used: "CreateCodingTaskRequest.metadata.structuralPatchIntents, runTask, task events"
      required_for: "Execute patch planning, validation and apply through deterministic lifecycle."
      failure_modes:
        - "Chat claims code was changed while runtime failed."
      fallback_or_recovery: "Persist failed chat assistant message with task id and runtime error."
      verification:
        - "apps/server/test/horusChatCodingRuntimeBridge.test.mjs"

    - name: "StructuralPatchIntent"
      type: "shared_contract"
      direction: "this_spec_consumes_dependency"
      contract_used: "StructuralPatchIntentSchema"
      required_for: "Ensure planner emits parseable edits, not free-form text replacements."
      failure_modes:
        - "Planner generates invalid or ambiguous target edits."
      fallback_or_recovery: "Reject with planner_diagnostic; ask for narrower target."
      verification:
        - "apps/server/test/chatCodingPlanner.test.mjs"

  depended_on_by:
    - name: "Preview chat UI"
      type: "frontend_component"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "chat message metadata with coding task id, diff summary, validation state and apply state"
      compatibility_obligation: "Existing text chat rendering must remain compatible."
      expected_consumer_behavior: "Show real task progress, not mock IDs or synthetic completion."
      verification:
        - "pnpm --filter @u-build/web test:guards"

  data_flow:
    inbound:
      - source: "User chat message"
        payload_or_state: "natural-language code edit request plus selected project/session"
        validation: "intent router classifies code-editing request and ensures project context exists"
    outbound:
      - target: "Coding runtime task"
        payload_or_state: "structuralPatchIntents in task metadata"
        compatibility: "Runtime owns validation and apply"
      - target: "Chat history"
        payload_or_state: "durable assistant message with diff/apply/validation evidence"
        compatibility: "No fake IDs, no mocked messages"
```

## 7. Architecture Rules

```yaml
architecture_rules:
  - "Chat may plan code edits but may not write files directly."
  - "Planner output must be StructuralPatchIntent[], never raw string replacement instructions."
  - "Runtime must be started automatically only when projectRootPath and selected project context are real."
  - "A failed validation/apply artifact must produce a failed chat answer, not a generic success."
  - "Validation evidence must explicitly list test, build, type-check, lint or check when run or skipped."
```

## 8. Contracts And Invariants

```yaml
contracts:
  - name: "Chat coding plan"
    invariant: "Every generated intent references a retrieved path and a known/derivable AST target."
  - name: "Chat runtime evidence"
    invariant: "Every code-editing assistant response contains taskId, terminal runtime state and artifact summaries."
  - name: "Apply safety"
    invariant: "Chat never reports applied unless patch_apply artifact is ready/applied."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Add planner port and structured output schema"
    expected_output: "ChatCodingPlannerPort and parser for StructuralPatchIntent[] plus diagnostics."
  - step: 2
    name: "Integrate planner into SubmitHorusChatTurnUseCase"
    expected_output: "Code-editing chat requests create and run coding tasks automatically."
  - step: 3
    name: "Project runtime events into chat"
    expected_output: "Assistant message includes task state, files, diff stats, validation commands and apply result."
  - step: 4
    name: "Frontend rendering"
    expected_output: "Preview chat renders patch evidence, validation failures and retry action."
  - step: 5
    name: "Validation"
    expected_output: "Focused backend bridge tests and web guards pass."
```

## 10. Pseudo-Code

```ts
interface ChatCodingPlannerPort {
  plan(input: ChatTurnContext): Promise<{
    intents: StructuralPatchIntent[];
    diagnostics: PlannerDiagnostic[];
  }>;
}

class SubmitHorusChatTurnUseCase {
  async execute(input) {
    if (!intent.isCodeEdit) return normalChat(input);
    const plan = await planner.plan(input);
    const task = await codingRuntime.createTask({
      prompt: input.message,
      projectRootPath: input.project.rootPath,
      metadata: { structuralPatchIntents: plan.intents },
      autoRun: true,
    });
    const completed = await codingRuntime.runTask(task.id);
    return chatProjector.fromCodingSnapshot(completed);
  }
}
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  - "A real chat request can create a coding task with non-empty structuralPatchIntents."
  - "The runtime runs automatically and terminal state is persisted into chat."
  - "The chat response includes diff/apply/validation evidence."
  - "Validation command states mention test, build, type-check, lint or check when applicable."
  - "No direct fs write is introduced in chat/planner code."
```

## 12. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T23:45:00Z"
status: "implemented"
changes:
  shared_contracts:
    - "Added HorusChatCodingEvidence metadata for runtime state, artifacts, changed files, diff stats, validation commands, apply result and planner diagnostics."
  backend:
    - "Added ChatCodingPlannerPort."
    - "Added ChatCodingPlanner backed by RepositoryScanner, TextRepositoryRetriever and Tree-sitter AST evidence."
    - "Planner emits StructuralPatchIntent only when it can resolve a real path/symbol/content boundary."
    - "SubmitHorusChatTurnUseCase now plans code-change chat requests, starts the coding runtime automatically and returns terminal runtime evidence in the assistant message."
    - "Server composition wires ChatCodingPlanner and auto-runs CodingRuntimeOrchestrator with structuralPatchIntents in task metadata."
  frontend:
    - "Preview chat maps codingEvidence from shared metadata."
    - "Preview chat renders runtime state, changed files, patch stats, validation status/commands and apply status."
  tests:
    - "Added chatCodingPlanner focused coverage."
    - "Added horusChatCodingRuntimeBridge focused coverage."
    - "Extended frontend regression guards for coding evidence rendering."
```

## 13. Validation Evidence

```yaml
commands:
  - command: "pnpm --filter @u-build/shared build"
    status: "passed"
  - command: "pnpm --filter @u-build/server build"
    status: "passed"
  - command: "pnpm --filter @u-build/web build"
    status: "passed"
  - command: "pnpm --filter @u-build/web test:guards"
    status: "passed"
  - command: "node --test apps/server/test/chatCodingPlanner.test.mjs apps/server/test/horusChatCodingRuntimeBridge.test.mjs apps/server/test/horusChatTurn.test.mjs apps/server/test/codingRuntimeOrchestrator.test.mjs apps/server/test/astPatchPlanner.test.mjs apps/server/test/codingValidationRunner.test.mjs"
    status: "passed"
  - command: "git diff --check -- packages/shared/src/entities/HorusChat.ts apps/server/src/application/ports/ChatCodingPlannerPort.ts apps/server/src/application/ports/index.ts apps/server/src/application/coding/ChatCodingPlanner.ts apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts apps/server/src/infrastructure/http/server.ts apps/server/test/chatCodingPlanner.test.mjs apps/server/test/horusChatCodingRuntimeBridge.test.mjs apps/web/src/components/PreviewConversationPanel.tsx apps/web/src/features/visual-preview/previewChatMessages.ts apps/web/src/styles/preview-chat-message.css apps/web/test/frontendRegressionGuards.test.mjs"
    status: "passed"
known_limits:
  - "Natural-language inference is intentionally conservative: ambiguous edits without code block or explicit StructuralPatchIntent are blocked instead of hallucinated."
  - "Global rename, LSP references, embeddings and visual/browser smoke remain assigned to later specs."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test apps/server/test/chatCodingPlanner.test.mjs apps/server/test/horusChatCodingRuntimeBridge.test.mjs"
    - "pnpm --filter @u-build/web test:guards"
```

## 13. Error Mitigation And Handoff Rules

```yaml
error_mitigation:
  - "If planner cannot map request to structural targets, return a clarifying failure; do not invent file paths."
  - "If runtime validation is skipped, include the exact skipped reason in chat."
  - "If apply fails due to hash conflict, tell the user to rerun retrieval/planning."
```
