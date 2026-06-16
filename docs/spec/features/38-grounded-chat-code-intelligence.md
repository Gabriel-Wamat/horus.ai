---
format_version: "agentic_sdd.v1"
task_id: "38-grounded-chat-code-intelligence"
title: "Grounded chat code intelligence"
created_at_utc: "2026-05-26T23:18:05Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "spec/features/18-preview-chat-horus-contract.md"
  - "spec/features/19-preview-chat-frontend-horus-ui.md"
  - "spec/features/21-isolated-code-memory-context-tools.md"
  - "spec/features/22-chat-driven-agent-code-change-loop.md"
  - "spec/features/35-project-code-intelligence-ast.md"
  - "spec/features/37-project-file-editing-persistence.md"
---

# 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec rigorosa para resolve esses problemas, destrinche eles detalhadamente na spec, garanta um checklist rigoroso para garantir que quando você concluir tudo estará funcionando perfeitamente
```

# 2. System Interpretation

```yaml
system_translation: |
  Criar uma SPEC executável para corrigir as falhas do chat conversacional do Horus como sistema de IA
  grounded em código. O chat deve conseguir responder perguntas sobre o projeto, retornar trechos reais
  de código, citar arquivos/linhas, explicar quando o contexto é insuficiente, preservar isolamento por
  user story/projeto e manter separação segura entre ASK e ACTION.

expected_user_visible_result: |
  Na tela de conversa/preview, o usuário pode perguntar algo como "me mostre o trecho que salva arquivos"
  ou "onde está o botão de salvar?" e Horus responde com trechos reais, arquivo, linhas aproximadas ou exatas,
  fontes visíveis e aviso claro quando não encontrou evidência suficiente. A UI mostra quais arquivos foram
  consultados e não apresenta resposta inventada como se fosse código real.

expected_engineering_result: |
  O backend passa a enviar conteúdo selecionado de arquivos ao agente de chat, usando um retrieval mais forte
  que path matching simples. O contrato compartilhado passa a suportar evidências/fontes/excerpts. A UI passa
  a renderizar fontes e estado de inspeção. Testes provam que pedidos de trecho de código usam conteúdo real,
  que limites/segurança são respeitados e que comandos mutáveis continuam roteados para ACTION.
```

# 3. Verified Current-State Diagnosis

```yaml
verified_files:
  backend:
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/infrastructure/agents/HorusChatAgentImpl.ts"
    - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
    - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
    - "apps/server/src/infrastructure/http/routes/chatRoutes.ts"
  frontend:
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/api/horusChatApi.ts"
  shared:
    - "packages/shared/src/entities/HorusChat.ts"
    - "packages/shared/src/entities/ChatMemory.ts"
    - "packages/shared/src/entities/CodeContext.ts"

current_good_parts:
  - "ASK/ACTION routing exists and is structured."
  - "Chat sessions are scoped by workspaceFolderId and userStoryId."
  - "Frontend sends projectId when a project is selected."
  - "answer_question can call ReadOnlyCodeContextService when project is available."
  - "The system blocks arbitrary shell commands from normal chat."
  - "There are existing tests for routing, preview lifecycle, chat persistence and read-only code context."

current_failures:
  - id: "F1"
    title: "Code file content is not injected into HorusChatAgent prompt."
    evidence: "HorusChatAgentImpl only serializes inspectedFiles, not codeContext.files[].content."
    user_impact: "A request for a code excerpt can be answered from file names only, causing hallucinated or vague answers."
  - id: "F2"
    title: "Retrieval is path-term based and misses content/symbol intent."
    evidence: "ReadOnlyCodeContextService scores paths by query terms and always prepends default files."
    user_impact: "The chat may not inspect the file containing the requested function/component if the path name does not match."
  - id: "F3"
    title: "No source/excerpt contract in chat response."
    evidence: "HorusChatOutcome.contextSources is string[] only."
    user_impact: "UI cannot show citations, snippets, line ranges, confidence or missing-evidence reasons."
  - id: "F4"
    title: "No explicit answer mode for code excerpts."
    evidence: "answer_question is the only ASK outcome, independent of whether code excerpts were required."
    user_impact: "The system cannot distinguish generic explanation from evidence-required code answer."
  - id: "F5"
    title: "Low output budget for engineering answer."
    evidence: "HorusChatAgentImpl uses maxTokens 700."
    user_impact: "Longer technical answers and code snippets are likely truncated."
  - id: "F6"
    title: "UI hides inspected-code evidence."
    evidence: "PreviewConversationPanel renders message body only."
    user_impact: "User cannot know which files Horus actually read."
  - id: "F7"
    title: "No negative-grounding behavior."
    evidence: "No schema or UI state for no_matches/insufficient_context."
    user_impact: "The chat can sound confident when it did not find the requested code."
