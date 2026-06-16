---
format_version: "agentic_sdd.v1"
task_id: "feature-41-agentic-runtime-validation-observability"
title: "Runtime QA Validation And Agent Observability"
created_at_utc: "2026-05-26T23:20:29Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
---

# 41 - Runtime QA Validation And Agent Observability

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec extremamente rigorosa detalhando como resolve todos esses problemas, se precisar divida em 2 ou 3 specs para garantir que você conseguirá detalhar bem como resolver, integrar e modularizar a resolução de cada problema
```

## 2. System Interpretation

```yaml
system_translation: |
  Adicionar validação executável e observabilidade rigorosa para o sistema agentico: QA deve rodar checks reais quando houver preview/projeto, Curator deve consumir evidência runtime, e a UI/logs devem mostrar exatamente o que foi feito, aprovado, aplicado e validado.

expected_user_visible_result: |
  O usuário consegue acompanhar se o projeto foi construído, quais comandos/testes rodaram, qual preview abriu, qual agente falhou e por quê.

expected_engineering_result: |
  O sistema passa a registrar evidência estruturada de comandos, preview smoke, browser checks, build/typecheck, QA manual cases, Curator verdict, retries e estados finais.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O sistema pode dizer que agentes concluíram sem evidência visual/runtime suficiente."
  target_user: "Usuário operador do Horus e agentes que dependem de evidência para continuar alterações."
  expected_outcome: "Conclusão agentica auditável: build, preview, QA, curadoria e logs."
  product_surface:
    - "Preview"
    - "User Stories workflow"
    - "Agent run flow"
    - "Project construction runs"
    - "Chat progress"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Express"
      - "PreviewRuntimeManager"
      - "ProjectQualityGateService"
      - "QAAgent"
      - "CuratorAgent"
    frontend:
      - "React"
      - "Preview console"
      - "Run flow timeline"
    database:
      - "workflow_events"
      - "project_quality_gates"
      - "project_command_runs"
    infrastructure:
      - "Local process preview adapter"
      - "Command catalog"
  known_entrypoints:
    - "apps/server/src/infrastructure/project/ProjectQualityGateService.ts"
    - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
    - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
  known_existing_patterns:
    - "Project command runs are persisted."
    - "Preview runtime has lifecycle and event stream."
    - "Curator prompt accepts QA output and CodeChangeSet."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add executable QA evidence to complement QA manual test cases."
    - "Run build/typecheck/test commands from command catalog when available."
    - "Run preview smoke checks when a frontend project is registered."
    - "Feed runtime evidence into Curator verdict."
    - "Persist and expose validation evidence in run flow/timeline."
    - "Add UI states for waiting/running/passed/failed validation."
  out_of_scope:
    - "Full visual regression platform."
    - "Cloud deployment."
    - "Replacing all QA manual cases with automation."
    - "Changing LLM provider config."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
      - "apps/server/src/infrastructure/project/ProjectQualityGateService.ts"
      - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
      - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
      - "packages/shared/src/entities/HorusRunFlow.ts"
      - "packages/shared/src/entities/ProjectConstruction.ts"
    services:
      - "QAAgent"
      - "CuratorAgent"
      - "ProjectQualityGateService"
      - "PreviewRuntimeManager"
      - "HorusRunFlowSnapshotBuilder"
    database:
      migrations_required: true
      tables:
        - "project_command_runs"
        - "project_quality_gates"
        - "workflow_events"
        - "preview_events"
  frontend:
    files:
      - "apps/web/src/components/PreviewTimeline.tsx"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/components/StorySpecWorkspace.tsx"
    components:
      - "Agent timeline"
      - "Validation evidence panel"
      - "Preview status"
    routes:
      - "Preview screen"
      - "UserStories screen"
  workflow:
    graph_nodes:
      - "qaAgent"
      - "curatorAgent"
    agents:
      - "QAAgent"
      - "CuratorAgent"
  tests:
    unit:
      - "QA evidence schema tests"
      - "Curator prompt evidence tests"
    integration:
      - "ProjectQualityGate command persistence tests"
      - "Preview smoke result tests"
    e2e:
      - "Generated project preview opens and evidence appears in UI"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    Runtime evidence becomes a first-class contract. QA still produces test cases, but when a real project/preview exists, Horus also runs controlled validation and passes the result to Curator and UI.

  depends_on:
    - name: "Project command catalog"
      type: "internal_module"
      owner: "infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "HorusProjectConfig.commandCatalog and roleProfiles.*.defaultValidationCommandIds"
      required_for: "Run only allowed build/test/typecheck commands."
      assumptions: []
      failure_modes:
        - "No validation command is available, leaving runtime evidence incomplete."
      fallback_or_recovery: "Record validation_not_available with reason."
      verification:
        - "Test quality gate with empty command list records skipped evidence."

    - name: "PreviewRuntimeManager"
      type: "backend_service"
      owner: "infrastructure/preview"
      direction: "this_spec_consumes_dependency"
      contract_used: "create/start/reload/get session"
      required_for: "Start or inspect preview and collect smoke evidence."
      assumptions:
        - "Preview session can expose URL/status for local smoke."
      failure_modes:
        - "Preview starts but app is blank or wrong route."
      fallback_or_recovery: "Mark preview smoke failed and pass evidence to Curator."
      verification:
        - "Preview smoke test with known URL."

    - name: "CuratorAgent"
      type: "agent"
      owner: "infrastructure/agents"
      direction: "this_spec_consumes_dependency"
      contract_used: "validateOutput(spec, html, qaOutput, codeChangeSet, settings, executionBrief)"
      required_for: "Make final pass/fail decision using static plus runtime evidence."
      assumptions: []
      failure_modes:
        - "Curator passes output despite failed runtime validation."
      fallback_or_recovery: "Curator must fail when required evidence has failed status."
      verification:
        - "buildCuratorPrompt includes runtime evidence and tests assert failed command blocks pass."

  depended_on_by:
    - name: "Agent run flow UI"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "HorusRunFlow validation evidence snapshots"
      compatibility_obligation: "may extend schema without breaking existing timeline rendering"
      expected_consumer_behavior: "Render commands, preview smoke, pass/fail status and error tails."
      migration_or_notification_required: false
      verification:
        - "UI smoke with validation evidence object."

    - name: "Chat progress"
      type: "workflow"
      owner: "application/usecases"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "agent progress messages"
      compatibility_obligation: "must keep existing messages and add concise evidence summaries"
      expected_consumer_behavior: "User can see whether Horus ran validation or why it could not."
      migration_or_notification_required: false
      verification:
        - "horusChatTurn/action flow test checks evidence summary message."

  bidirectional_integrations:
    - name: "QA-Curator runtime evidence handoff"
      participants:
        - "QAAgent"
        - "ProjectQualityGateService"
        - "CuratorAgent"
      shared_contract: "RuntimeValidationEvidence"
      consistency_rule: "Curator cannot pass if required runtime evidence status is failed."
      verification:
        - "Curator unit test with failed command evidence returns passed=false."

  data_flow:
    inbound:
      - source: "Command execution"
        payload_or_state: "commandId, command, cwd, exitCode, stdoutTail, stderrTail, durationMs"
        validation: "ProjectCommandRunSchema"
      - source: "Preview smoke"
        payload_or_state: "url, statusCode or error, rendered title/body snippet, screenshot path if available"
        validation: "Runtime evidence schema"
    outbound:
      - target: "Curator prompt"
        payload_or_state: "runtime evidence summary"
        compatibility: "LLM prompt must remain concise and structured"
      - target: "Run flow API/UI"
        payload_or_state: "validation evidence snapshots"
        compatibility: "Existing event consumers must tolerate unknown evidence fields"

  sequencing_dependencies:
    - dependency: "Code must be applied or staged in isolated workspace before runtime validation."
      reason: "Build/preview must test the actual candidate project."
      validation: "Integration test checks validation cwd is project root."
    - dependency: "Runtime validation must complete before Curator final pass."
      reason: "Curator needs evidence."
      validation: "Workflow test ensures curator input includes evidence."

  integration_risks:
    - risk: "Validation commands can be slow."
      severity: "medium"
      mitigation: "Use command timeouts and show running state."
    - risk: "Preview smoke requires browser automation not always available."
      severity: "medium"
      mitigation: "Start with HTTP smoke and optional browser/screenshot stage; never fake browser evidence."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Do not claim validation that was not executed."
    - "Keep manual QA cases separate from executable runtime evidence."
    - "Use command catalog, never arbitrary shell from LLM output."
    - "Persist stdout/stderr tails, not full unbounded logs."
    - "Expose evidence through typed shared schemas."
  project_specific:
    - "QAAgent may propose cases; ProjectQualityGateService runs commands."
    - "Curator receives both static artifacts and runtime evidence."
    - "Preview smoke must use registered project/session boundaries."
    - "Frontend UI must show failed validation prominently and concisely."
