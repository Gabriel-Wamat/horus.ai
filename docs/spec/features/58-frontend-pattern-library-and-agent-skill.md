---
format_version: "agentic_sdd.v1"
task_id: "feature-58-frontend-pattern-library-and-agent-skill"
title: "Frontend Pattern Library And Agent Skill Upgrade"
created_at_utc: "2026-05-27T04:51:51Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "1.1.0"
status: "implemented"
depends_on:
  - "spec/features/43-specialized-subagents-tool-boundaries.md"
  - "spec/features/56-visual-contract-design-system.md"
  - "spec/features/57-visual-curator-screenshot-gate.md"
---

# 58 - Frontend Pattern Library And Agent Skill Upgrade

## 1. Original User Request

```yaml
raw_user_request: |
  utilize a skill de criar specs para criar 3 planejamentos que contempletem todos esses pontos mapeados, quero que voce detalhe a implementacao e ajustes de forma altamente rigorosa para que nada seja esquecido
```

## 2. System Interpretation

```yaml
system_translation: |
  Create the third implementation plan for improving the first-pass quality of Horus-generated frontends. This plan adds an internal library of frontend patterns, component policies, prompt rubrics, and reusable design examples so Front Agent stops producing generic, over-framed, inconsistent UI.

expected_user_visible_result: |
  Users get frontends that feel intentionally designed for the domain: dashboards are dense and scannable, chat/previews are calm and responsive, landing pages use real visual assets, and generated changes preserve the existing app identity.

expected_engineering_result: |
  The repo gains an AI-readable pattern library consumed by Spec and Front agents, a stricter front-design skill, a component/pattern selection step, and tests that prevent regression into generic UI patterns.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Generated UI often looks generic, inconsistent, too colorful, too framed, or not matched to the product domain."
  target_user: "Users asking Horus to build complete frontend experiences or iterative visual changes."
  expected_outcome: "The Front Agent chooses a domain-appropriate layout pattern and component strategy before writing code."
  product_surface:
    - "Front Agent implementation"
    - "Spec Agent frontend SDD"
    - "Project construction seed"
    - "Generated project UI"
    - "Horus skills"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Agent skill loader"
      - "FrontAgentImpl"
      - "SpecAgentImpl"
    frontend:
      - "React/Vite generated projects"
      - "CSS variables"
      - "Lucide/shadcn-style component conventions when available"
    database:
      - "None required for initial pattern library"
    infrastructure:
      - "skills/agents runtime prompt injection"
  known_entrypoints:
    - "skills/agents/front-design-frontend/SKILL.md"
    - "skills/agents/spec-frontend-sdd/SKILL.md"
    - "skills/agents/curator-quality-gate/SKILL.md"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
    - "apps/server/src/infrastructure/agentSkills/loadAgentSkill.ts"
    - "apps/server/src/infrastructure/preview/SeedFrontendProject.ts"
  known_existing_patterns:
    - "Agent skills are markdown files injected into runtime prompts."
    - "Project manifests already reference design files and UI style notes."
    - "Front Agent returns file operations in project mode."
    - "Existing frontend skill has foundations but lacks pattern catalog, examples, and strict anti-pattern gates."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create an AI-readable pattern library for common frontend/product surfaces."
    - "Update Front Agent skill to select a pattern before implementation."
    - "Update Spec Agent skill to include pattern choice and visual architecture in specs."
    - "Add component policy rules for existing components, shadcn/Radix/Tailwind/Lucide, and static fallback."
    - "Add anti-pattern checks for excessive frames, highlight colors, card nesting, one-note palettes, text overflow, generic landing pages, and style drift."
    - "Add tests/assertions that the runtime prompt includes pattern library guidance."
    - "Document how future patterns are added and versioned."
  out_of_scope:
    - "Installing shadcn/ui into every project automatically."
    - "Building a public marketplace of templates."
    - "Implementing screenshot visual scoring. That belongs to the visual curator gate spec."
    - "Changing generated project stacks beyond their existing projectStack."
    - "Replacing user-requested custom designs with fixed templates."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "skills/agents/front-design-frontend/SKILL.md"
      - "skills/agents/spec-frontend-sdd/SKILL.md"
      - "skills/agents/curator-quality-gate/SKILL.md"
      - "skills/agents/front-design-frontend/references/pattern-library.md"
      - "skills/agents/front-design-frontend/references/anti-patterns.md"
      - "skills/agents/front-design-frontend/references/component-policy.md"
      - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
      - "apps/server/src/infrastructure/agentSkills/loadAgentSkill.ts"
    services:
      - "AgentSkillLoader"
      - "SpecAgent"
      - "FrontAgent"
      - "CuratorAgent"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "apps/web/test/frontendRegressionGuards.test.mjs"
    components: []
    routes: []
  workflow:
    graph_nodes:
      - "specAgent"
      - "frontAgent"
      - "curatorAgent"
    agents:
      - "Spec"
      - "Front"
      - "Curator"
  tests:
    unit:
      - "apps/server/test/loadAgentSkill.test.mjs"
      - "apps/server/test/frontAgentPromptPatternLibrary.test.mjs"
      - "apps/server/test/buildSpecPrompt.test.mjs"
    integration:
      - "apps/server/test/frontAgentNodeCodeContext.test.mjs"
    e2e:
      - "optional generated-project visual smoke after visual gate exists"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    The pattern library is a runtime prompt dependency for Spec and Front agents and a validation reference for Curator. It connects user intent, visualContract, project design context, and generated code operations by forcing an explicit pattern selection before implementation.

  depends_on:
    - name: "AgentSkillLoader"
      type: "internal_module"
      owner: "apps/server/infrastructure/agentSkills"
      direction: "this_spec_consumes_dependency"
      contract_used: "loadAgentSkill(skillName) -> markdown string"
      required_for: "Inject pattern library and policy references into agent prompts."
      assumptions:
        - "Skill loader can load only main SKILL.md unless references are embedded or explicitly read."
      failure_modes:
        - "References exist but are never injected."
      fallback_or_recovery: "Inline short pattern index in SKILL.md and load detailed references only if loader supports it."
      verification:
        - "loadAgentSkill test asserts pattern index is present."

    - name: "VisualContract"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "Spec.visualContract.layoutArchetype, density, componentPolicy, antiPatterns"
      required_for: "Map generated specs to patterns."
      assumptions:
        - "If visualContract spec is not implemented yet, pattern selection can be encoded in technicalApproach temporarily."
      failure_modes:
        - "Pattern selection becomes unstructured prose."
      fallback_or_recovery: "Use transitional 'Pattern:' line in technicalApproach until VisualContract exists."
      verification:
        - "Spec prompt test checks pattern requirement."

    - name: "Project design context"
      type: "internal_module"
      owner: "DesignContextService"
      direction: "this_spec_consumes_dependency"
      contract_used: "DesignContextBundle tokens/components/constraints"
      required_for: "Avoid using patterns that violate local identity."
      assumptions:
        - "DesignContextService may be implemented by a separate spec."
      failure_modes:
        - "Front Agent uses generic pattern when project has existing identity."
      fallback_or_recovery: "Require Front Agent to inspect CSS/component files and summarize local constraints manually."
      verification:
        - "Front prompt test with design context present."

  depended_on_by:
    - name: "Spec Agent"
      type: "agent"
      owner: "apps/server/infrastructure/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Pattern selection rules"
      compatibility_obligation: "may extend prompt output; must preserve required structured spec fields"
      expected_consumer_behavior: "Choose a layout/product pattern and include it in visualContract or technicalApproach."
      migration_or_notification_required: false
      verification:
        - "Spec prompt test."

    - name: "Front Agent"
      type: "agent"
      owner: "apps/server/infrastructure/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Pattern library + anti-pattern checklist + component policy"
      compatibility_obligation: "must preserve ProjectExecutionPlan schema"
      expected_consumer_behavior: "Use selected pattern to produce cohesive file operations."
      migration_or_notification_required: false
      verification:
        - "Front prompt pattern test and generated plan fixture."

    - name: "Curator Agent"
      type: "agent"
      owner: "apps/server/infrastructure/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Pattern-specific acceptance rubric"
      compatibility_obligation: "may extend missingItems"
      expected_consumer_behavior: "Reject output that contradicts selected pattern or anti-pattern rules."
      migration_or_notification_required: false
      verification:
        - "Curator prompt assertion includes pattern rubric."

  bidirectional_integrations:
    - name: "Pattern selection and generated code"
      participants:
        - "SpecAgent"
        - "FrontAgent"
        - "CuratorAgent"
      shared_contract: "Selected pattern id and pattern requirements"
      consistency_rule: "The selected pattern must be used by Front and validated by Curator."
      verification:
        - "End-to-end prompt tests and Curator rejection fixture."

  data_flow:
    inbound:
      - source: "User story and execution brief"
        payload_or_state: "Requested product surface and visual change intent"
        validation: "Spec Agent pattern selection rules"
      - source: "Project design context"
        payload_or_state: "Tokens, components, density, anti-patterns"
        validation: "DesignContextService or manual file inspection"
    outbound:
      - target: "Front Agent prompt"
        payload_or_state: "Selected pattern, component policy, anti-patterns"
        compatibility: "Must fit current structured output schema"
      - target: "Curator prompt"
        payload_or_state: "Pattern-specific validation rubric"
        compatibility: "Must map failure to fixTarget"

  sequencing_dependencies:
    - dependency: "Pattern library should be available before Front Agent executes."
      reason: "First-pass quality depends on constrained layout choices."
      validation: "Front prompt includes selected pattern."
    - dependency: "Curator must know the selected pattern."
      reason: "Without the same rubric, Curator cannot enforce pattern consistency."
      validation: "Curator prompt includes pattern id/rules."

  integration_risks:
    - risk: "Patterns become templates that make every app look the same."
      severity: "high"
      mitigation: "Patterns define layout logic and constraints, not fixed colors/content."
    - risk: "Skill docs grow too large for prompt context."
      severity: "medium"
      mitigation: "Keep SKILL.md with compact index; load only selected pattern details in future enhancement."
    - risk: "Agent overuses shadcn even when project uses plain CSS."
      severity: "medium"
      mitigation: "Component policy says existing project stack/components first, shadcn only when installed or explicitly allowed."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Keep pattern library as guidance, not generated source code."
    - "Do not change ProjectExecutionPlan output schema unless a separate migration spec requires it."
    - "Do not install dependencies from the skill."
  project_specific:
    - "Agent skills must remain inspectable markdown."
    - "Pattern selection must be explicit and auditable."
    - "Existing project components and tokens must be preferred over generic patterns."
    - "Horus operational screens must remain gray-forward, calm, dense, and low-highlight."
```

