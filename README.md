# Horus.AI

Horus.AI is an autonomous multi-agent interface generation system. It receives user stories, transforms them into technical specifications (SDDs), coordinates implementation and quality control agents, validates the generated work through a curator, and exposes the resulting project, preview, files, and execution evidence.

This branch is a reproducibility snapshot of the local Horus workspace. It includes the application source, operational specs, selected runtime data, generated project workspaces, local guidance files, and evidence artifacts needed to inspect the project close to its local machine state.

## Repository Contents

```text
apps/server/      Express API, LangGraph workflow, agents, repositories, preview runtime
apps/web/         React/Vite web application
packages/shared/  Shared Zod schemas and TypeScript contracts
skills/agents/    Runtime skills loaded by the Horus agents
docker/           nginx template for the containerized local web app
scripts/          Operational scripts required by install/build/smoke checks
docs/spec/        Historical and active implementation specifications
spec/             Local implementation specs used during agentic development
data/             Versioned local runtime snapshot and generated project workspaces
.horus/artifacts/ Browser smoke reports and preview evidence images
```

The snapshot still excludes secrets, `.env` files, local package dependencies, build outputs, caches, nested Git repositories, and machine-specific LLM credential stores.

## System Flow

```mermaid
flowchart LR
  UserStory["User Story"] --> Spec["Spec Agent"]
  Spec --> ODIN["ODIN"]
  ODIN --> Front["Front Agent"]
  ODIN --> QA["QA Agent"]
  Front --> Curator["Curator"]
  QA --> Curator
  Curator -- "Pass" --> Output["Preview / Files / Evidence"]
  Curator -- "Fail" --> ODIN

  Spec -. "events" .-> Telemetry["Telemetry Collector"]
  ODIN -. "routing trace" .-> Telemetry
  Front -. "file ops / diffs / shell output" .-> Telemetry
  QA -. "validation commands / retries" .-> Telemetry
  Curator -. "verdict / quality gates" .-> Telemetry
  Telemetry --> Timeline["Execution Console / Operation Timeline"]
  Timeline --> Output
```

Telemetry is collected during the same agent execution flow, not as a separate after-the-fact report. Each agent emits structured operational events with the current task/session identifiers, touched files, command output, diffs, retries, validation status, failures, and final verdict. The web console projects those events into a navigable execution timeline so the operator can inspect what changed, which commands ran, why a retry happened, and which evidence supported the final preview.

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

`LLM_PROVIDER=openai` is already the default. Horus chooses a provider-specific default model when `LLM_MODEL` is unset. Use the optional provider fields in `.env.example` only if you want OpenRouter or Groq.

Provider examples:

```bash
# OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=<your-openai-key>

# OpenRouter
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=<your-openrouter-key>

# Groq
LLM_PROVIDER=groq
GROQ_API_KEY=<your-groq-key>
```

Set `LLM_MODEL` only when you want to override the provider default.

