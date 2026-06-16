# Horus Release Checklist

## Required Gates

- `pnpm verify:ci` passes locally or in CI.
- `node --test apps/server/test/*.test.mjs` passes after `@u-build/server` build.
- `HORUS_PUBLIC_HOST=<host-reachable-from-your-browser> docker compose config` renders without warnings.
- `HORUS_PUBLIC_HOST=<host-reachable-from-your-browser> docker compose up -d --build --wait` reaches healthy `api` and `web`.
- `pnpm verify:docker` passes against the explicit `HORUS_DOCKER_BASE_URL`.
- `pnpm security:secrets` reports no high-confidence secrets.

## Persistence And Migrations

- File persistence is allowed only for local single-user runs with `HORUS_ALLOW_FILE_DRIVER_IN_PRODUCTION=true`.
- Multi-user or production runs must use `PERSISTENCE_DRIVER=postgres`.
- For Postgres releases, run `docker compose --profile postgres up migrate` before promoting the API.
- Confirm `/ready` returns 200 after migrations.
- Keep `horus-data` and `horus-postgres` volumes backed up before destructive changes.

## Runtime Smoke

- Open the web app at the configured `HORUS_DOCKER_BASE_URL`.
- Start a project construction run from specs.
- Confirm project appears in the file tree immediately.
- Confirm preview session starts and `/api/preview/projects` returns 200.
- Confirm Curator blocks incomplete runtime evidence instead of marking pass.

## Rollback

- Keep the previous image tag deployable until runtime smoke passes.
- If migrations fail, stop API promotion and restore the database volume/snapshot.
- If preview ports fail, stop generated preview sessions and redeploy with a clean `HORUS_DATA_DIR`.
- Record failed release evidence: commit SHA, command output, `/ready` response, Docker logs, and migration id.
