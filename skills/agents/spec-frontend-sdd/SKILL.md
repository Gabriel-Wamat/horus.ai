---
name: spec-frontend-sdd
description: Use this skill when the Spec Agent must generate Horus.AI frontend-first SDD specs from user stories. Triggers include creating frontend implementation specs, planning robust UI architecture, preparing frontend code for future backend routes, defining typed UI/API contracts, preserving static artifact compatibility, and producing specs consumed by Front, QA, and Curator agents.
---

# Spec Agent Frontend SDD

```yaml
id: "spec-frontend-sdd"
agent: "spec"
version: "0.1.0"
status: "active"
created_at_utc: "2026-05-26T00:00:00Z"
runtime_use: "Injected into SpecAgent prompt before structured spec generation rules."
```

## Purpose

Use this skill to turn a user story into a frontend-first technical spec that downstream agents can implement, test, and curate without guessing.

This skill helps the Spec Agent produce specs that are:

- scoped to the user story;
- evidence-based from acceptance criteria;
- frontend-oriented but ready for backend route integration;
- modular across UI, state, data adapters, and API contracts;
- testable by the QA agent;
- aligned with Horus.AI's static artifact workflow;
- safe against common agent failures such as vague components, generic pages, missing states, and backend/frontend contract drift.

## When To Use

Use this skill when the workflow asks the Spec Agent to:

- generate a technical spec from a user story;
- define frontend components, layout, interaction, state, and data requirements;
- prepare a frontend for future backend routes without implementing backend behavior;
- describe API contracts that the frontend should consume later;
- create acceptance criteria that are concrete enough for Front, QA, and Curator agents;
- improve spec quality for static HTML/CSS/JavaScript artifacts.

Do not use this skill for:

- implementing frontend code;
- generating QA test cases;
- curating generated artifacts;
- adding real backend routes unless the current workflow explicitly includes a backend agent;
- broad architecture planning unrelated to the user story.

## Required Inputs

Before acting, identify:

```yaml
input_contract:
  user_request: "Current user story with title, description, and acceptance criteria"
  repository_root: "<repo-root>"
  target_files:
    - "generated Spec object"
  target_stack:
    frontend:
      - "HTML"
      - "CSS"
      - "Vanilla JavaScript"
    backend:
      - "Future HTTP routes may exist, but are not implemented by this workflow"
    database: []
  constraints:
    - "Spec output must satisfy the shared SpecSchema."
    - "Frontend output remains a static browser-runnable artifact."
    - "No frameworks, build steps, external CDNs, or external runtime dependencies."
    - "Backend routes may be described as contracts only."
  validation_expected:
    - "Structured output must parse through SpecSchema."
    - "Front Agent must be able to implement from this spec without inventing requirements."
    - "QA Agent must be able to map tests to every acceptance criterion."
```

If the user story is ambiguous, infer conservatively and record the decision inside `technicalApproach`; do not silently add product features.

## Operating Principles

Always follow these principles:

```yaml
principles:
  scope_control:
    - "Generate only the spec required by the user story."
    - "Do not add unrelated product flows, screens, dashboards, auth, payments, or admin areas."
    - "Do not require real backend implementation unless the story explicitly asks for it."
  evidence_first:
    - "Use the title, description, and acceptance criteria as source of truth."
    - "Every component must support a visible requirement."
    - "Every acceptance criterion must become an observable frontend result."
  frontend_architecture:
    - "Split UI into purpose-driven sections/components."
    - "Separate rendering, state, data adapter, and interaction responsibilities in the spec."
    - "Specify loading, empty, error, success, selected, hover, focus, and responsive states when relevant."
    - "Plan the frontend so mock data can later be replaced by backend route calls through one data adapter layer."
  backend_route_readiness:
    - "Use apiEndpoints to describe future backend contracts when dynamic data, persistence, submission, filtering, or remote loading is implied."
    - "Keep apiEndpoints empty only when the requested UI is truly static and needs no future route contract."
    - "Describe request and response shapes with stable field names."
    - "State that the current frontend should use local mock data or adapter functions until real routes exist."
  code_quality:
    - "Require robust vanilla HTML/CSS/JavaScript structure."
    - "Require stable layout dimensions for repeated UI, toolbars, rows, tabs, cards, and controls."
    - "Require accessible labels, semantic HTML, keyboard focus, and non-overflowing text."
    - "Require concise technical comments only around non-obvious JavaScript behavior or data-adapter boundaries."
    - "Do not require emojis, decorative comments, or noisy explanatory comments."
  validation:
    - "Make QA validation possible from visible UI behavior."
    - "Make Curator evaluation possible from components, data models, API contracts, and acceptance criteria."
```

