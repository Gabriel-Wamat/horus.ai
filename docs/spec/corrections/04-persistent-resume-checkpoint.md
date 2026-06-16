# Correction 04: Define Persistent Resume Semantics

Spec version: 0.2.0
Status: implemented
Owner: TBD
Created: 2026-05-26

## Problem

Workflow snapshots are saved as JSON, but LangGraph uses `MemorySaver`. After a server restart, a saved JSON state may exist while the resumable LangGraph checkpoint no longer exists.

## Affected Files

- `apps/server/src/infrastructure/langgraph/checkpointer.ts`
- `apps/server/src/domain/services/WorkflowOrchestrator.ts`
- `apps/server/src/infrastructure/adapters/JsonStorageAdapter.ts`

## Target Behavior

Resume semantics must be explicit and reliable. Either interrupted workflows survive process restart, or the API reports a clear non-resumable state.

## Implementation Options

Option A: short-term guard

- Keep `MemorySaver`.
- Detect missing graph checkpoint on resume.
- Return a clear API error explaining that the checkpoint is no longer resumable.

Option B: durable checkpointer

- Replace `MemorySaver` with a persistent checkpointer compatible with LangGraph JS.
- Keep JSON storage for UI/status artifacts or consolidate state storage if practical.

## Recommended First Step

Implement Option A first to remove ambiguity, then evaluate Option B after core retry correctness is fixed.

## Acceptance Criteria

- [x] Resume after process restart does not fail ambiguously.
- [x] The API distinguishes displayable historical state from resumable graph state.
- [x] Documentation states the current durability model.

## Validation

- 2026-05-26: `pnpm type-check` passed.
- 2026-05-26: `pnpm test` passed.

## Implementation Log

- 2026-05-26: Spec created; no code changes yet.
- 2026-05-26: Implemented short-term guard for missing in-memory LangGraph checkpoints.
- 2026-05-26: `/resume` and `/retry-decision` now return 409 when the required checkpoint is unavailable.
- 2026-05-26: Added `resumeCheckpoint.ts` with pure checkpoint detection and error type.
- 2026-05-26: Added regression coverage for checkpoint detection without importing the LLM-backed graph.
