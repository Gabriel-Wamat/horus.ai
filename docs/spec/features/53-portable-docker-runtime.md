# SPEC 53 - Portable Docker Runtime

```yaml
format_version: "agentic_sdd.v1"
task_id: "53-portable-docker-runtime"
title: "Portable Docker Runtime"
created_at_utc: "2026-05-27T03:34:35Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
spec_version: "0.1.0"
```

## 1. Original User Request

```yaml
raw_user_request: |
  agora crie uma spec para você preparar todo o docker do projeto, sem nenhum hardcode, de forma que rode em qualquer máquina ou sistema operacional, que tenha todas as dependências e demais detalhes rigorosos que precisar
```

## 2. System Interpretation

```yaml
system_translation: |
  Prepare an execution-ready Dockerization plan for Horus.AI so the monorepo can be built
  and run on macOS, Windows, and Linux without machine-specific paths, OS-specific shell
  assumptions, or hardcoded loopback host/absolute filesystem dependencies. The implementation
  must define Dockerfiles, compose files, runtime env conventions, volumes, health checks,
  optional Postgres wiring, file-mode persistence, generated-project preview behavior,
  and validation commands.

expected_user_visible_result: |
  A developer can clone the repository, copy an env template, run one Docker command, and
  access the Horus web app/API from any Docker-supported OS.

expected_engineering_result: |
  Add portable Docker build/runtime artifacts, env templates, startup documentation, and
  tests or smoke checks proving the containerized server and web app start without relying
  on this workstation or a specific operating system.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "The project currently depends on local Node/pnpm setup and host-machine assumptions."
  target_user: "Developers and agents running Horus.AI on fresh macOS, Windows, Linux, CI, or container hosts."
  expected_outcome: "One reproducible container workflow for local development and production-like execution."
  product_surface:
    - "Horus web app"
    - "Horus API server"
    - "Local persistence"
    - "Optional Postgres persistence"
    - "Generated project preview/runtime workflow"

technical_context:
  repository_root: "<repo-root>"
  relevant_stack:
    backend:
      - "Node.js >=20"
      - "TypeScript"
      - "Express"
      - "LangGraph"
      - "pnpm workspace"
      - "Turbo"
    frontend:
      - "React 19"
      - "Vite 6"
      - "TypeScript"
    database:
      - "File-mode JSON persistence under HORUS_DATA_DIR"
      - "Optional Postgres via DATABASE_URL"
      - "LangGraph Postgres checkpoint package for postgres mode"
    infrastructure:
      - "Docker"
      - "Docker Compose"
      - "Named volumes"
      - "Health checks"
  known_entrypoints:
    - "Root scripts: pnpm build, pnpm test, pnpm dev"
    - "Server start: apps/server/dist/main.js"
    - "Web build: apps/web/dist"
    - "Server port env: PORT"
    - "Server host env: HOST"
  known_existing_patterns:
    - "Runtime config must derive paths from env and repository root."
    - "File-mode persistence must live under HORUS_DATA_DIR."
    - "No absolute /<USER_HOME>/... paths in runtime code or generated config."
    - "Postgres mode is selected by PERSISTENCE_DRIVER=postgres."
    - "File mode is selected by PERSISTENCE_DRIVER=file."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create Dockerfile(s) for reproducible build and runtime."
    - "Create compose configuration for app-only file mode."
    - "Create compose configuration or profile for Postgres mode."
    - "Create .dockerignore to keep builds small and deterministic."
    - "Create container env templates without secrets."
    - "Document all required and optional env vars."
    - "Define persistent volumes for HORUS_DATA_DIR and database data."
    - "Expose ports through env or compose variables, not hardcoded source code."
    - "Add health check endpoints or use existing endpoints if available."
    - "Add smoke validation commands for Docker build/run on a fresh machine."
    - "Handle generated project preview dependencies and limitations explicitly."
  out_of_scope:
    - "Changing core agent behavior."
    - "Changing public API contracts unless needed for health checks."
    - "Adding cloud deployment-specific manifests such as Kubernetes, ECS, or Vercel."
    - "Embedding API keys, local user paths, local Docker Desktop paths, or machine-specific defaults."
    - "Rewriting the frontend/backend architecture."
```

## 5. Affected Entities

