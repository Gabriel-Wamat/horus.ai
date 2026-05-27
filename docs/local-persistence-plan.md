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
   - `FileCodeChangeSetRepository` defaults to `./data/code-change-sets`.
   - `FileWorkflowEventLogRepository` defaults to `./data/workflow-events`.
   - `FileProjectConstructionRepository` defaults to `./data/project-construction`.
   - `ProjectWorkspaceService` defaults generated project roots to `data/project-workspaces` and run worktrees to `data/project-run-worktrees`.
   - These paths are portable at the Node API level, but they are not stable across `cwd` changes, Docker/service execution, packaged builds, or different launch scripts.

2. Dependency injection does not centralize persistence configuration.
   - `createApp()` now accepts injected repositories and calls `createRepositories(env)`, which is a good seam.
   - The file-backed `createRepositories()` path still constructs every file repository with default `./data/...` paths.
   - There is no single app config object or environment contract such as `HORUS_DATA_DIR` for the file driver.
   - Tests can inject repositories directly, but production file mode cannot move all local state with one setting.

3. Workflow persistence is driver-dependent and inconsistent.
   - Workflow snapshots are saved as JSON.
   - Postgres mode uses `PostgresSaver`, which is the right durable direction.
   - File mode still returns `MemorySaver`.
   - Human-in-the-loop resume in file mode can fail after process restart because the checkpoint is only in memory.
   - This means the default local mode cannot fully restore an interrupted workflow from local files.

4. Preview process state is persisted as if it were durable.
   - `PreviewSession` stores `processId`.
   - `ProcessBrowserPreviewAdapter` keeps live children in an in-memory map.
   - After server restart, a stored `running` session may point to a process the new server cannot control.
   - Process cleanup should be reviewed for Windows behavior; process groups and signal semantics are not portable in the same way across macOS/Linux/Windows.

5. Frontend project registry stores absolute project paths.
   - Seeded projects canonicalize `apps/web` into an absolute `rootPath`.
   - If `data/frontend-projects/projects.json` is copied to another machine or checkout path, the stored path becomes invalid.
   - Registered projects are constrained to the repository root, which is good, but persisted absolute paths reduce portability.

6. Preview commands are persisted as shell-like strings.
   - The newer preview model has a `commandCatalog` with executable plus args, which is the right shape.
   - The legacy `devCommand` string remains in the schema and seed data as a fallback.
   - The migration should make `commandCatalog` authoritative and keep `devCommand` display-only or remove it after compatibility is no longer needed.

7. Skill metadata contains a machine-specific repository root.
   - Some agent skills include an absolute `repository_root` value.
   - This is a direct portability problem if skills are loaded as project metadata or inspected by agents.

8. JSON file writes are not atomic and no locking/migration layer exists.
   - Stores overwrite shared JSON files directly.
   - Concurrent requests can lose updates in `sessions.json`, `projects.json`, workspace indexes, timelines, event logs, project-construction arrays, and revision manifests.
   - There is no storage schema version, migration path, backup, or corruption recovery.

9. Local runtime URLs and CORS are hardcoded.
   - Server CORS is configurable through `CORS_ORIGIN`, which is good.
   - Preview seed uses `HORUS_WEB_PREVIEW_*` settings, also good.
   - Vite proxies to `http://localhost:3000`.
   - Generated project preview settings have separate `HORUS_GENERATED_PROJECT_PREVIEW_*` defaults.
   - This is less about persistence, but it affects running consistently across machines, containers, and non-default ports.

10. Postgres mode solves some persistence problems but is not the local portability answer by itself.
   - Postgres gives durable workflow state/checkpoints and central persistence when configured.
   - A fresh clone still defaults to file mode.
   - The project still needs a robust file-mode contract for "runs on any machine" without requiring an external database.
   - If Postgres is supported as an option, the README and `.env.example` must document `PERSISTENCE_DRIVER`, `DATABASE_URL`, `DATABASE_SSL`, and migration behavior.

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
  - `code-change-sets`
  - `workflow-events`
  - `project-construction`
  - `project-workspaces`
  - `project-run-worktrees`
  - `langgraph-checkpoints`

### Store Construction

Replace direct default construction in `createApp()` with:

- `const config = loadRuntimeConfig(process.env)`
- `createRepositories(config)` or `createRepositories(env, config)`.
- File repositories must receive explicit paths from `config.paths`.
- Project workspace services must receive explicit generated-project roots from `config.paths`.

Expose a test-only/app-factory override so integration tests can use temp directories without mutating environment variables.

### Durable Workflow Resume

For Postgres mode, keep `PostgresSaver`.

For file mode, replace `MemorySaver` with a durable checkpoint implementation or wrap LangGraph checkpoint data under the configured storage root.

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

Apply the same rule to generated project construction data:

