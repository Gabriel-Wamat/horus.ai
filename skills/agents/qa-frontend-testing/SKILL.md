---
name: qa-frontend-testing
description: Use this skill when the QA Agent must generate frontend validation cases for Horus.AI static UI artifacts. Triggers include QA test generation, acceptance criteria coverage, responsive checks, accessibility checks, interaction testing, curator feedback targeting QA fixes, and manual browser validation plans.
---

# QA Agent Frontend Testing

```yaml
id: "qa-frontend-testing"
agent: "qa"
version: "0.3.0"
status: "active"
created_at_utc: "2026-05-26T00:00:00Z"
runtime_use: "Injected into QAAgent prompt before test generation rules."
```

## Purpose

Use this skill to create rigorous frontend validation cases that verify generated UI against the spec, acceptance criteria, technical approach, data models, future route contracts, responsive behavior, accessibility expectations, and user workflows.

This skill helps the QA Agent produce test work that is:

- scoped to the spec;
- traceable to acceptance criteria;
- grounded in the spec's frontend architecture, state model, data model, and route-readiness contracts;
- modular by scenario;
- executable by a human or automation engineer;
- aligned with the generated static frontend artifact;
- validated against common frontend failure modes;
- safe against generic or shallow test output.

## When To Use

Use this skill when the workflow asks the QA Agent to:

- generate frontend test cases from a `Spec`;
- revise QA output after curator feedback;
- validate a static HTML/CSS/JavaScript artifact;
- validate frontend readiness for future backend routes described in `apiEndpoints`;
- validate data adapter and mock-data behavior described by the spec;
- check responsive behavior and accessibility basics;
- ensure acceptance criteria are covered by concrete steps.

Do not use this skill for:

- implementing frontend code;
- scoring final quality as Curator;
- backend unit tests;
- generic page-load-only checks;
- casual explanation without structured test output.

## Required Inputs

Before acting, identify:

```yaml
input_contract:
  user_request: "Current user story and generated technical spec"
  repository_root: "<repo-root>"
  target_files:
    - "generated index.html artifact when available"
    - "technical spec with components, data models, apiEndpoints, and acceptance criteria"
    - "visualContract and DesignContextBundle when available"
  target_stack:
    frontend:
      - "HTML"
      - "CSS"
      - "Vanilla JavaScript"
    backend: []
    database: []
  constraints:
    - "Return structured test cases"
    - "One or more tests must map to each acceptance criterion"
    - "Tests must be executable manually in a browser"
    - "Tests must not assume real backend routes exist"
  validation_expected:
    - "Curator compares QA cases with spec and frontend output"
```

If the generated frontend is not available, create tests from the spec and mark visible evidence expected in the `expected` field.

## Operating Principles

```yaml
principles:
  scope_control:
    - "Test only behavior implied by the user story and spec."
    - "Do not invent unrelated product requirements."
    - "Do not convert manual validation into framework-specific code unless requested."
  evidence_first:
    - "Trace tests to acceptance criteria."
    - "Use component names, technical approach, data models, and apiEndpoints from the spec."
    - "When the spec describes future backend routes, test the frontend adapter/mock behavior and visible states rather than real network availability."
    - "Use curator feedback as a correction contract on retries."
    - "Use visualContract to create explicit visual QA coverage for tokens, density, states, responsivity, accessibility, and antiPatterns."
  architecture:
    - "Separate primary journey, component behavior, responsive checks, and accessibility checks."
    - "Separate route-readiness tests from real backend integration tests."
    - "Keep each test case focused on one observable outcome."
  code_quality:
    - "Write clear steps."
    - "Write observable expected results."
    - "Use stable IDs: TC-01, TC-02, etc."
    - "Make expected results specific enough for the Curator to compare against generated HTML."
  validation:
    - "Every acceptance criterion must be covered."
    - "Frontend-specific risks must be represented."
```

## Workflow

### Step 1 - Understand The Spec

Extract:

```yaml
request_analysis:
  raw_request: "User story plus technical spec"
  interpreted_goal: "What the frontend must allow the user to do"
  in_scope:
    - "Acceptance criteria"
    - "Named UI components"
    - "Interaction requirements"
    - "Technical approach and data adapter expectations"
    - "Future API/route contracts if present"
    - "Data models and mock-data shapes"
    - "Responsive and accessibility expectations"
  out_of_scope:
    - "Backend implementation details"
    - "Real network calls for future backend contracts"
    - "Unrequested browser automation framework"
  risks:
    - "Missing criteria coverage"
    - "Vague expected results"
    - "No responsive or accessibility coverage"
    - "Tests that ignore route-readiness contracts from the spec"
    - "Tests that assume real backend endpoints exist"
  unknowns:
    - "Generated frontend details not yet available"
```

### Step 2 - Build A Coverage Matrix

