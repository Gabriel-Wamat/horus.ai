---
format_version: "agentic_sdd.v1"
task_id: "feature-57-visual-curator-screenshot-gate"
title: "Screenshot-Based Visual Curator Gate For Generated Frontends"
created_at_utc: "2026-05-27T04:51:51Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "1.1.0"
status: "implemented"
depends_on:
  - "spec/features/41-agentic-runtime-validation-observability.md"
  - "spec/features/47-validation-gates-true-success.md"
  - "spec/features/56-visual-contract-design-system.md"
---

# 57 - Screenshot-Based Visual Curator Gate For Generated Frontends

## 1. Original User Request

```yaml
raw_user_request: |
  utilize a skill de criar specs para criar 3 planejamentos que contempletem todos esses pontos mapeados, quero que voce detalhe a implementacao e ajustes de forma altamente rigorosa para que nada seja esquecido
```

## 2. System Interpretation

```yaml
system_translation: |
  Create the second implementation plan for a real visual quality gate. Horus must not rely only on generated code text or QA cases to decide whether a frontend is visually acceptable. It must render the candidate UI, capture screenshots, evaluate them against the visual contract and objective anti-patterns, and feed failures back into the agent loop before final application.

expected_user_visible_result: |
  Generated UI stops being accepted when it has broken layout, excessive highlights, too many frames, poor spacing, text overflow, low contrast, or mismatched identity. The user sees concise progress and failure reasons instead of a broken project being delivered.

expected_engineering_result: |
  A VisualDesignGateService produces screenshot evidence and a VisualCurator verdict consumed by Curator/Odin. The workflow only approves/applies a CodeChangeSet after build/runtime validation and visual gate pass.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "A project can pass functional/spec text checks while looking visually bad or inconsistent."
  target_user: "Users relying on Horus to generate polished frontend UI."
  expected_outcome: "A generated UI must pass objective visual QA before delivery."
  product_surface:
    - "Preview chat"
    - "Agent flow map"
    - "CodeChangeSet lifecycle"
    - "Preview runtime"
    - "Curator approval"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph agent nodes"
      - "PreviewRuntimeManager"
      - "CodeChangeSet preflight"
      - "CuratorAgent"
    frontend:
      - "React/Vite preview console"
      - "Browser-accessible local preview"
    database:
      - "File/Postgres event and CodeChangeSet repositories"
    infrastructure:
      - "Local dev server command catalog"
      - "Browser automation / screenshot capture"
  known_entrypoints:
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
    - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/features/agent-flow-map/*"
  known_existing_patterns:
    - "Curator is the final quality gate."
    - "CodeChangeSet is proposed before mutation."
    - "Preview runtime already records lifecycle events and evidence."
    - "Workflow events are consumed by preview chat and agent flow UI."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Render candidate frontend in an isolated validation pass."
    - "Capture desktop and mobile screenshots for generated UI."
    - "Score screenshots against visualContract, design context, and objective visual anti-patterns."
    - "Fail Curator approval when visual gate fails."
    - "Feed concise, actionable visual failure feedback to Front Agent."
    - "Persist bounded visual evidence metadata and screenshot paths/ids."
    - "Show concise user-visible progress and failure status."
    - "Add deterministic and mocked tests for gate pass/fail behavior."
  out_of_scope:
    - "Building a full Figma-like visual editor."
    - "Manual drag-and-drop visual edits."
    - "Replacing functional QA or terminal repair gate."
    - "Adding public screenshot hosting."
    - "Changing all Horus app visuals."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/Preview.ts"
      - "packages/shared/src/entities/ProjectConstruction.ts"
      - "apps/server/src/infrastructure/visual/VisualDesignGateService.ts"
      - "apps/server/src/infrastructure/visual/VisualCuratorAgent.ts"
      - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
      - "apps/server/src/infrastructure/langgraph/dependencies.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
      - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/repositories/contracts.ts"
    services:
      - "VisualDesignGateService"
      - "VisualCuratorAgent"
      - "PreviewRuntimeManager"
      - "CuratorAgentNode"
      - "WorkflowOrchestrator"
    database:
      migrations_required: true
      tables:
        - "workflow_events if visual evidence metadata is persisted in event data"
        - "code_change_sets if visual gate status is persisted directly"
  frontend:
    files:
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/features/agent-flow-map/components/RunFlowDrawer.tsx"
      - "apps/web/src/features/agent-flow-map/utils/deriveHorusRunSnapshot.ts"
    components:
      - "PreviewConversationPanel"
      - "VisualPreviewConsole"
      - "RunFlowDrawer"
    routes:
      - "preview mode"
      - "agents mode"
  workflow:
    graph_nodes:
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
      - "odinAgent"
    agents:
      - "Front"
      - "QA"
      - "Curator"
      - "Odin"
  tests:
    unit:
      - "apps/server/test/visualDesignGateService.test.mjs"
      - "apps/server/test/curatorAgentVisualGate.test.mjs"
      - "apps/web/test/frontendRegressionGuards.test.mjs"
    integration:
      - "apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
      - "apps/server/test/previewLifecycle.test.mjs"
    e2e:
      - "browser smoke check against localhost preview"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    VisualDesignGateService sits between candidate CodeChangeSet validation and final Curator approval. It consumes preview runtime, screenshots, Spec.visualContract, DesignContextBundle, and QA evidence. It exposes a typed VisualGateResult to Curator/Odin and bounded visual evidence to frontend consumers.

  depends_on:
    - name: "CodeChangeSet preflight"
      type: "internal_module"
      owner: "apps/server/infrastructure/code"
      direction: "this_spec_consumes_dependency"
      contract_used: "Preflight must produce a candidate state that can be rendered or explain why rendering is impossible."
      required_for: "Avoid screenshotting stale or unapplied code."
      assumptions:
        - "Candidate patch can be applied in a controlled workspace or temporary copy."
      failure_modes:
        - "Screenshot is taken from old code."
        - "Preflight leaves project dirty."
      fallback_or_recovery: "Fail visual gate as inconclusive and block delivery until evidence is available."
      verification:
        - "Test candidate file content appears in screenshot route or rendered DOM."

    - name: "PreviewRuntimeManager"
      type: "backend_service"
      owner: "apps/server/infrastructure/preview"
      direction: "this_spec_consumes_dependency"
      contract_used: "Start/reuse preview session, resolve URL, emit lifecycle events, capture runtime evidence."
      required_for: "Render the candidate UI in a browser-accessible context."
      assumptions:
        - "A command catalog can start the generated frontend preview."
      failure_modes:
        - "Preview server fails to start."
        - "SSE/browser preview is offline."
      fallback_or_recovery: "Route failure to terminal repair/Front instead of approving."
      verification:
        - "previewLifecycle test with preview_ready and preview_error."

    - name: "Browser/screenshot adapter"
      type: "external_dependency"
      owner: "runtime infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "capture({ url, viewport }) -> screenshot artifact + optional DOM diagnostics"
      required_for: "Produce visual evidence."
      assumptions:
        - "Local browser automation is available in the runtime environment."
      failure_modes:
        - "Browser unavailable in CI."
        - "Screenshot times out."
      fallback_or_recovery: "Mark visual gate inconclusive; do not approve unless policy explicitly allows bypass for CI-only unit tests."
      verification:
        - "Mock adapter unit test plus optional local browser smoke."

    - name: "VisualContract and DesignContextBundle"
      type: "internal_module"
      owner: "packages/shared + DesignContextService"
      direction: "this_spec_consumes_dependency"
      contract_used: "Spec.visualContract, DesignContextBundle"
      required_for: "Know what visual identity and anti-patterns to evaluate."
      assumptions:
        - "This may be absent in old specs."
      failure_modes:
        - "Gate becomes subjective if no contract exists."
      fallback_or_recovery: "Use generic operational UI baseline and record warning."
      verification:
        - "Gate tests for with/without visualContract."

  depended_on_by:
    - name: "Curator approval"
      type: "agent"
      owner: "apps/server/infrastructure/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "VisualGateResult"
      compatibility_obligation: "must block pass when failed"
      expected_consumer_behavior: "Curator includes visual gate result in score, missingItems, and fixTarget."
      migration_or_notification_required: false
      verification:
        - "curatorAgentVisualGate test: failed visual gate returns passed=false."

    - name: "Odin retry routing"
      type: "agent"
      owner: "apps/server/infrastructure/langgraph"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "CuratorFeedback missingItems with [front:visual] prefixes"
      compatibility_obligation: "must preserve existing routing schema"
      expected_consumer_behavior: "Route visual failures to Front unless QA evidence is the cause."
      migration_or_notification_required: false
      verification:
        - "decideRouting test with visual failure."

    - name: "Preview chat"
      type: "frontend_component"
      owner: "apps/web/components"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "workflow event visual_gate_started|visual_gate_passed|visual_gate_failed"
      compatibility_obligation: "may extend event union; existing consumers must ignore unknown events safely"
      expected_consumer_behavior: "Show short status like 'Validando visual' and concise issue if failed."
      migration_or_notification_required: false
      verification:
        - "frontendRegressionGuards test for compact activity and no verbose spam."

  bidirectional_integrations:
    - name: "Visual gate and Front Agent retry"
      participants:
        - "VisualCuratorAgent"
        - "FrontAgent"
      shared_contract: "Actionable visual feedback"
      consistency_rule: "Feedback must identify concrete visual issue, affected area, expected correction, and evidence source."
      verification:
        - "Prompt test ensures feedback is included in reflectionBlock."

  data_flow:
    inbound:
      - source: "Rendered candidate UI"
        payload_or_state: "Screenshots and DOM diagnostics at desktop/mobile viewports"
        validation: "Browser adapter timeout, nonblank screenshot, page console errors"
      - source: "Spec and DesignContext"
        payload_or_state: "visualContract, design tokens, anti-patterns"
        validation: "Zod parse or fallback baseline"
    outbound:
      - target: "CuratorFeedback"
        payload_or_state: "Visual failures with fixTarget=front"
        compatibility: "Existing feedback schema preserved"
      - target: "Workflow events"
        payload_or_state: "Bounded visual evidence metadata"
        compatibility: "No raw image blobs in event stream unless explicitly supported"

  sequencing_dependencies:
    - dependency: "Build/preflight must pass before screenshot gate."
      reason: "Broken builds cannot produce reliable visual evidence."
      validation: "Gate returns failed/inconclusive if preflight failed."
    - dependency: "Visual gate must run before final Curator pass."
      reason: "Curator is final quality gate; visual failure must block approval."
      validation: "curator node test."

  integration_risks:
    - risk: "Visual scoring becomes arbitrary and blocks valid work."
      severity: "high"
      mitigation: "Use explicit rubric, objective checks, and threshold bands; require actionable evidence."
    - risk: "Screenshot capture adds latency."
      severity: "medium"
      mitigation: "Run only after build/preflight passes; capture two viewports; cache current run evidence."
    - risk: "Gate approves nonblank but ugly screens."
      severity: "high"
      mitigation: "Combine deterministic checks with model-based visual curator and anti-pattern rubric."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Curator remains final approval owner."
    - "Keep visual gate service independent from web presentation components."
    - "Do not put screenshot capture logic directly inside CuratorAgentImpl."
    - "Do not expose raw filesystem paths or secrets to the frontend."
  project_specific:
    - "A failed or inconclusive visual gate must block delivery."
    - "Visual gate failures must route to Front Agent by default."
    - "Visual gate events must be concise and must not spam the chat."
    - "The visual gate must respect Horus dark/gray/controlled-green identity for Horus-owned screens."
```

