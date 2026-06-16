# Correction 01: Use Latest Successful Agent Artifacts

Spec version: 0.2.0
Status: implemented
Owner: TBD
Created: 2026-05-26

## Problem

Retries append new `AgentResult` entries, but several call sites use `find(...)`, which selects the first successful result. This can make the curador validate stale HTML and make preview/download expose stale artifacts.

## Affected Files

- `apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts`
- `apps/server/src/infrastructure/http/routes/workflowRoutes.ts`
- `apps/web/src/components/ArtifactsPanel.tsx`

## Target Behavior

For each user story and agent, runtime consumers must use the latest successful result, not the first one.

## Implementation Plan

1. Add a small helper for selecting the latest successful `AgentResult` by `agentName`.
2. Use the helper in `curatorAgentNode.ts` before calling the curador.
3. Use the same selection rule in `/download/:threadId`.
4. Mirror the selection rule in `ArtifactsPanel.tsx`.

## Acceptance Criteria

- [x] Curator validates the newest FrontAgent HTML after a retry.
- [x] ZIP download includes the newest HTML and QA test cases.
- [x] Frontend preview renders the newest HTML and QA test cases.
- [x] A unit test or narrow regression test covers older and newer attempts in the same `agentResults` array.

## Validation

- 2026-05-26: `pnpm type-check` passed.
- 2026-05-26: `pnpm build` passed.
- 2026-05-26: `pnpm test` passed.

## Implementation Log

- 2026-05-26: Spec created; no code changes yet.
- 2026-05-26: Added `getLatestSuccessfulAgentResult` in `packages/shared/src/entities/AgentResult.ts`.
- 2026-05-26: Updated curator node, ZIP download route, and frontend artifacts panel to select the latest successful FrontAgent/QAAgent result.
- 2026-05-26: Added `packages/shared/test/getLatestSuccessfulAgentResult.test.mjs` and root `pnpm test` script.
