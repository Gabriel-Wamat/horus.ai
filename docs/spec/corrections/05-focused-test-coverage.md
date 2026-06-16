# Correction 05: Add Focused Regression Coverage

Spec version: 0.2.0
Status: implemented
Owner: TBD
Created: 2026-05-26

## Problem

The most important behavior is orchestration correctness, but the repo currently has no visible test structure for the reviewed flow. LLM calls also need to be isolated behind mocks for deterministic validation.

## Target Behavior

Add small, deterministic tests around the correction points without requiring live Anthropic calls.

## Test Plan

1. [x] Helper test: latest successful result selection.
2. [x] Curator input test: latest front and latest QA outputs are selected for validation.
3. [x] Download artifact test: generated artifact file list contains latest artifacts.
4. [x] Spec rejection test: approval resolver reaches terminal cancellation.
5. [x] Retry routing test: QA-only curator feedback routes only QA when appropriate.

## Implementation Notes

- Mock `generateSpec`, `generateFrontend`, `generateQaTests`, and `validateOutput`.
- Prefer narrow tests close to the changed modules.
- Avoid adding broad infrastructure unless the repo already has a preferred test framework when implementation begins.

## Acceptance Criteria

- [x] Tests run without network access.
- [x] Tests fail against the old stale-artifact behavior.
- [x] Tests cover both front and QA artifact selection.

## Validation

- 2026-05-26: `pnpm type-check` passed.
- 2026-05-26: `pnpm test` passed with 10 passing tests.

## Implementation Log

- 2026-05-26: Spec created; no code changes yet.
- 2026-05-26: Added Node test script using built-in `node:test`.
- 2026-05-26: Added tests for latest agent result selection, curator inputs, artifact file generation, HITL approval resolution, checkpoint detection, and Odin QA-only routing.
- 2026-05-26: Extracted `buildWorkflowArtifactFiles` so download artifact selection is testable without streaming a ZIP.
