# Horus.AI

Horus.AI is a TypeScript multi-agent software delivery console. It receives a user story, creates a technical specification, coordinates implementation and verification agents, validates the result, and exposes the generated project through a React preview UI.

This public repository is intentionally minimal. It contains only the source and operational files required to install, build, run, and reproduce the project.

## Repository Contents

```text
apps/server/      Express API, LangGraph workflow, agents, repositories, preview runtime
apps/web/         React/Vite web application
packages/shared/  Shared Zod schemas and TypeScript contracts
docker/           nginx template for the pre-staging web container
scripts/          Operational scripts required by install/build/smoke checks
```

The repository must not include local runtime state, logs, generated builds, documentation folders, internal specs, test folders, screenshots, OpenClaude baselines, or Markdown files other than this README.

## Requirements

- Node.js 22
- pnpm 9.15.0
- Git
- Docker and Docker Compose for the pre-staging stack

The repo includes `.node-version` and `packageManager` metadata. If Corepack can manage pnpm on your machine:

```bash
corepack prepare pnpm@9.15.0 --activate
```

If Corepack cannot create global shims on your machine, install pnpm through your preferred Node package manager:

```bash
npm install -g pnpm@9.15.0
```

## Environment

Create a local environment file:

```bash
cp .env.example .env
```

Set at least one real provider key before using LLM-backed agents:

```bash
LLM_PROVIDER=openai
LLM_MODEL=<provider-model>
OPENAI_API_KEY=<your-key>
```

Never commit `.env`, `.env.*.local`, `.horus/`, `data/`, logs, generated workspaces, or build output.

## Local Development

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Run the development stack:

```bash
pnpm dev
```

Default local endpoints:

```text
API: http://localhost:3001
Web: http://localhost:5173
```

Health check:

```bash
curl http://localhost:3001/health
```

## Validation

Run the reproducibility gate used by CI:

```bash
pnpm verify:ci
```

That command runs:

```bash
pnpm lint
pnpm type-check
pnpm security:secrets
pnpm build
```

This public distribution does not include test folders. Internal test suites and specs stay local/private and must not be committed to this repository.

## Production-Like Local Run

Build all shipped packages:

```bash
pnpm build
```

Start the API:

```bash
pnpm --filter @u-build/server start
```

The server entrypoint is:

```text
apps/server/dist/main.js
```

Runtime behavior is configured through environment variables such as `PORT`, `HOST`, `PERSISTENCE_DRIVER`, `DATABASE_URL`, `HORUS_AUTH_MODE`, `HORUS_API_TOKEN`, and provider settings.

## Pre-Staging With Docker

The Docker Compose stack is the reproducible pre-staging path. It builds the source from scratch, starts Postgres and Redis, applies database migrations before the API starts, serves the built web app through nginx, and proxies `/api` to the API with configured Horus auth headers.

Create a pre-staging env file:

```bash
cp .env.prestaging.example .env.prestaging.local
```

Edit `.env.prestaging.local` with local-only secrets, then run:

```bash
docker compose --env-file .env.prestaging.local up --build
```

Default pre-staging endpoints:

```text
Web UI: http://localhost:8080
API through web proxy: http://localhost:8080/api
Health: http://localhost:8080/health
Ready: http://localhost:8080/ready
Direct API: http://localhost:3001
```

Smoke check:

```bash
pnpm verify:prestage
```

Stop the stack:

```bash
docker compose --env-file .env.prestaging.local down
```

Reset all pre-staging database state:

```bash
docker compose --env-file .env.prestaging.local down -v
```

## Clean-Machine Reproduction

Use this sequence on a fresh machine:

```bash
git clone https://github.com/Gabriel-Wamat/horus.git
cd horus
corepack prepare pnpm@9.15.0 --activate || npm install -g pnpm@9.15.0
pnpm install --frozen-lockfile
pnpm verify:ci
cp .env.prestaging.example .env.prestaging.local
docker compose --env-file .env.prestaging.local up --build
pnpm verify:prestage
```

Expected result:

- dependencies install from `pnpm-lock.yaml`
- TypeScript validation passes
- secret scan passes
- production build passes
- Docker pre-staging stack becomes healthy
- `pnpm verify:prestage` succeeds against `http://localhost:8080`

## Troubleshooting

- Missing provider key: configure `.env` or a provider profile in the UI.
- Port conflict: set `PORT`, `HOST`, or Compose port mappings.
- CORS issue: set `CORS_ORIGIN` for split frontend/API origins.
- Lost local state: verify `HORUS_DATA_DIR` and `PERSISTENCE_DRIVER`.
- Postgres startup failure: verify `DATABASE_URL`, `DATABASE_SSL`, and migration logs.
- Docker hangs or fails with `input/output error`: inspect Docker Desktop logs for `EXT4-fs` or `vda1` read-only errors. That is a local Docker VM disk problem. Restart Docker Desktop first; if it remains read-only, repair or reset Docker Desktop data before rerunning pre-staging.

## License

This project is not licensed for commercial use.

Horus.AI is distributed under the Horus.AI Restricted Non-Commercial License in `LICENSE`.