## 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Use typed VisualGateResult schemas."
    - "Keep screenshot metadata bounded."
    - "Never mark a visual gate as passed without actual screenshot/DOM evidence unless explicitly running a unit-test mock."
  backend:
    - "Implement browser capture behind an interface for tests."
    - "Add timeouts and explicit failed/inconclusive states."
    - "Store only bounded screenshot references and summaries in events."
    - "Use [front:visual] missingItems prefixes for routing."
  frontend:
    - "Show visual gate progress as compact status, not as multiple large chat messages."
    - "Display issue summaries only when actionable."
    - "Do not add large image previews into chat unless a drawer/detail view exists."
  tests:
    - "Mock browser adapter for deterministic tests."
    - "Add one optional local smoke that can be skipped when browser automation is unavailable."
```

## 9. Contracts And Invariants

```yaml
contracts:
  domain_contracts:
    - name: "VisualGateResult"
      producer: "VisualDesignGateService"
      consumers:
        - "CuratorAgentNode"
        - "WorkflowOrchestrator"
        - "PreviewConversationPanel"
        - "RunFlowDrawer"
      invariant: "Final delivery cannot proceed when status is failed or inconclusive, unless an explicit human override contract is added in a later spec."

    - name: "Visual issue"
      producer: "VisualCuratorAgent"
      consumers:
        - "FrontAgent reflectionBlock"
      invariant: "Every issue must include location, observed problem, violated rule, and requested correction."

  ui_contracts:
    - name: "Compact visual validation status"
      producer: "PreviewConversationPanel"
      consumers:
        - "User monitoring execution"
      requirement: "Show one compact dynamic indicator during visual validation and one concise issue if failed."

  data_contracts:
    - name: "Visual evidence metadata"
      producer: "VisualDesignGateService"
      consumers:
        - "Event log"
        - "Agent flow map"
      migration_required: true
      compatibility_notes: "Event consumers must ignore unknown event types and tolerate absent screenshot metadata."
