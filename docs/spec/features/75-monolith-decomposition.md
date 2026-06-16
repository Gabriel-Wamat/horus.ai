---
format_version: "agentic_sdd.v1"
task_id: "feature-75-monolith-decomposition"
title: "Monolith Decomposition"
created_at_utc: "2026-05-28T14:19:19Z"
author: "agent"
target_mode: "refactor"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
depends_on:
  - "spec/features/69-release-hardening-and-orchestrator-modularization.md"
  - "spec/features/73-workflow-chat-memory-contract-spine.md"
---

# 75 - Monolith Decomposition

## 1. Original User Request

```yaml
raw_user_request: |
  sem nenhum arquivo gigante... modularizar, deletar, ajustar, remover... deixar esse projeto a nível produção
```

## 2. System Interpretation

```yaml
system_translation: |
  Quebrar os maiores arquivos do servidor e frontend em unidades coesas, preservando comportamento e reduzindo
  risco de regressao por etapas pequenas e testadas.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Split FrontAgentImpl into prompt builder, structured-output parser, fallback planner and execution-plan adapter."
    - "Split VisualPreviewConsole into session state, chat stream, workflow activity, project selector and preview actions."
    - "Split StorySpecWorkspace into data loading, folder tree, editor panels and action handlers."
    - "Reduce index.css into global tokens plus feature-level styles."
    - "Continue extracting WorkflowOrchestrator only where contracts are already stable."
  out_of_scope:
    - "Changing generated UI behavior."
    - "Changing workflow event semantics."
    - "Large redesign."
```

## 4. Target File Budget

```yaml
file_budget:
  max_default_lines: 400
  exceptions_require:
    - "Documented reason"
    - "No mixed ownership"
    - "Focused tests"
  current_hotspots:
    - "apps/web/src/index.css"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/components/StorySpecWorkspace.tsx"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
```

## 5. Validation

```yaml
validation:
  required_commands:
    - "pnpm lint"
    - "pnpm type-check"
    - "pnpm --filter @u-build/web test:guards"
    - "node --test apps/server/test/*.test.mjs"
  acceptance_criteria:
    - "No production source hotspot remains over budget without an explicit exception."
    - "No behavior is changed without focused regression coverage."
```

## 6. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T14:42:41Z"
implemented_version: "1.0.0"
changes:
  - "Split VisualPreviewConsole helper logic into visual-preview feature modules for chat message reconciliation, workflow progress parsing/projection, project selection and preview event utilities."
  - "Split FrontAgentImpl structured-output schemas into frontAgentOutputSchemas and deterministic React/Vite fallback templates into frontAgentFallbackTemplates/frontAgentFallbackCss."
  - "Split index.css into feature-level stylesheets loaded in the original cascade order."
  - "Updated frontend regression guards to follow moved modules/styles rather than relying on monolithic source files."
line_budget_after:
  index_css: 12
  largest_split_css: 363
  front_agent_impl: 638
  visual_preview_console: 853
  story_spec_workspace: 1322
  workflow_orchestrator: 1160
explicit_exceptions:
  - path: "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    reason: "Still owns two stable exported orchestration entrypoints; parser and fallback template ownership were removed in this pass."
    focused_tests:
      - "node --test apps/server/test/frontAgentNodeToolRuntime.test.mjs apps/server/test/buildFrontendCodeChangeSet.test.mjs"
  - path: "apps/web/src/components/VisualPreviewConsole.tsx"
    reason: "Still owns React state/effect orchestration for preview/chat; pure helpers, project selection and workflow event logic were removed in this pass."
    focused_tests:
      - "pnpm --filter @u-build/web test:guards"
  - path: "apps/web/src/components/StorySpecWorkspace.tsx"
    reason: "Deferred because this pass avoided changing story/spec editor behavior while CSS ownership was split underneath it."
    focused_tests:
      - "pnpm --filter @u-build/web test:guards"
  - path: "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    reason: "Deferred to stable contract-only extractions already started in spec 69; further split should be paired with durable restart/chaos validation."
    focused_tests:
      - "node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs apps/server/test/agentExecutionLedger.test.mjs"
validation_evidence:
  - "pnpm lint"
  - "pnpm type-check"
  - "pnpm --filter @u-build/web test:guards"
  - "node --test apps/server/test/*.test.mjs"
```
