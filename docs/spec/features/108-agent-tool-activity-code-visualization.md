---
format_version: "agentic_sdd.v1"
task_id: "feature-108-agent-tool-activity-code-visualization"
title: "Agent Tool Activity Code Visualization"
created_at_utc: "2026-05-28T22:30:10Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
phase: "phase_3_agent_code_execution_runtime"
depends_on:
  - "spec/features/97-incremental-edit-tool-read-before-write.md"
  - "spec/features/99-agent-operational-session-ledger.md"
  - "spec/features/103-agent-runbook-progress-projection.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 108 - Agent Tool Activity Code Visualization

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_context_from_previous_request: |
  Quando os agentes estao editando, expor no front como outras ferramentas de codigo fazem: criando/editando
  arquivo, +N -M, diff/preview de codigo, status e ferramenta em execucao.
```

## 2. System Interpretation

```yaml
system_translation: |
  Build a frontend visualization layer for live agent tool activity. It must render file creation, editing,
  deletion, command execution and blocked/failure states from structured backend events, not from inferred
  chat text.

expected_user_visible_result: |
  While agents work, the Preview chat/progress area shows cards like "Editing App.tsx +12 -4", expandable
  diff/code preview, command rows and failure reasons.

expected_engineering_result: |
  Horus gains shared UI-facing tool activity contracts, React projection utilities and code preview
  components using the existing design system and Monaco/Shiki-compatible highlighting strategy.
```

## 3. Context, Scope, Entities

```yaml
business_context:
  user_problem: "Users cannot trust agent work when edits are invisible until the end."
  target_user: "Horus operator supervising code generation."
  expected_outcome: "Agent work feels transparent, inspectable and alive."
  product_surface:
    - "Preview chat"
    - "Agent Flow"
    - "Future run detail view"
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Workflow events"
      - "Agent runbook projection"
    frontend:
      - "React"
      - "Monaco already present in Project Files"
      - "Optional Shiki for lightweight read-only highlighting"
    database:
      - "Operational session events"
    infrastructure:
      - "SSE"
  known_entrypoints:
    - "apps/web/src/features/visual-preview/workflowProgress.ts"
    - "apps/web/src/features/visual-preview/previewChatMessages.ts"
    - "apps/web/src/features/project-files/components/CodeViewer.tsx"
    - "apps/web/src/features/project-files/utils/languageMapping.ts"
    - "packages/shared/src/entities/HorusRunFlow.ts"
scope:
  in_scope:
    - "Define AgentToolActivityViewModel frontend model."
    - "Render file activity cards for create/edit/delete with +N -M."
    - "Render expandable diff/code preview with stable dimensions."
    - "Render command activity rows with status and output summary."
    - "Render blocked/failure details with copyable evidence."
    - "Use existing Horus visual identity: dark shell, subtle green accent, dense technical panels."
    - "Keep cards responsive and non-overlapping on mobile/desktop."
  out_of_scope:
    - "Manual code editing inside the activity card."
    - "New full IDE screen."
    - "Rendering entire large files unbounded."
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/HorusRunFlow.ts"
      - "packages/shared/src/entities/AgentRunbook.ts"
    services:
      - "HorusRunFlowSnapshotBuilder"
    database:
      migrations_required: false
  frontend:
    files:
      - "apps/web/src/features/visual-preview/components/AgentToolActivityCard.tsx"
      - "apps/web/src/features/visual-preview/components/CodeChangePreview.tsx"
      - "apps/web/src/features/visual-preview/workflowProgress.ts"
      - "apps/web/src/features/visual-preview/previewChatMessages.ts"
      - "apps/web/src/styles or feature stylesheet"
    components:
      - "AgentToolActivityCard"
      - "CodeChangePreview"
      - "CommandActivityRow"
  tests:
    unit:
      - "apps/web/src/features/visual-preview/agentToolActivity.test.tsx"
      - "apps/web/src/features/visual-preview/workflowProgress.test.ts"
    e2e:
      - "local browser smoke for live edit card"
