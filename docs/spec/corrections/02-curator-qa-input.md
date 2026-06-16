# Correction 02: Include QA Output In Curator Validation

Spec version: 0.2.0
Status: implemented
Owner: TBD
Created: 2026-05-26

## Problem

The graph runs QA, and the curador can return `fixTarget: "qa"`, but the curador currently receives only `spec` and `html`. QA output cannot influence pass/fail, score, notes, missing items, or retry routing.

## Affected Files

- `apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts`
- `apps/server/src/infrastructure/agents/CuratorAgentImpl.ts`
- `apps/server/src/infrastructure/agents/QaAgentImpl.ts`

## Target Behavior

The curador must evaluate both generated HTML and generated QA test cases against the spec and acceptance criteria.

## Implementation Plan

1. Extract the latest successful QA result in `curatorAgentNode.ts`.
2. Pass QA test cases to `validateOutput`.
3. Update `validateOutput` signature to accept QA output.
4. Update the curador prompt to assess:
   - HTML/spec adherence.
   - QA coverage against acceptance criteria.
   - whether `fixTarget` should be `front`, `qa`, or `both`.
5. Keep schema validation strict for curator output.

## Acceptance Criteria

- [x] A QA-only failure can produce `fixTarget: "qa"`.
- [x] A QA retry can change the curator verdict.
- [x] Curator notes mention concrete QA coverage problems when `fixTarget` includes `qa`.
- [x] Tests cover the curator input path passing both latest HTML and latest QA output.

## Validation

- 2026-05-26: `pnpm type-check` passed.
- 2026-05-26: `pnpm test` passed.

## Implementation Log

- 2026-05-26: Spec created; no code changes yet.
- 2026-05-26: Added `selectCuratorInputs` helper to extract latest FrontAgent HTML and QA test cases.
- 2026-05-26: Updated `curatorAgentNode` and `validateOutput` to pass QA output into the curador.
- 2026-05-26: Updated curador prompt to evaluate combined HTML/spec/test coverage and target QA-specific failures.
- 2026-05-26: Added regression coverage in `apps/server/test/selectCuratorInputs.test.mjs`.