```

# 4. Product And Technical Context

```yaml
business_context:
  user_problem: "The chat should be the user's operational interface into the project, but it cannot yet prove code-grounded answers."
  target_user: "Developer/operator using Horus to inspect, ask about and direct AI agents around a generated project."
  expected_outcome: "Trustworthy chat answers with explicit evidence from project code."
  product_surface:
    - "Preview conversation/chat panel"
    - "Horus chat turn API"
    - "Read-only code retrieval"
    - "Agent answer prompt"
    - "Chat memory/evidence display"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "Express"
      - "LangChain chat model wrapper"
      - "File/Postgres chat memory repositories"
      - "ReadOnlyCodeContextService"
    frontend:
      - "React"
      - "Vite"
      - "PreviewConversationPanel"
    database:
      - "Postgres chat_sessions/chat_messages when DATABASE_URL is configured"
      - "FileChatMemoryStore fallback"
    infrastructure:
      - "Local filesystem project roots"
      - "PreviewRuntimeManager project registry"
  known_entrypoints:
    - "POST /api/horus/chat/turn"
    - "GET /api/chat/sessions/:sessionId/messages"
    - "SubmitHorusChatTurnUseCase.execute"
    - "HorusChatAgentImpl.answer"
    - "ReadOnlyCodeContextService.buildContext"
  known_existing_patterns:
    - "Shared zod contracts under packages/shared/src/entities."
    - "Context isolation enforced before chat turn execution."
    - "ASK responses are non-mutating; ACTION requests go to controlled executors."
```

# 5. Scope

```yaml
scope:
  in_scope:
    - "Inject selected code excerpts into HorusChatAgentImpl prompt."
    - "Improve code retrieval with content search and direct path extraction from the user message."
    - "Add line-numbered code excerpts to CodeContextBundle."
    - "Add shared response evidence/source contracts."
    - "Return evidence metadata through HorusChatTurnResponse/outcome and persist it in chat message context or metadata as needed."
    - "Render consulted files/excerpts in PreviewConversationPanel."
    - "Add explicit insufficient-context behavior for code questions."
    - "Increase answer token budget only for ASK responses that include code context."
    - "Add tests that prove real code snippets are used and exposed."
  out_of_scope:
    - "Letting the chat directly mutate code in ASK mode."
    - "Replacing ACTION orchestration."
    - "Adding vector database/embeddings."
    - "Full semantic code search beyond local AST/content heuristics."
    - "Changing preview lifecycle controls."
    - "Adding arbitrary shell command execution."
    - "Reworking the whole chat UI layout."
```

# 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/CodeContext.ts"
      - "packages/shared/src/entities/HorusChat.ts"
      - "packages/shared/src/entities/ChatMemory.ts"
      - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      - "apps/server/src/infrastructure/agents/HorusChatAgentImpl.ts"
      - "apps/server/src/infrastructure/chat/FileChatMemoryStore.ts"
      - "apps/server/src/infrastructure/repositories/PostgresChatMemoryRepository.ts"
    services:
      - "ReadOnlyCodeContextService"
      - "SubmitHorusChatTurnUseCase"
      - "HorusChatAgentImpl"
    database:
      migrations_required: false
      tables:
        - "chat_messages"
      note: "Prefer additive JSON in contextSnapshot/evidence field only if existing schema already supports it; otherwise keep evidence in outcome response and assistant body."
  frontend:
    files:
      - "apps/web/src/api/horusChatApi.ts"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/index.css"
    components:
      - "PreviewConversationPanel"
      - "VisualPreviewConsole"
    routes:
      - "Preview/chat surface"
  workflow:
    graph_nodes: []
    agents:
      - "HorusChatAgentImpl"
  tests:
    unit:
      - "readOnlyCodeContextService.test.mjs"
      - "horusChatTurn.test.mjs"
    integration:
      - "chat route/usecase tests for evidence"
    e2e:
      - "Manual smoke: ask for a real code snippet and verify sources are visible."
```

# 7. Required Contracts

## 7.1 Code Context Contract

Extend `packages/shared/src/entities/CodeContext.ts`.

