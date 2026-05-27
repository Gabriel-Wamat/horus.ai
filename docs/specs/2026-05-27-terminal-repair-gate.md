---
format_version: "agentic_sdd.v1"
task_id: "terminal-repair-gate"
title: "Terminal Repair Gate For Failed Agent Deliveries"
created_at_utc: "2026-05-27T04:21:25Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
---

## 1. Original User Request

```yaml
raw_user_request: |
  implemente uma feature em um dos agentes(avalie qual) que nunca entrega um projeto falhado, sempre que cai em falha, abre o terminal vê os erros e corrge. um projeto nunca e em hipótese alguma deve ser entregue com falha. destrinche isso rigorosamente e em seguida pesquise quais as melhores práticas para esse cenários(vá no github, meidum, arxiv...) e em seguida use a skill de criar spec para ajustar isso
```

## 2. System Interpretation

```yaml
system_translation: |
  Add a mandatory terminal-backed repair gate to the agent workflow so a failed project is never marked as delivered. The correct ownership is Curator/Odin: Front can produce changes, QA can test, but Curator is the final quality gate and Odin owns retry routing. Curator must inspect deterministic validation evidence before approval; Odin must route failures back to the right agent until success or explicit human escalation.

expected_user_visible_result: |
  If terminal/build/test/static validation fails, Horus does not say the project was delivered. The chat/run-flow shows a correction/retry state with concise failure evidence. A patch is only applied as delivered after the gate passes.

expected_engineering_result: |
  Proposed CodeChangeSets receive a preflight gate before Curator approval. The gate applies the candidate in a controlled validation pass, runs deterministic project checks, captures stdout/stderr tails, rolls back the candidate, and feeds failures into CuratorFeedback so Front/QA can correct them.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Horus can appear to deliver even when the generated project or patch is broken."
  target_user: "Users asking Horus to modify/build frontend projects through the preview chat and agent workflow."
  expected_outcome: "No failed project is presented as delivered; failures become repair input."
  product_surface:
    - "Preview chat execution"
    - "Agent flow map"
    - "Workflow events"
    - "CodeChangeSet lifecycle"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph StateGraph"
      - "SafeCliRunner"
      - "CodeChangeSet lifecycle"
    frontend:
      - "React/Vite UI observing workflow events"
    database:
      - "File/Postgres repositories depending on runtime config"
    infrastructure:
      - "Local generated project workspaces"
  known_entrypoints:
    - "apps/server/src/infrastructure/langgraph/graph.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
  known_existing_patterns:
    - "CuratorFeedback drives Odin retry routing."
    - "MAX_RETRIES prevents infinite loops."
    - "CodeChangeSet is persisted as proposed, approved, applied, failed."
    - "RuntimeValidationEvidence carries command stdout/stderr tails."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add Curator-owned preflight validation for proposed frontend CodeChangeSets."
    - "Capture terminal/runtime failure evidence and convert it into CuratorFeedback."
    - "Prevent patch_applied and completed delivery when preflight/apply validation fails."
    - "Add tests for preflight failure, retry feedback, and non-delivery."
  out_of_scope:
    - "Creating a new agent role."
    - "Replacing the LangGraph topology."
    - "Changing provider configuration or multiprovider settings."
    - "Broad redesign of the agent-flow UI."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/langgraph/dependencies.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
    services:
      - "CuratorAgentNode"
      - "WorkflowOrchestrator"
      - "ProjectExecutionService"
      - "FrontendChangeSetQualityGate"
    database:
      migrations_required: false
      tables: []
  frontend:
    files: []
    components: []
    routes: []
  workflow:
    graph_nodes:
      - "curatorAgent"
      - "odinAgent"
      - "frontAgent"
    agents:
      - "Curator"
      - "Odin"
      - "Front"
  tests:
    unit:
      - "apps/server/test/codeChangeSetPreflightService.test.mjs"
      - "apps/server/test/curatorAgentNodePreflight.test.mjs"
    integration:
      - "apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
    e2e: []
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    Curator consumes Front's proposed CodeChangeSet and project root, invokes a deterministic preflight, and exposes failure evidence back to Odin/Front through existing CuratorFeedback. WorkflowOrchestrator remains responsible for persistence and must not emit delivery events for failed change sets.

  depends_on:
    - name: "FrontendChangeSetQualityGate"
      type: "internal_module"
      owner: "apps/server/infrastructure/code"
      direction: "this_spec_consumes_dependency"
      contract_used: "evaluateFrontendChangeSet({ projectRootPath, changeSet }) -> { passed, issues }"
      required_for: "Static preflight before any terminal command or final delivery."
      assumptions: []
      failure_modes:
        - "Disconnected files, forbidden mock/fake fixtures, or TypeScript syntax errors are missed."
      fallback_or_recovery: "Return failed preflight and route to Front."
      verification:
        - "Unit test with disconnected file or syntax issue."

    - name: "ProjectExecutionService"
      type: "backend_service"
      owner: "apps/server/infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "executeCommandRequests({ roleName, plan, config, projectRoot })"
      required_for: "Run controlled command catalog entries and capture stdout/stderr tails."
      assumptions:
        - "Commands are detected from project package scripts through ProjectDefaultContractBuilder."
      failure_modes:
        - "No command catalog means terminal validation is skipped but static gate still applies."
      fallback_or_recovery: "Return skipped command evidence and do not claim command validation."
      verification:
        - "Unit test with fake command failure evidence."

  depended_on_by:
    - name: "Odin retry routing"
      type: "agent"
      owner: "apps/server/infrastructure/langgraph"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "CuratorFeedback { passed:false, fixTarget, missingItems }"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "Route failure back to Front/QA according to fixTarget."
      migration_or_notification_required: false
      verification:
        - "Existing decideRouting tests plus curator node preflight test."

    - name: "Preview chat progress"
      type: "frontend_component"
      owner: "apps/web/components"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "workflow validation_evidence, retry_started, status_changed events"
      compatibility_obligation: "may extend without breaking existing event consumers"
      expected_consumer_behavior: "Show concise repair/retry state, not delivery."
      migration_or_notification_required: false
      verification:
        - "Event assertion in workflow orchestrator test."

  bidirectional_integrations:
    - name: "CodeChangeSet lifecycle"
      participants:
        - "FrontAgent proposed patch"
        - "Curator preflight and Orchestrator persistence"
      shared_contract: "CodeChangeSetSchema"
      consistency_rule: "A failed preflight cannot become curator_approved, applied, validated, or patch_applied."
      verification:
        - "workflowOrchestratorCodeChangeSet test for failed apply/preflight."

  data_flow:
    inbound:
      - source: "FrontAgent"
        payload_or_state: "CodeChangeSet with operations and validation metadata"
        validation: "CodeChangeSetSchema plus preflight gate"
    outbound:
      - target: "Odin/Front retry loop"
        payload_or_state: "CuratorFeedback with terminal/static error evidence"
        compatibility: "Existing CuratorFeedback schema preserved"

  sequencing_dependencies:
    - dependency: "FrontAgent must propose CodeChangeSet before Curator preflight."
      reason: "Preflight needs concrete file operations."
      validation: "Curator node selects latest front output from agentResults."

  integration_risks:
    - risk: "Temporary preflight writes could leave files changed if process dies mid-run."
      severity: "medium"
      mitigation: "Use try/finally rollback; final delivery still uses existing applier. A future version can validate in a full isolated copy."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Separate application, domain, infrastructure, and presentation concerns."
    - "Prefer dependency injection over direct construction of concrete services."
    - "Do not introduce circular dependencies."
  project_specific:
    - "Curator is the final quality gate; Front must not self-certify delivery."
    - "Odin owns retry routing through CuratorFeedback."
    - "The workflow must never emit patch_applied for a failed CodeChangeSet."
    - "Runtime failures must be represented as evidence, not swallowed as chat prose."
```

