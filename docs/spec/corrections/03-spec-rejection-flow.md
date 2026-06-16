# Correction 03: Make Spec Rejection A Real Backend Decision

Spec version: 0.2.0
Status: implemented
Owner: TBD
Created: 2026-05-26

## Problem

Rejecting a generated spec in the frontend clears local React state only. The backend graph remains interrupted at the human checkpoint, leaving an invisible hanging workflow.

## Affected Files

- `apps/web/src/App.tsx`
- `apps/server/src/infrastructure/langgraph/nodes/hitlCheckpointNode.ts`
- `packages/shared/src/entities/WorkflowState.ts`
- `packages/shared/src/ports/IEventStream.ts`

## Target Behavior

Spec rejection must be represented in backend state and surfaced to the user consistently.

## Recommended Policy

Introduce a `cancelled` workflow status for explicit human rejection. This is clearer than overloading `error`, because rejection is intentional operator input rather than runtime failure.

## Implementation Plan

1. Add `cancelled` to `WorkflowStatusSchema`.
2. In the frontend, call `/api/workflow/resume` when the user rejects.
3. Send `HumanFeedback` with `approved: false` and optional comment support.
4. In `hitlCheckpointNode`, return `status: "cancelled"` when `approved` is false.
5. In `WorkflowOrchestrator`, emit terminal status changes for `cancelled`.
6. Update UI progress and status handling to display cancellation.

## Acceptance Criteria

- [x] Rejecting a spec sends a backend decision.
- [x] The graph no longer remains silently interrupted after rejection.
- [x] `/api/workflow/status/:threadId` returns terminal `cancelled` state.
- [x] The UI can return to the input page while preserving clarity that the previous thread was cancelled.

## Validation

- 2026-05-26: `pnpm type-check` passed.
- 2026-05-26: `pnpm test` passed.

## Implementation Log

- 2026-05-26: Spec created; no code changes yet.
- 2026-05-26: Added `cancelled` workflow status.
- 2026-05-26: Added `resolveSpecApproval` and routed rejected specs to terminal cancellation.
- 2026-05-26: Updated graph routing to end after cancelled HITL review.
- 2026-05-26: Updated frontend rejection flow to call backend resume with `approved: false`.
- 2026-05-26: Added cancellation UI and regression tests for approval resolution.
