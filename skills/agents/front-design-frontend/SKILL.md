---
name: front-design-frontend
description: Use this skill when the Front Agent must generate or revise frontend code from a Horus.AI spec using TypeScript/LangGraph workflow context. Triggers include project-aware React/Vite/TypeScript implementation, stack-aware frontend generation, UI quality, responsive layout, accessibility, and curator feedback targeting front fixes. Static HTML is allowed only for explicit artifact mode.
---

# Front Agent Design And Frontend Quality

```yaml
id: "front-design-frontend"
agent: "front"
version: "0.4.0"
status: "active"
created_at_utc: "2026-05-26T00:00:00Z"
runtime_use: "Injected into FrontAgent prompt before implementation rules."
```

## Purpose

Use this skill to generate polished, usable, responsive frontend code from a technical spec.

This skill helps the Front Agent produce work that is:

- scoped to the spec;
- evidence-based from the user story and acceptance criteria;
- modular in the selected frontend stack;
- testable by the QA and Curator agents;
- aligned with Horus.AI's generated project architecture;
- validated before completion;
- safe against common agent errors such as generic pages, broken responsive layouts, missing interactions, standalone HTML inside framework projects, and unmounted source files.

## When To Use

Use this skill when the workflow asks the Front Agent to:

- generate a static frontend artifact from a `Spec`;
- implement or revise a real generated frontend project;
- edit React/Vite/TypeScript project files such as `src/main.tsx`, `src/App.tsx`, `src/features`, `src/components`, `src/styles`, and typed adapters;
- follow a selected frontend stack contract such as React, Vue, Svelte, Angular, Next.js, Nuxt, Astro, Remix, Vite vanilla, HTML/CSS/JavaScript, or TypeScript variants;
- revise frontend output after curator feedback;
- implement user-facing HTML/CSS/JavaScript behavior;
- improve design quality, layout, visual hierarchy, accessibility, or responsiveness;
- create a complete browser-runnable page without external dependencies when artifact mode is explicit.

Do not use this skill for:

- backend API implementation;
- QA test generation;
- curator scoring;
- casual explanation without software output;
- tasks where a more specific project skill applies better.

## Required Inputs

Before acting, identify:

```yaml
input_contract:
  user_request: "Current user story and generated technical spec"
  repository_root: "<repo-root>"
  target_files:
    - "project source files or generated index.html artifact"
  target_stack:
    frontend:
      - "selected projectStack, such as React/Vite/TypeScript"
    backend: []
    database: []
  constraints:
    - "Use the selected stack; do not invent a different framework"
    - "No external CDNs"
    - "No standalone HTML implementation when a framework project root exists"
    - "Return ProjectExecutionPlan operations for real projects"
  validation_expected:
    - "Curator validates generated source changes against spec, QA cases, and architecture gates"
```

If the spec omits details, infer conservatively from the user story and acceptance criteria. Do not invent unrelated product features.

## Operating Principles

```yaml
principles:
  scope_control:
    - "Build only the frontend requested by the spec."
    - "Do not add unrelated product flows."
    - "Do not change acceptance criteria."
  evidence_first:
    - "Use the user story, spec summary, components, data models, and acceptance criteria as source of truth."
    - "Treat curator feedback as a correction contract on retries."
    - "Do not claim support for a state or interaction unless implemented."
  architecture:
    - "For real projects, keep code reachable from the selected stack entrypoint or route system."
    - "For React/Vite/TypeScript, use src/main.tsx, src/App.tsx, src/features, src/components, src/styles, and typed contracts."
    - "Keep CSS organized by design tokens, layout, components, states, and responsive rules."
    - "Keep JavaScript or TypeScript deterministic and tied to visible interactions."
  code_quality:
    - "Prefer semantic elements and accessible attributes."
    - "Use stable dimensions for controls and repeated UI elements."
    - "Every visible button must follow the icon+name pattern: a meaningful icon plus a short visible text label."
    - "Avoid layout shifts caused by dynamic labels, hover states, or long text."
  validation:
    - "Ensure the document opens directly in a browser."
    - "Ensure the UI can be checked manually by QA cases."
```

## Workflow

### Step 1 - Understand The Spec

Extract:

```yaml
request_analysis:
  raw_request: "User story plus technical spec"
  interpreted_goal: "The concrete UI/application experience to build"
  in_scope:
    - "Required sections/components"
    - "Required interactions"
    - "Required data models"
    - "Required acceptance criteria"
  out_of_scope:
    - "External services"
    - "Framework-specific code"
    - "Unrequested flows"
  risks:
    - "Generic output that does not satisfy the domain"
    - "Responsive text overflow"
    - "Missing interactive states"
  unknowns:
    - "Domain details not specified by the user story"
```

Rules:

- Preserve the user's intent.
- Do not silently turn an application into a marketing page.
- Do not omit any acceptance criterion.

### Step 2 - Plan The UI

Identify:

```yaml
ui_plan:
  information_architecture:
    - "Primary user task"
    - "Secondary supporting content"
  layout:
    - "Mobile structure"
    - "Desktop structure"
  components:
    - "Named sections from the spec"
  interactions:
    - "Buttons, forms, tabs, filters, toggles, menus, modals, or dynamic views"
  states:
    - "Default"
    - "Empty"
    - "Error"
    - "Success"
    - "Selected"
    - "Focus"
```

### Step 3 - Implement The Artifact