```yaml
affected_entities:
  root:
    files:
      - "Dockerfile"
      - "docker-compose.yml"
      - "docker-compose.postgres.yml"
      - ".dockerignore"
      - ".env.docker.example"
      - "README.md"
      - "package.json"
  backend:
    files:
      - "apps/server/src/main.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/config/runtimeConfig.ts"
      - "apps/server/package.json"
    services:
      - "Express app"
      - "Repository factory"
      - "Runtime config"
      - "Preview runtime"
    database:
      migrations_required: false
      tables:
        - "Existing Postgres migration tables only if PERSISTENCE_DRIVER=postgres"
  frontend:
    files:
      - "apps/web/package.json"
      - "apps/web/vite config if present"
      - "apps/web/src/api/*.ts"
    components:
      - "No component changes expected"
    routes:
      - "Web app root route"
  workflow:
    graph_nodes:
      - "No graph node changes expected"
    agents:
      - "No agent prompt/skill changes expected unless Docker run instructions must be surfaced"
  tests:
    unit:
      - "runtimeConfig tests for container env values"
    integration:
      - "Docker build smoke"
      - "Container API health smoke"
      - "Compose file-mode smoke"
      - "Compose postgres smoke if Docker is available"
    e2e:
      - "Open web app served through container and verify API reachability"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    Dockerization wraps the existing pnpm/turbo monorepo into portable build and runtime
    boundaries. It must consume the same env-driven config already used by local execution
    and expose stable host/container contracts for browser access, API access, persistence,
    and optional database mode.

  depends_on:
    - name: "pnpm workspace"
      type: "internal_module"
      owner: "repo"
      direction: "this_spec_consumes_dependency"
      contract_used: "pnpm-lock.yaml, pnpm-workspace.yaml, packageManager=pnpm@9.15.0"
      required_for: "Install dependencies and build all packages reproducibly."
      assumptions:
        - "pnpm-lock.yaml exists and is current."
      failure_modes:
        - "Docker build installs wrong dependency graph or fails offline cache resolution."
      fallback_or_recovery: "Use corepack with the packageManager version from package.json."
      verification:
        - "docker build must run pnpm install --frozen-lockfile successfully."

    - name: "Turbo build graph"
      type: "internal_module"
      owner: "repo"
      direction: "this_spec_consumes_dependency"
      contract_used: "turbo.json build outputs dist/**"
      required_for: "Build shared, server, and web packages in dependency order."
      assumptions: []
      failure_modes:
        - "Runtime image misses compiled server or web assets."
      fallback_or_recovery: "Build explicit packages if turbo fails, but record why."
      verification:
        - "pnpm build inside Docker image exits 0."

    - name: "Server runtime config"
      type: "backend_service"
      owner: "apps/server"
      direction: "this_spec_consumes_dependency"
      contract_used: "PORT, HOST, PERSISTENCE_DRIVER, HORUS_DATA_DIR, DATABASE_URL, DATABASE_SSL"
      required_for: "Bind container interfaces and select persistence mode."
      assumptions: []
      failure_modes:
        - "Server binds only to loopback host inside container and is unreachable from host."
        - "Data is written into image layer instead of mounted volume."
      fallback_or_recovery: "Default container HOST=0.0.0.0 and HORUS_DATA_DIR=/var/lib/horus/data."
      verification:
        - "Container logs show configured driver and dataDir."
        - "curl health endpoint through mapped host port succeeds."

    - name: "Web API client"
      type: "frontend_component"
      owner: "apps/web"
      direction: "this_spec_consumes_dependency"
      contract_used: "Relative /api routes or Vite proxy/runtime base URL"
      required_for: "Browser-loaded frontend must call the containerized API without hardcoded hostnames."
      assumptions:
        - "Existing web API modules use relative paths for same-origin deployment, or can be adapted through env."
      failure_modes:
        - "Web app calls wrong host/port when served from container."
      fallback_or_recovery: "Serve built web assets from the API container or configure reverse proxy."
      verification:
        - "Browser smoke proves frontend can call /api routes from container host."

    - name: "Postgres"
      type: "database"
      owner: "external_dependency"
      direction: "this_spec_consumes_dependency"
      contract_used: "DATABASE_URL and DATABASE_SSL"
      required_for: "Optional durable multi-process persistence mode."
      assumptions: []
      failure_modes:
        - "Migrations fail at startup."
        - "Database volume not persisted across restarts."
      fallback_or_recovery: "Use compose healthcheck and depends_on condition for postgres profile."
      verification:
        - "docker compose with postgres profile reaches API health and creates tables."

  depended_on_by:
    - name: "Developers on macOS/Windows/Linux"
      type: "external_consumer"
      owner: "users"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "docker compose commands and .env.docker.example"
      compatibility_obligation: "Must preserve cross-OS path and line-ending behavior."
      expected_consumer_behavior: "Run documented commands without editing source paths."
      migration_or_notification_required: true
      verification:
        - "Documentation includes copy/paste commands for Docker Desktop and Linux Docker Engine."

    - name: "CI"
      type: "external_consumer"
      owner: "unknown"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "docker build and docker compose smoke commands"
      compatibility_obligation: "Must not require local secrets for build."
      expected_consumer_behavior: "Build image and optionally run smoke with placeholder LLM configuration."
      migration_or_notification_required: false
      verification:
        - "Docker build does not require OPENAI_API_KEY."

    - name: "Horus runtime"
      type: "backend_service"
      owner: "apps/server"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Mounted data dir and optional database network service"
      compatibility_obligation: "Must preserve existing runtime env contracts."
      expected_consumer_behavior: "Read/write all local state in mounted container volume."
      migration_or_notification_required: false
      verification:
        - "Restart container and verify file-mode state remains available."

  bidirectional_integrations:
    - name: "Web app and API container boundary"
      participants:
        - "Browser"
        - "API server"
      shared_contract: "HTTP /api routes and static web asset serving or reverse proxy routing"
      consistency_rule: "Browser must never need container-internal hostnames."
      verification:
        - "Frontend smoke submits a no-secret API request such as providers/settings metadata."

  data_flow:
    inbound:
      - source: "Host environment or .env.docker"
        payload_or_state: "Provider keys, persistence driver, ports, hostnames, preview config"
        validation: "Runtime config parser and Docker Compose variable substitution"
      - source: "Browser"
        payload_or_state: "HTTP requests to web app and /api routes"
        validation: "Existing Express route schemas"
    outbound:
      - sink: "Named Docker volume"
        payload_or_state: "File-mode JSON persistence and LangGraph file checkpoints"
        validation: "Existing Zod schemas and JsonFileStore"
      - sink: "Postgres container"
        payload_or_state: "Repository tables and checkpoint tables"
        validation: "Existing migrations"
      - sink: "Browser"
        payload_or_state: "Web UI and API JSON responses"
        validation: "Existing shared schemas"
```

