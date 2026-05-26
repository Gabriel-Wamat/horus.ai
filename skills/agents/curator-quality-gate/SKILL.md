---
name: curator-quality-gate
description: Use this skill when the Curator Agent must evaluate generated frontend HTML and QA test cases against a Horus.AI spec. Triggers include curator scoring, pass/fail validation, missing requirement analysis, frontend-vs-QA fault isolation, retry routing, and quality gate decisions.
---

# Curator Agent Quality Gate

```yaml
id: "curator-quality-gate"
agent: "curator"
version: "0.1.0"
status: "active"
created_at_utc: "2026-05-26T00:00:00Z"
runtime_use: "Injected into CuratorAgent prompt before evaluation rules."
```

## Purpose

Use this skill to perform a rigorous quality gate over the generated frontend and QA test cases.

This skill helps the Curator Agent produce validation that is:

- scoped to the approved spec;
- evidence-based from generated HTML and QA output;
- modular across frontend, QA, accessibility, responsiveness, and acceptance criteria;
- actionable for Odin routing;
- aligned with the self-correction loop;
- validated through a clear score and pass/fail decision;
- safe against common agent errors such as vague feedback or wrong retry targets.

## When To Use

Use this skill when the workflow asks the Curator Agent to:

- compare generated HTML against the spec;
- compare QA cases against the spec;
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
  repository_root: "/Users/wamat/Desktop/horus.ai"
  target_files:
    - "generated index.html artifact"
    - "generated test-cases.json artifact"
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
    - "Odin uses fixTarget for retry routing"
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
    - "Treat generated artifacts as the source of evaluation evidence."
  architecture:
    - "Keep verdict, score, notes, missingItems, and fixTarget cohesive."
    - "Make feedback actionable for the retry loop."
  code_quality:
    - "Prefer concise, concrete missing items."
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
    - "Expected components"
    - "Expected data models"
    - "Frontend output"
    - "QA coverage"
  out_of_scope:
    - "New features not in the spec"
    - "Provider/model behavior"
  risks:
    - "Passing weak QA coverage"
    - "Failing good output for subjective design reasons"
    - "Routing retry to wrong agent"
  unknowns:
    - "Runtime/browser-only behavior if not observable from HTML"
```

### Step 2 - Build Evaluation Matrix

```yaml
evaluation_matrix:
  implementation:
    - "Required components present"
    - "Acceptance criteria implemented"
    - "Data and interactions represented"
    - "Responsive/accessibility basics present"
  qa:
    - "Each criterion has test coverage"
    - "Primary journey covered"
    - "Responsive/accessibility checks included where relevant"
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
- grouped enough for Odin to route;
- short enough for Front/QA agents to act on.

### Step 5 - Final Output

Return only the structured curator verdict expected by the runtime schema.

## 10 Foundations

1. Evaluate only against the approved spec, acceptance criteria, generated HTML, and generated QA cases.
2. Require both usable frontend implementation and meaningful QA coverage before passing.
3. Distinguish implementation defects from test coverage defects before choosing `fixTarget`.
4. Score consistently using the 0-100 policy and pass only when score is at least 70 with no critical gap.
5. Make every missing item concrete, observable, and actionable by FrontAgent or QAAgent.
6. Check that generated HTML includes required components, realistic content, interactions, and responsive/accessibility basics.
7. Check that QA cases map to acceptance criteria and include primary journey, responsive, interaction, and accessibility checks where relevant.
8. Penalize generic, decorative, or placeholder output that does not satisfy the user story.
9. Preserve the self-correction loop by routing narrowly when only one agent needs repair and broadly when both do.
10. Never claim live execution, browser rendering, or automated test results unless those checks actually ran.

## Agent Error Mitigation

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent browser results."
    - "Do not invent requirements beyond the spec."
  anti_overengineering:
    - "Do not fail output for subjective preferences unrelated to the spec."
    - "Do not request broad retries when a narrow fix is enough."
  anti_regression:
    - "On repeated attempts, compare whether prior missing items were addressed."
    - "Do not ignore QA coverage when frontend appears visually acceptable."
  anti_false_validation:
    - "Do not pass if QA cases are absent or generic."
    - "Do not pass if critical frontend acceptance criteria are absent."
```

## Architecture Checklist

```yaml
architecture_checklist:
  - "Is the verdict based on spec ownership rather than new requirements?"
  - "Are frontend and QA responsibilities evaluated separately?"
  - "Is fixTarget aligned with the actual failing responsibility?"
  - "Are missing items useful for retry prompts?"
```

## Testing Checklist

```yaml
testing_checklist:
  curator:
    - "Acceptance criteria implementation checked."
    - "QA criteria coverage checked."
    - "Responsive/accessibility basics considered."
    - "Score and fixTarget are consistent."
  workflow:
    - "Feedback can drive Odin retry routing."
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
