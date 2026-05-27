# Runbook

This runbook covers repeatable local operation for Horus.AI. It is written for a fresh clone, not for this workstation.

## Operator Flow

```mermaid
flowchart LR
  Clone["Clone repo"] --> Install["Install dependencies"]
  Install --> Env["Create .env"]
  Env --> Mode{"Persistence mode"}
  Mode -->|"file"| File["Use HORUS_DATA_DIR"]
  Mode -->|"postgres"| Pg["Set DATABASE_URL"]
  File --> Run["pnpm dev"]
  Pg --> Run
  Run --> Health["GET /health"]
  Health --> Validate["pnpm test"]
```

## Command Summary

| Task | Command |
| --- | --- |
| Install | `pnpm install` |
| Develop | `pnpm dev` |
| Build | `pnpm build` |
| Test | `pnpm test` |
| Type-check | `pnpm type-check` |
| Server only | `pnpm --filter @u-build/server dev` |
| Web only | `pnpm --filter @u-build/web dev` |
| Health | `curl http://localhost:3000/health` |

## First Run

Prerequisites:

- Node.js `>=20`
- pnpm `>=9`
- Git

Install dependencies:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install
```

Create local configuration:

```bash
cp .env.example .env
```

Edit `.env` and set a provider/model/key for real agent execution. The app can build without API keys, but LLM-backed workflows need a configured provider.

Start development:

```bash
pnpm dev
```

Check API health:

```bash
curl http://localhost:3000/health
```

## Development Loop

Common commands:

```bash
pnpm type-check
pnpm build
pnpm test
pnpm --filter @u-build/web test:guards
```

Useful package-local commands:

```bash
pnpm --filter @u-build/server dev
pnpm --filter @u-build/web dev
pnpm --filter @u-build/shared build
```

## Production-Like Local Start

```bash
pnpm build
pnpm --filter @u-build/server start
```

The server reads:

- `PORT`, default `3000`
- `HOST`, default behavior is Express listen on all interfaces
- `PERSISTENCE_DRIVER`, default `file`
- `HORUS_DATA_DIR`, default `.horus/data`

## File-Mode Persistence

Default:

```bash
PERSISTENCE_DRIVER=file
HORUS_DATA_DIR=.horus/data
```

To reset file-mode local state:

```bash
rm -rf .horus data apps/server/.horus apps/server/data
```

On Windows PowerShell:

```powershell
Remove-Item -Recurse -Force .horus,data,apps/server/.horus,apps/server/data -ErrorAction SilentlyContinue
```

Only run reset commands when you intentionally want to remove local workflows, chats, previews, generated workspaces, and provider profiles.

## Postgres Mode

Set:

```bash
PERSISTENCE_DRIVER=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/horus
DATABASE_SSL=false
```

Start the server normally. Repository creation runs migrations before serving routes.

Manual migration command:

```bash
pnpm --filter @u-build/server db:migrate
```

Use Postgres mode when you need database-backed durability or want behavior closer to a multi-process deployment.

## Docker Status

Docker runtime is planned by the Docker runtime spec. Until `Dockerfile` and compose files exist and pass validation, the supported run path is pnpm.

Expected future Docker behavior:

- App container exposes the API and web surface.
- File mode uses a named volume for `HORUS_DATA_DIR`.
- Postgres mode uses a compose profile and database health checks.
- Secrets are injected at runtime, never baked into the image.

## LLM Provider Operation

The app supports provider defaults from environment variables and persisted provider profiles through the LLM settings UI/API.

For local development, `.env` fallback is the fastest path:

```bash
LLM_PROVIDER=openai
LLM_MODEL=gpt-5-mini
OPENAI_API_KEY=...
```

If a provider key is missing, build and static UI flows may still work, but LLM-backed agent calls fail when invoked.

## Preview Runtime

The preview runtime starts managed frontend preview processes based on registered project command catalogs.

If preview startup fails:

1. Check the preview session timeline in the UI.
2. Check server logs for command policy or process errors.
3. Verify preview command ids and cwd safety.
4. Verify the preview port is available.
5. Confirm generated project workspaces exist under the configured workspace root.

Relevant env values:

- `HORUS_WEB_PREVIEW_HOST`
- `HORUS_WEB_PREVIEW_PORT`
- `HORUS_WEB_PREVIEW_URL`
- `HORUS_PROJECT_WORKSPACE_ROOT`
- `HORUS_PROJECT_RUN_WORKSPACE_ROOT`

## Troubleshooting

### Port Already In Use

Set another server port:

```bash
PORT=3001 pnpm --filter @u-build/server dev
```

If the frontend has a Vite port conflict, Vite will normally choose another port and print it.

### CORS Errors

Set `CORS_ORIGIN` when frontend and backend run on different origins:

```bash
CORS_ORIGIN=http://localhost:5173
```

Use comma-separated values for multiple origins.

### Workflow Cannot Resume

Check persistence mode and checkpointer state:

- File mode stores checkpoints under `HORUS_DATA_DIR/langgraph-checkpoints`.
- Postgres mode stores checkpoints in the configured database.

If the checkpoint file or database row is gone, start a new workflow.

### Postgres Fails At Startup

Verify:

- `DATABASE_URL`
- `DATABASE_SSL`
- Database reachability
- Migration logs
- User permissions to create/update tables

### Provider Settings Do Not Persist

Check `HORUS_DATA_DIR` and `.horus/data/llm`. Do not commit those files. If file-mode state was reset, provider profiles must be recreated.

### Generated Project Files Are Missing

Check:

- `HORUS_PROJECT_WORKSPACE_ROOT`
- `HORUS_PROJECT_RUN_WORKSPACE_ROOT`
- Project construction run status
- Project file browser errors
- Server logs around project workspace creation

## Validation Checklist Before Handoff

Run:

```bash
pnpm type-check
pnpm build
pnpm test
```

For UI-sensitive changes, also run:

```bash
pnpm --filter @u-build/web test:guards
```