```ts
export const CodeContextExcerptSchema = z.object({
  filePath: z.string().trim().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  content: z.string(),
  reason: z.string().trim().min(1),
  score: z.number().nonnegative(),
});

export const CodeContextFileSchema = z.object({
  path: z.string().trim().min(1),
  bytes: z.number().int().nonnegative(),
  content: z.string(),
  startLine: z.number().int().positive().default(1),
  endLine: z.number().int().positive(),
  matchedTerms: z.array(z.string()).default([]),
});

export const CodeContextBundleSchema = z.object({
  projectId: z.string().uuid(),
  query: z.string().trim().min(1),
  inspectedFiles: z.array(z.string().trim().min(1)),
  files: z.array(CodeContextFileSchema),
  excerpts: z.array(CodeContextExcerptSchema).default([]),
  omittedFilesCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  limits: CodeContextLimitsSchema,
  retrievalStatus: z.enum(["matched", "partial", "no_match"]),
  retrievalNotes: z.array(z.string()).default([]),
});
```

Rules:

- `files[].content` may remain bounded.
- `excerpts[]` must be line-numbered and short enough for prompt injection.
- `retrievalStatus=no_match` means the chat must not pretend it found code.
- Preserve backward compatibility where possible by using defaults.

## 7.2 Chat Evidence Contract

Extend `packages/shared/src/entities/HorusChat.ts`.

```ts
export const HorusChatEvidenceSourceSchema = z.object({
  type: z.enum(["code_file", "user_story", "spec", "chat_history", "preview"]),
  label: z.string().trim().min(1),
  path: z.string().trim().min(1).optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  excerpt: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

export const HorusChatOutcomeSchema = z.object({
  ...
  contextSources: z.array(z.string().trim().min(1)).optional(),
  evidenceSources: z.array(HorusChatEvidenceSourceSchema).optional(),
  groundingStatus: z.enum(["grounded", "partial", "ungrounded"]).optional(),
});
```

Rules:

- `evidenceSources` are user-visible.
- `contextSources` may remain for backward compatibility.
- `groundingStatus=ungrounded` must be used when no code evidence was found for a code-specific question.

# 8. Retrieval Design

```yaml
retrieval_pipeline:
  step_1_extract_intent:
    - "Detect explicit paths in user message, e.g. src/App.tsx, apps/web/src/components/Foo.tsx."
    - "Detect quoted symbols/components/functions, e.g. CodeViewer, saveFile, handleSubmit."
    - "Detect semantic terms from message."

  step_2_candidate_collection:
    - "Always include explicit paths first."
    - "Search file paths as current implementation does."
    - "Search textual content for terms/symbols in source files."
    - "Prefer recently active/open project files if future UI passes them; optional for this spec."
    - "Keep DEFAULT_PRIORITY_FILES only as fallback, not as dominant evidence."

  step_3_scoring:
    scoring_rules:
      explicit_path: "+100"
      filename_exact_symbol_match: "+50"
      content_exact_symbol_match: "+40"
      content_all_terms_nearby: "+25"
      path_term_match: "+10 per term"
      priority_file_fallback: "+1"

  step_4_excerpt_extraction:
    - "For each top file, find best matching line window."
    - "Default window: 8-20 lines around strongest match."
    - "Include imports or function signature when match is inside a function if easy by local heuristic."
    - "Do not exceed maxExcerptBytes and maxTotalBytes."

  step_5_status:
    matched: "At least one excerpt has score above threshold."
    partial: "Only fallback/default files or weak matches."
    no_match: "No file/content/path evidence found."
```

Security:

- Reuse existing root containment.
- Keep ignoring `.git`, `node_modules`, `dist`, generated folders and hidden files except allowed `.env.example`.
- Do not include files that look binary.
- Do not include secrets or `.env` values.
- Do not read outside selected project root.

# 9. Prompt Design

`HorusChatAgentImpl` must include code excerpts in the system prompt when available.

Required prompt section:

```text
# Codigo consultado em modo somente leitura
retrieval_status: matched | partial | no_match
omitted_files_count: N

## Arquivo: apps/web/src/.../CodeViewer.tsx
linhas: 120-148
motivo: match para "saveFile"
```tsx
...
```
```

Rules:

- Do not inject entire large files unless small and relevant.
- If `retrievalStatus=no_match`, instruct the model to say it did not find evidence.
- For code-excerpt questions, the model must cite file path and line range.
- The model must never invent code when no excerpt contains it.
- Increase `maxTokens` to at least `1400` when `codeContext.files/excerpts` are present.

