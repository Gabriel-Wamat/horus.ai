---
format_version: "agentic_sdd.v1"
task_id: "feature-112-surface-pattern-library-design-intelligence"
title: "Surface Pattern Library And Design Intelligence"
created_at_utc: "2026-06-08T18:29:35Z"
author: "agent"
target_mode: "refactor"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "docs/spec/features/56-visual-contract-design-system.md"
  - "docs/spec/features/58-frontend-pattern-library-and-agent-skill.md"
  - "docs/spec/features/111-runtime-visual-curator-design-evaluator.md"
---

# 112 - Surface Pattern Library And Design Intelligence

## 1. Original User Request

```yaml
raw_user_request: |
  outra coisa, o agente tem poucas habildiades e noções de construção de interfaces e diferentes tipos de features de design. faça uma pesquisa aprofundada no github, lovable, bolt, medium, arxiv. sobre melhores práticas e abordagens
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar uma biblioteca interna de padrões de interface por surfaceType para que o FrontAgent tenha habilidades reais de construção:
  CRUD, dashboard, calendar, kanban, editor/canvas, chat-preview, workflow-map, auth, onboarding, settings, file-browser,
  report, checkout, media-gallery, form, search-results, detail-view, data-table e custom.

expected_user_visible_result: |
  As interfaces geradas passam a parecer produtos específicos do domínio, com IA correta, componentes esperados, estados,
  responsividade e estratégia visual coerente, em vez de dashboards/landing pages genéricas.

expected_engineering_result: |
  FrontAgent consome DesignBrief.surfaceType e seleciona um SurfacePatternDefinition tipado, com componentes, estados,
  design rules, anti-patterns, fixtures e testes. Skills/prompt deixam de carregar apenas conselhos genéricos.
```

## 3. Context

```yaml
business_context:
  user_problem: "O agente entende pouco de tipos de interface e features de design; isso gera telas genéricas e pouco profissionais."
  target_user: "Usuário pedindo produtos e ferramentas diferentes via user stories."
  expected_outcome: "Cada surfaceType tem um repertório profissional mínimo: layout, componentes, estados, comportamento e visual strategy."
  product_surface:
    - "SpecAgent designBrief"
    - "FrontAgent project execution plan"
    - "Generated React apps"
    - "QA/Curator validation"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "SpecAgentImpl"
      - "FrontAgentImpl"
      - "QaAgentImpl"
      - "CuratorAgentImpl"
      - "frontAgentFallbackTemplates"
    frontend:
      - "Generated React/Vite project output"
    database:
      - "No migration expected unless pattern metadata is persisted."
    infrastructure:
      - "skills/agents"
      - "Node tests"
  known_entrypoints:
    - "packages/shared/src/entities/Spec.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/front/frontAgentFallbackTemplates.ts"
    - "apps/server/src/infrastructure/agents/front/frontAgentFallbackCss.ts"
    - "skills/agents/front-design-frontend/SKILL.md"
    - "skills/agents/spec-frontend-sdd/SKILL.md"
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Define SurfacePatternDefinition shared or server-side contract."
    - "Create pattern definitions for all DesignSurfaceType values."
    - "Map each surfaceType to IA regions, component inventory, state matrix expectations, visual strategy rules and anti-patterns."
    - "Make FrontAgent select pattern by designBrief.surfaceType before implementation."
    - "Add examples/fixtures for common product domains without seeded runtime fake data."
    - "Update SpecAgent skill and FrontAgent skill to reference the pattern registry."
    - "Add tests proving CRUD does not become dashboard and chat-preview does not become landing page."
  out_of_scope:
    - "Adding a third-party UI kit as mandatory dependency."
    - "Generating one rigid template per product with hardcoded content."
    - "Replacing DesignBrief or visualContract."
    - "Building a full design system editor."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/Spec.ts"
      - "apps/server/src/infrastructure/design/SurfacePatternRegistry.ts"
      - "apps/server/src/infrastructure/design/DesignBriefPrompt.ts"
      - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/front/frontAgentFallbackTemplates.ts"
    services:
      - "SurfacePatternRegistry"
      - "FrontAgent prompt/project plan builder"
      - "Design evaluator from spec 111"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "Generated project output only unless registry UI is added later."
    components:
      - "Generated UI components"
    routes:
      - "No Horus app route change required."
  workflow:
    graph_nodes:
      - "Spec Agent"
      - "Front Agent"
      - "QA Agent"
      - "Curator Agent"
    agents:
      - "Spec"
      - "Front"
      - "QA"
      - "Curator"
  tests:
    unit:
      - "apps/server/test/surfacePatternRegistry.test.mjs"
      - "apps/server/test/frontAgentSurfacePatternSelection.test.mjs"
      - "apps/server/test/frontAgentDesignIntelligence.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    SurfacePatternRegistry becomes a deterministic bridge between designBrief.surfaceType and FrontAgent behavior.
    SpecAgent may use it as guidance, FrontAgent uses it as implementation structure, QA uses it for coverage,
    and Curator/DesignEvaluator use it to reject wrong surfaces.

  depends_on:
    - name: "DesignBrief"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "DesignSurfaceType, componentInventory, stateMatrix, designSystemBinding, visualStrategy"
      required_for: "Pattern selection and customization."
      failure_modes:
        - "Pattern registry cannot choose a surface."
        - "LLM overrides surface with generic layout."
      fallback_or_recovery: "Use custom-product-surface only with explicit reason and stricter curator review."
      verification:
        - "Surface selection unit tests"

  depended_on_by:
    - name: "FrontAgentImpl"
      type: "agent"
      owner: "apps/server agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Pattern guidance block"
      compatibility_obligation: "Must remain additive; existing specs without designBrief still run with conservative fallback."
      expected_consumer_behavior: "Select pattern before coding and include pattern evidence in plan."
      migration_or_notification_required: false
      verification:
        - "Prompt/project plan tests"

    - name: "DesignEvaluationService"
      type: "backend_service"
      owner: "apps/server application/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Expected regions/components/states by surface"
      compatibility_obligation: "Evaluator uses registry as defaults but respects specific DesignBrief overrides."
      expected_consumer_behavior: "Reject wrong IA/surface with deterministic reason."
      migration_or_notification_required: false
      verification:
        - "Known wrong-surface fixture tests"
```

