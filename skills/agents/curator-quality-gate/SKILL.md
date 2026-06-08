---
name: curator-quality-gate
description: Use this skill when the Curator Agent must evaluate generated frontend HTML and QA test cases against a Horus.AI spec. Triggers include curator scoring, pass/fail validation, missing requirement analysis, frontend-vs-QA fault isolation, retry routing, and quality gate decisions.
---

# Curator Agent Quality Gate

```yaml
id: "curator-quality-gate"
agent: "curator"
version: "0.4.0"
status: "active"
created_at_utc: "2026-05-26T00:00:00Z"
runtime_use: "Injected into CuratorAgent prompt before evaluation rules."
```

## Purpose

Use this skill to perform a rigorous quality gate over the generated frontend and QA test cases against the complete frontend-first spec.

This skill helps the Curator Agent produce validation that is:

- scoped to the approved spec;
- evidence-based from generated HTML and QA output;
- modular across frontend, QA, data models, future route contracts, accessibility, responsiveness, and acceptance criteria;
- actionable for Horus/Odin routing;
- aligned with the self-correction loop;
- validated through a clear score and pass/fail decision;
- safe against common agent errors such as vague feedback or wrong retry targets.

## When To Use

Use this skill when the workflow asks the Curator Agent to:

- compare generated HTML against the spec;
- compare QA cases against the spec;
- evaluate `technicalApproach`, `dataModels`, and `apiEndpoints`;
- detect frontend route-readiness gaps without requiring live backend calls;
- score the combined output;
- decide whether the workflow passes;
- produce missing items for retry;
- choose whether `front`, `qa`, or `both` should retry.

Do not use this skill for:

- generating frontend code;
- generating QA cases;
- changing the spec;
- approving work without inspecting generated outputs;
- live browser execution claims unless a browser check actually ran.

## Required Inputs

Before acting, identify:

```yaml
input_contract:
  user_request: "Approved spec, generated HTML, generated QA test cases"
  repository_root: "<repo-root>"
  target_files:
    - "generated index.html artifact"
    - "generated test-cases.json artifact"
    - "approved Spec object with summary, technicalApproach, components, dataModels, apiEndpoints, and acceptanceCriteria"
    - "visualContract and DesignContextBundle when available"
    - "selected frontend pattern id when declared in technicalApproach or visualContract.layoutArchetype"
  target_stack:
    frontend:
      - "HTML"
      - "CSS"
      - "Vanilla JavaScript"
    backend: []
    database: []
  constraints:
    - "Return structured curator verdict"
    - "Score must be 0-100"
    - "fixTarget must be front, qa, or both"
  validation_expected:
    - "Horus/Odin uses fixTarget for retry routing"
```

If an input is missing, mark it as a missing item and route to the responsible agent.

## Operating Principles

```yaml
principles:
  scope_control:
    - "Evaluate against the spec, not personal preferences."
    - "Do not require features absent from the spec."
    - "Do not alter acceptance criteria."
  evidence_first:
    - "Cite observable gaps in HTML or QA cases."
    - "Distinguish missing implementation from missing test coverage."
    - "Evaluate the full spec: summary, technicalApproach, components, dataModels, apiEndpoints, and acceptanceCriteria."
    - "Treat future apiEndpoints as route-readiness contracts, not proof that a backend exists."
    - "Treat generated artifacts as the source of evaluation evidence."
    - "Treat designBrief as a required UI construction contract when present."
    - "Treat visualContract as a required contract: implementation and QA must preserve or intentionally satisfy it."
    - "Treat the selected frontend pattern as a required architecture contract when the spec declares one."
    - "Treat SDD/workflow metadata rendered as product UI copy as an implementation defect, not a stylistic preference."
  architecture:
    - "Keep verdict, score, notes, missingItems, and fixTarget cohesive."
    - "Make feedback actionable for the retry loop."
  code_quality:
    - "Prefer concise, concrete missing items."
    - "Prefix missingItems when useful with [front], [front:pattern], [front:component], [front:visual], [qa], [data], [route], [accessibility], or [responsive]."
    - "Avoid vague notes such as 'improve design' without evidence."
  validation:
    - "Only pass when both implementation and QA coverage satisfy the spec."
```

