# Feature 76: Structural Patch Intents And Redis Cache

## Status

Implemented

## User Request

> crie uma plano para que isso(AST/StructuralPatchIntent, redis) ocorra e implemente

## Problem

The project already has AST analysis and `StructuralPatchIntent` entities, but the frontend generation path still asks the Front Agent to return full-file operations for code-aware edits. That leaves symbol-level edits available in the coding runtime, but not in the main LangGraph Front Agent path.

The code context service also recomputes AST and semantic context on every retrieval. That is acceptable for local fallback, but expensive for repeated agent loops. Redis should be available as an optional cache layer without making Redis mandatory for local development, Docker, CI, or machines without Redis.

## Goals

1. Allow the Front Agent to return `structuralPatchIntents` for existing-file edits.
2. Compile structural intents into a normal `CodeChangeSet` before preflight, tool-loop mutation, curator review, and validation.
3. Keep full-file operations as fallback for new files, large rewrites, or unsupported structural targets.
4. Add a cache port with in-memory fallback and optional Redis adapter.
5. Cache AST/semantic structural context with content-aware invalidation.
6. Preserve cross-machine portability: the app must still build and run without Redis.

## Non-Goals

- Redis must not become required for local execution.
- The Front Agent must not receive direct filesystem mutation powers outside the governed tool runtime.
- Structural patch planning must not bypass preflight, path policy, preconditions, or validation.
- This does not implement global semantic rename across multiple files.

## Design

### Front Agent Output Contract

The code-aware Front Agent response supports both:

- `structuralPatchIntents`: preferred for scoped edits in inspected existing files.
- `operations`: fallback for create/delete/full rewrite cases.

Rules:

- Existing component/function/import edits should prefer `StructuralPatchIntent`.
- `replace`, `delete`, `rename_local`, `add_import`, `remove_import`, and `insert` must identify a real `targetPath`.
- Symbol-scoped operations must include `targetSymbolName` and, when known, `targetSymbolKind`.
- Full-file `operations` remain accepted only when structural targeting is not adequate.

### LangGraph Integration

`frontAgentNode` checks `frontendOutput.structuralPatchIntents` before full-file operations. When present:

1. Build AST candidates from the read-only code context.
2. Analyze candidates with `TreeSitterAstAnalyzer`.
3. Plan the structural patch with `AstPatchPlanner`.
4. Fail fast if the plan is blocked.
5. Convert the plan to `CodeChangeSet.operations`.
6. Continue through the existing tool loop, preflight and validation path.

### Redis Cache

The cache layer is a small port:

- `getJson<T>(key)`
- `setJson(key, value, { ttlMs })`
- `delete(key)`

Implementations:

- `InMemoryKeyValueCache` for local fallback and tests.
- `RedisKeyValueCache` for `HORUS_CACHE_DRIVER=redis` with `REDIS_URL` or `HORUS_REDIS_URL`.

The app defaults to memory cache unless Redis is explicitly configured. Redis failures must not prevent code context retrieval; the service falls back to recomputing context.

### Cache Key

Structural context cache keys include:

- project root
- retrieval query
- requested paths
- retrieved file paths
- retrieved file content hashes

This prevents stale AST/semantic context after file edits.

## Acceptance Criteria

- The Front Agent schema accepts `structuralPatchIntents`.
- The Front Agent prompt instructs symbol-level edits to prefer structural intents.
- `frontAgentNode` builds a valid `CodeChangeSet` from structural intents.
- Blocked structural plans surface clear diagnostics instead of silently falling back.
- The code context service supports cache injection.
- Redis is configurable through environment variables and remains optional.
- Tests cover structural intent compilation and cache reuse.
- `@u-build/shared` and `@u-build/server` build successfully.

## Validation Plan

1. Run shared build.
2. Run server build.
3. Run structural patch planner tests.
4. Run frontend node structural intent tests.
5. Run read-only code context cache tests.

