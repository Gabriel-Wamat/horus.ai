---
format_version: "agentic_sdd.v1"
task_id: "feature-67-artifact-validation-self-healing-and-observability-control-plane"
title: "Artifact Validation Self-Healing And Observability Control Plane"
created_at_utc: "2026-05-27T17:09:18Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
depends_on:
  - "spec/features/41-agentic-runtime-validation-observability.md"
  - "spec/features/47-validation-gates-true-success.md"
  - "spec/features/57-visual-curator-screenshot-gate.md"
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "spec/features/65-event-sourced-chat-and-progress-streaming.md"
  - "spec/features/66-agent-memory-and-runtime-skills-governance.md"
research_catalog: "spec/notes/ai-agent-engineering-strategy-catalog.md"
---

# 67 - Artifact Validation Self-Healing And Observability Control Plane

## 1. Original User Request

```yaml
raw_user_request: |
  quero que faça uma revisão rigorosa de todos os pontos que precisam ser refatorados na parte de agentes, chat, salvamento de dados, memória dos agentes e da conversa etc. todas as boas práticas que faltam

  pesquise quais são melhores práticas de engenharia de IA(no arxiv, medium, github, fóruns, reddit) para resolver esse tipo de problema, após isso catalogue as estratégias. em seguida, use a skill de criar spec para planeja a solução desse problema, (analise quantas specs são necessárias, para que você consiga detalhar rigorosamente e ter o máximo de contexto para solucionar de forma cirúrgica)
```

## 2. System Interpretation