```yaml
implementation_strategy:
  selected_approach: "Stack-aware source files for real projects; complete HTML only for explicit artifact mode"
  why_this_approach: "Horus.AI generated projects must remain editable, importable, buildable, and previewable"
  compatibility_notes:
    - "React/Vite/TypeScript projects require mounted TSX source files"
    - "HTML/CSS/JS standalone is allowed only when selected stack is explicit artifact/static mode"
    - "No external network dependency"
```

Implementation rules:

- In project mode, inspect existing entrypoints before creating files.
- In React/Vite/TypeScript mode, implement through TSX components, typed data/contracts, CSS, and imports reachable from `src/main.tsx` or `src/App.tsx`.
- Do not write `generated/horus/*.html` as the implementation for a framework project.
- Do not create parallel apps, orphan components, or unmounted files.
- Start UI markup with semantic structure.
- Define CSS variables for color, spacing, radius, type, and shadows.
- Use CSS Grid/Flexbox with responsive constraints.
- Use realistic mock data from the spec.
- Implement interactive behavior with small functions.
- Keep content inspectable and useful.
- Buttons must always use the `icon + name` pattern. Do not create text-only buttons for actions when an icon can clarify intent.
- Icon-only buttons are allowed only for globally familiar chrome/navigation controls and must have `aria-label`.
- Button labels must be short, visible, and action-oriented, such as `Editar`, `Excluir`, `Criar`, `Gerar specs`, `Salvar`, or `Cancelar`.
- Button icons must use `currentColor`, fixed dimensions, and must not shift layout on hover or active states.

### Step 4 - Self-Check Before Returning

Verify:

```yaml
self_check:
  - "Document starts with <!DOCTYPE html>."
  - "No markdown fences or explanations are present."
  - "Every acceptance criterion is represented in the UI."
  - "No text overlaps or overflows obvious containers."
  - "Controls have accessible labels or visible text."
  - "Mobile and desktop layouts are explicitly handled."
```

### Step 5 - Final Output

Return only the structured output requested by the runtime. In project mode, return file operations with complete final file contents. In explicit artifact mode, return only the complete HTML document.

## 10 Foundations

1. Build the actual requested experience first, not a marketing placeholder or explanatory landing page unless the spec explicitly asks for one.
2. Match the domain and user intent with an appropriate visual system, information density, interaction model, and tone.
3. Create a clear visual hierarchy with restrained typography, consistent spacing, and no oversized text inside compact UI regions.
4. Use responsive layouts with explicit constraints, stable grids, sensible breakpoints, and no overlapping or overflowing text.
5. Prefer semantic HTML, accessible labels, keyboard-friendly controls, meaningful landmarks, and sufficient color contrast.
6. Use real content structures and realistic mock data derived from the spec rather than generic filler.
7. Keep CSS organized with variables, component-level sections, predictable states, and no one-note color palette.
8. Implement complete interactive behavior expected by the spec, including empty, loading, selected, hover, focus, and error states when relevant.
9. Standardize action buttons as `icon + visible name`, preserving accessible labels, stable dimensions, and consistent hover/active states.
10. Return project file operations for real generated projects; return a directly runnable HTML document only when the selected stack is explicit static artifact mode.

## Agent Error Mitigation

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent APIs, backend calls, libraries, or assets."
    - "If content is missing, use typed local development data only when clearly labeled and not pretending to be a live integration."
  anti_overengineering:
    - "Do not implement a framework inside vanilla JS."
    - "Do not add abstractions unless they simplify visible behavior."
  anti_regression:
    - "On retry, fix curator feedback without removing previously correct requirements."
    - "Preserve acceptance criteria coverage."
    - "Do not replace standardized icon+name buttons with text-only controls."
    - "Do not replace a React/Vite/TypeScript project with standalone HTML."
  anti_false_validation:
    - "Do not say the page is accessible unless labels, focus, and semantics are present."
```

## Architecture Checklist

```yaml
architecture_checklist:
  - "Is project-mode output reachable from the selected stack entrypoint?"
  - "For React/Vite/TypeScript, are TSX/CSS/type files mounted by src/main.tsx or src/App.tsx?"
  - "If the output is a single static HTML artifact, was artifact/static mode explicit?"
  - "Is CSS separated into tokens, layout, components, states, and responsive rules?"
  - "Is JavaScript limited to UI behavior required by the spec?"
  - "Are semantic regions and controls used correctly?"
  - "Do all action buttons follow icon+name unless they are documented chrome/navigation exceptions?"
  - "Are long text and dynamic content constrained?"
```

## Testing Checklist

```yaml
testing_checklist:
  frontend:
    - "Can the selected stack preview/build path run when dependencies are available?"
    - "Can QA execute all test steps against visible UI?"
    - "Does the UI work at mobile and desktop widths?"
    - "Are focus states and labels present for controls?"
    - "Do buttons use icon+name consistently and preserve visible text at desktop and mobile widths?"
  workflow:
    - "Does the output provide enough evidence for Curator to score it?"
```

## Final Report Contract

The runtime output must be HTML only. If this skill is used by a human or external agent outside the runtime, report:

```yaml
final_report:
  status: "completed | blocked"
  summary:
    - "Frontend artifact generated or revised"
  validation:
    passed:
      - "Self-check completed"
    failed: []
  remaining_risks:
    - "Any unsupported spec requirement"
```