- Persist generated project workspaces relative to `HORUS_DATA_DIR` when they are managed by Horus.
- Only persist external absolute paths for user-selected existing repositories.
- Mark external repositories explicitly so the UI can explain that they are machine-local.

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

Migration rule:

- Prefer `previewCommandId` plus `commandCatalog`.
- If only legacy `devCommand` exists, parse it once during migration and store the resulting command object when safe.
- Keep legacy `devCommand` only as a display/backward-compatibility field.

### Atomic JSON Store Layer

Add a small shared `JsonFileStore` helper:

- `readJson(schema, defaultValue)`
- `writeJsonAtomic(value)`
- write to `<file>.tmp-<pid>-<uuid>`
- `rename` into place
- optional `.bak` before migration
- storage schema version support

Use it in every file-backed store before changing storage format. This reduces data loss risk before larger migrations.

File-backed stores in scope:

- workflow state
- workspace folders/stories/specs
- chat sessions/messages
- frontend projects
- preview sessions/timelines/drafts
- code change sets
- workflow event logs
- project construction workspaces/runs/commands/quality gates
- project config and manifest writes inside generated project roots

### Machine-Specific Skill Metadata

Remove absolute `repository_root` values from skill files.

Options:

- Replace with `repository_root: "<repo-root>"`.
- Or remove the field entirely if runtime already provides `cwd`.
- Ensure any prompt-visible context uses dynamically resolved root paths, not checkout-specific absolute paths.

### Runtime Ports and Origins

Add config:

- `PORT`
- `HORUS_WEB_ORIGIN`
- `HORUS_PREVIEW_HOST`
- `HORUS_PREVIEW_PORT`
- `HORUS_API_BASE_URL` or Vite `VITE_API_BASE_URL`

Defaults can remain local, but they should be explicit and documented.

Keep the already added settings:

- `CORS_ORIGIN`
- `HORUS_WEB_PROJECT_ROOT`
- `HORUS_WEB_PREVIEW_HOST`
- `HORUS_WEB_PREVIEW_PORT`
- `HORUS_WEB_PREVIEW_URL`
- `HORUS_GENERATED_PROJECT_PREVIEW_HOST`
- `HORUS_GENERATED_PROJECT_PREVIEW_PORT`

Add missing single-root settings:

- `HORUS_DATA_DIR`
- `HORUS_PROJECT_WORKSPACE_ROOT`, defaulting to `${HORUS_DATA_DIR}/project-workspaces`
- `HORUS_PROJECT_RUN_WORKSPACE_ROOT`, defaulting to `${HORUS_DATA_DIR}/project-run-worktrees`

## Implementation Phases

### Phase 1 - Centralize Config and Storage Root

1. Add `runtimeConfig.ts`.
2. Add `.env.example` with `HORUS_DATA_DIR=.horus/data`.
3. Update `createRepositories()` to inject configured paths into every file-backed repository.
4. Update `.gitignore` to ignore `.horus/`.
5. Keep `data/` ignored for backward compatibility.
6. Add tests proving the server writes all local stores under a temp configured root, including workflow events, code change sets, project construction, generated project workspaces, and run worktrees.

### Phase 2 - Remove Machine-Specific Paths

1. Replace hardcoded checkout-specific absolute paths in skill files.
2. Store frontend project roots as repo-relative values.
3. Add migration for old absolute `projects.json`.
4. Add tests for moving a persisted project registry between two fake repo roots.

### Phase 3 - Make JSON Persistence Safer

1. Add shared atomic JSON read/write helper.
2. Convert workflow, workspace, chat, preview, and registry stores to use it.
3. Add basic schema version fields for persisted collections.
4. Add tests for missing files, invalid JSON, and concurrent-like update ordering where practical.

### Phase 4 - Durable Workflow Resume

1. Keep `PostgresSaver` for Postgres mode.
2. Replace or augment `MemorySaver` with configured durable checkpoint storage for file mode.
3. Persist recoverable HITL continuation metadata.
4. Add restart/resume integration tests for file mode and Postgres mode.
5. Update API errors to distinguish missing workflow JSON from missing checkpoint.

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
4. Document Postgres mode separately from file mode.
5. Add a smoke test that starts the app with a temporary `HORUS_DATA_DIR` and validates all major persisted areas.

## Acceptance Criteria

- A fresh clone on macOS, Windows, or Linux can start with only documented environment variables.
- No persisted file contains any checkout-specific absolute path for built-in projects.
- All local data is written under the configured `HORUS_DATA_DIR`.
- Restarting the server does not leave preview sessions falsely marked as controllable.
- A workflow awaiting human input can be resumed after process restart, or is explicitly marked unrecoverable with a documented reason until Phase 4 is complete.
- Tests cover configured data roots, repo-relative project paths, stale preview session recovery, and durable workflow resume.