# 10. Frontend UX

```yaml
preview_conversation_panel:
  message_rendering:
    - "Render normal chat body as today."
    - "Under Horus messages, render a compact 'Fontes consultadas' section when evidenceSources exists."
    - "Each source shows file path, optional line range and confidence."
    - "Code excerpts render in a collapsed detail by default if long."
  states:
    - "When submitting, show 'Horus lendo contexto...' instead of only disabled composer."
    - "If groundingStatus=partial, show a subtle warning badge."
    - "If groundingStatus=ungrounded, show 'sem evidência de código encontrada'."
  constraints:
    - "Do not make the chat visually heavy."
    - "Do not expose sensitive content."
    - "Keep ID visual: dark restrained UI, compact evidence chips, no oversized cards."
```

# 11. Integration Context Map

```yaml
integration_context:
  summary: |
    This work upgrades Horus ASK mode from generic chat into grounded code Q&A. It consumes chat memory,
    project registry and read-only code retrieval, and exposes evidence-aware chat outcomes to the frontend.

  depends_on:
    - name: "ChatMemoryRepository"
      type: "backend_service"
      owner: "chat memory"
      direction: "this_spec_consumes_dependency"
      contract_used: "buildAgentContext(sessionId), appendMessage(sessionId, input)"
      required_for: "Preserve isolated chat scope and recent history."
      failure_modes:
        - "Wrong user story/project context leaks into answer."
      fallback_or_recovery: "Reject mismatch before retrieval."
      verification:
        - "Existing context mismatch tests continue passing."

    - name: "PreviewRuntimeReader project registry"
      type: "backend_service"
      owner: "preview/runtime"
      direction: "this_spec_consumes_dependency"
      contract_used: "listProjects(), getSession(sessionId)"
      required_for: "Resolve selected project root before code retrieval."
      failure_modes:
        - "No project selected; code Q&A cannot inspect project."
      fallback_or_recovery: "Return partial answer explaining project selection is required."
      verification:
        - "Test answer_question without project does not attempt file retrieval."

    - name: "ReadOnlyCodeContextService"
      type: "backend_service"
      owner: "code context"
      direction: "this_spec_consumes_dependency"
      contract_used: "buildContext({ project, chatContext, query })"
      required_for: "Find and read relevant project code safely."
      failure_modes:
        - "Weak retrieval misses code."
        - "Unsafe path reads outside root."
      fallback_or_recovery: "retrievalStatus partial/no_match and explicit user-facing limitation."
      verification:
        - "Tests for explicit path, symbol, content term and no_match."

  depended_on_by:
    - name: "HorusChatAgentImpl"
      type: "agent"
      owner: "chat agent"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "codeContext.excerpts with line-numbered content"
      compatibility_obligation: "Must not hallucinate code beyond supplied excerpts."
      expected_consumer_behavior: "Answer with cited excerpts or say evidence is missing."
      migration_or_notification_required: false
      verification:
        - "Unit test using fake responder receives excerpt content."

    - name: "PreviewConversationPanel"
      type: "frontend_component"
      owner: "preview/chat UI"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "HorusChatTurnResponse.outcome.evidenceSources and groundingStatus"
      compatibility_obligation: "Existing messages render without evidence."
      expected_consumer_behavior: "Show evidence compactly under assistant message."
      migration_or_notification_required: false
      verification:
        - "Web typecheck/build and manual visual smoke."

  data_flow:
    inbound:
      - source: "User chat composer"
        payload_or_state: "message, chatSessionId, projectId, workspaceFolderId, userStoryId, previewSessionId?"
        validation: "HorusChatTurnInputSchema and context mismatch checks."
    outbound:
      - destination: "Assistant chat message"
        payload_or_state: "summary plus evidenceSources/groundingStatus in outcome"
        validation: "HorusChatTurnResponseSchema."
```

# 12. Implementation Plan