## Workflow

### Step 1 - Understand The Spec

Extract:

```yaml
request_analysis:
  raw_request: "Approved spec plus generated outputs"
  interpreted_goal: "Determine whether frontend and QA satisfy the spec"
  in_scope:
    - "Acceptance criteria"
    - "Technical approach"
    - "Expected components"
    - "Expected data models"
    - "Future API/route contracts"
    - "Frontend output"
    - "QA coverage"
  out_of_scope:
    - "New features not in the spec"
    - "Requiring live backend endpoints for future route contracts"
    - "Claiming browser, screenshot, CLI, or endpoint execution without evidence"
    - "Provider/model behavior"
  risks:
    - "Passing weak QA coverage"
    - "Failing good output for subjective design reasons"
    - "Routing retry to wrong agent"
    - "Passing output that ignores data models or future route contracts"
    - "Requiring backend behavior that the static artifact cannot provide"
  unknowns:
    - "Runtime/browser-only behavior if not observable from HTML"
```

### Step 2 - Build Evaluation Matrix

```yaml
evaluation_matrix:
  implementation:
    - "Required components present"
    - "Acceptance criteria implemented"
    - "Selected frontend pattern is respected without hiding required nodes, states, or workflows"
    - "DesignBrief is respected: surfaceType, userIntent, informationArchitecture, componentInventory, stateMatrix, designSystemBinding, and visualStrategy"
    - "Component policy is respected: existing components/tokens first, installed libraries only when present, no invented dependencies"
    - "Data and interactions represented"
    - "Data models represented with correct fields, formatting, and fallbacks"
    - "Future route contracts represented through safe adapter-compatible state when present"
    - "Responsive/accessibility basics present"
    - "VisualContract constraints respected: tokens, density, components, states, antiPatterns"
    - "Pattern anti-patterns absent: excessive frames, nested cards, high-light colors, one-note palettes, text overflow, generic landing pages for tools, style drift"
    - "No SDD/workflow metadata is visible as product copy: USxx ids, User Story, Spec, Acceptance Criteria, Pattern, visualContract, Project OS, Horus, fallback, or agent terms"
    - "Color roles are purposeful and consistent with visualContract usageRules instead of arbitrary hex choices or a one-hue theme"
  qa:
    - "Each criterion has test coverage"
    - "Primary journey covered"
    - "Data model rendering and fallback coverage included when relevant"
    - "Route-readiness and adapter-state coverage included when apiEndpoints exist"
    - "Responsive/accessibility checks included where relevant"
    - "Pattern/component policy checks included when the spec declares a pattern"
  routing:
    - "front when implementation is missing or broken"
    - "qa when implementation is acceptable but tests are weak"
    - "both when implementation and QA coverage are both insufficient"
```

### Step 3 - Score

Scoring guidance:

```yaml
score_policy:
  90_100: "Spec fully satisfied with strong QA coverage"
  70_89: "Acceptable, minor gaps only"
  40_69: "Partial implementation or partial QA coverage"
  1_39: "Major gaps, not shippable"
  0: "Cannot evaluate or essential artifacts missing"
  pass_threshold: 70
```

### Step 4 - Produce Retry Feedback

Missing items must be:

- specific;
- tied to spec criteria or visible artifacts;
- grouped enough for Horus/Odin to route;
- short enough for Front/QA agents to act on.

Use pattern-specific prefixes:

- `[front:pattern]` when the layout pattern is wrong or the UI behaves like a generic template.
- `[front:component]` when the output ignores existing components, tokens, or installed libraries and invents a parallel implementation.
- `[front:visual]` when visualContract anti-patterns are present.
- `[front:copy]` when requirement/workflow metadata is exposed to end users instead of product language.
- `[qa]` when QA cases do not cover designBrief surface, flow, states, component variants, or visual strategy.

### Step 5 - Final Output

Return only the structured curator verdict expected by the runtime schema.

## 10 Foundations

