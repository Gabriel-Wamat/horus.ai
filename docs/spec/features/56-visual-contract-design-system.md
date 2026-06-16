---
format_version: "agentic_sdd.v1"
task_id: "feature-56-visual-contract-design-system"
title: "Visual Contract And Design System Context For Generated Frontends"
created_at_utc: "2026-05-27T04:51:51Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "1.1.0"
status: "implemented"
depends_on:
  - "spec/features/40-react-frontend-project-architecture.md"
  - "spec/features/48-frontend-architecture-remediation-plan.md"
  - "spec/features/50-preview-chat-command-streaming.md"
---

# 56 - Visual Contract And Design System Context For Generated Frontends

## 1. Original User Request

```yaml
raw_user_request: |
  utilize a skill de criar specs para criar 3 planejamentos que contempletem todos esses pontos mapeados, quero que voce detalhe a implementacao e ajustes de forma altamente rigorosa para que nada seja esquecido
```

## 2. System Interpretation

```yaml
system_translation: |
  Create the first implementation plan for making Horus-generated frontends visually consistent and attractive by giving every agent an explicit, versioned visual contract. This plan covers the structured design context that must be extracted from projects, stored in specs/manifests, and injected into Spec, Front, QA, and Curator agents.

expected_user_visible_result: |
  When the user asks Horus to create or change frontend UI, the generated result follows the current project's visual identity instead of inventing random colors, excessive highlights, decorative frames, or inconsistent layouts.

expected_engineering_result: |
  The shared Spec contract gains a visualContract, project manifests gain richer design-system metadata, backend services can extract a DesignContextBundle from existing files, and all relevant agents receive the same bounded design context.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Generated UIs drift between screens, overuse highlight colors, and ignore established project identity."
  target_user: "Horus users generating or editing frontend projects through user stories and preview chat."
  expected_outcome: "Every generated frontend starts from a concrete visual system, not from a vague 'modern UI' instruction."
  product_surface:
    - "Spec generation"
    - "Front Agent execution"
    - "Generated project manifests"
    - "Preview chat build flow"
    - "Story/spec review UI"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph"
      - "Zod schemas in @u-build/shared"
      - "Project workspace services"
    frontend:
      - "React/Vite"
      - "CSS tokens and project-level design files"
    database:
      - "File/Postgres repositories for persisted project and spec data"
    infrastructure:
      - "Generated project workspaces"
      - "Command catalog based validation"
  known_entrypoints:
    - "packages/shared/src/entities/Spec.ts"
    - "packages/shared/src/entities/ProjectConstruction.ts"
    - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/project/ProjectManifestService.ts"
    - "apps/server/src/infrastructure/project/ProjectWorkspaceService.ts"
    - "skills/agents/spec-frontend-sdd/SKILL.md"
    - "skills/agents/front-design-frontend/SKILL.md"
  known_existing_patterns:
    - "Shared domain contracts are Zod schemas exported from packages/shared."
    - "Agent prompts consume skills from skills/agents."
    - "Project manifests already include designSystem.referenceFiles and designSystem.notes."
    - "The Horus visual identity is dark, dense, operational, gray-forward, with controlled green accent."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add typed visualContract fields to Spec without breaking existing stored specs."
    - "Create a DesignContextBundle schema for extracted project visual identity."
    - "Extract design context from ID_VISUAL.md, CSS token files, global CSS, component roots, and project manifest metadata."
    - "Inject the DesignContextBundle into Spec, Front, QA, and Curator prompts."
    - "Update agent skills so design system adherence is mandatory and testable."
    - "Add unit tests for schema compatibility and prompt inclusion."
  out_of_scope:
    - "Running screenshot-based visual evaluation. That belongs to the visual curator gate spec."
    - "Creating a full component library or pattern catalog. That belongs to the pattern library spec."
    - "Changing the entire Horus web UI visual design."
    - "Replacing the current LangGraph topology."
    - "Adding new LLM providers."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/Spec.ts"
      - "packages/shared/src/entities/ProjectConstruction.ts"
      - "apps/server/src/infrastructure/project/ProjectManifestService.ts"
      - "apps/server/src/infrastructure/project/ProjectWorkspaceService.ts"
      - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
      - "apps/server/src/infrastructure/design/DesignContextService.ts"
    services:
      - "DesignContextService"
      - "ProjectWorkspaceService"
      - "SpecAgent"
      - "FrontAgent"
      - "QaAgent"
      - "CuratorAgent"
    database:
      migrations_required: true
      tables:
        - "specs if visualContract is persisted in normalized Postgres columns"
        - "project_constructions if spec JSON shape is stored as JSON and needs compatibility checks"
  frontend:
    files:
      - "apps/web/src/components/SpecReview.tsx"
      - "apps/web/src/components/StorySpecWorkspace.tsx"
    components:
      - "SpecReview"
      - "StorySpecWorkspace"
    routes:
      - "Main app story/spec workspace"
  workflow:
    graph_nodes:
      - "specAgent"
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
    agents:
      - "Spec"
      - "Front"
      - "QA"
      - "Curator"
  tests:
    unit:
      - "packages/shared/test/spec.test.mjs"
      - "apps/server/test/designContextService.test.mjs"
      - "apps/server/test/buildSpecPrompt.test.mjs"
      - "apps/server/test/frontAgentDesignContext.test.mjs"
    integration:
      - "apps/server/test/projectWorkspaceService.test.mjs"
      - "apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
    e2e: []
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    The visual contract is produced by Spec Agent, enriched by DesignContextService, consumed by Front/QA/Curator, persisted with specs, and rendered in the StorySpecWorkspace. It becomes the shared design-language contract that prevents agent drift.

  depends_on:
    - name: "Project manifest designSystem block"
      type: "internal_module"
      owner: "apps/server/infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "HorusProjectManifest.designSystem.referenceFiles, notes"
      required_for: "Find canonical design references and describe project identity."
      assumptions:
        - "Generated projects have horus.project.json after construction."
      failure_modes:
        - "Reference files listed but absent."
        - "Reference files too large for prompt context."
      fallback_or_recovery: "Use CSS and source inspection; mark missing references in DesignContextBundle.warnings."
      verification:
        - "Unit test manifest with present and missing reference files."

    - name: "ProjectWorkspaceService file loading"
      type: "backend_service"
      owner: "apps/server/infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "ProjectWorkspaceContextSnapshot.files/tree/writeRoots/commandCatalog"
      required_for: "Read existing CSS, tokens, and components before Front Agent execution."
      assumptions: []
      failure_modes:
        - "Design files not included in workspace context."
      fallback_or_recovery: "DesignContextService performs bounded direct reads inside allowed project root."
      verification:
        - "Integration test with ID_VISUAL.md and src/index.css fixture."

    - name: "Spec persistence"
      type: "database"
      owner: "packages/shared + repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "SpecSchema and repository serialization"
      required_for: "Persist and replay visualContract through existing workflows."
      assumptions:
        - "File stores can persist additional JSON fields without migration."
        - "Postgres repositories may need migrations if spec columns are normalized."
      failure_modes:
        - "Older specs fail parsing if new fields are required."
      fallback_or_recovery: "Make visualContract optional with defaults; only require for new generated specs after migration."
      verification:
        - "Schema tests parsing old and new specs."

  depended_on_by:
    - name: "Front Agent"
      type: "agent"
      owner: "apps/server/infrastructure/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Spec.visualContract + DesignContextBundle"
      compatibility_obligation: "may extend; must not remove existing Spec fields"
      expected_consumer_behavior: "Use visualContract and bundle as mandatory implementation constraints."
      migration_or_notification_required: false
      verification:
        - "Prompt snapshot/assertion includes visualContract and token/component constraints."

    - name: "QA Agent"
      type: "agent"
      owner: "apps/server/infrastructure/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Visual requirements and anti-pattern checklist"
      compatibility_obligation: "may extend"
      expected_consumer_behavior: "Generate visual/state/responsive checks from visualContract."
      migration_or_notification_required: false
      verification:
        - "QA prompt/test includes visual acceptance criteria."

    - name: "Curator Agent"
      type: "agent"
      owner: "apps/server/infrastructure/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Visual contract expected in generated output"
      compatibility_obligation: "may extend"
      expected_consumer_behavior: "Fail outputs that violate explicit design-system constraints."
      migration_or_notification_required: false
      verification:
        - "Curator prompt test includes visualContract and design context."

    - name: "Story/spec review UI"
      type: "frontend_component"
      owner: "apps/web/components"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Spec.visualContract"
      compatibility_obligation: "must render old specs without this field"
      expected_consumer_behavior: "Show concise visual contract details only when useful; avoid noisy text."
      migration_or_notification_required: false
      verification:
        - "Frontend regression guard for old and new spec shapes."

  bidirectional_integrations:
    - name: "Spec Agent and Front Agent design contract"
      participants:
        - "SpecAgent"
        - "FrontAgent"
      shared_contract: "Spec.visualContract"
      consistency_rule: "Front output must trace every visualContract requirement or record why it is not applicable."
      verification:
        - "Curator prompt and QA tests compare expected visualContract to generated files."

  data_flow:
    inbound:
      - source: "Project files"
        payload_or_state: "ID_VISUAL.md, CSS variables, component names, package hints"
        validation: "Bounded file reads, max length, allowed roots, ignored secrets"
      - source: "User story"
        payload_or_state: "User visual intent and constraints"
        validation: "SpecAgent structured output schema"
    outbound:
      - target: "Spec repository"
        payload_or_state: "Spec with optional visualContract"
        compatibility: "Old specs parse with defaults"
      - target: "Agent prompts"
        payload_or_state: "DesignContextBundle markdown block"
        compatibility: "Prompt remains bounded and excludes secrets"

  sequencing_dependencies:
    - dependency: "DesignContextService must run before Front Agent planning."
      reason: "Front Agent must not invent style when local identity exists."
      validation: "frontAgentDesignContext test verifies prompt block."
    - dependency: "Spec schema must be backward-compatible before repository reads."
      reason: "Existing specs must not fail on startup."
      validation: "shared schema compatibility test."

  integration_risks:
    - risk: "Prompt bloat reduces model performance."
      severity: "high"
      mitigation: "Summarize tokens/components into a compact bundle with hard size limits."
    - risk: "Over-constraining style prevents valid user-requested redesigns."
      severity: "medium"
      mitigation: "VisualContract has mode: preserve_identity | guided_redesign | blank_project."
    - risk: "DesignContextService accidentally reads secrets."
      severity: "critical"
      mitigation: "Use manifest referenceFiles, source roots, deny paths, secret pattern redaction, and max bytes."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Separate shared schemas, backend services, agent prompts, and frontend presentation."
    - "Prefer dependency injection for DesignContextService."
    - "Do not introduce circular dependencies between agents and project services."
  project_specific:
    - "Specs remain the source of truth for Front, QA, and Curator."
    - "Visual identity must be explicit, compact, and auditable."
    - "Local project identity beats generic 'modern' defaults."
    - "Horus UI default identity is dark, gray-forward, operational, dense, with controlled green accent."
    - "Agents must not use high-saturation highlight colors unless explicitly present in the project's design context."
```