## 7. Architecture and Coding Rules

```yaml
architecture_rules:
  - "Do not hardcode absolute filesystem paths."
  - "Do not hardcode host-only loopback host into source code for container communication."
  - "Use env vars and Docker Compose variable substitution for ports, hosts, persistence mode, and preview URLs."
  - "Container-internal paths must be generic Linux container paths such as /app and /var/lib/horus/data."
  - "Host-mounted paths must be relative project paths or named volumes, never user-specific absolute paths."
  - "Use multi-stage builds to separate dependency install, build, and runtime layers."
  - "Use corepack to activate the pnpm version declared in package.json."
  - "Runtime images must not include dev-only caches unless required."
  - "Secrets must be injected at runtime, not copied into images."
  - "Prefer one app image that can serve the built web UI and API from one origin, unless implementation evidence proves separate containers are cleaner."
  - "Postgres mode must be optional; file mode must work without any database."
  - "Container startup must run database migrations only when PERSISTENCE_DRIVER=postgres."
```

## 8. Docker Design Requirements

```yaml
docker_design:
  image_strategy:
    recommended:
      - "Base: node:20-bookworm-slim or newer Node 20 LTS image."
      - "Install system packages only when required by runtime dependencies."
      - "Use corepack enable and corepack prepare pnpm@9.15.0 --activate."
      - "Copy package manifests before source for Docker layer caching."
      - "Run pnpm install --frozen-lockfile."
      - "Run pnpm build."
      - "Prune or copy only runtime node_modules/build outputs into final stage."
    forbidden:
      - "Installing dependencies from local machine paths."
      - "Copying .env into the image."
      - "Using OS-specific shell scripts that fail on Windows hosts."

  compose_services:
    app:
      required: true
      ports:
        - "${HORUS_HTTP_PORT:-3000}:3000"
      environment:
        - "NODE_ENV=production"
        - "HOST=0.0.0.0"
        - "PORT=3000"
        - "PERSISTENCE_DRIVER=${PERSISTENCE_DRIVER:-file}"
        - "HORUS_DATA_DIR=/var/lib/horus/data"
      volumes:
        - "horus_data:/var/lib/horus/data"
      healthcheck:
        command: "node-based or wget/curl health check, depending on installed tools"
    postgres:
      required: false
      profile: "postgres"
      image: "postgres:16-alpine"
      environment:
        - "POSTGRES_DB=${POSTGRES_DB:-horus}"
        - "POSTGRES_USER=${POSTGRES_USER:-horus}"
        - "POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-horus}"
      volumes:
        - "horus_postgres:/var/lib/postgresql/data"
      healthcheck:
        command: "pg_isready"

  env_files:
    - ".env.docker.example"
    - ".env.docker.local ignored by git if introduced"

  network_rules:
    - "Compose service names may be used only inside compose env, not inside app source."
    - "Browser-facing URLs must resolve from host-mapped ports or same-origin routes."
```

