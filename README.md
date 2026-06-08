# Horus.AI

Horus.AI is a TypeScript multi-agent software delivery console. It receives a user story, creates a technical specification, coordinates implementation and verification agents, validates the result, and exposes the generated project through a React preview UI.

This public repository is intentionally minimal. It contains only the source and operational files required to install, build, run, and reproduce the project.

## Repository Contents

```text
apps/server/      Express API, LangGraph workflow, agents, repositories, preview runtime
apps/web/         React/Vite web application
packages/shared/  Shared Zod schemas and TypeScript contracts
skills/agents/    Runtime skills loaded by the Horus agents
docker/           nginx template for the containerized local web app
scripts/          Operational scripts required by install/build/smoke checks
```

The repository must not include local runtime state, logs, generated builds, documentation folders, internal specs, test folders, screenshots, OpenClaude baselines, experimental UI prototypes, or Markdown files other than this README and agent skill bundles under `skills/agents`.

## Requirements

- Node.js 22
- pnpm 9.15.0
- Git
- Docker and Docker Compose for the containerized local stack

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

For the default OpenAI setup, fill only your API key:

```bash
OPENAI_API_KEY=<your-openai-key>
```

`LLM_PROVIDER=openai` and `LLM_MODEL=gpt-5-mini` are already the defaults. Use the optional provider fields in `.env.example` only if you want OpenRouter or Groq.

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

## Production Build Run

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

For local use, leave `PERSISTENCE_DRIVER`, `HORUS_AUTH_MODE`, and `HORUS_API_TOKEN` unset. Horus will use file persistence under `.horus/data` and no local auth token.

## Docker Run

Docker is the clean-machine path for people who want to run the shipped app without managing local Node processes. It builds the source from scratch, starts the API with file persistence, serves the built web app through nginx, and persists Horus state in the `horus-data` Docker volume.

Create the local env file and add your API key:

```bash
cp .env.example .env
```

Run:

```bash
docker compose up --build
```

Default Docker endpoints:

```text
Web UI: http://localhost:8080
API through web proxy: http://localhost:8080/api
Health: http://localhost:8080/health
Ready: http://localhost:8080/ready
Direct API: http://localhost:3001
```

Smoke check:

```bash
pnpm verify:docker
```

Stop the stack:

```bash
docker compose down
```

Reset all local Docker state:

```bash
docker compose down -v
```

## Clean-Machine Reproduction

Use this sequence on a fresh machine:

```bash
git clone https://github.com/Gabriel-Wamat/horus.git
cd horus
corepack prepare pnpm@9.15.0 --activate || npm install -g pnpm@9.15.0
pnpm install --frozen-lockfile
pnpm verify:ci
cp .env.example .env
# edit .env and set OPENAI_API_KEY
docker compose up --build
pnpm verify:docker
```

Expected result:

- dependencies install from `pnpm-lock.yaml`
- TypeScript validation passes
- secret scan passes
- production build passes
- Docker stack becomes healthy
- `pnpm verify:docker` succeeds against `http://localhost:8080`

## Production Notes

For a real multi-user deployment, configure explicit production settings instead of the local defaults:

```bash
HORUS_ENV=production
HORUS_AUTH_MODE=token
HORUS_API_TOKEN=<server-token>
HORUS_TENANT_ID=<tenant-id>
PERSISTENCE_DRIVER=postgres
DATABASE_URL=<postgres-url>
CORS_ORIGIN=<allowed-origin>
```

The local Docker Compose file is intentionally optimized for first-run usability. Production deployments should provide their own database, secret management, TLS, and reverse proxy policy.

## Troubleshooting

- Missing provider key: configure `.env` or a provider profile in the UI.
- Port conflict: set `PORT`, `HOST`, or Compose port mappings.
- CORS issue: set `CORS_ORIGIN` only when using split frontend/API origins.
- Lost local state: verify `HORUS_DATA_DIR` and `PERSISTENCE_DRIVER`.
- Postgres startup failure: only applies when `PERSISTENCE_DRIVER=postgres`; verify `DATABASE_URL`, `DATABASE_SSL`, and migration logs.
- Docker hangs or fails with `input/output error`: inspect Docker Desktop logs for `EXT4-fs` or `vda1` read-only errors. That is a local Docker VM disk problem. Restart Docker Desktop first; if it remains read-only, repair or reset Docker Desktop data before rerunning the stack.

## License

This project is not licensed for commercial use.

Horus.AI is distributed under the Horus.AI Restricted Non-Commercial License in `LICENSE`.