## 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Use Zod schemas for new persisted/contracts fields."
    - "Keep new fields optional or defaulted for backward compatibility."
    - "Handle missing design files as warnings, not crashes."
    - "Never expose secrets or large source files in prompt blocks."
  backend:
    - "DesignContextService must accept projectRoot and manifest/context inputs; it must not depend on web UI state."
    - "Use bounded reads and deterministic summarization."
    - "Prefer pure helper functions for extracting CSS variables and component hints."
  frontend:
    - "Render visualContract compactly; do not add large prose blocks to the UI."
    - "Old specs without visualContract must render exactly as before."
  tests:
    - "Cover old and new Spec parsing."
    - "Cover prompt inclusion without snapshots that are too brittle."
    - "Cover missing, oversized, and secret-like design reference files."
```

## 9. Contracts And Invariants

```yaml
contracts:
  domain_contracts:
    - name: "VisualContract"
      producer: "SpecAgent"
      consumers:
        - "FrontAgent"
        - "QaAgent"
        - "CuratorAgent"
        - "StorySpecWorkspace"
      invariant: "A visualContract describes style constraints, component policy, state expectations, responsive rules, and anti-patterns without replacing acceptance criteria."

    - name: "DesignContextBundle"
      producer: "DesignContextService"
      consumers:
        - "SpecAgent"
        - "FrontAgent"
        - "CuratorAgent"
      invariant: "Bundle must be compact, redacted, deterministic, and derived from real project evidence."

  ui_contracts:
    - name: "Spec visual review"
      producer: "StorySpecWorkspace"
      consumers:
        - "Human reviewer"
      requirement: "The reviewer can see whether a spec will preserve identity, redesign, or start blank, without reading a giant prompt block."

  data_contracts:
    - name: "Persisted Spec compatibility"
      producer: "Spec repositories"
      consumers:
        - "WorkflowOrchestrator"
        - "StorySpecWorkspace"
        - "Agent nodes"
      migration_required: true
      compatibility_notes: "visualContract must be optional/defaulted until existing stored specs are migrated or proven JSON-compatible."
