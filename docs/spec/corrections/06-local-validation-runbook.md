# Correction 06: Local Validation Runbook

Spec version: 0.2.0
Status: implemented
Owner: TBD
Created: 2026-05-26

## Problem

The review could not run `pnpm type-check` before dependencies were available. Future correction work needs a repeatable validation sequence that separates static checks, build checks, and live LLM-dependent workflow checks.

## Target Behavior

Every correction should record what was run and whether it validated static correctness, runtime behavior, or only mocked behavior.

## Validation Commands

```bash
pnpm install
pnpm type-check
pnpm build
```

If tests are added:

```bash
pnpm test
```

For manual runtime validation:

```bash
pnpm dev
```

Then verify:

1. Web app opens on Vite port `5173`.
2. API is reachable on server port `3000`.
3. SSE events arrive after workflow start.
4. Spec approval advances the graph.
5. Retry behavior uses latest artifacts.
6. ZIP download contains latest artifacts.
7. Spec rejection reaches a backend terminal state.

## Environment Notes

Live workflow execution requires Anthropic credentials configured in the environment expected by `@langchain/anthropic`.

## Acceptance Criteria

- [x] Each implementation PR or local change batch updates the relevant spec `Implementation Log`.
- [x] Validation results are recorded in this file or in the changed correction spec.
- [x] Network-dependent checks are clearly separated from offline checks.

## Implementation Log

- 2026-05-26: Spec created; no validation run recorded yet.
- 2026-05-26: Offline validation run recorded: `pnpm type-check` passed.
- 2026-05-26: Offline validation run recorded: `pnpm test` passed. This command runs `pnpm build` before `node --test`.
- 2026-05-26: Manual runtime validation with live Anthropic credentials was not run in this correction batch.