```

## 8. Proposed Runtime Evidence Contract

```yaml
RuntimeValidationEvidence:
  id: "uuid"
  workflowThreadId: "uuid | null"
  constructionRunId: "uuid | null"
  userStoryId: "uuid | null"
  projectId: "uuid | null"
  status: "passed | failed | skipped | running"
  commands:
    - commandId: "string"
      command: "string"
      cwd: "string"
      exitCode: "number | null"
      stdoutTail: "string"
      stderrTail: "string"
      durationMs: "number"
  preview:
    status: "passed | failed | skipped"
    url: "string | null"
    message: "string"
    evidence:
      title: "string | null"
      bodySnippet: "string | null"
      screenshotPath: "string | null"
  createdAt: "ISO datetime"
```

Rules:

- `skipped` requires a reason.
- `failed` must include actionable stderr/message.
- Screenshot/browser fields must be null unless actually captured.
- Curator prompt should receive compact evidence, not full logs.

## 9. Execution Plan

```yaml
execution_plan:
  phase_1_schema_and_persistence:
    - "Create shared RuntimeValidationEvidence schema."
    - "Persist evidence either as project quality gate details or workflow event payloads."
    - "Add migration if evidence needs normalized table."

  phase_2_quality_gate_execution:
    - "Make ProjectQualityGateService emit RuntimeValidationEvidence."
    - "Run role default validation commands and record skipped if none exist."
    - "Add preview smoke step when project/preview is available."

  phase_3_curator_integration:
    - "Extend Curator validateOutput input to accept runtime evidence."
    - "Update prompt and hard prechecks: failed required evidence cannot pass."
    - "Add tests for failed build, skipped validation and passed evidence."

  phase_4_qa_agent_contract:
    - "Keep QA manual cases, but add expectation that executable evidence is separate."
    - "Update QA skill to require cases that can be automated later without claiming execution."

  phase_5_frontend_observability:
    - "Show validation evidence in run flow/timeline."
    - "Display command id, status, stderr tail and preview smoke status."
    - "Ensure chat progress includes concise runtime evidence summary."