```

### Proposed Shared Schemas

```ts
export const VisualContractSchema = z.object({
  mode: z.enum(["preserve_identity", "guided_redesign", "blank_project"]).default("preserve_identity"),
  designSource: z.enum(["project_files", "user_reference", "generated_default", "mixed"]).default("project_files"),
  layoutArchetype: z.string().min(1).max(120),
  density: z.enum(["compact", "balanced", "spacious"]).default("balanced"),
  tone: z.string().min(1).max(240),
  colorPolicy: z.object({
    background: z.array(z.string()).default([]),
    surface: z.array(z.string()).default([]),
    text: z.array(z.string()).default([]),
    accent: z.array(z.string()).default([]),
    forbidden: z.array(z.string()).default([]),
    usageRules: z.array(z.string()).default([]),
  }),
  typography: z.object({
    families: z.array(z.string()).default([]),
    scaleRules: z.array(z.string()).default([]),
  }),
  spacingAndShape: z.object({
    spacingScale: z.array(z.string()).default([]),
    radiusRules: z.array(z.string()).default([]),
    strokeRules: z.array(z.string()).default([]),
    shadowRules: z.array(z.string()).default([]),
  }),
  componentPolicy: z.object({
    preferExistingComponents: z.boolean().default(true),
    allowedLibraries: z.array(z.string()).default([]),
    requiredPatterns: z.array(z.string()).default([]),
    forbiddenPatterns: z.array(z.string()).default([]),
  }),
  states: z.array(z.enum(["default", "loading", "empty", "error", "success", "selected", "focus", "disabled"])).default([]),
  responsiveRules: z.array(z.string()).default([]),
  accessibilityRules: z.array(z.string()).default([]),
  antiPatterns: z.array(z.string()).default([]),
  referenceFiles: z.array(z.string()).default([]),
});