## 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant skill and prompt files before editing."
    - "Keep pattern names stable and versioned."
    - "Do not add unverifiable aesthetic claims."
    - "Make every anti-pattern observable."
  backend:
    - "If changing skill loader, keep current loadAgentSkill behavior compatible."
    - "Prompt additions must be bounded and deterministic."
  frontend:
    - "No UI changes are required unless adding tests or docs preview."
  tests:
    - "Add tests that assert pattern guidance is present in runtime prompt paths."
    - "Avoid brittle full prompt snapshots; assert stable headings and rules."
```

## 9. Contracts And Invariants

```yaml
contracts:
  domain_contracts:
    - name: "FrontendPattern"
      producer: "front-design-frontend skill"
      consumers:
        - "SpecAgent"
        - "FrontAgent"
        - "CuratorAgent"
      invariant: "A pattern describes task structure, information density, component choices, state expectations, and anti-patterns; it must not hardcode a brand."

    - name: "ComponentPolicy"
      producer: "front-design-frontend references"
      consumers:
        - "FrontAgent"
      invariant: "Existing project components first; installed component libraries second; no invented external dependencies."

    - name: "AntiPatternChecklist"
      producer: "front-design-frontend references"
      consumers:
        - "FrontAgent"
        - "CuratorAgent"
      invariant: "Every anti-pattern must be detectable by code review, screenshot review, or browser smoke."

  ui_contracts:
    - name: "Generated product surface fit"
      producer: "FrontAgent"
      consumers:
        - "End user"
        - "Curator"
      requirement: "Generated UI must match the chosen product surface, not default to a landing page or generic card grid."

  data_contracts:
    - name: "Skill markdown references"
      producer: "skills/agents/front-design-frontend"
      consumers:
        - "loadAgentSkill"
        - "agent prompt builders"
      migration_required: false
      compatibility_notes: "If references are not automatically loaded, the SKILL.md must contain a compact self-sufficient pattern index."