## 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Use typed models or schemas instead of unstructured dictionaries where practical."
    - "Handle errors explicitly with actionable messages."
  backend:
    - "Do not run arbitrary shell; use SafeCliRunner through ProjectExecutionService."
    - "Never execute commands outside the selected project root."
    - "Rollback candidate file writes after preflight validation."
  tests:
    - "Cover success, static failure, command failure, rollback, and event behavior."
```

## 9. Contracts And Invariants

```yaml
contracts:
  domain_contracts:
    - name: "No Failed Delivery"
      producer: "CuratorAgentNode and WorkflowOrchestrator"
      consumers:
        - "Preview chat"
        - "Agent flow map"
        - "CodeChangeSet repository"
      invariant: "A CodeChangeSet with failed validation cannot be marked delivered or emit patch_applied."
    - name: "Retryable Terminal Failure"
      producer: "CodeChangeSetPreflightService"
      consumers:
        - "CuratorFeedback"
        - "FrontAgent reflection prompt"
      invariant: "Terminal stderr/stdout tails must be preserved in missingItems when validation fails."
  data_contracts:
    - name: "RuntimeValidationEvidence"
      producer: "Preflight service"
      consumers:
        - "Workflow event stream"
        - "Curator prompt/result"
      migration_required: false
      compatibility_notes: "Use existing schema."
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current implementation and integration map"
    agent: "repo_explorer"
    action: "Read Curator, Odin, Front, WorkflowOrchestrator, CodeChangeSet applier and quality gate paths."
    expected_output: "Confirmed failure boundary and correct ownership."
  - step: 2
    name: "Add preflight service"
    agent: "backend_specialist"
    action: "Create CodeChangeSetPreflightService that validates static gate, temporarily applies candidate, runs deterministic commands, captures evidence, and rolls back."
    expected_output: "Typed service with pass/fail result and RuntimeValidationEvidence."
  - step: 3
    name: "Wire Curator"
    agent: "backend_specialist"
    action: "Call preflight before Curator can pass; convert failures into CuratorFeedback and agent result evidence."
    expected_output: "Failed terminal/static validation routes to retry, not delivery."
  - step: 4
    name: "Harden Orchestrator delivery"
    agent: "backend_specialist"
    action: "If final applier returns failed, persist failed state and emit validation evidence/error rather than patch_applied."
    expected_output: "No false patch_applied event."
  - step: 5
    name: "Validate"
    agent: "qa_specialist"
    action: "Run focused tests and server build."
    expected_output: "Validation evidence with commands and exit codes."