export const DesignContextBundleSchema = z.object({
  projectId: z.string().optional(),
  sourceFiles: z.array(z.string()),
  tokens: z.record(z.string(), z.string()).default({}),
  components: z.array(z.object({
    name: z.string(),
    path: z.string().optional(),
    purpose: z.string().optional(),
  })).default([]),
  visualSummary: z.string(),
  constraints: z.array(z.string()).default([]),
  antiPatterns: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  generatedAt: z.string().datetime(),
});
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current spec and project context contracts"
    agent: "repo_explorer"
    action: "Read SpecSchema, ProjectConstruction schemas, repositories, ProjectManifestService, ProjectWorkspaceService, and agent prompt builders."
    expected_output: "Map of exact persistence and prompt surfaces that must accept visualContract and DesignContextBundle."

  - step: 2
    name: "Add shared visual schemas"
    agent: "backend_specialist"
    action: "Add VisualContractSchema and DesignContextBundleSchema to shared entities, export types, and make SpecSchema.visualContract optional/defaulted."
    expected_output: "Backward-compatible shared contracts."

  - step: 3
    name: "Implement DesignContextService"
    agent: "backend_specialist"
    action: "Create bounded extractor for manifest reference files, CSS variables, component roots, package hints, and local visual docs."
    expected_output: "DesignContextBundle generated from real project evidence with warnings for missing data."

  - step: 4
    name: "Wire design context into agent prompts"
    agent: "agent_prompt_specialist"
    action: "Inject compact design context into SpecAgent, FrontAgent project mode, QA Agent, and Curator Agent. Add strict instructions that project identity is mandatory unless visualContract.mode allows redesign."
    expected_output: "Agents consume the same design contract."

  - step: 5
    name: "Update skills"
    agent: "agent_prompt_specialist"
    action: "Revise spec-frontend-sdd, front-design-frontend, qa-frontend-testing, and curator-quality-gate skills to reference visualContract, design tokens, component policy, and anti-patterns."
    expected_output: "Runtime skill guidance matches the new contracts."

  - step: 6
    name: "Expose compact spec review"
    agent: "frontend_specialist"
    action: "Update StorySpecWorkspace/SpecReview to show visual mode, density, key tokens, and anti-pattern warnings without creating verbose UI."
    expected_output: "Human reviewer can catch identity drift before approving a spec."

  - step: 7
    name: "Validate"
    agent: "qa_specialist"
    action: "Run shared tests, server tests, web build, and targeted frontend regression guards."
    expected_output: "Validation evidence with command outputs and any remaining risks."