## 7. Pattern Requirements

```yaml
surface_patterns:
  crud:
    required_regions: ["create/edit form", "record list/table", "filters/search", "empty/error/validation feedback"]
    anti_patterns: ["project dashboard", "marketing hero", "fake seeded records"]
  dashboard:
    required_regions: ["summary metrics", "trend/detail panels", "filters/time range", "drilldown or alerts"]
    anti_patterns: ["single CRUD form as whole page", "metrics without domain data model"]
  calendar:
    required_regions: ["date navigation", "calendar grid/list", "event detail/create", "empty day state"]
    anti_patterns: ["plain task list without temporal structure"]
  kanban:
    required_regions: ["columns", "cards", "move/status interaction", "empty columns", "overflow handling"]
    anti_patterns: ["static status cards without movement model"]
  editor-canvas:
    required_regions: ["toolbar", "canvas/work area", "selection inspector", "layers/properties", "zoom/pan states"]
    anti_patterns: ["decorative preview card instead of usable work surface"]
  chat-preview:
    required_regions: ["conversation", "preview/output", "execution progress", "composer", "evidence/errors"]
    anti_patterns: ["landing page", "chat only without output surface"]
  workflow-map:
    required_regions: ["graph/map", "node detail", "status legend", "timeline/log", "empty/error states"]
    anti_patterns: ["linear checklist only when graph topology is requested"]
  auth:
    required_regions: ["credential form", "validation feedback", "secondary action", "security copy"]
    anti_patterns: ["dashboard shell before authentication"]
  onboarding:
    required_regions: ["stepper/progress", "current task", "contextual help", "completion path"]
    anti_patterns: ["marketing hero without task progression"]
  settings:
    required_regions: ["category nav", "setting groups", "save/reset state", "validation/errors"]
    anti_patterns: ["one giant form without grouping"]
  file-browser:
    required_regions: ["tree/list", "file preview/detail", "actions toolbar", "empty/error/loading states"]
    anti_patterns: ["cards that hide hierarchy"]
  report:
    required_regions: ["summary", "sections", "tables/charts where needed", "export/share", "source/evidence"]
    anti_patterns: ["dashboard metrics without narrative structure"]
  checkout:
    required_regions: ["cart/order summary", "payment/shipping form", "validation", "confirmation"]
    anti_patterns: ["generic contact form"]
  media-gallery:
    required_regions: ["grid/list", "filters", "preview/lightbox/detail", "loading/empty/error"]
    anti_patterns: ["text-only list for visual media"]
  form:
    required_regions: ["grouped fields", "validation", "submit/cancel", "success/error states"]
    anti_patterns: ["dashboard wrapper around simple input flow"]
  search-results:
    required_regions: ["query input", "filters/facets", "results", "empty/no-results", "pagination/loading"]
    anti_patterns: ["static cards without search state"]
  detail-view:
    required_regions: ["header identity", "key facts", "sections", "actions", "related/history"]
    anti_patterns: ["summary dashboard when one entity is primary"]
  data-table:
    required_regions: ["toolbar", "table", "sorting/filtering", "selection/actions", "pagination/empty/error"]
    anti_patterns: ["cards when comparison/scanning is primary"]
  custom:
    required_regions: ["explicitly justified by DesignBrief"]
    anti_patterns: ["used because the agent failed to classify"]
```