## 9. Implementation Plan

```yaml
execution_plan:
  - step: 1
    agent: "infra_specialist"
    action: "Inspect current server static serving and API routing."
    files_to_read:
      - "apps/server/src/main.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/web/src/api/*.ts"
    expected_output: "Decision whether API container can serve built web assets directly or needs a separate web service."

  - step: 2
    agent: "infra_specialist"
    action: "Add Dockerfile with multi-stage pnpm/turbo build."
    files_to_change:
      - "Dockerfile"
      - ".dockerignore"
    expected_output: "Image builds from clean context without local node_modules or local env files."

  - step: 3
    agent: "backend_specialist"
    action: "Add or verify health endpoint if no stable endpoint exists."
    files_to_change:
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/test/*health*.test.mjs"
    expected_output: "GET /health or /api/health returns non-secret runtime status."

  - step: 4
    agent: "infra_specialist"
    action: "Add Docker Compose file-mode runtime."
    files_to_change:
      - "docker-compose.yml"
      - ".env.docker.example"
    expected_output: "HORUS_PUBLIC_HOST=<host-reachable-from-your-browser> docker compose up app starts API/web with named file-mode volume."

  - step: 5
    agent: "infra_specialist"
    action: "Add optional Postgres compose profile."
    files_to_change:
      - "docker-compose.yml"
      - "docker-compose.postgres.yml if separation is clearer"
      - ".env.docker.example"
    expected_output: "postgres profile starts database and app with DATABASE_URL using service name."

  - step: 6
    agent: "frontend_specialist"
    action: "Ensure frontend API calls are same-origin or runtime-configurable."
    files_to_read:
      - "apps/web/src/api/*.ts"
    files_to_change:
      - "apps/web/src/api/*.ts only if required"
    expected_output: "No browser code requires container-internal service names."

  - step: 7
    agent: "docs_specialist"
    action: "Document Docker usage and env values."
    files_to_change:
      - "README.md"
      - "docs/docker.md if README would become too large"
    expected_output: "Fresh machine runbook for file mode, Postgres mode, rebuild, logs, reset volumes, and troubleshooting."

  - step: 8
    agent: "qa_specialist"
    action: "Run Docker build and smoke validations."
    expected_output: "Command evidence with exit codes and reachable URLs."
```

## 10. Environment Contract

```yaml
environment_contract:
  required_runtime_vars:
    - name: "PERSISTENCE_DRIVER"
      allowed_values: ["file", "postgres"]
      default: "file"
      secret: false
    - name: "HORUS_DATA_DIR"
      container_default: "/var/lib/horus/data"
      secret: false
    - name: "HOST"
      container_default: "0.0.0.0"
      secret: false
    - name: "PORT"
      container_default: "3000"
      secret: false
  optional_runtime_vars:
    - name: "DATABASE_URL"
      required_when: "PERSISTENCE_DRIVER=postgres"
      secret: true
    - name: "DATABASE_SSL"
      required_when: "External Postgres needs SSL"
      secret: false
    - name: "LLM_PROVIDER"
      required_when: "Running real agent generation"
      secret: false
    - name: "LLM_MODEL"
      required_when: "Running real agent generation"
      secret: false
    - name: "OPENAI_API_KEY"
      required_when: "LLM_PROVIDER=openai or specific OpenAI profile is selected"
      secret: true
    - name: "OPENROUTER_API_KEY"
      required_when: "LLM_PROVIDER=openrouter or specific OpenRouter profile is selected"
      secret: true
    - name: "GROQ_API_KEY"
      required_when: "LLM_PROVIDER=groq or specific Groq profile is selected"
      secret: true
    - name: "CORS_ORIGIN"
      required_when: "Frontend and API are served from different origins"
      secret: false
    - name: "HORUS_WEB_PREVIEW_HOST"
      default_rule: "Use an explicitly configured host reachable from the server container."
      secret: false
    - name: "HORUS_WEB_PREVIEW_PORT"
      default_rule: "Compose variable with no source hardcode."
      secret: false
```

## 11. Generated Project Preview Rules