```

## 11. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm schema boundaries, prompt data flow, and backward compatibility."
    inputs:
      - "This SDD"
      - "Spec and project manifest schemas"
    outputs:
      - "Final contract map"

  - agent_name: "backend_specialist"
    responsibility: "Implement schemas, DesignContextService, repository compatibility, and agent prompt wiring."
    inputs:
      - "Affected backend files"
      - "Contracts section"
    outputs:
      - "Backend diff"
      - "Schema tests"

  - agent_name: "frontend_specialist"
    responsibility: "Render compact visual contract review."
    inputs:
      - "Spec.visualContract"
      - "Existing StorySpecWorkspace patterns"
    outputs:
      - "Frontend diff"
      - "Web regression tests"

  - agent_name: "qa_specialist"
    responsibility: "Validate old/new specs, prompt inclusion, and web build."
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
    - "New specs can include visualContract with mode, tokens, component policy, responsive rules, and anti-patterns."
    - "Old specs without visualContract continue to parse and render."
    - "Front Agent receives a compact DesignContextBundle in project mode."
    - "Spec Agent can generate visualContract from user story plus project design context."
    - "QA and Curator prompts include visual requirements derived from the same contract."
  integration:
    - "Project manifest designSystem.referenceFiles are consumed by DesignContextService."
    - "Spec repositories preserve visualContract without corrupting existing specs."
    - "StorySpecWorkspace handles specs with and without visualContract."
  architectural:
    - "No agent invents a design system when local evidence exists."
    - "Design context extraction is separated from prompt construction."
    - "No secrets or denied paths are read into the bundle."
  quality:
    - "Shared schema tests pass."
    - "Server prompt/context tests pass."
    - "pnpm --filter @u-build/web build passes."
  observability:
    - "DesignContextBundle warnings are logged or attached to execution evidence without exposing secrets."
```

