# Component Policy

Version: 1.0.0
Owner: Horus Front Agent
Purpose: choose components without inventing dependencies or fighting the existing project identity.

## Priority Order

1. Existing local components, tokens, styles, layout primitives, routes, and utility APIs.
2. Installed project libraries proven by `package.json`, imports, or source files.
3. Native HTML/CSS/TypeScript primitives.
4. New dependency proposals only when explicitly requested by the user or allowed by the project manifest.

## Existing Project First

- Inspect current entrypoints and the smallest useful set of source files before adding new UI primitives.
- Reuse local button, input, card, table, modal, tabs, badge, tooltip, icon, and layout conventions when present.
- Keep names, file locations, import style, CSS strategy, and state management consistent with the app.
- Do not create duplicate primitives when a local equivalent exists.

## Library Use

- Lucide icons are acceptable only if the project already has `lucide-react` or the runtime scaffold includes it.
- shadcn/ui, Radix, Tailwind, Material, Chakra, Ant, or other libraries may be used only when already installed and consistent with project code.
- Do not mention or import library components unless the package/source evidence proves they exist.
- Do not add CDN dependencies.

## Button And Control Rules

- Action buttons should use icon plus visible name when a familiar icon exists.
- Icon-only buttons are allowed for navigation/chrome controls and must include `aria-label`.
- Text labels must be short and stable; hover/focus/active states must not resize controls.
- Use toggles for binary settings, segmented controls for mutually exclusive modes, tabs for major views, menus/selects for option sets, sliders/steppers/inputs for numeric values, and dialogs only for focused confirmation or editing.

## Layout And Surface Rules

- Cards are for repeated items, modals, and genuinely framed tools; do not place cards inside cards.
- Page sections should be full-width bands or unframed constrained layouts.
- Dense tools should use separators, spacing, subtle strokes, typography, and grouping before adding extra frames.
- Keep fixed-format elements stable with grid tracks, aspect ratio, min/max constraints, or container-relative sizing.

## Data And State Rules

- Do not add mock/fake adapters in runtime project code.
- If development data is unavoidable for a blank local artifact, name it explicitly as local development data and keep the adapter replaceable.
- Implement visible loading, empty, error, success, selected, disabled, and focus states when the selected pattern or spec requires them.

## Output Rules

- In project mode, return complete file operations for reachable source files.
- In artifact/static mode, return complete HTML only when the selected stack allows it.
- The summary should mention the selected pattern id and files touched, without verbose design prose.