```

## 11. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Keep ownership in Curator/Odin, not Front-only."
  - agent_name: "backend_specialist"
    responsibility: "Implement preflight, event, and persistence safeguards."
  - agent_name: "qa_specialist"
    responsibility: "Validate no failed project can be marked delivered."
```

## 12. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Curator returns failed feedback when candidate static validation fails."
    - "Curator returns failed feedback when terminal validation command exits non-zero."
    - "Front receives failure evidence through existing curator feedback on retry."
    - "No patch_applied event is emitted for a failed CodeChangeSet."
  integration:
    - "WorkflowOrchestrator persists failed CodeChangeSet without marking it applied."
    - "RuntimeValidationEvidence preserves command id, command, cwd, exit code, stdout tail, stderr tail, and duration."
  architectural:
    - "No new graph topology is required."
    - "No arbitrary shell execution is introduced."
  quality:
    - "Focused backend tests pass."
    - "Server build passes."
  observability:
    - "Failure evidence is available through workflow event stream and curator missingItems."
```

## 13. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Typecheck backend changes."
      success_condition: "exit code 0"
    - command: "node --test apps/server/test/codeChangeSetPreflightService.test.mjs apps/server/test/curatorAgentNodePreflight.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate preflight, retry feedback, and non-delivery invariants."
      success_condition: "all tests pass"
  runtime_checks:
    - name: "Failed command repair loop"
      method: "unit/integration test"
      expected: "failure evidence causes retry and no delivery event"
  integration_checks:
    - name: "CodeChangeSet lifecycle"
      surfaces:
        - "Curator"
        - "WorkflowOrchestrator"
      method: "integration test"
      expected: "failed candidate never reaches patch_applied"
  manual_checks: []
```

