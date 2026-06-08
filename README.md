# Horus.AI

Horus.AI is an autonomous multi-agent interface generation system. It receives user stories, transforms them into technical specifications (SDDs), coordinates implementation and quality control agents, validates the generated work through a curator, and exposes the resulting project, preview, files, and execution evidence.

## Documentation Map

| Start Here | Use It For |
| --- | --- |
| [Technical documentation site](https://docs-three-coral.vercel.app/docs) | Public Fumadocs documentation with search, architecture diagrams, configuration, runbooks, and contribution guidance |
| `apps/docs` | Source for the documentation site |
| [Quick Start](https://docs-three-coral.vercel.app/docs/quickstart) | Clean-clone setup and local development |
| [Architecture](https://docs-three-coral.vercel.app/docs/architecture) | System design, agents, persistence, preview runtime |
| [Runbook](https://docs-three-coral.vercel.app/docs/runbook) | Running, validating, resetting, troubleshooting |
| [Configuration](https://docs-three-coral.vercel.app/docs/configuration) | Environment variables and secret handling |

## What It Does

- Converts user stories into versioned technical specs.
- Orchestrates Spec, ODIN, Frontend, QA, and Curator agents through LangGraph.
- Runs a validation loop with retry and human-in-the-loop checkpoints.
- Persists workspaces, specs, chats, workflow state, preview sessions, and generated project metadata.
- Supports file-mode local persistence and optional Postgres persistence.
- Provides a visual preview console, project file browser, run-flow view, LLM settings UI, and chat-driven code-change loop.
- Stores runtime evidence for previews, quality gates, command execution, and agent progress.

## System Flow

```mermaid
flowchart LR
  Story["User Story"] --> Spec["Spec Agent"]
  Spec --> Odin["ODIN"]
  Odin --> Front["Front Agent"]
  Odin --> QA["QA Agent"]
  Front --> Curator["Curator"]
  QA --> Curator
  Curator -->|"Fail"| Odin
  Curator -->|"Pass"| Preview["Preview / Files / Evidence"]
```

## Repository Layout

```text
apps/
  server/        Express API, LangGraph workflow, repositories, agents, preview runtime
  web/           React/Vite application
packages/
  shared/        Zod schemas, shared entities, and ports
skills/
  agents/        Product runtime skills used by Horus agents
tools/           Project-owned tool notes and future reusable tooling
docs/            Supplemental engineering notes
```

## First Run

| Step | Command |
| --- | --- |
| Enable package manager | `corepack enable` |
| Pin pnpm | `corepack prepare pnpm@9.15.0 --activate` |
| Install dependencies | `pnpm install` |
| Create env file | `cp .env.example .env` |
| Start dev stack | `pnpm dev` |
| Check API | `curl http://localhost:3000/health` |

## Requirements

- Node.js `>=20`
- pnpm `>=9`
- Git
- Optional: Postgres, when using `PERSISTENCE_DRIVER=postgres`
- Optional: Docker, once the Docker runtime from the Docker spec is implemented

Use Corepack so the repo uses the pinned pnpm version from `package.json`:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

## Setup

```bash
pnpm install
cp .env.example .env
```

Then edit `.env` with the provider/model you want to use. At least one provider key is needed for real LLM-backed agent generation:

```bash
LLM_PROVIDER=openai
LLM_MODEL=<provider-model>
OPENAI_API_KEY=...
```

Never commit `.env`, `.horus/`, or `data/`.

## Run Locally

Start the full development stack:

```bash
pnpm dev
```

The server defaults to `http://localhost:3000`. The Vite frontend runs on its Vite dev port and calls the API through the local development configuration.

Health check:

```bash
curl http://localhost:3000/health
```

## Production-Like Local Run

```bash
pnpm build
pnpm --filter @u-build/server start
```

The server entrypoint is `apps/server/dist/main.js`. It reads `PORT`, `HOST`, persistence settings, and provider settings from the environment.

## Docker

Docker support is planned in the local Docker runtime spec and should be implemented before presenting Docker as the primary run path. Until Docker artifacts exist and pass validation, use the pnpm workflow above.

When Docker is implemented, the expected contract is:

- File-mode runtime with a named volume for `HORUS_DATA_DIR`.
- Optional Postgres profile using `PERSISTENCE_DRIVER=postgres`.
- No API keys or local paths baked into images.
- Browser-facing web/API access through host-mapped ports.

See [docs/runbook.md](docs/runbook.md) for the operational runbook and Docker status notes.

## Technical Documentation Site

The polished technical documentation lives in `apps/docs`, built with Unmint-style Next.js + Fumadocs.

Public URL:

```text
https://docs-three-coral.vercel.app/docs
```

```bash
pnpm --filter @u-build/docs dev
pnpm --filter @u-build/docs build
```

Local URL:

```text
http://localhost:3002/docs
```

## Persistence

Horus supports two persistence modes:

- `file`: local JSON stores under `HORUS_DATA_DIR`.
- `postgres`: Postgres repositories and Postgres LangGraph checkpoints.

Default file-mode configuration:

```bash
PERSISTENCE_DRIVER=file
HORUS_DATA_DIR=.horus/data
```

File-mode state includes workflows, workspace artifacts, chat memory, preview sessions, frontend project registry data, project construction metadata, workflow events, generated project workspaces, and file-backed LangGraph checkpoints.

Postgres mode:

```bash
PERSISTENCE_DRIVER=postgres
DATABASE_URL=postgresql://user:password@host:5432/horus
DATABASE_SSL=false
```

More detail is in [docs/configuration.md](docs/configuration.md) and [docs/runbook.md](docs/runbook.md).

## LLM Providers

Supported provider configuration is environment-driven and also exposed through the LLM settings API/UI:

- OpenAI
- OpenRouter
- Groq

Global defaults:

```bash
LLM_PROVIDER=openai
LLM_MODEL=<provider-model>
```

Per-agent overrides are available for Spec, Front, QA, and Curator agents. See `.env.example` and [docs/configuration.md](docs/configuration.md).

## Validation

Run the main validation suite:

```bash
pnpm type-check
pnpm build
pnpm test
```

`pnpm test` builds the workspace and runs shared/server Node test suites. The web package also has frontend regression guards:

```bash
pnpm --filter @u-build/web test:guards
```

## Core Workflow

At a high level:

1. The user creates or selects a user story.
2. The Spec Agent generates or updates the technical specification.
3. ODIN routes work to Front and QA agents.
4. Front proposes code changes.
5. QA produces validation expectations and evidence.
6. Curator compares implementation, tests, runtime evidence, and spec.
7. ODIN either routes a retry or completes the workflow.
8. Approved changes are applied and surfaced through previews, files, and run-flow evidence.

The full architecture is documented in [docs/architecture.md](docs/architecture.md).

## Troubleshooting

- Missing provider key: configure `.env` or save a provider profile in the UI.
- Port conflict: set `PORT` and, if needed, `HOST`.
- CORS issue: set `CORS_ORIGIN` for split frontend/API origins.
- Lost local state: verify `HORUS_DATA_DIR` and whether you are using `file` or `postgres`.
- Preview cannot start: verify the project command catalog and preview port settings.
- Postgres startup failure: verify `DATABASE_URL`, `DATABASE_SSL`, and migration logs.

More operational detail is in [docs/runbook.md](docs/runbook.md).

## Further Documentation

- [Visual Documentation Index](docs/index.md)
- [Architecture](docs/architecture.md)
- [Runbook](docs/runbook.md)
- [Configuration](docs/configuration.md)
- [Chronology](docs/chronology.md)
- [Contributing](docs/contributing.md)
- [Project-local agent skills](skills/README.md)
- [Tools workspace](tools/README.md)