Never commit `.env`, `.env.*.local`, API keys, LLM credential stores, package dependencies, nested `.git` folders, logs, caches, or build output. Runtime data and generated project workspaces are versioned only when they are part of an explicit reproducibility snapshot.

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
API: http://<HORUS_API_PROXY_HOST>:<HORUS_API_PROXY_PORT>
Web: http://<HORUS_WEB_DEV_HOST>:<HORUS_WEB_DEV_PORT>
```

Set the host values to the browser-facing hostname or IP for the machine running
Horus:

```text
HORUS_PUBLIC_HOST=<host-reachable-from-your-browser>
HORUS_API_PROXY_HOST=<host-reachable-from-your-browser>
HORUS_WEB_DEV_HOST=0.0.0.0
HORUS_WEB_PREVIEW_HOST=0.0.0.0
HORUS_WEB_PREVIEW_PUBLIC_HOST=<host-reachable-from-your-browser>
```

Health check:

```bash
curl "http://${HORUS_API_PROXY_HOST}:${HORUS_API_PROXY_PORT}/health"
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
pnpm verify:llm-providers
```

This reproducibility branch includes the local specs, selected test suites, generated project workspaces, user stories, and Horus runtime data needed to inspect the project state. Secrets, `.env` files, credential stores, dependencies, build outputs, caches, and nested Git metadata stay out of Git.

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

Runtime behavior for local use is intentionally small: choose an LLM provider, set the matching API key, and optionally change `PORT`, `HOST`, `CORS_ORIGIN`, or `HORUS_DATA_DIR`.

By default, Horus uses file persistence under `.horus/data` and does not require a local auth token or database.

## Docker Run

Docker is the clean-machine path for people who want to run the shipped app without managing local Node processes. It builds the source from scratch, starts the API with file persistence, serves the built web app through nginx, and persists Horus state in the `horus-data` Docker volume. Local `HORUS_DATA_DIR` values are not reused as container mount targets; set `HORUS_DOCKER_DATA_DIR` only if you need to change the internal container path.

Create the local env file and add your API key:

```bash
cp .env.example .env
```

Run:

```bash
HORUS_PUBLIC_HOST=<host-reachable-from-your-browser> docker compose up --build
```

Default Docker endpoints:

```text
Web UI: <HORUS_DOCKER_BASE_URL>
API through web proxy: <HORUS_DOCKER_BASE_URL>/api
Health: <HORUS_DOCKER_BASE_URL>/health
Ready: <HORUS_DOCKER_BASE_URL>/ready
Direct API: http://<HORUS_PUBLIC_HOST>:<HORUS_API_HOST_PORT>
```

Set `HORUS_DOCKER_BASE_URL` to the browser-facing web URL before running the
Docker smoke script. The Compose default web host port is `8080`, but the host
must be explicit because it changes across local machines, Windows/WSL, remote
desktops, and team demos.

Override host/container ports without editing Compose:

```bash
HORUS_PUBLIC_HOST=<host-reachable-from-your-browser> HORUS_WEB_HOST_PORT=18080 HORUS_API_HOST_PORT=13001 docker compose up --build
HORUS_DOCKER_BASE_URL=http://<host-reachable-from-your-browser>:18080 pnpm verify:docker
```

Smoke check:

```bash
HORUS_DOCKER_BASE_URL=http://<host-reachable-from-your-browser>:8080 pnpm verify:docker
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
git clone https://github.com/Gabriel-Wamat/horus.ai.git
cd horus.ai
corepack prepare pnpm@9.15.0 --activate || npm install -g pnpm@9.15.0
pnpm install --frozen-lockfile
pnpm verify:ci
cp .env.example .env
# edit .env and set OPENAI_API_KEY plus HORUS_PUBLIC_HOST
HORUS_PUBLIC_HOST=<host-reachable-from-your-browser> docker compose up --build
HORUS_DOCKER_BASE_URL=http://<host-reachable-from-your-browser>:8080 pnpm verify:docker
```

Expected result:

- dependencies install from `pnpm-lock.yaml`
- TypeScript validation passes
- secret scan passes
- production build passes
- Docker stack becomes healthy
- `pnpm verify:docker` succeeds against `HORUS_DOCKER_BASE_URL`

## Troubleshooting

- Missing provider key: configure `.env` or a provider profile in the UI.
- Port conflict: set `PORT`, `HOST`, or Compose port mappings.
- CORS issue: set `CORS_ORIGIN` only when using split frontend/API origins.
- Lost local state: verify local `HORUS_DATA_DIR`, Docker `HORUS_DOCKER_DATA_DIR`, or the `horus-data` Docker volume.
- Docker hangs or fails with `input/output error`: inspect Docker Desktop logs for `EXT4-fs` or `vda1` read-only errors. That is a local Docker VM disk problem. Restart Docker Desktop first; if it remains read-only, repair or reset Docker Desktop data before rerunning the stack.

## License

This project is not licensed for commercial use.

Horus.AI is distributed under the Horus.AI Restricted Non-Commercial License in `LICENSE`.