## 13. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate shared schema compatibility."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate DesignContextService, agent prompts, repositories, and workflow compatibility."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend type/build compatibility."
      success_condition: "Exit code 0."
  runtime_checks:
    - name: "Generated project design context extraction"
      method: "test fixture or local generated project"
      expected: "Bundle includes ID_VISUAL.md/CSS tokens and no secret-like values."
  integration_checks:
    - name: "Spec to Front Agent prompt propagation"
      surfaces:
        - "SpecAgentImpl"
        - "FrontAgentImpl"
      method: "prompt builder unit tests"
      expected: "visualContract and compact design context appear in prompts."
  manual_checks:
    - "Review a generated spec in the app and confirm visual contract is concise and readable."
```

## 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent visual tokens; derive them from files or mark them as generated defaults."
    - "Do not claim a design system exists unless files or manifest prove it."
    - "Do not cite screenshots or references that were not attached or read."
  read_before_write:
    - "Read SpecSchema and repository serialization before changing persisted fields."
    - "Read current prompt builders before injecting new context."
    - "Read StorySpecWorkspace before adding visual review UI."
  failure_handling:
    - "If schema changes break old specs, restore backward compatibility before proceeding."
    - "If prompt size grows too much, summarize more aggressively instead of dropping the design context."
  state_consistency:
    - "Update producer and consumer contracts together."
    - "Update shared types before backend/frontend code that consumes them."
  scope_control:
    - "Do not redesign the Horus UI in this task."
    - "Do not implement screenshot scoring in this task."
```

## 15. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "Missing optional design reference file"
    - "Oversized CSS file requiring summarization"
    - "Prompt assertion needing stable substring adjustment"
  non_retryable_failures:
    - "Spec persistence cannot store the new contract without migration"
    - "Secret redaction cannot be guaranteed"
  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only schema/service changes introduced by this task if they break startup."
  escalation_rules:
    - "Escalate if a migration is required but database migration conventions are unclear."
    - "Escalate if user requests redesign mode that conflicts with preserving project identity."
```

## 16. Observability Requirements

```yaml
observability:
  logs:
    - event: "design_context_extracted"
      fields:
        - "project_id"
        - "source_file_count"
        - "token_count"
        - "component_count"
        - "warning_count"
        - "duration_ms"
    - event: "visual_contract_generated"
      fields:
        - "spec_id"
        - "mode"
        - "design_source"
        - "anti_pattern_count"
  audit_trail:
    required: true
    must_capture:
      - "design reference files read"
      - "warnings"
      - "agent prompts received design context"
      - "tests executed"
  user_visible_failures:
    - "Show when design context is missing and Horus is using generated defaults."
    - "Show when a reference file could not be read."
```

## 17. Risks And Unknowns

```yaml
risks:
  - risk: "Schema migration touches many existing persisted records."
    severity: "high"
    mitigation: "Make visualContract optional/defaulted first; add migration only if repository inspection proves normalized columns require it."
  - risk: "DesignContextBundle becomes too verbose."
    severity: "high"
    mitigation: "Hard cap prompt block size and store full evidence separately only if needed."
  - risk: "Agent obeys visualContract but user asked for a deliberate redesign."
    severity: "medium"
    mitigation: "Use mode=guided_redesign when user request clearly overrides existing identity."
unknowns:
  - question: "Are current Postgres spec records stored as JSON or normalized fields?"
    resolution_strategy: "Inspect Postgres repositories and migrations before implementation."
  - question: "Which generated projects already have ID_VISUAL.md?"
    resolution_strategy: "Inspect SeedFrontendProject and generated project fixtures."
