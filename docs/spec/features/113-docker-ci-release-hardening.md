---
format_version: "agentic_sdd.v1"
task_id: "feature-113-docker-ci-release-hardening"
title: "Docker CI And Release Hardening"
created_at_utc: "2026-06-08T18:29:35Z"
author: "agent"
target_mode: "refactor"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "docs/spec/features/53-portable-docker-runtime.md"
  - "docs/spec/features/54-professional-project-documentation.md"
  - "docs/spec/features/77-production-observability-and-release-hygiene.md"
  - "docs/spec/features/82-production-boundary-release-readiness.md"
  - "docs/spec/features/84-production-critical-closure.md"
---

# 113 - Docker CI And Release Hardening

## 1. Original User Request

```yaml
raw_user_request: |
  e como rodo com docker?

  limpe a árvore com base nas melhores práticas, faça algo clean, bem feito
```

## 2. System Interpretation

```yaml
system_translation: |
  Fechar a trilha profissional de execução e entrega: Docker precisa subir o stack inteiro com healthchecks,
  migrações, volumes e documentação. CI/release precisa bloquear falso verde com typecheck, build, testes,
  secret scan, audit, preview smoke e Docker smoke.

expected_user_visible_result: |
  O usuário consegue rodar Horus localmente e com Docker usando comandos documentados, ver health/ready,
  abrir a UI e confiar que PR/commit passou por gates reais.

expected_engineering_result: |
  Repositório com Docker Compose validável, scripts de smoke, CI reproduzível e política clara para commitar/pushar
  sem misturar alterações ou deixar artefatos locais na árvore.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Review current Dockerfiles/compose/scripts and close gaps."
    - "Add or fix Docker healthchecks for server, web/docs if applicable, DB/Redis when configured."
    - "Run migrations automatically or document explicit migration step with readiness validation."
    - "Ensure volumes for HORUS_DATA_DIR/project workspaces are explicit and portable."
    - "Make docker smoke validate UI/API/preview readiness."
    - "Ensure CI runs typecheck, build, server tests, web build, secret scan, audit policy and Docker smoke where feasible."
    - "Document local and Docker runbooks with ports and troubleshooting."
    - "Add a release checklist for clean tree, staged files, commit, push and validation evidence."
  out_of_scope:
    - "Deploying to a cloud provider."
    - "Adding Kubernetes."
    - "Changing product features unrelated to reproducible execution."
```

## 4. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/config/runtimeConfig.ts"
      - "apps/server/src/infrastructure/database/migrateCli.ts"
    services:
      - "Health/readiness"
      - "Database migration"
      - "Preview/project workspace runtime"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "apps/web/package.json"
      - "apps/web/vite.config.ts"
    components: []
    routes:
      - "/"
      - "/?mode=preview"
  workflow:
    graph_nodes: []
    agents: []
  infrastructure:
    files:
      - "Dockerfile"
      - "docker-compose.yml"
      - ".dockerignore"
      - ".github/workflows/ci.yml"
      - "scripts/docker-smoke.mjs"
      - "scripts/preview-browser-smoke.mjs"
      - "README.md"
      - "docs/*"
```

## 5. Integration Context Map

```yaml
integration_context:
  summary: |
    Docker/CI is the delivery proof layer. It consumes the same runtime ports, migrations, health endpoints,
    preview smoke and secret scan used locally. It must not invent alternate behavior that hides failures.

  depends_on:
    - name: "Runtime config"
      type: "backend_service"
      owner: "apps/server infrastructure/config"
      direction: "this_spec_consumes_dependency"
      contract_used: "env vars, HORUS_DATA_DIR, database/redis/preview config, auth config"
      required_for: "Container startup and readiness."
      failure_modes:
        - "Container starts with unsafe local defaults in production mode."
        - "Data is written to ephemeral unexpected paths."
      fallback_or_recovery: "Fail startup with actionable config error."
      verification:
        - "docker smoke"
        - "runtime config tests"

    - name: "Health/readiness endpoints"
      type: "api"
      owner: "apps/server"
      direction: "this_spec_consumes_dependency"
      contract_used: "GET /health, GET /ready"
      required_for: "Compose healthchecks and CI smoke."
      failure_modes:
        - "Healthy process but broken database/migrations/preview stores."
      fallback_or_recovery: "Readiness reports failed dependency without leaking secrets."
      verification:
        - "curl health/ready in docker smoke"

  depended_on_by:
    - name: "Developer/operator runbook"
      type: "external_consumer"
      owner: "project docs"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Documented commands and ports"
      compatibility_obligation: "Commands must match package scripts and compose services."
      expected_consumer_behavior: "Run local or Docker stack without guessing."
      migration_or_notification_required: false
      verification:
        - "Run commands exactly as documented."
```

## 6. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Audit current Docker/CI/run scripts"
    agent: "platform_engineer"
    action: "Read Docker, compose, scripts, package scripts, CI and docs."
    expected_output: "Gap map and exact files to change."
  - step: 2
    name: "Fix compose runtime"
    agent: "platform_engineer"
    action: "Ensure services, env, healthchecks, volumes, migrations and port mapping are coherent."
    expected_output: "Docker stack reaches ready state."
  - step: 3
    name: "Strengthen CI gates"
    agent: "release_engineer"
    action: "Add missing validation steps and prevent false green."
    expected_output: "CI mirrors local meaningful checks."
  - step: 4
    name: "Document runbooks"
    agent: "docs_engineer"
    action: "Update README/docs with local, Docker, health, preview and troubleshooting."
    expected_output: "Commands are copy-executable and verified."
  - step: 5
    name: "Release hygiene"
    agent: "release_engineer"
    action: "Create checklist for clean tree, staged files, commit, push, validation evidence and rollback."
    expected_output: "Professional handoff flow."
```

## 7. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "docker compose up reaches healthy server and reachable web UI."
    - "Docker smoke verifies /health, /ready and the web route."
    - "Preview smoke can run in local mode and has documented Docker expectations."
    - "Generated workspace/data volumes are explicit and portable."
  integration:
    - "CI uses the same package scripts documented for local validation."
    - "Secret scan runs without printing secret values."
    - "Migration/readiness behavior is deterministic."
  quality:
    - "No untracked generated artifacts are left by smoke scripts."
    - "Release checklist requires clean git status before commit/push."
```

## 8. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm verify:ci"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Run repo CI equivalent."
      success_condition: "exit code 0"
    - command: "pnpm verify:docker"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Run Docker smoke."
      success_condition: "exit code 0"
    - command: "HORUS_PUBLIC_HOST=<host-reachable-from-your-browser> docker compose up --build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Manual operator proof when needed."
      success_condition: "services healthy and documented URLs reachable"
    - command: "git status --short"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Confirm no generated noise before commit/push."
      success_condition: "only intended files are modified"
```

## 9. Risks

```yaml
risks:
  - risk: "Docker smoke is too slow for every local iteration."
    severity: "medium"
    mitigation: "Keep focused docker smoke script and run full compose proof before release."
  - risk: "CI audit fails due third-party advisories."
    severity: "medium"
    mitigation: "Document accepted advisory with owner/expiry or update dependencies."
  - risk: "Docker path diverges from local dev."
    severity: "high"
    mitigation: "Use package scripts and env contracts shared by both paths."
```
