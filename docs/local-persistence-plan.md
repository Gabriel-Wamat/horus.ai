# Local Persistence Portability Plan

## Goal

Horus.AI must run on macOS, Windows, and Linux without depending on this machine, this checkout path, or OS-specific process behavior. Local persistence must be explicit, configurable, recoverable, and separated from generated build artifacts.

## Current Findings

1. Storage paths are relative to the process working directory.
   - `JsonStorageAdapter` defaults to `./data/workflows`.
   - `FileWorkspaceStore` defaults to `./data/workspace`.
   - `FileChatMemoryStore` defaults to `./data/chat-memory`.
   - `FileFrontendProjectRegistry` defaults to `./data/frontend-projects`.
   - `FilePreviewSessionStore` defaults to `./data/preview-sessions`.
   - These paths are portable at the Node API level, but they are not stable across `cwd` changes, Docker/service execution, packaged builds, or different launch scripts.

2. Dependency injection does not centralize persistence configuration.
   - `createApp()` constructs every store with default paths.
   - There is no single app config object or environment contract such as `HORUS_DATA_DIR`.
   - Tests can inject temp directories directly, but production cannot.

3. Workflow persistence is split between durable JSON state and an in-memory LangGraph checkpoint.
   - Workflow snapshots are saved as JSON.
   - LangGraph uses `MemorySaver`.
   - Human-in-the-loop resume explicitly fails after process restart because the checkpoint is only in memory.
   - This means local files are not enough to restore an interrupted workflow on another process or machine.

4. Preview process state is persisted as if it were durable.
   - `PreviewSession` stores `processId`.
   - `ProcessBrowserPreviewAdapter` keeps live children in an in-memory map.
   - After server restart, a stored `running` session may point to a process the new server cannot control.
   - Process group termination uses POSIX-style negative PIDs and may not behave correctly on Windows.

5. Frontend project registry stores absolute project paths.
   - Seeded projects canonicalize `apps/web` into an absolute `rootPath`.
   - If `data/frontend-projects/projects.json` is copied to another machine or checkout path, the stored path becomes invalid.
   - Registered projects are constrained to the repository root, which is good, but persisted absolute paths reduce portability.

6. Preview commands are persisted as shell-like strings.
   - Commands are split by a custom parser.
   - This avoids `shell: true`, but the parser is not a full cross-platform command model.
   - A string such as `pnpm --filter @u-build/web dev -- --host 127.0.0.1 --port 5174` should be stored as executable plus args, not reparsed every run.

7. Skill metadata contains a machine-specific repository root.
   - Four agent skills include `repository_root: "/Users/wamat/Desktop/horus.ai"`.
   - This is a direct portability problem if skills are loaded as project metadata or inspected by agents.

8. JSON file writes are not atomic and no locking/migration layer exists.
   - Stores overwrite shared JSON files directly.
   - Concurrent requests can lose updates in `sessions.json`, `projects.json`, workspace indexes, timelines, and revision manifests.
   - There is no storage schema version, migration path, backup, or corruption recovery.

9. Local runtime URLs and CORS are hardcoded.
   - Server CORS allows only `http://localhost:5173`.
   - Preview seed uses `http://localhost:5174`.
   - Vite proxies to `http://localhost:3000`.
   - This is less about persistence, but it affects running consistently across machines, containers, and non-default ports.

## Target Design

### Storage Root

Create a single runtime config module:

- `HORUS_DATA_DIR`: explicit storage root.
- Default for development: `<repo>/.horus/data`.
- Optional production default: platform-specific user data directory only if the app becomes packaged. Until then, prefer explicit `HORUS_DATA_DIR` or repo-local `.horus/data`.
- Resolve the path once with `path.resolve`.
- Reject empty paths and paths that point to files.
- Create subdirectories from this root:
  - `workflows`
  - `workspace`
  - `chat-memory`
  - `frontend-projects`
  - `preview-sessions`
  - `langgraph-checkpoints`

### Store Construction

Replace direct default construction in `createApp()` with:

- `const config = loadRuntimeConfig(process.env)`
- `new JsonStorageAdapter(config.paths.workflowsDir)`
- `new FileWorkspaceStore(config.paths.workspaceDir)`
- `new FileChatMemoryStore(workspaceStore, storage, config.paths.chatMemoryDir)`
- `new FileFrontendProjectRegistry(config.paths.frontendProjectsDir, config.repositoryRoot)`
- `new FilePreviewSessionStore(config.paths.previewSessionsDir)`

Expose a test-only/app-factory override so integration tests can use temp directories without mutating environment variables.

### Durable Workflow Resume

Replace `MemorySaver` with a durable checkpoint implementation or wrap LangGraph checkpoint data under the configured storage root.

Minimum acceptable behavior:

- A workflow awaiting human approval can resume after server restart.
- `getStatus()` can distinguish "state JSON exists" from "checkpoint exists".
- The UI receives a precise recovery state instead of "Start a new workflow" when the checkpoint is recoverable.

If durable LangGraph checkpointer support is not practical immediately, phase in a restart-safe fallback:

- Persist enough HITL continuation data to reconstruct the graph command.
- Mark interrupted states as `awaiting_human_recoverable`.
- Add a recovery test that starts a workflow, reaches HITL, creates a new app instance, and resumes.

### Portable Project Paths

Persist project roots as repository-relative paths when the project is inside the repository.

Suggested schema:

```json
{
  "rootPath": "apps/web",
  "rootPathKind": "repo-relative"
}
```

At runtime, resolve against `repositoryRoot`. Only use absolute paths for explicitly external projects, and then mark them as `external-absolute` with a portability warning.

For existing `projects.json`, add a migration:

- If absolute path is inside current repository root, convert to repo-relative.
- If absolute path is outside the current repository root, keep it but mark it external and validate existence.

### Preview Process Recovery

Treat `processId` as ephemeral runtime metadata, not durable state.

On server startup:

- Scan preview sessions.
- Convert `running`, `starting`, `inspecting`, and `applying` sessions to `stopped` or `unknown`.
- Clear `processId`.
- Add a timeline event such as `preview_recovered_after_restart`.

For Windows support:

- Replace process-group kill assumptions with a platform-aware process manager.
- Prefer a dependency such as `tree-kill` or use Node APIs with `process.platform` branches.
- Add tests for `killProcessGroup` behavior through a small injectable process-killer abstraction.

### Command Model

Store preview commands as structured data:

```ts
{
  executable: "pnpm",
  args: ["--filter", "@u-build/web", "dev", "--", "--host", "127.0.0.1", "--port", "5174"]
}
```

Keep display strings in the UI only. Avoid reparsing persisted command strings.

### Atomic JSON Store Layer

Add a small shared `JsonFileStore` helper:

- `readJson(schema, defaultValue)`
- `writeJsonAtomic(value)`
- write to `<file>.tmp-<pid>-<uuid>`
- `rename` into place
- optional `.bak` before migration
- storage schema version support

Use it in every file-backed store before changing storage format. This reduces data loss risk before larger migrations.

### Machine-Specific Skill Metadata

Remove absolute `repository_root` values from skill files.

Options:

- Replace with `repository_root: "<repo-root>"`.
- Or remove the field entirely if runtime already provides `cwd`.
- Ensure any prompt-visible context uses dynamically resolved root paths, not `/Users/wamat/...`.

### Runtime Ports and Origins

Add config:

- `PORT`
- `HORUS_WEB_ORIGIN`
- `HORUS_PREVIEW_HOST`
- `HORUS_PREVIEW_PORT`
- `HORUS_API_BASE_URL` or Vite `VITE_API_BASE_URL`

Defaults can remain local, but they should be explicit and documented.

## Implementation Phases

### Phase 1 - Centralize Config and Storage Root

1. Add `runtimeConfig.ts`.
2. Add `.env.example` with `HORUS_DATA_DIR=.horus/data`.
3. Update `createApp()` to inject configured paths.
4. Update `.gitignore` to ignore `.horus/`.
5. Keep `data/` ignored for backward compatibility.
6. Add tests proving the server writes all local stores under a temp configured root.

### Phase 2 - Remove Machine-Specific Paths

1. Replace hardcoded `/Users/wamat/Desktop/horus.ai` in skill files.
2. Store frontend project roots as repo-relative values.
3. Add migration for old absolute `projects.json`.
4. Add tests for moving a persisted project registry between two fake repo roots.

### Phase 3 - Make JSON Persistence Safer

1. Add shared atomic JSON read/write helper.
2. Convert workflow, workspace, chat, preview, and registry stores to use it.
3. Add basic schema version fields for persisted collections.
4. Add tests for missing files, invalid JSON, and concurrent-like update ordering where practical.

### Phase 4 - Durable Workflow Resume

1. Replace or augment `MemorySaver` with configured durable checkpoint storage.
2. Persist recoverable HITL continuation metadata.
3. Add restart/resume integration tests.
4. Update API errors to distinguish missing workflow JSON from missing checkpoint.

### Phase 5 - Preview Runtime Portability

1. Mark preview process IDs as ephemeral.
2. Normalize stale sessions on startup.
3. Replace POSIX-specific process-group killing with platform-aware behavior.
4. Convert preview command strings to executable plus args.
5. Add Windows/Linux/macOS-oriented unit coverage for command normalization and process cleanup abstraction.

### Phase 6 - Documentation and Startup Contract

1. Document local data directory behavior in README.
2. Document backup/migration expectations.
3. Add a startup log showing resolved data dir and repository root.
4. Add a smoke test that starts the app with a temporary `HORUS_DATA_DIR` and validates all major persisted areas.

## Acceptance Criteria

- A fresh clone on macOS, Windows, or Linux can start with only documented environment variables.
- No persisted file contains `/Users/wamat` or any checkout-specific absolute path for built-in projects.
- All local data is written under the configured `HORUS_DATA_DIR`.
- Restarting the server does not leave preview sessions falsely marked as controllable.
- A workflow awaiting human input can be resumed after process restart, or is explicitly marked unrecoverable with a documented reason until Phase 4 is complete.
- Tests cover configured data roots, repo-relative project paths, stale preview session recovery, and durable workflow resume.