```

## 18. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Add a small typed visual contract to the existing Spec model, then use a dedicated DesignContextService to build compact context from real files. Keep the implementation backward-compatible and prompt-bounded. Treat design context as a contract consumed by agents, not as UI prose.
  alternatives_considered:
    - option: "Only update front-design-frontend skill."
      tradeoff: "Too weak; skills are not persisted, testable, or shared as structured data."
    - option: "Hardcode Horus colors in Front Agent."
      tradeoff: "Breaks generated projects with their own identity and repeats the user's current complaint about inconsistent screens."
  migration_notes:
    - "Add optional visualContract first."
    - "Only add DB migration after repository inspection confirms it is required."
  backward_compatibility:
    required: true
    notes:
      - "Existing specs must parse and render."
      - "Existing workflows must run even when DesignContextBundle has warnings."
```

## 19. Deliverables

```yaml
deliverables:
  code:
    - "VisualContractSchema and DesignContextBundleSchema"
    - "DesignContextService"
    - "Agent prompt wiring"
    - "Compact visualContract UI rendering"
  tests:
    - "Shared schema tests"
    - "DesignContextService tests"
    - "Agent prompt tests"
    - "Frontend regression guard"
  docs:
    - "Update docs/architecture.md or docs/workflow.md if docs site tracks agent contracts"
  validation_evidence:
    - "Command outputs for shared/server/web checks"
```

## 20. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Relevant schema, repository, agent, and UI files were read."
    - "Existing design manifest patterns were identified."
    - "Upstream dependencies and downstream consumers were mapped."
  implementation:
    - "Changes are scoped to visual contract/context."
    - "Old specs remain compatible."
    - "No unrelated redesign was introduced."
    - "Producer and consumer contracts were updated together."
  validation:
    - "Shared tests were run."
    - "Server tests were run."
    - "Web build was run."
    - "Runtime extraction was checked with a fixture or generated project."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

## 21. Implementation Log

```yaml
implemented_at_utc: "2026-05-27T05:30:00Z"
status: "implemented"
summary: |
  Implemented the visual contract foundation for generated frontends. Shared schemas now support Spec.visualContract and
  DesignContextBundle. The backend extracts compact project visual context from real files, injects it into Spec, Front,
  QA and Curator agent prompts, and keeps extraction bounded/redacted. The spec review UI renders the visual contract
  compactly without exposing prompt-sized prose.
files_changed:
  shared_contracts:
    - "packages/shared/src/entities/Spec.ts"
    - "packages/shared/test/specVisualContract.test.mjs"
  backend:
    - "apps/server/src/infrastructure/design/DesignContextService.ts"
    - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/src/infrastructure/langgraph/dependencies.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/specAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/test/designContextService.test.mjs"
    - "apps/server/test/frontAgentNodeCodeContext.test.mjs"
    - "apps/server/test/buildCuratorPrompt.test.mjs"
  frontend:
    - "apps/web/src/components/SpecReview.tsx"
    - "apps/web/src/components/StorySpecWorkspace.tsx"
    - "apps/web/src/index.css"
    - "apps/web/test/frontendRegressionGuards.test.mjs"
  skills:
    - "skills/agents/spec-frontend-sdd/SKILL.md"
    - "skills/agents/front-design-frontend/SKILL.md"
    - "skills/agents/qa-frontend-testing/SKILL.md"
    - "skills/agents/curator-quality-gate/SKILL.md"
validation:
  passed:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "pnpm --filter @u-build/web build"
    - "node --test packages/shared/test/specVisualContract.test.mjs apps/server/test/designContextService.test.mjs apps/server/test/frontAgentNodeCodeContext.test.mjs apps/server/test/buildCuratorPrompt.test.mjs apps/web/test/frontendRegressionGuards.test.mjs"
    - "pnpm test"
remaining_risks:
  - "Screenshot scoring and rendered visual pass/fail remain intentionally out of scope for spec 56 and belong to spec 57."
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