```

### Proposed Result Schema

```ts
export const VisualGateIssueSchema = z.object({
  id: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  category: z.enum([
    "identity_drift",
    "layout_overflow",
    "contrast",
    "spacing",
    "typography",
    "component_misuse",
    "excessive_decoration",
    "missing_state",
    "responsive_breakage",
    "render_error"
  ]),
  location: z.string(),
  observed: z.string(),
  expected: z.string(),
  evidence: z.string(),
});

export const VisualGateResultSchema = z.object({
  status: z.enum(["passed", "failed", "inconclusive"]),
  score: z.number().int().min(0).max(100),
  threshold: z.number().int().min(0).max(100).default(85),
  screenshots: z.array(z.object({
    viewport: z.enum(["desktop", "mobile", "tablet"]),
    artifactId: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    nonBlank: z.boolean(),
  })),
  issues: z.array(VisualGateIssueSchema),
  summary: z.string(),
  generatedAt: z.string().datetime(),
});
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current validation and preview flow"
    agent: "repo_explorer"
    action: "Read CuratorAgentImpl, curatorAgentNode, WorkflowOrchestrator, PreviewRuntimeManager, preview repositories, and chat/agent-flow event consumers."
    expected_output: "Exact insertion point for visual gate and event propagation."

  - step: 2
    name: "Define visual gate schemas"
    agent: "backend_specialist"
    action: "Add VisualGateResult and VisualGateIssue schemas/types to shared entities or a server-local contract if persistence is initially metadata-only."
    expected_output: "Typed result contract with compatibility tests."

  - step: 3
    name: "Create browser screenshot adapter"
    agent: "backend_specialist"
    action: "Add interface and implementation for rendering URL at desktop/mobile, capturing screenshot metadata, DOM diagnostics, page title, console errors, and nonblank checks."
    expected_output: "Mockable screenshot capture service."

  - step: 4
    name: "Implement VisualDesignGateService"
    agent: "backend_specialist"
    action: "Given project root, candidate change set, preview command, visualContract, and design context, run render capture and deterministic checks."
    expected_output: "VisualGateResult with deterministic issues before model-based critique."

  - step: 5
    name: "Implement VisualCuratorAgent"
    agent: "agent_prompt_specialist"
    action: "Use screenshots/DOM diagnostics plus visualContract to score identity, hierarchy, density, responsive behavior, states, and anti-patterns."
    expected_output: "Actionable visual issues for Front Agent."

  - step: 6
    name: "Wire into Curator and Odin"
    agent: "backend_specialist"
    action: "Call visual gate before Curator pass. Convert failed/inconclusive result into CuratorFeedback with fixTarget=front and [front:visual] missingItems."
    expected_output: "Visual failure blocks delivery and triggers retry."

  - step: 7
    name: "Add compact UI progress"
    agent: "frontend_specialist"
    action: "Add visual gate event rendering as a compact live activity indicator in preview chat and optional detail in run drawer."
    expected_output: "User sees dynamic real progress without chat spam."

  - step: 8
    name: "Validate"
    agent: "qa_specialist"
    action: "Run server tests, web build, regression guards, and a local browser smoke if available."
    expected_output: "Evidence that visual gate blocks bad UI and passes valid UI."