```yaml
coverage_matrix:
  for_each_acceptance_criterion:
    - "Map at least one test case"
    - "Name visible evidence"
    - "Name interaction or state under test"
  additional_frontend_risks:
    - "Responsive layout"
    - "Keyboard/focus behavior"
    - "Long text and empty state"
    - "Loading, error, and disabled states"
    - "Future route contract compatibility through mock data or adapter functions"
    - "Data model fields rendered with correct labels, formatting, and fallbacks"
    - "Visual identity drift from visualContract or project design context"
```

### Step 3 - Generate Test Cases

Implementation rules:

- Use `TC-01`, `TC-02`, and sequential IDs.
- Keep `criterion` tied to spec text.
- Make `steps` concrete and reproducible.
- Make `expected` observable in the browser.
- Include negative/edge cases when the spec includes input or dynamic data.
- Add at least one route-readiness test when `apiEndpoints` is non-empty.
- Add at least one data rendering/fallback test when `dataModels` is non-empty.
- Add at least one visual-contract test when `visualContract` is present.
- Add loading, empty, and error-state tests when the technical approach mentions adapter-backed data.
- Do not write "verify API call succeeds" unless the spec explicitly says a real backend route exists.
- Prefer "verify the UI uses mock/adapter-compatible data and exposes loading/error fallback" for future route contracts.

### Step 4 - Self-Check Before Returning

```yaml
self_check:
  - "Every acceptance criterion has coverage."
  - "No test only says 'page loads'."
  - "At least one test addresses responsive behavior when UI layout exists."
  - "At least one test addresses accessibility basics when controls exist."
  - "Future route contracts are covered through adapter/mock behavior if apiEndpoints exist."
  - "Data model fields are covered when dynamic data appears in the spec."
  - "Steps are executable by a human tester."
```

### Step 5 - Final Output

Return only the structured test cases expected by the runtime schema.

## 10 Foundations

1. Trace every acceptance criterion to at least one explicit test case with clear expected results.
2. Test the primary user journey end to end before secondary or cosmetic checks.
3. Cover visible UI states: default, hover/focus where relevant, selected, empty, validation error, success, and disabled states.
4. Validate responsive behavior at mobile, tablet, and desktop widths, including text wrapping and layout stability.
5. Check accessibility basics: labels, keyboard navigation, focus visibility, semantic structure, and contrast-sensitive content.
6. Inspect content correctness: realistic data, required sections, required CTAs, and alignment with the user story.
7. Verify interaction behavior, including buttons, forms, filters, tabs, menus, modals, and dynamic updates when present.
8. Include negative and edge cases when the spec implies user input, missing data, long text, or unusual combinations.
9. Make each test executable by a human or automation engineer with concrete steps, no vague assertions, and observable outcomes.
10. Prioritize defects by user impact and distinguish frontend implementation failures, route-readiness gaps, and weak or missing test coverage.

## Agent Error Mitigation

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent UI controls absent from the spec."
    - "Do not invent framework-specific test runners."
    - "Do not invent real backend availability when apiEndpoints are future contracts."
  anti_overengineering:
    - "Do not create exhaustive low-value permutations."
    - "Prefer a focused coverage set over repetitive checks."
  anti_regression:
    - "On retry, preserve previous useful coverage while addressing curator feedback."
    - "Do not remove coverage for acceptance criteria."
    - "Do not drop route-readiness or data-model coverage when curator feedback targets QA."
  anti_false_validation:
    - "Do not claim automation execution."
    - "Do not mark accessibility verified without concrete checks."
```

## Architecture Checklist

```yaml
architecture_checklist:
  - "Are tests organized around user-visible behavior?"
  - "Does each test case have one clear responsibility?"
  - "Are criteria, steps, and expected results aligned?"
  - "Are frontend-specific risks represented?"
  - "Are future backend route contracts tested safely through adapter/mock expectations?"
  - "Are data models represented in visible rendering, fallback, or interaction checks?"
```

## Testing Checklist

```yaml
testing_checklist:
  frontend:
    - "Primary journey covered."
    - "Responsive behavior covered."
    - "Accessibility basics covered."
    - "Dynamic/interactive states covered when present."
    - "Loading, empty, error, and success states covered when adapter-backed data exists."
  contract_readiness:
    - "Future apiEndpoints covered without assuming live backend availability."
    - "Data models covered with visible field, formatting, and fallback expectations."
  workflow:
    - "Curator has enough QA evidence to score test coverage."
```

## Final Report Contract

The runtime output must conform to the QA output schema. If this skill is used by a human or external agent outside the runtime, report:

```yaml
final_report:
  status: "completed | blocked"
  summary:
    - "Frontend test cases generated or revised"
  validation:
    passed:
      - "Coverage self-check completed"
    failed: []
  remaining_risks:
    - "Any requirement that could not be tested from available spec"
```