```

### Initial Pattern Set

```yaml
frontend_patterns:
  - id: "operational-dashboard"
    use_when:
      - "Monitoring, admin, CRM, observability, file browser, project control"
    layout_rules:
      - "Use dense but breathable sections, tables/lists, compact controls, predictable navigation."
      - "Avoid marketing hero sections."
      - "Prefer neutral surfaces, subtle strokes, and one controlled accent."
    required_states:
      - "loading"
      - "empty"
      - "error"
      - "selected"
      - "focus"
    anti_patterns:
      - "giant cards for every metric"
      - "decorative gradient background"
      - "excessive highlight colors"
      - "card nested inside card"

  - id: "chat-preview-workbench"
    use_when:
      - "Chat plus live preview"
      - "Agent progress plus rendered app"
    layout_rules:
      - "Keep chat readable and preview primary."
      - "Use compact streaming/progress indicators."
      - "Avoid large repeated status messages."
      - "Keep input pinned and history scroll stable."
    required_states:
      - "thinking"
      - "running"
      - "retrying"
      - "failed"
      - "completed"
    anti_patterns:
      - "message overlap"
      - "spamming full progress messages"
      - "oversized activity panels"

  - id: "workflow-map"
    use_when:
      - "Agent graph, pipeline, topology, execution flow"
    layout_rules:
      - "Prefer top-to-bottom or clearly grouped lanes."
      - "Show simplified/full edge mode without hiding nodes."
      - "Use edge semantics sparingly and label only meaningful transitions."
    required_states:
      - "idle"
      - "active"
      - "completed"
      - "failed"
      - "waiting"
    anti_patterns:
      - "crossing edges without grouping"
      - "tiny unreadable node text"
      - "color-only status"

  - id: "form-crud-tool"
    use_when:
      - "Forms, settings, create/edit/delete, profile management"
    layout_rules:
      - "Use clear field groups, labels, validation messages, and primary/secondary actions."
      - "Keep destructive actions visually separated but not theatrical."
    required_states:
      - "dirty"
      - "saving"
      - "saved"
      - "validation_error"
      - "server_error"
    anti_patterns:
      - "unlabeled inputs"
      - "same weight for destructive and primary actions"

  - id: "content-landing"
    use_when:
      - "Public marketing, portfolio, product, venue, branded page"
    layout_rules:
      - "Use real or generated visual assets."
      - "First viewport must signal the product/person/place/object."
      - "Avoid generic gradient-only hero."
    required_states:
      - "responsive_desktop"
      - "responsive_mobile"
    anti_patterns:
      - "SaaS hero for every domain"
      - "stock-like dark blurred image"
      - "text in a floating card when hero needs immersion"
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current skill loader and prompt usage"
    agent: "repo_explorer"
    action: "Read loadAgentSkill, FrontAgentImpl, SpecAgentImpl, CuratorAgentImpl, and current skill markdown."
    expected_output: "Confirmed path for injecting pattern guidance."

  - step: 2
    name: "Create pattern library references"
    agent: "agent_prompt_specialist"
    action: "Add pattern-library.md, anti-patterns.md, and component-policy.md under front-design-frontend/references."
    expected_output: "Versioned, AI-readable pattern source."

  - step: 3
    name: "Upgrade front-design-frontend skill"
    agent: "agent_prompt_specialist"
    action: "Add mandatory pattern selection workflow, component policy, anti-pattern checklist, and evidence expectations to SKILL.md."
    expected_output: "Front Agent receives concrete design decision process."

  - step: 4
    name: "Upgrade spec and curator skills"
    agent: "agent_prompt_specialist"
    action: "Update spec-frontend-sdd to require pattern choice; update curator-quality-gate to validate selected pattern and anti-patterns."
    expected_output: "Spec/Curator align with Front Agent's design system."

  - step: 5
    name: "Wire references into prompts if needed"
    agent: "backend_specialist"
    action: "If loadAgentSkill only returns SKILL.md, either embed compact pattern index in SKILL.md or extend loader to include declared reference snippets with size cap."
    expected_output: "Runtime prompts actually include the new rules."

  - step: 6
    name: "Add tests"
    agent: "qa_specialist"
    action: "Add stable prompt/skill tests for pattern guidance, anti-patterns, and component policy."
    expected_output: "Regression protection for prompt behavior."

  - step: 7
    name: "Validate"
    agent: "qa_specialist"
    action: "Run server skill/prompt tests and web build if frontend touched."
    expected_output: "Validation evidence with no unrelated changes."