```

## 11. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm gate insertion point and non-delivery invariant."
    inputs:
      - "WorkflowOrchestrator"
      - "Curator node"
      - "CodeChangeSet lifecycle"
    outputs:
      - "Gate sequencing notes"

  - agent_name: "backend_specialist"
    responsibility: "Implement visual gate service, screenshot adapter, schemas, event persistence, and Curator/Odin integration."
    inputs:
      - "Backend affected files"
      - "Contracts"
    outputs:
      - "Backend diff"
      - "Server tests"

  - agent_name: "frontend_specialist"
    responsibility: "Render compact validation status and issue summaries."
    inputs:
      - "Visual gate events"
      - "Existing preview chat activity pattern"
    outputs:
      - "Frontend diff"
      - "UI regression checks"

  - agent_name: "qa_specialist"
    responsibility: "Validate visual pass/fail paths, non-delivery invariant, and compact UX."
    inputs:
      - "Diff"
      - "Acceptance criteria"
    outputs:
      - "Validation report"
```

## 12. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "A candidate UI is rendered before final Curator approval."
    - "Desktop and mobile screenshots are captured or the gate returns inconclusive."
    - "Blank, broken, overflowing, or visually inconsistent screens fail the gate."
    - "A failed visual gate prevents CodeChangeSet delivery and routes feedback to Front Agent."
    - "A passed visual gate is recorded as evidence."
  integration:
    - "VisualGateResult is consumed by CuratorAgentNode."
    - "WorkflowOrchestrator does not emit patch_applied or completed delivery when visual gate fails."
    - "Preview chat consumes visual gate events without breaking existing event handling."
  architectural:
    - "Screenshot capture is behind a service interface."
    - "Visual scoring does not live directly in React components."
    - "The gate is additive to terminal/build/QA validation, not a replacement."
  quality:
    - "Server tests cover passed, failed, and inconclusive gate results."
    - "Web regression tests cover compact status rendering."
    - "Local browser smoke confirms the screenshot path when available."
  observability:
    - "Events capture visual_gate_started, visual_gate_passed, visual_gate_failed, and visual_gate_inconclusive with bounded details."
