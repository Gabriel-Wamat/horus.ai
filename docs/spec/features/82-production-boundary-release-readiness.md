---
format_version: "agentic_sdd.v1"
task_id: "feature-82-production-boundary-release-readiness"
title: "Production Boundary Release Readiness"
created_at_utc: "2026-05-28T17:05:00Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented"
depends_on:
  - "spec/features/77-production-observability-and-release-hygiene.md"
  - "spec/features/78-production-readiness-p0-remediation.md"
  - "spec/features/81-agentic-llm-tool-abort-and-distributed-breaker.md"
---

# 82 - Production Boundary Release Readiness

## 1. Original User Request

```yaml
raw_user_request: |
  identifique o que ainda falta sobre isso(Ainda permanecem como próximos cortes da SPEC 78: auth/RBAC/tenant boundary, CORS fail-closed, secret scanning, lease TTL do outbox, locks/capability flag para file driver, CI real, Docker/readiness e o trabalho da SPEC 77 de observabilidade/release. Também continuam os avisos já conhecidos do build: chunk grande no web e turbo sem outputs configurados para docs.). use a skill de criar spec e faça um planejamento rigoroso, após criar a spec, implemente ela
```

## 2. System Interpretation

```yaml
system_translation: |
  Auditar o que ainda falta após SPEC 78/81, criar uma SPEC dedicada e implementar a primeira
  fatia production-grade verificável. O objetivo é fechar riscos de borda operacional sem
  prometer uma plataforma multi-tenant completa antes de existir um provedor real de identidade.

expected_user_visible_result: |
  O backend passa a falhar fechado em produção para CORS/auth/tenant e file-driver inseguro;
  há health/readiness separados; existem gates de CI/secret scanning e artefatos Docker base.

expected_engineering_result: |
  Security boundary middleware, CORS fail-closed, runtime config guard para file driver em produção,
  readiness endpoint, secret scanner, CI workflow, Dockerfile/compose/.dockerignore, turbo outputs
  corrigidos e split de bundle web para reduzir o warning de chunk grande.
```

## 3. Confirmed Remaining Gaps

```yaml
findings:
  - name: "API mutável sem auth/RBAC/tenant boundary"
    severity: "critical"
    locations:
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/http/routes/*"
    current_state: "Nenhum middleware protege /api; qualquer cliente que alcance o backend consegue chamar rotas mutáveis."
    implementation_slice: "Adicionar boundary fail-closed de bearer token + tenant em produção/opt-in."
    residual_risk: "RBAC por usuário/organização e identidade real continuam para uma fase dedicada."

  - name: "CORS permissivo por padrão"
    severity: "critical"
    locations:
      - "apps/server/src/infrastructure/http/server.ts"
    current_state: "Sem CORS_ORIGIN, o backend permite qualquer origem."
    implementation_slice: "Manter conveniência local, mas exigir CORS_ORIGIN explícito e proibir '*' em produção."

  - name: "Secret scanning ausente do release gate"
    severity: "high"
    locations:
      - "package.json"
      - "scripts/"
      - ".github/workflows/"
    current_state: "Não há gate automatizado que barre chaves acidentais em arquivos versionáveis."
    implementation_slice: "Adicionar scanner local high-confidence e colocá-lo no verify:ci."

  - name: "File driver não é seguro para produção multi-processo"
    severity: "high"
    locations:
      - "apps/server/src/infrastructure/config/runtimeConfig.ts"
    current_state: "File mode é portável, mas não garante lock distribuído."
    implementation_slice: "Exigir HORUS_ALLOW_FILE_DRIVER_IN_PRODUCTION=true para produção em file mode."
    residual_risk: "Locks reais por repositório file continuam como fase separada ou substituição por Postgres."

  - name: "Outbox lease TTL precisa permanecer contrato explícito"
    severity: "medium"
    locations:
      - "apps/server/src/infrastructure/repositories/OutboxLeasePolicy.ts"
    current_state: "TTL já existe, mas precisa continuar coberto por release gates."
    implementation_slice: "Manter teste focado no verify:ci e documentar env."

  - name: "CI/Docker/readiness incompletos"
    severity: "high"
    locations:
      - ".github/workflows"
      - "Dockerfile"
      - "docker-compose.yml"
      - "apps/server/src/infrastructure/http/server.ts"
    current_state: "Não existe CI real nem artefato Docker validável; /health mistura liveness mínimo com readiness."
    implementation_slice: "Adicionar workflow CI, Dockerfile, compose, .dockerignore, /ready."

  - name: "Avisos de release hygiene ainda visíveis"
    severity: "medium"
    locations:
      - "apps/web/vite.config.ts"
      - "turbo.json"
    current_state: "Vite avisa chunk grande; Turbo não declara outputs para apps Next."
    implementation_slice: "Adicionar manualChunks estável e outputs .next para docs."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add production fail-closed CORS policy."
    - "Add token auth and tenant boundary middleware for /api."
    - "Add production runtime guard for file persistence driver."
    - "Add /ready endpoint with non-secret readiness payload."
    - "Add high-confidence secret scanning script and tests."
    - "Add verify:ci script and GitHub Actions workflow."
    - "Add Dockerfile, docker-compose.yml and .dockerignore."
    - "Add Vite manual chunks and Turbo docs outputs."
    - "Update .env.example with production boundary envs."
    - "Add focused tests and run full validation."
  out_of_scope:
    - "Full user identity provider integration."
    - "Per-route/per-action RBAC matrix."
    - "Tenant-scoped database row ownership migration."
    - "Distributed file locks; Postgres remains the production recommendation."
    - "OpenTelemetry exporter deployment."
```

