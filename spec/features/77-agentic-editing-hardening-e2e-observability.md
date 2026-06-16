# Feature 77: Agentic Editing Hardening, E2E, And Observability

## Status

Implemented

## User Request

> implemente tudo isso

## Context

The request refers to the remaining work after Feature 76:

1. E2E real with LLM and preview.
2. Stronger Front Agent behavior so it prefers `StructuralPatchIntent`.
3. Redis live validation.
4. Larger monorepo validation surface.
5. Frontend observability for AST edits, preconditions, hashes, diffs, and fallback strategy.
6. Broader structural patch coverage.
7. Production hardening across Docker/Redis/Postgres/env.

## Goals

- Make AST structural edits easier for the model to choose and easier for users to inspect.
- Add opt-in live smoke harnesses for Redis and chat-to-preview E2E without breaking portable local execution.
- Surface structural edit evidence in file-operation telemetry.
- Preserve existing fallback paths: full-file operation, memory cache, no Redis, no LLM smoke unless configured.
- Add focused tests around structural metadata projection and opt-in cache behavior.

## Non-Goals

- Do not make Redis mandatory.
- Do not make live LLM E2E part of the default test suite.
- Do not replace the existing governed tool loop.
- Do not implement automatic global rename across the whole repo without explicit per-file intents.

## Implementation Plan

1. Add Front Agent few-shot examples for structural patch responses.
2. Preserve structural patch metadata on compiled `CodeChangeSet.operations`.
3. Project structural metadata into file telemetry.
4. Show strategy, symbol, intent kinds, precondition count, hash, and diff in the telemetry inspector.
5. Add Redis live smoke script.
6. Add chat-preview E2E smoke script that drives existing HTTP APIs.
7. Add production hardening smoke script for build/env/cache checks.
8. Add tests for metadata, telemetry projection, and existing structural flows.

## Acceptance Criteria

- Server and shared packages build.
- Structural CodeChangeSet operations expose AST metadata.
- File-operation telemetry carries AST strategy, target symbol, intent kind, precondition count, precondition hash, and diff preview.
- UI inspector renders this metadata when present.
- Redis live smoke can run with `HORUS_REDIS_URL` or `REDIS_URL`.
- Chat-preview E2E smoke can run against a live server with explicit IDs.
- Production hardening smoke can run locally and report missing optional external checks as skipped instead of false success.

## Validation

- `pnpm --filter @u-build/shared build`
- `pnpm --filter @u-build/server build`
- `pnpm --filter @u-build/web build`
- `node --test packages/shared/test/agentOperationalSession.test.mjs packages/shared/test/horusRunFlow.test.mjs apps/server/test/buildStructuralPatchCodeChangeSet.test.mjs apps/server/test/agentToolLoop.test.mjs`
- `pnpm verify:production-smoke`
- `pnpm cache:redis-smoke` skips cleanly without Redis env.
- `pnpm e2e:chat-preview` skips cleanly without live E2E IDs.