```

## 13. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate visual gate, Curator integration, event lifecycle, and non-delivery behavior."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend event/status rendering."
      success_condition: "Exit code 0."
    - command: "node --test apps/web/test/frontendRegressionGuards.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate compact visual activity UX and avoid chat spam regressions."
      success_condition: "Exit code 0."
  runtime_checks:
    - name: "Screenshot gate smoke"
      method: "browser"
      expected: "Gate captures nonblank desktop and mobile screenshots for a running preview."
  integration_checks:
    - name: "Failed visual gate blocks delivery"
      surfaces:
        - "CuratorAgentNode"
        - "WorkflowOrchestrator"
        - "CodeChangeSet repository"
      method: "integration test"
      expected: "No patch_applied event; CuratorFeedback routes to Front."
  manual_checks:
    - "Start a local preview run with a deliberately bad visual patch and confirm user sees concise failure/progress."
```

## 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not mark screenshots captured unless artifacts exist."
    - "Do not claim visual pass from HTML text alone."
    - "Do not invent visual issues without evidence source."
  read_before_write:
    - "Read PreviewRuntimeManager and existing activity UI before adding new events."
    - "Read Curator node and WorkflowOrchestrator before changing approval sequencing."
  failure_handling:
    - "If browser capture fails, return inconclusive and block delivery."
    - "If preview cannot start, route to repair instead of visual pass."
    - "If visual curator model fails to parse, use deterministic issues and mark inconclusive/failed."
  state_consistency:
    - "Update event producers and consumers together."
    - "Update Curator feedback and Odin routing expectations together."
  scope_control:
    - "Do not redesign the preview chat in this task."
    - "Do not add large screenshot galleries to the UI."