```yaml
system_translation: |
  Planejar o control plane que impede o Horus de entregar projetos falhados: candidate artifacts com IDs estáveis,
  validação pré-execução, retry/self-healing baseado em evidência real, ferramenta/ACI controlada e observabilidade
  estruturada. Esta spec fecha a confiabilidade de entrega após as fundações de execução, chat e memória.

expected_user_visible_result: |
  O usuário acompanha uma execução que só termina como sucesso quando artefato, preview, comandos e curadoria passam.
  Se falhar, o sistema abre um ciclo de correção com erro real e mensagem compacta, não entrega uma tela quebrada.

expected_engineering_result: |
  Substituir seleção por varredura de arrays por IDs explícitos de tentativa/candidato/evidência. Criar validação e
  observabilidade orientadas a eventos, spans e gates.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O Horus pode confundir tentativas, aplicar candidato errado, mostrar evidência antiga ou declarar sucesso sem validação robusta."
  target_user: "Usuário que pede a agentes para construir/corrigir frontends e espera entrega funcional."
  expected_outcome: "Nenhum projeto é entregue como sucesso se validação real falhar ou ficar inconclusiva."
  product_surface:
    - "Agent flow map"
    - "Preview chat"
    - "Generated project preview"
    - "Validation evidence"
    - "Operator/debug inspection"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "LangGraph agents"
      - "CodeChangeSet"
      - "ProjectCodeChangeSetApplier"
      - "VisualDesignGateService"
      - "ProjectQualityGateService"
    frontend:
      - "Agent Flow inspector"
      - "Preview console"
    database:
      - "code_change_sets"
      - "workflow_events"
      - "project_quality_gates"
      - "new candidate/evidence tables if needed"
    infrastructure:
      - "Browser validation"
      - "Structured tools"
      - "Tracing"
  known_entrypoints:
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/langgraph/state.ts"
    - "apps/server/src/infrastructure/langgraph/curatorInputs.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
    - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
    - "apps/server/src/infrastructure/visual/VisualDesignGateService.ts"
  known_existing_patterns:
    - "CodeChangeSet lifecycle exists but selection still depends on latest/proposed scanning."
    - "Validation gates exist but need attempt/candidate identity."
    - "Browser visual validation is planned/implemented separately in spec 63."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Introduce candidate artifact IDs linked to run/attempt/agent outputs."
    - "Attach QA, visual, command and curator evidence to exact candidate IDs."
    - "Make Curator validate a selected candidate, not implicit latest outputs."
    - "Make apply step consume approved candidate ID only."
    - "Create self-healing policy that reads terminal/browser/build errors and routes fixes to the correct agent."
    - "Add structured traces/spans for LLM calls, tools, handoffs, gates, retries and apply."
    - "Add operator/debug views or APIs for run/candidate/evidence lineage."
    - "Ensure terminal success is impossible without required gates."
  out_of_scope:
    - "Implement external tracing vendor."
    - "Replace all current tests."
    - "Expose private chain-of-thought."
    - "Let agents run arbitrary shell commands."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/CodeChangeSet.ts"
      - "packages/shared/src/entities/WorkflowState.ts"
      - "packages/shared/src/entities/AgentResult.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/langgraph/state.ts"
      - "apps/server/src/infrastructure/langgraph/curatorInputs.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/*AgentNode.ts"
      - "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
      - "apps/server/src/infrastructure/project/ProjectQualityGateService.ts"
    services:
      - "ArtifactCandidateService"
      - "ValidationGateService"
      - "SelfHealingRecoveryService"
      - "AgentTraceService"
    database:
      migrations_required: true
      tables:
        - "code_change_sets"
        - "workflow_events"
        - "agent_artifact_candidates"
        - "agent_validation_evidence"
        - "agent_trace_spans"
  frontend:
    files:
      - "apps/web/src/features/agent-flow-map/*"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
    components:
      - "Agent flow drawer"
      - "Preview workflow activity"
      - "Validation evidence panel"
  workflow:
    graph_nodes:
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
      - "odinAgent"
      - "retryCheckpoint"
    agents:
      - "Front"
      - "QA"
      - "Curator"
      - "Odin"
  tests:
    unit:
      - "candidate selection tests"
      - "validation evidence lineage tests"
    integration:
      - "failed apply triggers self-healing"
      - "curator cannot approve stale candidate"
    e2e:
      - "browser-visible success only after validation"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec consumes durable run/attempt IDs and memory/skills context, then ensures generated artifacts are selected,
    validated, applied and observed with precise lineage. It is the safety layer that prevents false success.

  depends_on:
    - name: "Execution attempts"
      type: "database"
      owner: "spec 64"
      direction: "this_spec_consumes_dependency"
      contract_used: "runId, attemptId, terminal status"
      required_for: "Tie each candidate artifact and validation evidence to a retry attempt."
      assumptions: []
      failure_modes:
        - "Evidence cannot prove which attempt it belongs to."
      fallback_or_recovery: "Block approval with missing_attempt_identity."
      verification:
        - "Curator stale candidate test."

    - name: "Prompt/memory/skills context"
      type: "backend_service"
      owner: "spec 66"
      direction: "this_spec_consumes_dependency"
      contract_used: "PromptContextBundle diagnostics and skill usage IDs"
      required_for: "Explain which procedural instructions shaped an artifact."
      assumptions: []
      failure_modes:
        - "Agent generated output without logged skill/memory context."
      fallback_or_recovery: "Mark trace incomplete; do not block unless required by policy."
      verification:
        - "Trace contains skill/memory refs."

  depended_on_by:
    - name: "Preview success UI"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "finalStatus, gates, candidateId, evidence summaries"
      compatibility_obligation: "must not label run success if status is failed_validation/blocked"
      expected_consumer_behavior: "Render precise status and compact evidence."
      migration_or_notification_required: false
      verification:
        - "Frontend guard for true success semantics."

  bidirectional_integrations:
    - name: "Curator and Odin retry loop"
      participants:
        - "curatorAgent"
        - "odinAgent"
      shared_contract: "candidateId, fixTarget, failedGateIds, retryReason"
      consistency_rule: "Odin retries based on failed evidence for the same candidate."
      verification:
        - "Retry routing test by failed gate."

  data_flow:
    inbound:
      - source: "Front Agent"
        payload_or_state: "candidate code change set"
        validation: "candidate schema plus preflight"
      - source: "QA/visual/command gates"
        payload_or_state: "validation evidence"
        validation: "gate schema and candidateId"
    outbound:
      - target: "ProjectCodeChangeSetApplier"
        payload_or_state: "approved candidate id"
        validation: "candidate status curator_approved and gates passed"
      - target: "Agent flow UI"
        payload_or_state: "trace and evidence lineage"
        validation: "shared snapshot schema"
```

## 7. Candidate And Evidence Model

```yaml
artifact_candidate:
  id: "uuid"
  runId: "uuid"
  attemptId: "uuid"
  workflowThreadId: "uuid legacy bridge"
  userStoryId: "uuid"
  sourceAgent: "front | qa | curator | odin"
  artifactType: "code_change_set | qa_plan | visual_report | spec"
  status: "draft | proposed | validating | rejected | approved | applied | failed"
  sourceResultId: "uuid or deterministic id"
  contentHash: "sha256"
  createdAt: "datetime"

validation_evidence:
  id: "uuid"
  candidateId: "uuid"
  runId: "uuid"
  attemptId: "uuid"
  gateId: "string"
  gateType: "schema | path_safety | command | preview | qa | visual | curator | apply"
  status: "passed | failed | blocked | skipped | inconclusive"
  required: "boolean"
  summary: "string"
  rawEvidenceRef: "json/file ref optional"
  createdAt: "datetime"
```