```

## 11. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm pattern library remains guidance and does not become hardcoded templates."
    inputs:
      - "Existing skills"
      - "This SDD"
    outputs:
      - "Pattern scope notes"

  - agent_name: "agent_prompt_specialist"
    responsibility: "Write pattern library, anti-patterns, component policy, and skill updates."
    inputs:
      - "Research synthesis"
      - "Existing skills"
    outputs:
      - "Skill/reference markdown diffs"

  - agent_name: "backend_specialist"
    responsibility: "Ensure runtime actually loads required skill content."
    inputs:
      - "loadAgentSkill"
      - "FrontAgentImpl"
    outputs:
      - "Loader/prompt diffs if needed"

  - agent_name: "qa_specialist"
    responsibility: "Validate skill loading and prompt inclusion."
    inputs:
      - "Diff"
      - "Acceptance criteria"
    outputs:
      - "Test report"
```

## 12. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Front Agent skill requires selecting a frontend pattern before implementation."
    - "Spec Agent skill requires pattern choice or equivalent visual architecture."
    - "Curator skill can reject outputs that violate selected pattern or anti-patterns."
    - "Component policy clearly prioritizes existing project components and tokens."
    - "Pattern library includes at least operational-dashboard, chat-preview-workbench, workflow-map, form-crud-tool, and content-landing."
  integration:
    - "Runtime prompt paths include pattern guidance."
    - "Existing ProjectExecutionPlan schema remains unchanged."
    - "Existing skill tests still pass."
  architectural:
    - "Patterns do not hardcode colors or force a single visual theme."
    - "No new frontend dependencies are installed by default."
    - "Skill references are bounded and maintainable."
  quality:
    - "loadAgentSkill and prompt tests pass."
    - "pnpm --filter @u-build/server test passes for affected tests."
    - "pnpm --filter @u-build/web build passes if web files are touched."
  observability:
    - "Front Agent summary should mention selected pattern and files touched in generated plan summary, without verbose design prose in chat."
