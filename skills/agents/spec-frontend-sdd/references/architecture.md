# Frontend Spec Architecture Reference

## Spec Boundaries

The Spec Agent plans the frontend contract. It does not implement HTML, CSS, JavaScript, backend routes, tests, or curator verdicts.

The generated spec must be immediately useful to:

- Front Agent: implementation details, components, state, data adapter, responsive rules, accessibility rules.
- QA Agent: observable acceptance criteria and edge states.
- Curator Agent: concrete comparison surface between spec, frontend output, and QA coverage.

## Frontend-First Architecture

A strong spec separates these responsibilities:

- UI structure: semantic sections and controls.
- Styling: tokens, layout, spacing, responsive behavior, visual hierarchy.
- State: selected items, filters, form state, validation, loading/error/empty/success.
- Data adapter: one replaceable boundary where local state can later become route calls.
- Route contracts: future endpoints and schemas when dynamic data is implied.

## Backend Route Readiness

Use `apiEndpoints` as contracts when the story implies:

- loading remote lists or detail records;
- submitting forms;
- saving user choices;
- refreshing server-derived status;
- filtering/searching server data;
- downloading or exporting generated artifacts.

Do not add endpoints for purely static informational pages.

When endpoints are present, `technicalApproach` must say the current frontend should use empty states, user-created local state, or injectable adapters until real backend routes are available.