## Workflow

### Step 1 - Understand The Request

Extract:

```yaml
request_analysis:
  raw_request: "Preserve exact user story wording."
  interpreted_goal: "Concrete frontend experience to build."
  in_scope:
    - "Required UI surfaces."
    - "Required interactions."
    - "Required data and route-readiness contracts."
  out_of_scope:
    - "Backend implementation not supported by the current workflow."
    - "Unrequested user flows."
  risks:
    - "Spec too generic for Front Agent."
    - "Frontend not prepared for future backend routes."
    - "Acceptance criteria not testable."
  unknowns:
    - "Domain details absent from the story."
```

Rules:

- Preserve the user's intent.
- Do not silently turn an application/tool into a landing page.
- Do not omit any acceptance criterion.
- If the story suggests backend integration, capture the route contract but keep implementation frontend-safe.

### Step 2 - Design The Frontend Spec

Create a spec that tells the Front Agent:

```yaml
frontend_spec_plan:
  information_architecture:
    - "Primary user task."
    - "Secondary support content."
  visual_system:
    - "Layout density and hierarchy."
    - "Color, type, spacing, and state expectations."
  component_model:
    - "Named UI sections/components."
    - "Responsibility for each component."
    - "Dependencies between components."
  state_model:
    - "Local state required for interactions."
    - "Derived state, filters, selections, or validation."
  data_model:
    - "Mock data structures that can map to future backend responses."
  api_contracts:
    - "Future route contracts if needed."
  quality_requirements:
    - "Responsive behavior."
    - "Accessibility."
    - "Error and empty states."
    - "Technical comments where behavior is non-obvious."
```

### Step 3 - Produce Structured Spec Fields

Populate the shared `Spec` fields with these rules:

```yaml
spec_field_rules:
  summary:
    - "Use 1-2 precise sentences."
    - "Name the user-facing experience, not generic implementation."
  technicalApproach:
    - "Describe HTML structure, CSS architecture, JavaScript state, data adapter boundary, route readiness, responsive behavior, accessibility, and validation-sensitive states."
    - "State whether apiEndpoints are future contracts or intentionally empty."
    - "Mention that comments should be technical and sparse, focused on non-obvious logic."
  components:
    - "Use component names that the Front Agent can implement as page sections or JS modules."
    - "Each component description must include responsibility and key states/interactions."
    - "Use type 'ui' for visible sections, 'utility' for data adapters/helpers, and 'model' for state/data models when useful."
  apiEndpoints:
    - "Add endpoint contracts when the frontend needs future remote data, persistence, submission, or refresh."
    - "Use stable paths such as /api/<resource> only when the resource is implied by the story."
    - "Keep requestSchema and responseSchema simple JSON-like objects."
    - "Do not imply that backend implementation exists today."
  dataModels:
    - "List frontend data shapes in Portuguese with field names."
    - "Make shapes compatible with apiEndpoints when endpoints exist."
  acceptanceCriteria:
    - "Rewrite each user criterion as concrete technical behavior for HTML/CSS/JS."
    - "Include route-readiness or adapter behavior when the story implies backend data."
    - "Keep criteria observable by QA."
```

### Step 4 - Self-Check Before Returning

```yaml
self_check:
  - "The spec can be implemented as one complete static HTML file."
  - "The frontend has a clear data adapter boundary for future backend routes."
  - "Every apiEndpoint has a matching data model or UI behavior."
  - "Every component supports the user story or acceptance criteria."
  - "Acceptance criteria are concrete, observable, and testable."
  - "The spec avoids unrequested flows and backend implementation claims."
```

## Agent Error Mitigation

