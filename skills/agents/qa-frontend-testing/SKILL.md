---
name: qa-frontend-testing
description: Use this skill when the QA Agent must generate frontend validation cases for Horus.AI static UI artifacts. Triggers include QA test generation, acceptance criteria coverage, responsive checks, accessibility checks, interaction testing, curator feedback targeting QA fixes, and manual browser validation plans.
---

# QA Agent Frontend Testing

```yaml
id: "qa-frontend-testing"
agent: "qa"
version: "0.2.0"
status: "active"
created_at_utc: "2026-05-26T00:00:00Z"
runtime_use: "Injected into QAAgent prompt before test generation rules."
```

## Purpose

Use this skill to create rigorous frontend validation cases that verify generated UI against the spec, acceptance criteria, responsive behavior, accessibility expectations, and user workflows.

This skill helps the QA Agent produce test work that is:

- scoped to the spec;
- traceable to acceptance criteria;
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
  repository_root: "/Users/wamat/Desktop/horus.ai"
  target_files:
    - "generated index.html artifact when available"
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
    - "Use component names and data models from the spec."
    - "Use curator feedback as a correction contract on retries."
  architecture:
    - "Separate primary journey, component behavior, responsive checks, and accessibility checks."
    - "Keep each test case focused on one observable outcome."
  code_quality:
    - "Write clear steps."
    - "Write observable expected results."
    - "Use stable IDs: TC-01, TC-02, etc."
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
    - "Responsive and accessibility expectations"
  out_of_scope:
    - "Backend implementation details"
    - "Unrequested browser automation framework"
  risks:
    - "Missing criteria coverage"
    - "Vague expected results"
    - "No responsive or accessibility coverage"
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
```

### Step 3 - Generate Test Cases

Implementation rules:

- Use `TC-01`, `TC-02`, and sequential IDs.
- Keep `criterion` tied to spec text.
- Make `steps` concrete and reproducible.
- Make `expected` observable in the browser.
- Include negative/edge cases when the spec includes input or dynamic data.

### Step 4 - Self-Check Before Returning

```yaml
self_check:
  - "Every acceptance criterion has coverage."
  - "No test only says 'page loads'."
  - "At least one test addresses responsive behavior when UI layout exists."
  - "At least one test addresses accessibility basics when controls exist."
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
10. Prioritize defects by user impact and distinguish frontend implementation failures from weak or missing test coverage.

## Agent Error Mitigation

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent UI controls absent from the spec."
    - "Do not invent framework-specific test runners."
  anti_overengineering:
    - "Do not create exhaustive low-value permutations."
    - "Prefer a focused coverage set over repetitive checks."
  anti_regression:
    - "On retry, preserve previous useful coverage while addressing curator feedback."
    - "Do not remove coverage for acceptance criteria."
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
```

## Testing Checklist

```yaml
testing_checklist:
  frontend:
    - "Primary journey covered."
    - "Responsive behavior covered."
    - "Accessibility basics covered."
    - "Dynamic/interactive states covered when present."
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