```

## 13. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "node --test apps/server/test/loadAgentSkill.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate skill loader still works and includes new pattern guidance."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate prompt/skill tests and backend compatibility."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate web app still builds if touched."
      success_condition: "Exit code 0."
  runtime_checks:
    - name: "Front Agent prompt includes pattern policy"
      method: "unit test or logged prompt fixture"
      expected: "Prompt includes selected pattern requirement and anti-pattern checklist."
  integration_checks:
    - name: "Spec-to-Front pattern continuity"
      surfaces:
        - "SpecAgent skill"
        - "FrontAgent skill"
        - "Curator skill"
      method: "prompt assertions"
      expected: "Same selected pattern/rubric is visible to all three agents."
  manual_checks:
    - "Review skill markdown for ambiguity, contradictions, and overbroad instructions."
```

## 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not claim patterns are enforced at runtime until prompt tests prove they are injected."
    - "Do not mention libraries as available unless package files prove they are installed."
    - "Do not turn pattern examples into required fixed layouts."
  read_before_write:
    - "Read existing skill files before editing."
    - "Read loadAgentSkill before creating reference files."
    - "Search tests for skill/prompt assertions before changing loader behavior."
  failure_handling:
    - "If references are not loaded, embed a compact index directly in SKILL.md."
    - "If prompt tests become brittle, assert stable policy markers instead of full text."
  state_consistency:
    - "Update Spec, Front, and Curator skills together."
    - "If component policy mentions a capability, ensure it is either generic or detected."
  scope_control:
    - "Do not install dependencies."
    - "Do not rewrite generated project seed unless explicitly needed."
    - "Do not redesign Horus UI."
```

## 15. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "Skill wording conflict"
    - "Prompt test too brittle"
    - "Reference file not loaded"
  non_retryable_failures:
    - "Runtime cannot load any new skill content"
    - "Pattern policy contradicts project AGENTS.md or user explicit instruction"
  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only skill/reference changes introduced by this task if they break tests."
  escalation_rules:
    - "Escalate if user requests a pattern that conflicts with project visual identity and no redesign mode is declared."
```

## 16. Observability Requirements

```yaml
observability:
  logs:
    - event: "front_pattern_selected"
      fields:
        - "run_id"
        - "spec_id"
        - "pattern_id"
        - "design_mode"
    - event: "front_pattern_policy_applied"
      fields:
        - "run_id"
        - "component_policy"
        - "anti_pattern_count"
  audit_trail:
    required: true
    must_capture:
      - "selected pattern id"
      - "component policy used"
      - "visual anti-patterns considered"
      - "files changed"
      - "validation results"
  user_visible_failures:
    - "If pattern selection is impossible, show concise reason and ask for clarification only when needed."
```

## 17. Risks And Unknowns