```

## 10. Validation Protocol

```yaml
validation_protocol:
  static_checks:
    - command: "pnpm --filter @u-build/server type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      required: true
    - command: "pnpm --filter @u-build/web type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      required: true

  tests:
    - command: "node --test apps/server/test/buildCuratorPrompt.test.mjs apps/server/test/projectConstructionWorkspace.test.mjs apps/server/test/previewRuntimeEvidence.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      required: true
    - command: "node --test apps/server/test/horusChatTurn.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      required: true

  runtime_checks:
    - command: "Start generated project preview from UI or API"
      cwd: "/Users/wamat/Desktop/horus.ai"
      expected: "Preview evidence appears in run flow."

  manual_checks:
    - "Open browser preview and confirm generated app is visible."
    - "Confirm UI shows command failures without expanding layout unpredictably."
```

## 11. Acceptance Criteria

- QA manual test cases remain available and traceable to acceptance criteria.
- Runtime evidence is recorded for commands and preview smoke when project exists.
- Curator cannot pass a candidate with failed required build/typecheck/test evidence.
- UI exposes runtime evidence clearly enough for the user to know whether construction actually happened.
- No browser/screenshot evidence is claimed unless captured.
- Validation failures include actionable stderr/message.
- Existing chat and workflow routes remain backward compatible.

## 12. Agent Error Mitigation

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent screenshot paths or browser outcomes."
    - "Do not invent command execution results."
  anti_overengineering:
    - "Start with command evidence and HTTP smoke before adding visual regression."
    - "Keep evidence compact."
  anti_regression:
    - "Do not remove existing QA test-case generation."
    - "Do not block workflows when validation is unavailable; mark skipped with reason unless validation is required by config."
  anti_false_validation:
    - "Curator must distinguish manual QA plan from executed QA evidence."
```

## 13. Final Output Contract

```yaml
final_report:
  status: "completed | partially_completed | blocked"
  evidence:
    - "commands executed"
    - "preview smoke result"
    - "curator decision"
  validation:
    commands_run:
      - "command, cwd, exit code"
  ui_verification:
    - "browser target checked"
    - "visible evidence state"
```
