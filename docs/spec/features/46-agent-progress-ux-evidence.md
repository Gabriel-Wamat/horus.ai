---
format_version: "agentic_sdd.v1"
task_id: "feature-46-agent-progress-ux-evidence"
title: "Agent Progress UX And Evidence Panel"
created_at_utc: "2026-05-26T23:45:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented"
depends_on:
  - "spec/features/17-visual-preview-frontend-console.md"
  - "spec/features/29-chat-runtime-evidence-integration.md"
  - "spec/features/38-grounded-chat-code-intelligence.md"
  - "spec/features/42-agentic-execution-loop.md"
---

# 46 - Agent Progress UX And Evidence Panel

## 1. Original User Request

```yaml
raw_user_request: |
  minha preocupação é no 4, 5, 6, 8, 9 e 10. destrinche como podemos corrigir o projeto com base o que foi listar. e crie uma spec para cada cenário que expressei preocupação
concern_mapped_from_previous_answer: "9. Feedback visual do agente"
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar uma UX clara para acompanhar agentes: status atual, timeline, arquivos lidos, arquivos alterados,
  ferramentas usadas, comandos rodados, validações, erros, retries, diff e decisão final. A UI deve refletir
  eventos reais persistidos, sem fechar/piscar ou perder estado durante atualização.

expected_user_visible_result: |
  O usuário abre uma run ou conversa e entende exatamente o que Horus está fazendo dentro de cada agente.
  Pode clicar em um agente para ver contexto, atividades, evidências e erros.

expected_engineering_result: |
  Frontend consome snapshots/event streams estáveis e renderiza painéis de atividade com preservação de seleção,
  scroll e expansão. Backend fornece payloads compactos, ordenados e suficientes.
```

## 3. Current Project Fit

```yaml
verified_existing_surfaces:
  - "apps/web/src/features/agents-flow/"
  - "apps/web/src/components/PreviewConversationPanel.tsx"
  - "apps/web/src/components/PreviewTimeline.tsx"
  - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
  - "packages/shared/src/entities/HorusRunFlow.ts"

good_existing_parts:
  - "React Flow agent screen exists."
  - "Preview timeline exists."
  - "Chat evidence rendering was introduced by spec 38."

gaps_to_fix:
  - "Agent internals are not consistently exposed in one evidence panel."
  - "UI can infer state locally instead of rendering normalized events."
  - "Event updates may reset interaction state if keys/layout are unstable."
  - "User cannot always trace final answer to read/write/validation evidence."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create reusable AgentEvidencePanel component."
    - "Show per-agent phases, events, tools, files, diffs, commands and validation results."
    - "Preserve selected agent, expanded rows, scroll and graph positions during polling/SSE updates."
    - "Add chat progress chips for active run."
    - "Add empty/error states that explain missing evidence."
  out_of_scope:
    - "Redesigning the whole navigation shell."
    - "Changing graph topology."
    - "Creating a full IDE diff editor."
```

## 5. UX Requirements

```yaml
ux_principles:
  - "Stable identity: no component should unmount because new events arrived."
  - "Progressive disclosure: summary first, details on click."
  - "Evidence over prose: show exact files, command ids and validation outputs."
  - "No fake certainty: show missing/skipped/failed states explicitly."
  - "Operator density: compact panels, readable hierarchy, no marketing cards."

required_views:
  agent_summary:
    fields:
      - "agent name"
      - "current phase"
      - "status"
      - "attempt"
      - "latest event"
  activity_timeline:
    rows:
      - "context read"
      - "tool call"
      - "patch proposed"
      - "command run"
      - "validation result"
      - "curator verdict"
  evidence_drawer:
    tabs:
      - "Resumo"
      - "Arquivos"
      - "Ferramentas"
      - "Validação"
      - "Erros"
```

## 6. Integration Context Map

```yaml
integration_context:
  depends_on:
    - name: "AgentRunEvent stream"
      type: "event_stream"
      contract_used: "normalized events from spec 42"
      required_for: "Render live progress."
      failure_modes:
        - "Events duplicate or arrive out of order."
      fallback_or_recovery: "Deduplicate by id and sort by sequence."
      verification:
        - "UI reducer test preserves state under duplicate events."
    - name: "HorusRunFlowSnapshotBuilder"
      type: "backend_service"
      contract_used: "run snapshot endpoint"
      required_for: "Hydrate page and recover after reload."
      failure_modes:
        - "Snapshot lacks evidence details."
      fallback_or_recovery: "Render compact unavailable state."
      verification:
        - "Snapshot test includes agent evidence summary."

  depended_on_by:
    - name: "Agent graph page"
      type: "frontend_component"
      contract_exposed: "AgentEvidencePanel props"
      compatibility_obligation: "Do not break existing graph interactions."
      expected_consumer_behavior: "Selection opens evidence panel for selected node."
    - name: "Preview chat panel"
      type: "frontend_component"
      contract_exposed: "active run progress summary"
      compatibility_obligation: "Preserve existing message rendering."
      expected_consumer_behavior: "Show live progress for current execution."
```

## 7. Execution Plan

```yaml
execution_plan:
  - step: "Extend shared run snapshot types with evidence summaries."
    files:
      - "packages/shared/src/entities/HorusRunFlow.ts"
  - step: "Update backend snapshot builder."
    files:
      - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
  - step: "Create frontend evidence panel and reducer."
    files:
      - "apps/web/src/features/agents-flow/components/AgentEvidencePanel.tsx"
      - "apps/web/src/features/agents-flow/hooks/useAgentEvidenceState.ts"
  - step: "Wire panel into graph drawer and chat progress."
    files:
      - "apps/web/src/features/agents-flow/components/RunFlowDrawer.tsx"
      - "apps/web/src/components/PreviewConversationPanel.tsx"
  - step: "Add interaction preservation tests or manual browser checklist."
```

## 8. Acceptance Checklist

```yaml
acceptance_checklist:
  - "Selecting an agent opens evidence without resetting graph positions."
  - "New events update rows without collapsing expanded details."
  - "Files read and files changed are distinguishable."
  - "Command stdout/stderr tails are visible and redacted."
  - "Validation failure appears before retry."
  - "Page reload reconstructs current run from snapshot."
  - "No loading flicker during polling/SSE merge."

validation_commands:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/web type-check"
  - "pnpm --filter @u-build/web build"
  - "pnpm test"
  - "Manual browser check: drag graph nodes, select agents, receive new event, verify no reset."
```

## 9. Implementation Log

```yaml
implemented_at_utc: "2026-05-26T00:00:00Z"
implementation_summary:
  - "Added HorusAgentEvidenceSummary to run snapshots."
  - "Derived per-node evidence summaries from persisted normalized events and agent executions."
  - "Created AgentEvidencePanel with files read, files changed, tools, commands, validation gates and errors."
  - "Wired the evidence panel into RunFlowDrawer without changing graph topology or selection behavior."
  - "Added stable empty states for missing evidence and validation."
validation_record:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "pnpm --filter @u-build/web type-check"
  - "node --test apps/server/test/validationGateAggregator.test.mjs apps/server/test/projectQualityGateRuntimeEvidence.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs packages/shared/test/horusRunFlow.test.mjs"
  - "pnpm test"
```