## 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent files, APIs, routes, tables, settings, or dependencies."
    - "Never claim a command was run unless it was actually executed."
  failure_handling:
    - "If a command fails, inspect stdout, stderr, and exit code."
    - "Fix the root cause when possible and rerun the relevant validation."
    - "If blocked, report exact blocker and evidence."
  state_consistency:
    - "Do not change producer behavior without checking event consumers."
    - "If changing workflow state, update accessors, persistence, and event summaries."
  scope_control:
    - "Do not perform broad rewrites."
```

## 15. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "static CodeChangeSet quality gate failure"
    - "typecheck/build/test command failure"
    - "preview smoke failure"
  non_retryable_failures:
    - "missing project root"
    - "unsafe path/writeRoots violation"
    - "missing required credentials"
  rollback_rules:
    - "Rollback temporary preflight writes in finally."
    - "Do not rollback user changes unrelated to the candidate."
  escalation_rules:
    - "After MAX_RETRIES, use existing retryCheckpoint/HITL escalation."
```

## 16. Observability Requirements

```yaml
observability:
  logs:
    - event: "preflight_started"
      fields: ["run_id", "user_story_id", "change_set_id"]
    - event: "preflight_failed"
      fields: ["run_id", "change_set_id", "command_id", "exit_code", "stderr_tail"]
  audit_trail:
    required: true
    must_capture:
      - "files changed temporarily"
      - "commands executed"
      - "test results"
      - "workflow decisions"
  user_visible_failures:
    - "Show failed step."
    - "Show concise failure reason."
    - "Show that Horus is correcting instead of delivering."
```

## 17. Risks And Unknowns

```yaml
risks:
  - risk: "Preflight temporary writes can be interrupted by process crash."
    severity: "medium"
    mitigation: "try/finally rollback in this version; future isolated-copy execution."
  - risk: "No test/build scripts in generated project means terminal validation is skipped."
    severity: "medium"
    mitigation: "Static gate remains required; skipped command evidence is explicit."
unknowns:
  - question: "Should preflight run every available build/test/lint/check command or only defaults?"
    resolution_strategy: "Start with safe deterministic build/type-check/test/lint/check scripts and avoid dev/start."
```

## 18. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Add a Curator preflight service instead of putting responsibility inside Front. This follows a generator/evaluator/refiner loop: Front proposes, Curator validates with terminal/static feedback, Odin routes correction.
  alternatives_considered:
    - option: "Let Front run commands itself."
      tradeoff: "Front would self-certify and could still deliver false positives."
    - option: "Only fail final applier."
      tradeoff: "Stops false delivery but does not feed errors into the correction loop early enough."
  migration_notes: []
  backward_compatibility:
    required: true
    notes:
      - "CuratorFeedback schema remains compatible."
      - "Workflow event schema remains compatible."
```

## 19. Deliverables

```yaml
deliverables:
  code:
    - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
    - "apps/server/src/infrastructure/langgraph/dependencies.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
  tests:
    - "apps/server/test/codeChangeSetPreflightService.test.mjs"
    - "apps/server/test/curatorAgentNodePreflight.test.mjs"
    - "apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
  docs:
    - "docs/specs/2026-05-27-terminal-repair-gate.md"
  validation_evidence:
    - "server build output"
    - "focused node --test output"
```

## 20. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Relevant files were read."
    - "Existing patterns were identified."
    - "Upstream dependencies and downstream consumers were mapped."
  implementation:
    - "Changes are scoped to the SDD."
    - "Architecture rules were followed."
    - "Producer and consumer contracts were updated together when required."
  validation:
    - "Relevant tests were run."
    - "Build/typecheck was run."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