## 8. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Define registry contract"
    agent: "architect"
    action: "Create SurfacePatternDefinition shape with regions, components, states, visual rules and anti-patterns."
    expected_output: "Typed registry and exhaustive surface coverage."
  - step: 2
    name: "Seed pattern library"
    agent: "frontend_architect"
    action: "Implement deterministic registry for every surfaceType."
    expected_output: "Pattern definitions with no hardcoded product examples."
  - step: 3
    name: "Integrate Spec/Front/QA/Curator"
    agent: "agent_runtime_specialist"
    action: "Add pattern guidance to prompts/plans and QA/Curator coverage."
    expected_output: "Agents consume registry consistently."
  - step: 4
    name: "Upgrade fallback templates"
    agent: "frontend_specialist"
    action: "Replace single project-manager fallback with pattern-aware fallback/adapters."
    expected_output: "Fallback remains product-like for CRUD/chat-preview/file-browser/etc."
  - step: 5
    name: "Validate wrong-surface failures"
    agent: "qa_specialist"
    action: "Add tests for common drift cases."
    expected_output: "Known wrong surfaces fail deterministically."
```

## 9. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Every DesignSurfaceType has a SurfacePatternDefinition."
    - "FrontAgent prompt/project plan includes selected pattern and reason."
    - "CRUD task creation cannot select dashboard unless the story explicitly asks for dashboard analytics."
    - "Pattern definitions include required states and anti-patterns."
    - "No pattern seeds visible fake records by default."
  integration:
    - "SpecAgent, FrontAgent, QA and Curator all reference the same surface vocabulary."
    - "DesignEvaluator uses registry defaults when DesignBrief is incomplete."
  quality:
    - "Exhaustiveness test fails if a new DesignSurfaceType has no registry entry."
    - "Fallback template tests verify no SDD metadata and no fake records."
```

## 10. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate surface contracts."
      success_condition: "exit code 0"
    - command: "pnpm --filter @u-build/server type-check && pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate registry and agent integration."
      success_condition: "exit code 0"
    - command: "node --test apps/server/test/*.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Run surface/fallback/design intelligence tests."
      success_condition: "all tests pass"
```

## 11. Risks

```yaml
risks:
  - risk: "Registry becomes a rigid template system."
    severity: "high"
    mitigation: "Patterns provide structure and anti-patterns; DesignBrief customizes content and domain."
  - risk: "Too much prompt text reduces LLM focus."
    severity: "medium"
    mitigation: "Summarize pattern guidance with compact structured blocks."
  - risk: "Fallbacks become mocked demos."
    severity: "high"
    mitigation: "Require empty/local state by default and Curator fake-data checks."
```