```

## 15. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "Preview server startup timeout"
    - "Browser capture timeout"
    - "Transient console error from dev server reload"
  non_retryable_failures:
    - "Build failure"
    - "Missing preview command"
    - "Screenshot consistently blank"
    - "Spec visualContract contradiction"
  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only temporary candidate application after screenshot."
    - "If rollback fails, block delivery and report dirty workspace evidence."
  escalation_rules:
    - "Escalate if visualContract requires assets that do not exist."
    - "Escalate if browser automation is unavailable in the target deployment environment."
```

## 16. Observability Requirements

```yaml
observability:
  logs:
    - event: "visual_gate_started"
      fields:
        - "run_id"
        - "project_id"
        - "change_set_id"
        - "viewports"
    - event: "visual_gate_finished"
      fields:
        - "run_id"
        - "status"
        - "score"
        - "issue_count"
        - "duration_ms"
    - event: "visual_gate_failed"
      fields:
        - "run_id"
        - "top_issue_category"
        - "severity"
        - "fix_target"
  audit_trail:
    required: true
    must_capture:
      - "candidate change set id"
      - "preview URL"
      - "viewports captured"
      - "screenshot artifact ids"
      - "visual issues"
      - "Curator decision"
  user_visible_failures:
    - "Show 'Visual reprovado' with one concise reason."
    - "Show that Horus is retrying Front Agent when retry budget remains."
    - "Show explicit escalation when retry budget is exhausted."
```

## 17. Risks And Unknowns

```yaml
risks:
  - risk: "Visual gate causes false negatives for acceptable minimalist designs."
    severity: "high"
    mitigation: "Use visualContract density/tone and a threshold with critical issue overrides, not generic beauty scoring alone."
  - risk: "Browser automation not available in production runtime."
    severity: "critical"
    mitigation: "Implement adapter capability check; block delivery or require human override when unavailable."
  - risk: "Large screenshots increase storage."
    severity: "medium"
    mitigation: "Store compressed artifacts with retention policy; put only metadata in events."
unknowns:
  - question: "Where should screenshot artifacts be stored long-term?"
    resolution_strategy: "Inspect existing storage patterns and choose file store first; add blob storage later if needed."
  - question: "Can current PreviewRuntimeManager render candidate changes before final application?"
    resolution_strategy: "Inspect CodeChangeSetPreflightService and workspace isolation behavior before implementation."
```

## 18. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Add an explicit VisualDesignGateService with a mockable screenshot adapter and a model-backed VisualCuratorAgent. Run deterministic checks first, then model critique. Treat failed/inconclusive as blocking. Emit compact progress events and route actionable feedback to Front Agent.
  alternatives_considered:
    - option: "Ask Curator LLM to review HTML text only."
      tradeoff: "Already insufficient; cannot see actual layout, overflow, contrast, or responsive breakage."
    - option: "Manual visual QA only."
      tradeoff: "Does not scale and still allows agents to claim success without evidence."
  migration_notes:
    - "Add event types in a backward-compatible way."
    - "Add visual gate result as optional metadata before requiring persistence fields."
  backward_compatibility:
    required: true
    notes:
      - "Existing runs without visual gate evidence must still replay."
      - "Event consumers must ignore unknown event types."