```

## 4. Integration Context Map

```yaml
integration_context:
  summary: |
    The frontend visualization consumes structured tool/runbook events from backend. It must not infer edit
    state from free-form assistant messages.
  depends_on:
    - name: "Agent runbook projection"
      type: "api"
      owner: "apps/server/application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "AgentRunbookEntry and tool activity metadata"
      required_for: "Render factual activity cards."
      assumptions:
        - "SPEC 103 exposes file and command activity entries."
      failure_modes:
        - "UI shows stale or fake work."
      fallback_or_recovery: "Render only generic tool event when detailed metadata is absent."
      verification:
        - "apps/web workflowProgress tests"
    - name: "Code highlighting"
      type: "frontend_component"
      owner: "apps/web/features/project-files"
      direction: "this_spec_consumes_dependency"
      contract_used: "language mapping and Monaco/optional Shiki renderer"
      required_for: "Render code snippets cleanly."
      assumptions:
        - "Monaco already exists for Project Files."
      failure_modes:
        - "Large previews hurt performance."
      fallback_or_recovery: "Render bounded plain code block with line numbers."
      verification:
        - "apps/web agentToolActivity tests"
  depended_on_by:
    - name: "Preview chat experience"
      type: "frontend_component"
      owner: "apps/web/features/visual-preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Tool activity UI components"
      compatibility_obligation: "Existing chat messages and composer remain stable."
      expected_consumer_behavior: "Show live activity under or beside chat messages."
      migration_or_notification_required: false
      verification:
        - "browser smoke"
```

## 5. Architecture, Plan, Acceptance

```yaml
architecture_rules:
  project_specific:
    - "UI reflects backend events; it must not fabricate tool activity."
    - "Use existing Horus visual identity and avoid decorative noise."
    - "Fixed-format cards must have stable dimensions and responsive constraints."
contracts:
  ui_contracts:
    - name: "AgentToolActivityCard"
      producer: "apps/web visual-preview feature"
      consumers:
        - "Preview chat"
        - "Agent Flow"
      requirement: "Render action, file/command, status, +N -M, expandable evidence and failure reason."
execution_plan:
  - step: 1
    name: "Map existing progress rendering"
    agent: "repo_explorer"
    action: "Read Preview chat/progress components and Project Files code viewer."
    expected_output: "Reusable UI component map."
  - step: 2
    name: "Create view model mapper"
    agent: "frontend_specialist"
    action: "Map runbook/tool events to AgentToolActivityViewModel."
    expected_output: "Deterministic frontend projection."
  - step: 3
    name: "Implement activity cards"
    agent: "frontend_specialist"
    action: "Render file and command activity with expandable code/diff preview."
    expected_output: "Visible live activity UI."
  - step: 4
    name: "Validate responsive/contrast behavior"
    agent: "qa_specialist"
    action: "Run web tests and browser smoke at desktop/mobile widths."
    expected_output: "No overlap, readable contrast and correct event rendering."
acceptance_criteria:
  functional:
    - "Create/edit/delete events render file cards with +N -M."
    - "Command events render status and bounded output summary."
    - "Blocked and failed events show actionable reason."
    - "Cards can expand/collapse code/diff preview."
  integration:
    - "UI renders from backend structured events only."
  architectural:
    - "No large unbounded code blob is rendered by default."
  quality:
    - "Frontend tests and browser smoke pass."
  observability:
    - "Activity card includes toolCallId/runId in copy details."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/web test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate React projection and rendering."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web test:guards"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend guardrails."
      success_condition: "Exit code 0."
    - command: "pnpm typecheck"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate cross-package types."
      success_condition: "Exit code 0."
  manual_checks:
    - "Browser smoke: run a small agent edit and verify the live card shows file, action, status and diff."
implementation_notes:
  preferred_approach: |
    Use opencode UI components for basic tool cards, tool status titles, error cards, diff changes and
    session turns as the main visual/interaction reference. Copy component logic only when it can be made
    framework-compatible with Horus React/CSS boundaries; otherwise adapt the structure. Keep the Horus brand:
    dark operational shell, grey structural surfaces, subtle green success accents and compact engineering
    density. Prefer lightweight read-only highlighting for activity cards; reuse Monaco only if
    bundle/performance is acceptable.
risks:
  - risk: "UI over-promises work before backend confirms it."
    severity: "high"
    mitigation: "Render 'started' distinct from 'applied' and source all states from backend events."
```