```yaml
phase_1_shared_contracts:
  steps:
    - "Extend CodeContext schemas with excerpts, line ranges, retrievalStatus and notes."
    - "Extend HorusChat outcome with evidenceSources and groundingStatus."
    - "Export all types."
  validation:
    - "pnpm --filter @u-build/shared build"

phase_2_retrieval_backend:
  steps:
    - "Add explicit path extraction from query."
    - "Add symbol/term extraction."
    - "Add content search over bounded source files."
    - "Add excerpt extraction with line ranges."
    - "Keep root safety and ignored dirs."
    - "Return no_match/partial/matched correctly."
  validation:
    - "readOnlyCodeContextService.test.mjs covers explicit path, symbol, content match, no_match, ignored folders and byte limits."

phase_3_chat_answer_grounding:
  steps:
    - "Serialize code excerpts into HorusChatAgentImpl prompt."
    - "Increase maxTokens when code context exists."
    - "Add prompt rules for no_match and citations."
    - "Build evidenceSources from codeContext.excerpts in SubmitHorusChatTurnUseCase."
    - "Set groundingStatus based on retrievalStatus."
  validation:
    - "horusChatTurn.test.mjs proves answer_question includes evidenceSources and fake responder receives codeContext with excerpt content."

phase_4_frontend_evidence_ui:
  steps:
    - "Extend PreviewChatMessage mapping to include evidence/grounding if persisted or available in response."
    - "Render evidence under assistant messages."
    - "Show submitting state 'Horus lendo contexto...'."
    - "Show partial/ungrounded badges."
  validation:
    - "pnpm --filter @u-build/web type-check"
    - "pnpm --filter @u-build/web build"

phase_5_regression_and_manual_smoke:
  steps:
    - "Run server build."
    - "Run focused tests."
    - "Ask a local chat question for a real code excerpt if runtime is available."
    - "Verify UI displays file path and excerpt source."
```

# 13. Rigorous Completion Checklist

```yaml
must_pass_before_done:
  backend_contract:
    - "[ ] CodeContextBundle includes excerpts with filePath/startLine/endLine/content."
    - "[ ] HorusChatOutcome includes evidenceSources and groundingStatus."
    - "[ ] Existing HorusChatTurnResponse callers remain compatible."

  retrieval_quality:
    - "[ ] Query with explicit path selects that file first."
    - "[ ] Query with component/function name selects file containing symbol."
    - "[ ] Query with phrase from file content selects correct file."
    - "[ ] Query with no matching code returns retrievalStatus=no_match."
    - "[ ] Generated/vendor/hidden/sensitive paths remain excluded."
    - "[ ] Byte/file limits are enforced and omittedFilesCount increments."

  prompt_grounding:
    - "[ ] HorusChatAgentImpl prompt contains actual excerpt content, not only file names."
    - "[ ] Prompt requires path and line range for code answers."
    - "[ ] Prompt forbids inventing code outside excerpts."
    - "[ ] no_match produces a limitation statement, not fabricated code."

  frontend:
    - "[ ] Assistant message can show consulted files."
    - "[ ] Code excerpts are readable but compact."
    - "[ ] Partial/ungrounded states are visually clear."
    - "[ ] Existing plain chat messages still render normally."
    - "[ ] Composer indicates processing while Horus is reading context."

  ask_action_safety:
    - "[ ] Asking for code excerpt remains ASK/answer_question."
    - "[ ] Asking to modify code remains ACTION/code_change."
    - "[ ] Asking to run preview remains ACTION/run_project."
    - "[ ] Arbitrary shell command remains unsupported."

  validation_commands:
    - "[ ] pnpm --filter @u-build/shared build"
    - "[ ] pnpm --filter @u-build/server build"
    - "[ ] pnpm --filter @u-build/web type-check"
    - "[ ] pnpm --filter @u-build/web build"
    - "[ ] node --test apps/server/test/readOnlyCodeContextService.test.mjs"
    - "[ ] node --test apps/server/test/horusChatTurn.test.mjs"
    - "[ ] node --test apps/server/test/horusOdinIntentRouter.test.mjs"
```

# 14. Acceptance Criteria

```yaml
acceptance_criteria:
  - "When user asks for a real code snippet, Horus returns a snippet from actual project files or says it did not find it."
  - "Every code-snippet answer includes at least one visible file source."
  - "The backend response includes evidenceSources for grounded code answers."
  - "The UI displays consulted files/excerpts under Horus messages."
  - "No code content is shown when retrievalStatus=no_match."
  - "ASK mode remains read-only."
  - "ACTION mode still routes explicit implementation requests to controlled agents."
  - "All focused tests and builds in the checklist pass."
```

# 15. Implementation Log

```yaml
implementation_log:
  - date: "2026-05-26"
    status: "planned"
    notes:
      - "Spec created after rigorous review of chat, routing, read-only code context and preview chat UI."
      - "Primary blocker identified: file contents are read by ReadOnlyCodeContextService but not injected into HorusChatAgentImpl prompt."
```