```

## 19. Deliverables

```yaml
deliverables:
  code:
    - "VisualGateResult schemas"
    - "Browser screenshot adapter"
    - "VisualDesignGateService"
    - "VisualCuratorAgent"
    - "Curator/Odin wiring"
    - "Compact frontend status"
  tests:
    - "Visual gate unit tests"
    - "Curator failed gate test"
    - "Workflow non-delivery test"
    - "Frontend compact activity regression test"
  docs:
    - "Update workflow docs with visual gate sequencing"
  validation_evidence:
    - "Server test output"
    - "Web build output"
    - "Browser smoke screenshot path if run locally"
```

## 20. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Preview, Curator, Orchestrator, event, and CodeChangeSet files were read."
    - "Current validation sequence was mapped."
    - "Upstream preview dependencies and downstream UI consumers were mapped."
  implementation:
    - "Visual gate blocks failed/inconclusive output."
    - "Screenshot capture is mockable and bounded."
    - "No raw screenshot blobs are pushed through event stream."
    - "Front retry receives actionable visual feedback."
  validation:
    - "Server tests were run."
    - "Web build was run."
    - "Frontend regression guard was run."
    - "Browser smoke was run or explicitly skipped with reason."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

## Minimal Output Contract For Executing Agents

```yaml
agent_result:
  status: "<completed | failed | blocked>"
  summary: "<short factual summary>"
  files_read:
    - "<path>"
  files_changed:
    - "<path>"
  commands_run:
    - command: "<command>"
      cwd: "<cwd>"
      exit_code: "<exit code>"
      result: "<short result>"
  validation:
    passed:
      - "<check>"
    failed:
      - "<check>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```

## 21. Implementation Log

```yaml
implemented_at: "2026-05-27"
implementation_version: "1.1.0"
summary: |
  Implemented the first visual curator gate in the Curator path. The gate now
  produces shared VisualGateResult evidence, inspects candidate UI artifacts
  through a mockable capture adapter, blocks failed or inconclusive visual
  results before LLM approval, converts visual failures into Front Agent retry
  feedback, and exposes compact visual validation evidence to Preview chat.
files_changed:
  shared_contracts:
    - "packages/shared/src/entities/ProjectConstruction.ts"
    - "packages/shared/test/visualGateSchema.test.mjs"
  server:
    - "apps/server/src/infrastructure/visual/VisualDesignGateService.ts"
    - "apps/server/src/infrastructure/langgraph/dependencies.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/test/visualDesignGateService.test.mjs"
    - "apps/server/test/curatorAgentNodeVisualGate.test.mjs"
  web:
    - "apps/web/src/components/VisualPreviewConsole.tsx"
behavior:
  - "Curator runs visual gate after terminal/static preflight passes."
  - "Visual gate failure or inconclusive capture sets Curator feedback to failed."
  - "Feedback is prefixed with [front:visual] so Odin routes correction to Front."
  - "Runtime evidence uses the Visual gate title so Preview chat shows compact visual status."
  - "Raw screenshot blobs are not sent through events; only bounded metadata/artifact ids are exposed."
current_capture_adapter:
  kind: "static_dom"
  reason: |
    The repo does not currently ship a server-side browser screenshot dependency.
    The service is adapter-based so a real browser_screenshot adapter can replace
    the default without changing Curator wiring or tests.
validation:
  passed:
    - "pnpm test"
    - "pnpm --filter @u-build/web test:guards"
known_follow_ups:
  - "Add a Playwright/browser-backed VisualCaptureAdapter when the runtime dependency policy is approved."
  - "Persist image artifacts in a bounded file/blob store once long-term artifact storage is selected."
```