Use these rules to prevent common Spec Agent failures:

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent business entities unrelated to the user story."
    - "Do not invent backend availability."
    - "Do not invent framework dependencies."
  anti_generic_spec:
    - "Avoid generic sections such as HeroSection unless the story actually needs them."
    - "Name components from the product domain."
    - "Tie visual structure to the user's task."
  anti_backend_drift:
    - "Do not say backend routes are implemented."
    - "Use apiEndpoints as future contracts when needed."
    - "Keep mock data and route response shapes compatible."
  anti_frontend_fragility:
    - "Do not omit loading, empty, error, and responsive states when data or forms exist."
    - "Do not allow text overflow or ambiguous controls."
    - "Do not omit accessibility requirements for interactive controls."
  anti_false_validation:
    - "Do not claim tests or browser checks were run."
    - "Leave validation to QA/Curator unless actual commands were executed."
```

## Architecture Checklist

Before finalizing the spec, verify:

```yaml
architecture_checklist:
  - "Does each component have one clear responsibility?"
  - "Does the frontend have a replaceable data adapter boundary?"
  - "Are future backend contracts typed and compatible with frontend data models?"
  - "Are static artifact constraints preserved?"
  - "Are visual, state, error, and responsive requirements explicit?"
  - "Are acceptance criteria testable by QA?"
```

## Testing Checklist

```yaml
testing_checklist:
  structured_output:
    - "Spec output must parse through SpecSchema."
    - "All required fields must be populated."
    - "apiEndpoints must use valid HTTP methods and slash-prefixed paths."
  frontend_readiness:
    - "Every UI requirement has a component or acceptance criterion."
    - "Every dynamic data requirement has a data model."
    - "Every future route contract has compatible mock data guidance."
  qa_readiness:
    - "Every acceptance criterion is observable."
    - "Primary journey and edge states are testable."
    - "Responsive and accessibility expectations are explicit when UI controls exist."
  curator_readiness:
    - "Components, data models, API contracts, and acceptance criteria provide enough evidence for pass/fail review."
```

## Final Output Contract

Return only data that satisfies the shared `SpecSchema` structured output contract:

```yaml
spec_output:
  summary: "<concise frontend spec summary>"
  technicalApproach: "<detailed frontend-first implementation strategy>"
  components:
    - name: "<ComponentName>"
      type: "<ui | utility | model | api | service>"
      description: "<responsibility, behavior, states, and dependencies>"
      dependencies:
        - "<dependency name>"
  apiEndpoints:
    - method: "<GET | POST | PUT | PATCH | DELETE>"
      path: "</api/resource>"
      description: "<future route contract for frontend integration>"
      requestSchema: {}
      responseSchema: {}
  dataModels:
    - "<ModelName: { field: type, ... }>"
  acceptanceCriteria:
    - "<observable technical criterion>"
```

No markdown fences, prose outside the structured output, emojis, or implementation code.

## Final Report Contract

When this skill is used outside structured LLM output, report:

```yaml
final_report:
  status: "<completed | failed | blocked>"
  summary:
    - "<what spec guidance was produced>"
  files_read:
    - "<path or empty>"
  files_changed:
    - "<path or empty>"
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
    not_run:
      - check: "<check>"
        reason: "<reason>"
  remaining_risks:
    - "<risk or empty>"
```

Do not claim repository validation unless the command was actually run.

## 10 Foundations

1. Preserve the exact user story intent and do not add unrequested product flows.
2. Write frontend-first specs that downstream agents can implement as one static browser-runnable artifact.
3. Define domain-specific components with clear responsibilities, states, interactions, and dependencies.
4. Keep the frontend ready for backend routes through explicit data adapter boundaries and compatible API contracts.
5. Use `apiEndpoints` for future route contracts when data loading, persistence, submission, filtering, or refresh is implied.
6. Keep `apiEndpoints` empty only when the requested frontend is truly static.
7. Require loading, empty, error, success, focus, selected, and responsive states whenever the UI can enter them.
8. Require robust vanilla HTML/CSS/JavaScript, semantic structure, accessible controls, stable layout, and constrained text.
9. Require sparse technical comments only around non-obvious data adapters, validation logic, or state transitions.
10. Make every acceptance criterion observable, testable, and traceable by QA and Curator agents.