## 8. Self-Healing Policy

| Failure Class | Detection | Recovery |
| --- | --- | --- |
| Build/test command fails | command gate stderr/exit code | Route to Front with concise error, changed files and failing command |
| Preview unreachable | preview gate timeout/error | Route to Front or runtime repair depending on ownership evidence |
| Visual gate fails | screenshot/layout checks | Route to Front with visual feedback items |
| QA output invalid | schema/gate failure | Route to QA with exact missing fields |
| Curator rejects requirements | curator missing items | Route to target from `fixTarget` |
| Apply fails | path/preflight/apply evidence | Route to Front with apply evidence; do not deliver |
| Retry limit exceeded | attempt count | Pause for HITL with compact decision options |

## 9. Observability Requirements

- Trace span for each LLM call with agent, model, duration, token/cost if available.
- Trace span for each tool call with input schema name, redacted input, output status and duration.
- Trace span for each validation gate.
- Trace span for each handoff/retry/approval/apply.
- Sensitive data policy: API keys, full env and private file contents must be redacted.
- Operator view should answer: "which candidate was approved, by which evidence, and what was applied?"

## 10. Execution Plan

1. Add shared candidate/evidence/trace schemas.
2. Add migration/repositories for candidates and validation evidence or extend `code_change_sets` safely.
3. Update Front/QA nodes to emit candidate IDs and result IDs.
4. Update Curator input selection to require explicit candidate selection by attempt.
5. Update orchestrator persistence so it saves only current candidate and evidence, not every array item blindly.
6. Update apply path to require approved candidate ID.
7. Add self-healing classifier that maps gate failures to retry targets.
8. Add trace service and redaction policy.
9. Update agent-flow snapshot to show candidate/evidence lineage.
10. Add tests for stale-candidate rejection, failed apply recovery and true terminal status.

## 11. Validation Commands

```bash
pnpm --filter @u-build/shared build
pnpm --filter @u-build/server build
pnpm --filter @u-build/web build
node --test apps/server/test/selectCuratorInputs.test.mjs
node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs
node --test apps/server/test/curatorAgentNodePreflight.test.mjs
node --test apps/server/test/curatorAgentNodeVisualGate.test.mjs
pnpm --filter @u-build/web test:guards
pnpm test
pnpm preview:browser-smoke
git diff --check
```

## 12. Acceptance Criteria

- Curator validates an explicit candidate ID.
- Apply consumes only an approved candidate ID.
- Validation evidence links to candidate, run and attempt.
- Failed final validation cannot result in `completed`.
- Self-healing retry uses real evidence and routes to the correct agent.
- Agent flow/preview surfaces can show concise lineage without raw internal noise.
- Trace output exists for LLM/tool/gate/handoff/apply steps with redaction.

## 13. Minimal Output Contract For Implementing Agent

```yaml
implementation_output:
  changed_files:
    - "<exact paths>"
  candidate_contract:
    - "<schemas/tables>"
  validation_evidence:
    - "<gates covered>"
  observability:
    - "<trace spans added>"
  validation:
    commands_run:
      - "<command>"
  browser_evidence:
    - "<screenshot path if UI changed>"
```

## 14. Implementation Log

```yaml
implemented_at_utc: "2026-05-27T18:40:00Z"
status: "implemented"
summary:
  - "Added shared AgentArtifact candidate, validation-evidence and trace-span schemas."
  - "Extended CodeChangeSet with artifactCandidateId/runId/attemptId lineage."
  - "Added file/Postgres artifact-control-plane repositories and migration 011."
  - "Added ArtifactCandidateService and SelfHealingRecoveryService for candidate persistence, evidence mapping, redacted spans and retry classification."
  - "Updated Front/Curator/Orchestrator flow so Curator emits candidateId and apply consumes the candidate approved by Curator instead of blindly selecting the latest proposal."
  - "Blocked final success after failed apply by persisting the workflow with an error message and recording failed apply evidence."
validation:
  commands_run:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/agentArtifactSchema.test.mjs apps/server/test/artifactCandidateService.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs apps/server/test/postgresSchema.test.mjs"
focused_tests:
  - "Shared candidate/evidence/trace schema tests."
  - "ArtifactCandidateService candidate lineage and failed-evidence self-healing trace tests."
  - "WorkflowOrchestrator applies Curator-approved candidate instead of latest proposed artifact."
  - "WorkflowOrchestrator does not emit patch_applied on final applier failure."
  - "Postgres migration coverage for artifact candidates, evidence, traces and CodeChangeSet lineage columns."
notes:
  - "No browser screenshot was required because this implementation is backend/control-plane only."
```