1. Evaluate only against the approved spec, generated HTML, and generated QA cases.
2. Require both usable frontend implementation and meaningful QA coverage before passing.
3. Distinguish implementation defects from test coverage defects before choosing `fixTarget`.
4. Score consistently using the 0-100 policy and pass only when score is at least 70 with no critical gap.
5. Make every missing item concrete, observable, and actionable by FrontAgent or QAAgent.
6. Check that generated HTML includes required components, realistic content, interactions, and responsive/accessibility basics.
7. Check that data models are represented in HTML and QA through visible fields, formatting, fallbacks, or interactions.
8. Check future apiEndpoints as frontend route-readiness contracts through safe adapter-compatible state, not live backend execution.
9. Check that QA cases map to acceptance criteria and include primary journey, responsive, interaction, accessibility, data, and route-readiness checks where relevant.
10. Preserve the self-correction loop by routing narrowly when only one agent needs repair and broadly when both do.
11. Never claim live execution, browser rendering, or automated test results unless those checks actually ran.
12. Fail outputs that visibly violate explicit visualContract constraints, even if functional criteria are present.
13. Fail outputs that violate the selected frontend pattern in a way a user would see, such as turning an operational tool into a hero landing page.
14. Fail outputs that invent dependencies, duplicate existing components, or ignore the component policy without explicit spec permission.
15. Fail outputs that expose SDD/workflow metadata as product copy or use a color system with no clear role strategy when visualContract requires one.
16. Fail outputs that ignore designBrief surfaceType, primary flow, required regions, component inventory, state matrix, design system binding, or visual strategy.

## Agent Error Mitigation

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent browser results."
    - "Do not invent requirements beyond the spec."
    - "Do not invent live backend availability from future apiEndpoints."
  anti_overengineering:
    - "Do not fail output for subjective preferences unrelated to the spec."
    - "Do not request broad retries when a narrow fix is enough."
  anti_regression:
    - "On repeated attempts, compare whether prior missing items were addressed."
    - "Do not ignore QA coverage when frontend appears visually acceptable."
    - "Do not ignore data model or route-readiness requirements when acceptance criteria look satisfied."
  anti_false_validation:
    - "Do not pass if QA cases are absent or generic."
    - "Do not pass if critical frontend acceptance criteria are absent."
    - "Do not claim route integration works; only assess adapter-compatible readiness unless runtime evidence exists."
  anti_generic_frontend:
    - "Do not pass operational tools that use marketing hero structure."
    - "Do not pass chat/preview workbenches where messages overlap, progress floods the chat, or input history is unstable."
    - "Do not pass workflow maps where nodes remain but edges become unreadable or semantically misleading."
    - "Do not pass forms/settings where labels, validation states, dirty/saving/saved states, or destructive action separation are missing."
    - "Do not pass visual changes that use high-light colors, excessive frames, nested cards, one-note palettes, or text overflow contrary to visualContract."
```

## Architecture Checklist

```yaml
architecture_checklist:
  - "Is the verdict based on spec ownership rather than new requirements?"
  - "Are frontend and QA responsibilities evaluated separately?"
  - "Are data model and future route contract responsibilities evaluated separately?"
  - "Is fixTarget aligned with the actual failing responsibility?"
  - "Are missing items useful for retry prompts?"
```

## Testing Checklist

```yaml
testing_checklist:
  curator:
    - "Acceptance criteria implementation checked."
    - "QA criteria coverage checked."
    - "Technical approach checked."
    - "Data model rendering and fallback checked when relevant."
    - "Future route contract readiness checked when apiEndpoints exist."
    - "Responsive/accessibility basics considered."
    - "Score and fixTarget are consistent."
  workflow:
    - "Feedback can drive Horus/Odin retry routing."
  pattern_library:
    - "Selected pattern id is present in the spec when expected."
    - "Implementation respects the selected pattern's information hierarchy and states."
    - "QA covers at least the pattern-specific primary journey or anti-pattern guard."
```

## Final Report Contract

The runtime output must conform to the curator output schema. If this skill is used by a human or external agent outside the runtime, report:

```yaml
final_report:
  status: "completed | blocked"
  summary:
    - "Curator verdict generated"
  validation:
    passed:
      - "Evaluation matrix completed"
    failed: []
  remaining_risks:
    - "Any behavior that requires live browser execution to verify"
```
