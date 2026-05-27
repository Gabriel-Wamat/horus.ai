# Contributing

This guide captures the engineering expectations for changing Horus.AI.

## Principles

- Read the owning module before editing it.
- Prefer existing patterns over new abstractions.
- Keep domain, application, infrastructure, web, and shared contracts separated.
- Preserve runtime validation and evidence semantics.
- Do not introduce machine-specific paths.
- Do not commit local state, secrets, generated workspaces, or local specs.
- Run focused validation first, then broader validation when risk warrants it.

## Project Boundaries

Use these ownership boundaries:

- `packages/shared`: shared Zod schemas, entities, and ports.
- `apps/server/src/domain`: core workflow behavior and domain-level services.
- `apps/server/src/application`: use cases, service orchestration, mapping, tool registry, validation aggregation.
- `apps/server/src/infrastructure`: concrete adapters, HTTP routes, repositories, LangGraph nodes, agents, LLM providers, preview runtime, project workspaces.
- `apps/web/src`: React UI, client APIs, hooks, and frontend state.
- `skills/agents`: product runtime instructions for agents.
- `docs`: public engineering documentation.
- `spec`: local-only implementation specs, not intended for GitHub.

## Adding or Changing Shared Schemas

When changing `packages/shared`:

1. Update the Zod schema.
2. Export it from `packages/shared/src/index.ts` if it is part of the public shared contract.
3. Update server and web consumers.
4. Add or update tests under `packages/shared/test`.
5. Run:

```bash
pnpm --filter @u-build/shared build
pnpm test
```

## Changing Persistence

Persistence changes must preserve both modes unless the change is explicitly mode-specific:

- File mode under `HORUS_DATA_DIR`.
- Postgres mode through repository classes and migrations.

Rules:

- Do not write local state into source directories by default.
- Use atomic writes for file-mode JSON state.
- Add migration tests for Postgres schema changes.
- Keep repository contracts stable where possible.
- Do not persist raw secrets in ordinary workflow/chat/event records.

Relevant files:

- `apps/server/src/infrastructure/repositories/contracts.ts`
- `apps/server/src/infrastructure/repositories/createRepositories.ts`
- `apps/server/src/infrastructure/config/runtimeConfig.ts`
- `apps/server/src/infrastructure/storage/JsonFileStore.ts`
- `apps/server/src/infrastructure/database/migrations`

## Changing the Agent Workflow

Workflow changes must be explicit about routing and completion semantics.

Relevant files:

- `apps/server/src/infrastructure/langgraph/graph.ts`
- `apps/server/src/infrastructure/langgraph/state.ts`
- `apps/server/src/domain/services/WorkflowOrchestrator.ts`
- `apps/server/src/infrastructure/langgraph/nodes`
- `apps/server/src/application/services/ValidationGateAggregator.ts`

Rules:

- Prevent infinite loops.
- Preserve human-in-the-loop checkpoints.
- Preserve Curator approval before applying Front Agent changes.
- Preserve run-flow evidence and workflow events.
- Add tests for routing, retry, and terminal statuses.

## Changing Agent Skills

Project-local skills live in `skills/agents`. They are product runtime instructions, not Codex skills.

Rules:

- Keep each skill specific to its agent.
- Preserve the skill metadata and validation sections.
- Do not include secrets or local machine paths.
- Run:

```bash
python3 skills/scripts/quick_validate.py skills/agents
```

## Changing Frontend UI

Frontend changes should keep operational workflows dense, clear, and evidence-oriented.

Rules:

- Keep API calls in `apps/web/src/api`.
- Keep large state workflows in hooks rather than inflating `App.tsx`.
- Reuse existing UI primitives from `apps/web/src/components/ui`.
- Preserve stable loading, error, empty, and streaming states.
- Avoid UI that claims success without backend evidence.

Validation:

```bash
pnpm --filter @u-build/web type-check
pnpm --filter @u-build/web build
pnpm --filter @u-build/web test:guards
```

## Changing Project File or Command Execution

File and command execution paths are safety-sensitive.

Rules:

- Enforce project-root and write-root boundaries.
- Reject traversal and absolute paths where unsafe.
- Avoid raw shell execution.
- Use command catalogs and policy validation.
- Record command evidence.
- Preserve binary, secret, generated-file, and truncation protections.

Relevant files:

- `apps/server/src/infrastructure/project/ProjectFileBrowserService.ts`
- `apps/server/src/infrastructure/project/ProjectExecutionService.ts`
- `apps/server/src/infrastructure/tools/SafeCliRunner.ts`
- `apps/server/src/infrastructure/tools/CliCommandPolicy.ts`

## Documentation Updates

Update docs when changing:

- Commands
- Environment variables
- Persistence behavior
- Docker behavior
- Workflow routing
- Agent responsibilities
- API route groups
- Generated project behavior
- Validation expectations

Primary docs:

- `README.md`
- `docs/architecture.md`
- `docs/runbook.md`
- `docs/configuration.md`
- `docs/chronology.md`
- `docs/contributing.md`

## Git Hygiene

Never commit:

- `.env`
- `.horus/`
- `data/`
- `apps/server/.env`
- `apps/server/data/`
- `apps/server/.horus/`
- `node_modules/`
- `dist/`
- `.turbo/`
- `output/`
- `spec/`
- `docs/specs/`
- root local reference files such as `AGENTS.md`, `CLAUDE.md`, `ID_VISUAL.md`, `UNPROTECT.md`

`README.md` and public files under `docs/` are intended to be tracked.

## Standard Validation

For broad changes:

```bash
pnpm type-check
pnpm build
pnpm test
```

For docs-only changes, at minimum:

```bash
test -f README.md
test -f docs/architecture.md
test -f docs/runbook.md
test -f docs/configuration.md
test -f docs/chronology.md
test -f docs/contributing.md
```

Run broader validation if docs changes touch examples, commands, or code-adjacent behavior.