```yaml
risks:
  - risk: "Pattern library makes generated UI feel repetitive."
    severity: "medium"
    mitigation: "Patterns define structure and quality constraints, while visualContract/design context controls identity."
  - risk: "Skills become too long and dilute core instructions."
    severity: "medium"
    mitigation: "Use compact SKILL.md index plus reference files with loading tests."
  - risk: "Component policy assumes shadcn/Tailwind when unavailable."
    severity: "high"
    mitigation: "Policy must explicitly require package/source verification before using library-specific components."
unknowns:
  - question: "Does loadAgentSkill support reference file inclusion?"
    resolution_strategy: "Inspect implementation; add bounded reference loader only if needed."
  - question: "Which generated project seeds should ship with built-in pattern examples?"
    resolution_strategy: "Inspect SeedFrontendProject after skill upgrade; defer seed changes unless first-pass output remains weak."
```

## 18. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Start with skill/reference files and prompt tests. Do not add dependencies or runtime schema changes in this spec unless necessary. Keep pattern selection explicit, compact, and compatible with the VisualContract spec.
  alternatives_considered:
    - option: "Install shadcn/ui automatically in every generated project."
      tradeoff: "Too invasive and conflicts with existing stacks."
    - option: "Create full HTML templates for each pattern."
      tradeoff: "Would make outputs repetitive and reduce adaptability."
    - option: "Only rely on screenshots after generation."
      tradeoff: "Catches problems late; this spec improves first-pass generation."
  migration_notes:
    - "No database migration required."
    - "May require loadAgentSkill enhancement if reference files are not loaded."
  backward_compatibility:
    required: true
    notes:
      - "Current agent output schemas remain unchanged."
      - "Existing skills must remain loadable."
```

## 19. Deliverables

```yaml
deliverables:
  code:
    - "Updated front-design-frontend skill"
    - "Updated spec-frontend-sdd skill"
    - "Updated curator-quality-gate skill"
    - "Pattern/reference markdown files"
    - "Optional bounded skill reference loader"
  tests:
    - "loadAgentSkill test update"
    - "Front prompt pattern test"
    - "Spec prompt pattern test"
    - "Curator pattern rubric test"
  docs:
    - "Pattern library maintenance notes"
  validation_evidence:
    - "Server test output"
    - "Web build output if applicable"
```

## 20. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Skill loader and prompt builders were read."
    - "Existing skill wording was reviewed for conflicts."
    - "Upstream visual contract and downstream visual gate specs were considered."
  implementation:
    - "Pattern library is added and versioned."
    - "Spec/Front/Curator skills are aligned."
    - "No dependencies were installed."
    - "No unrelated UI redesign was introduced."
  validation:
    - "Skill loader tests were run."
    - "Server tests were run."
    - "Web build was run if web files changed."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

## 21. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-27T05:50:00Z"
  implemented_by: "Codex"
  spec_version_after_implementation: "1.1.0"
  summary:
    - "Added a bounded skill reference loader so agent skills can consume versioned markdown reference files without bloating prompts indefinitely."
    - "Added frontend pattern, component policy, and anti-pattern reference files for Front Agent consumption."
    - "Updated Spec, Front, and Curator skills so pattern choice, component reuse policy, and anti-pattern checks are part of the runtime contract."
    - "Updated Spec/Front/Curator prompt builders so selected frontend patterns are enforced in generated specs, implementation summaries, and curator failure rubrics."
    - "Added regression tests for skill reference loading and pattern guidance in runtime prompts."
  files_changed:
    - "apps/server/src/infrastructure/agentSkills/loadAgentSkill.ts"
    - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/test/loadAgentSkill.test.mjs"
    - "apps/server/test/specAgentPromptPatternLibrary.test.mjs"
    - "apps/server/test/buildCuratorPrompt.test.mjs"
    - "skills/agents/front-design-frontend/SKILL.md"
    - "skills/agents/front-design-frontend/references/pattern-library.md"
    - "skills/agents/front-design-frontend/references/component-policy.md"
    - "skills/agents/front-design-frontend/references/anti-patterns.md"
    - "skills/agents/spec-frontend-sdd/SKILL.md"
    - "skills/agents/curator-quality-gate/SKILL.md"
    - "spec/README.md"
    - "spec/CHANGELOG.md"
    - "spec/features/58-frontend-pattern-library-and-agent-skill.md"
  dependencies_added: []
  validation:
    passed:
      - "pnpm test: build do monorepo passou e 184 testes passaram."
    failed: []
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