## 5. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec adds hard operational boundaries around the existing Express app and release toolchain.
    It does not change agent graph semantics; it prevents unsafe production startup and unauthenticated
    API access while preserving local development ergonomics.

  depends_on:
    - name: "Express app composition root"
      type: "backend_service"
      owner: "apps/server/infrastructure/http"
      direction: "this_spec_consumes_dependency"
      contract_used: "createApp(env, repositories)"
      required_for: "CORS, security middleware and readiness endpoints."
      failure_modes:
        - "Middleware order can break health checks or SSE."
      fallback_or_recovery: "/health stays public; /api is protected when policy is enabled."
      verification:
        - "server security tests"

    - name: "RuntimeConfig"
      type: "configuration_contract"
      owner: "apps/server/infrastructure/config"
      direction: "this_spec_extends_dependency"
      contract_used: "loadRuntimeConfig(env)"
      required_for: "File driver production capability flag."
      failure_modes:
        - "Production starts with non-locking local file stores."
      fallback_or_recovery: "Use Postgres or explicitly acknowledge file mode via env flag."
      verification:
        - "runtime config tests"

    - name: "Package scripts and Turbo"
      type: "release_tooling"
      owner: "repo root"
      direction: "this_spec_extends_dependency"
      contract_used: "pnpm scripts, turbo outputs"
      required_for: "Repeatable CI/release checks."
      failure_modes:
        - "False-green CI or stale cache outputs."
      fallback_or_recovery: "verify:ci composes build/test/security gates."
      verification:
        - "pnpm verify:ci"

  depended_on_by:
    - name: "Frontend and external API clients"
      type: "api_client"
      owner: "apps/web and operators"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Authorization: Bearer <token>; X-Horus-Tenant-Id when configured"
      compatibility_obligation: "Local dev without auth remains allowed unless HORUS_AUTH_MODE=token."
      expected_consumer_behavior: "Production clients must send token and tenant header."
      migration_or_notification_required: true
      verification:
        - "security boundary tests"

  data_flow:
    inbound:
      - source: "HTTP client"
        payload_or_state: "Origin, Authorization, X-Horus-Tenant-Id"
        validation: "CORS policy and security boundary middleware"
    outbound:
      - target: "API route handlers"
        payload_or_state: "Authenticated request or rejected 401/403"
        persistence: "none"
      - target: "CI runner"
        payload_or_state: "build/test/security status"
        persistence: "GitHub Actions logs"
```

## 6. Architecture Rules

```yaml
architecture_rules:
  - "Production must fail closed for CORS, API auth and unsafe file persistence."
  - "Health endpoints must not expose secrets, file paths, provider keys or database URLs."
  - "Security middleware must be deny-by-default only when enabled or in production; local dev remains ergonomic."
  - "Do not implement fake RBAC claims beyond the token role boundary."
  - "Docker artifacts must not bake secrets into images."
  - "Secret scanner should avoid noisy low-confidence matches but catch real key formats."
```

## 7. Execution Plan

```yaml
execution_plan:
  phase_1_this_slice:
    - "Create SPEC 82 and version index/changelog."
    - "Implement securityBoundary middleware and CORS policy tests."
    - "Guard file driver in production unless explicit capability flag is set."
    - "Add /ready endpoint."
    - "Add secret scanner, script tests and verify:ci."
    - "Add CI workflow and Docker base artifacts."
    - "Fix turbo/docs outputs and web manualChunks."
    - "Run focused and full validation."
  phase_2_next_slice:
    - "Replace token auth with real identity provider and route-level RBAC."
    - "Add tenant ownership columns/contracts to persisted user/workflow/project data."
    - "Add distributed file-driver lock provider or formally make file driver dev-only."
    - "Add structured logger/correlation IDs across all remaining console surfaces."
    - "Add Docker build smoke in CI with Postgres readiness."
```

## 8. Validation

```yaml
validation:
  required_commands:
    - "pnpm --filter @u-build/server build"
    - "node --test apps/server/test/serverSecurity.test.mjs apps/server/test/runtimeConfig.test.mjs apps/server/test/outboxLeasePolicy.test.mjs scripts/secret-scan.test.mjs"
    - "pnpm --filter @u-build/web build"
    - "pnpm security:secrets"
    - "pnpm test"
  acceptance_criteria:
    - "Production CORS without explicit origin fails before serving."
    - "Production /api rejects missing token and wrong tenant."
    - "Local dev still allows unauthenticated API unless auth mode is token."
    - "Production file driver requires explicit capability flag."
    - "/ready returns non-secret readiness metadata."
    - "Secret scanner catches high-confidence secrets and ignores allowed fixtures."
    - "Full suite remains green."
```

## Implementation Log

- 2026-05-28: Created SPEC 82 to close the remaining SPEC 78/77 operational boundary cuts and identify residual auth/tenant/RBAC work that still needs a dedicated identity model.
- 2026-05-28: Implemented fail-closed production CORS, token/tenant API boundary, file-driver production capability guard, non-secret readiness endpoint, high-confidence secret scanner, verify:ci release script, GitHub Actions CI, Dockerfile/compose/.dockerignore, Vite manual chunks and Turbo docs outputs. Validated focused tests, secret scan, web build, verify:ci and docker compose config with dummy env.