```yaml
preview_runtime_rules:
  problem: |
    Horus can spawn preview commands for frontend projects. Inside Docker, spawned preview
    processes run inside the app container unless explicitly configured otherwise.
  required_decisions:
    - "Define whether generated preview processes are supported inside the app container in the first Docker iteration."
    - "If supported, expose or proxy preview ports through documented compose ranges."
    - "If not supported, fail clearly with documentation and leave normal Horus API/web runtime working."
  required_config:
    - "HORUS_WEB_PREVIEW_HOST must not assume host loopback host unless it is browser-facing."
    - "HORUS_WEB_PREVIEW_URL must be configurable."
    - "Generated preview port defaults must avoid colliding with app server port."
  forbidden:
    - "Hardcoding a Docker Desktop host gateway in source code."
    - "Hardcoding <HORUS_PUBLIC_HOST> for browser-facing URLs."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_local_commands:
    - command: "pnpm test"
      cwd: "<repo-root>"
      purpose: "Ensure non-container behavior still passes."
      success_condition: "Exit code 0."
    - command: "docker build -t horus-ai:local ."
      cwd: "<repo-root>"
      purpose: "Verify image builds from source without local machine assumptions."
      success_condition: "Exit code 0."
    - command: "docker compose --env-file .env.docker.example up --build"
      cwd: "<repo-root>"
      purpose: "Start file-mode runtime."
      success_condition: "App container healthy and web/API reachable."
    - command: "curl -fsS http://<HORUS_PUBLIC_HOST>:${HORUS_HTTP_PORT:-3000}/health"
      cwd: "<repo-root>"
      purpose: "Verify API health through host port."
      success_condition: "HTTP 2xx."
    - command: "docker compose down && docker compose up -d && curl -fsS http://<HORUS_PUBLIC_HOST>:${HORUS_HTTP_PORT:-3000}/health"
      cwd: "<repo-root>"
      purpose: "Verify restart behavior."
      success_condition: "HTTP 2xx after restart."
    - command: "docker compose --profile postgres --env-file .env.docker.example up --build"
      cwd: "<repo-root>"
      purpose: "Verify optional Postgres mode."
      success_condition: "App container healthy and migrations succeed."
  cross_os_checks:
    - "Run the documented compose commands on at least one Linux environment."
    - "Run or reason-check Docker Desktop path/volume behavior for macOS and Windows."
    - "Avoid bind mounts that require POSIX path syntax for normal runtime."
```

## 13. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "A fresh clone can run in file mode with Docker Compose and no database."
    - "A fresh clone can run in Postgres mode with Docker Compose profile."
    - "Web UI and API are reachable from the host browser."
    - "File-mode data survives app container recreation."
    - "Build does not require provider API keys."
    - "Runtime can start without provider API keys, while real generation fails clearly only when invoked."
  portability:
    - "No source file contains machine-specific absolute paths."
    - "No Docker artifact contains user-specific host paths."
    - "No shell command in docs assumes zsh/bash-only syntax when a cross-OS Docker command is enough."
    - "Line endings and path separators are not part of runtime assumptions."
  quality:
    - "Docker image builds successfully."
    - "Compose health check passes."
    - "pnpm test passes after Docker changes."
    - "New or changed health/runtime config tests pass."
  security:
    - "Secrets are never baked into image layers."
    - ".env.docker.local or equivalent local secret file is gitignored if introduced."
    - "Health endpoint does not expose secrets."
```

## 14. Error Mitigation Rules for Executing Agents

```yaml
error_mitigation:
  - "Do not claim Docker support without running docker build or documenting Docker unavailability."
  - "Do not use local node_modules as evidence that the image works."
  - "Do not copy .env into the Docker image."
  - "Do not bake provider keys into compose files."
  - "Do not rely on this machine's /<USER_HOME>/wamat path."
  - "If Docker is unavailable, still create artifacts but mark validation as blocked with exact error."
  - "If preview process support in Docker is not complete, document the limitation explicitly and fail that path clearly at runtime."
  - "Keep implementation changes separate from unrelated frontend/backend refactors."
```

## 15. Minimal Output Contract for Executing Agents

```yaml
agent_result:
  status: "<completed | failed | blocked>"
  summary: "<short factual summary>"
  files_read:
    - "<path>"
  files_changed:
    - "<path>"
  commands_run:
    - command: "<command>"
      cwd: "<cwd>"
      exit_code: "<exit code>"
      result: "<short result>"
  docker_validation:
    image_build: "<passed | failed | blocked>"
    compose_file_mode: "<passed | failed | blocked>"
    compose_postgres_mode: "<passed | failed | blocked>"
    health_endpoint: "<passed | failed | blocked>"
    restart_persistence: "<passed | failed | blocked>"
  validation:
    passed:
      - "<check>"
    failed:
      - "<check>"
    blocked:
      - "<check>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```
