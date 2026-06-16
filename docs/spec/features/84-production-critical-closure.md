---
format_version: "agentic_sdd.v1"
task_id: "feature-84-production-critical-closure"
title: "Production Critical Closure"
created_at_utc: "2026-05-28T16:02:46Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "spec/features/77-production-observability-and-release-hygiene.md"
  - "spec/features/78-production-readiness-p0-remediation.md"
  - "spec/features/82-production-boundary-release-readiness.md"
  - "spec/features/83-provider-port-decoupling.md"
---

# 84 - Production Critical Closure

## 1. Original User Request

```yaml
raw_user_request: |
  entãó crie uma spec para resolve os casos mais graves
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar uma SPEC executável para fechar os bloqueadores graves restantes da auditoria de produção.
  A SPEC deve priorizar riscos P0/P1 confirmados por evidência recente: secret hygiene, autorização/RBAC,
  rate limiting, persistência/projeções, gates de CI, dependências vulneráveis, health/readiness real,
  observabilidade mínima e redução de arquivos centrais gigantes quando eles impedem manutenção.

expected_user_visible_result: |
  O usuário deve ter uma base local-first mais segura e verificável, com APIs protegidas em produção,
  releases bloqueados por gates reais e erros críticos de persistência visíveis em vez de silenciosos.

expected_engineering_result: |
  O projeto deve deixar de ter falso verde para produção. A implementação desta SPEC deve adicionar
  guardrails automáticos, testes e documentação operacional para os riscos críticos restantes, sem
  prometer uma reescrita completa do produto.
```

### Evidence Baseline

```yaml
verified_current_state:
  validation_green:
    - "pnpm verify:ci passed"
    - "pnpm test passed: 271 tests"
    - "pnpm --filter @u-build/docs test -- --run passed: 27 tests"
    - "pnpm --filter @u-build/web test:guards passed: 17 tests"
  still_blocking:
    - "apps/server/.env still contains non-placeholder OPENAI_API_KEY locally; value must never be printed."
    - "pnpm audit --audit-level low fails with 10 moderate vulnerabilities."
    - "pnpm lint only runs a real lint task for apps/docs; server/web/shared have no lint task."
    - "security boundary is token + tenant only; route-level RBAC and rate limiting are absent."
    - "WorkflowStatePersister still catches persistence failures and returns undefined."
    - "workflow event persistence and chat/memory projection still use fire-and-forget paths."
    - "file repositories remain read-modify-write without locks; file driver is dev/local only."
    - "large central files remain over budget: StorySpecWorkspace, WorkflowOrchestrator, SubmitHorusChatTurnUseCase, VisualPreviewConsole."
    - "ready endpoint reports metadata but does not verify DB, migrations, stores, or outbox health."
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "Horus has local-first agentic capabilities but still has critical gaps before credible production-grade use."
  target_user: "Horus maintainer/operator running local-first workflows with future production deployment needs."
  expected_outcome: "Critical risks are either fixed, fail-closed, or explicitly blocked from production."
  product_surface:
    - "HTTP API"
    - "workflow orchestration"
    - "chat/preview actions"
    - "release/CI pipeline"
    - "local and Postgres persistence"
    - "runtime operations docs"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph"
      - "LangChain"
    frontend:
      - "React"
      - "Vite"
      - "Next docs"
    database:
      - "Postgres migrations"
      - "file-mode local repositories"
    infrastructure:
      - "pnpm"
      - "Turborepo"
      - "Docker"
      - "GitHub Actions"
  known_entrypoints:
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/main.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/domain/services/WorkflowEventProjector.ts"
    - "apps/server/src/infrastructure/events/PersistentWorkflowEventStream.ts"
    - "apps/server/src/infrastructure/repositories/createRepositories.ts"
    - "package.json"
    - ".github/workflows/ci.yml"
  known_existing_patterns:
    - "spec/ is local-only and indexed in spec/README.md plus spec/CHANGELOG.md."
    - "Runtime production safety is fail-closed where possible."
    - "Postgres is the production persistence path; file driver is local/dev unless explicitly allowed."
    - "Use application/domain ports before adding direct infrastructure dependencies."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add route-level authorization policy and tests for sensitive API routes."
    - "Add tenant/token-aware rate limiting for /api write and LLM/agent execution surfaces."
    - "Make production startup fail closed when auth, tenant, CORS, persistence, or readiness dependencies are invalid."
    - "Add local secret hygiene checks that detect real-looking secrets in local env files without printing values."
    - "Update CI verification to include docs tests, audit, and real lint or explicit lint placeholders for every package."
    - "Fix or override dependency vulnerabilities until pnpm audit --audit-level low passes, or document an accepted unavoidable advisory with owner and expiry."
    - "Make workflow state persistence failures typed, observable, and terminal for affected workflow recovery paths."
    - "Replace fire-and-forget workflow event/chat/memory projections with durable outbox-backed retries or explicit observable failure records."
    - "Strengthen /ready to verify configured persistence, migration reachability, and outbox health without leaking secrets."
    - "Create a focused decomposition slice for the worst central files only when needed to unblock the above fixes."
  out_of_scope:
    - "Implement advanced semantic memory/RAG retrieval."
    - "Rewrite the full orchestrator or frontend workspace UI."
    - "Add enterprise SSO/OIDC; this SPEC uses token/RBAC boundaries already present."
    - "Support thousands of users; target is robust local-first plus safe small production deployment."
    - "Change user-visible product flows unless required for security errors."
    - "Print, move into docs, or commit any real secret value."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/http/securityBoundary.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/http/routes/*.ts"
      - "apps/server/src/infrastructure/config/runtimeConfig.ts"
      - "apps/server/src/domain/services/WorkflowStatePersister.ts"
      - "apps/server/src/domain/services/WorkflowEventProjector.ts"
      - "apps/server/src/infrastructure/events/PersistentWorkflowEventStream.ts"
      - "apps/server/src/infrastructure/repositories/*AgentExecutionLedgerRepository.ts"
      - "apps/server/src/infrastructure/repositories/createRepositories.ts"
      - "apps/server/src/infrastructure/database/pool.ts"
    services:
      - "Security boundary"
      - "Workflow state persister"
      - "Workflow event projection"
      - "Agent execution ledger/outbox"
      - "Readiness service"
    database:
      migrations_required: true
      tables:
        - "agent_execution_outbox"
        - "workflow_states"
        - "workflow_events"
        - "chat_messages"
        - "agent_memory_items"
  frontend:
    files:
      - "apps/web/src/api/*"
      - "apps/web/src/features/*"
    components:
      - "Only security/error states if backend contracts require user-visible handling."
    routes:
      - "No route changes planned."
  workflow:
    graph_nodes:
      - "No graph topology changes unless persistence failure terminalization needs explicit state updates."
    agents:
      - "No prompt behavior change required."
  tests:
    unit:
      - "apps/server/test/serverSecurity.test.mjs"
      - "apps/server/test/runtimeConfig.test.mjs"
      - "apps/server/test/postgresSchema.test.mjs"
      - "apps/server/test/outboxLeasePolicy.test.mjs"
      - "scripts/secret-scan.test.mjs"
    integration:
      - "apps/server/test/durable-restart-recovery.test.mjs"
      - "apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
      - "apps/server/test/horusChatTurn.test.mjs"
    release:
      - "pnpm verify:ci"
      - "pnpm audit --audit-level low"
      - "pnpm --filter @u-build/docs test -- --run"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This SPEC closes production blockers across security, persistence, release gates and operations.
    It connects HTTP route policies, repository health, workflow execution, durable event projection,
    CI validation and operator documentation. The change must preserve local development ergonomics
    while making production fail closed.

  depends_on:
    - name: "securityBoundary"
      type: "backend_service"
      owner: "apps/server/infrastructure/http"
      direction: "this_spec_consumes_dependency"
      contract_used: "resolveSecurityBoundaryPolicy(env), createSecurityBoundaryMiddleware(policy), res.locals.horusSecurityContext"
      required_for: "Enforce token auth, tenant boundary, role lookup and route authorization."
      assumptions:
        - "Current member/admin token model remains sufficient for this SPEC."
      failure_modes:
        - "Unauthenticated write surfaces remain reachable."
        - "Member token can mutate admin-only LLM/skill settings."
      fallback_or_recovery: "Fail closed with 401/403 and non-secret error envelope."
      verification:
        - "serverSecurity route matrix tests"

    - name: "Express route modules"
      type: "api"
      owner: "apps/server/infrastructure/http/routes"
      direction: "this_spec_consumes_dependency"
      contract_used: "create*Router(deps): Router"
      required_for: "Apply route-level RBAC and rate limiting without changing handler business logic."
      assumptions: []
      failure_modes:
        - "Authorization middleware skipped on nested routers."
      fallback_or_recovery: "Central policy table checked in tests."
      verification:
        - "HTTP integration tests for every protected route group."

    - name: "Agent execution ledger and outbox"
      type: "database"
      owner: "apps/server/infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "claimNextOutbox, completeOutbox, failOutbox, dead_letter status"
      required_for: "Durable retries for projections and startup recovery."
      assumptions:
        - "Postgres remains the only supported production-safe multi-process driver."
      failure_modes:
        - "Duplicate projections, lost chat progress, or stuck processing rows."
      fallback_or_recovery: "Lease TTL, retry count, dead-letter evidence and readiness warning."
      verification:
        - "durable restart recovery tests"
        - "Postgres schema contract tests"

    - name: "WorkflowStatePersister"
      type: "backend_service"
      owner: "apps/server/domain/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "persist({ threadId, startedAt, errorMessage }): Promise<WorkflowStatus | undefined>"
      required_for: "Ensure state persistence failure cannot look like success."
      assumptions: []
      failure_modes:
        - "State save fails and workflow caller continues with false green."
      fallback_or_recovery: "Return or throw a typed persistence failure and emit terminal error evidence."
      verification:
        - "workflow persistence failure regression test."

    - name: "CI pipeline"
      type: "external_dependency"
      owner: ".github/workflows"
      direction: "this_spec_consumes_dependency"
      contract_used: "pnpm verify:ci"
      required_for: "Prevent release when audit/docs/lint/test gates are false-green."
      assumptions:
        - "GitHub Actions remains the target CI runner."
      failure_modes:
        - "Merged code contains known vulnerabilities or untested docs breakage."
      fallback_or_recovery: "CI fails before merge."
      verification:
        - "local pnpm verify:ci mirrors workflow."

  depended_on_by:
    - name: "Horus API clients"
      type: "api_client"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "HTTP status 401/403/429/503 and non-secret JSON error body"
      compatibility_obligation: "Existing success payloads must be preserved; new security errors may be additive."
      expected_consumer_behavior: "Render blocked/unauthorized/rate-limited states without retry storms."
      migration_or_notification_required: false
      verification:
        - "web guard tests if client behavior changes."

    - name: "WorkflowOrchestrator"
      type: "workflow"
      owner: "apps/server/domain/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Typed persistence/projection failure semantics."
      compatibility_obligation: "Do not mark completed when persistence/projection required for durability fails."
      expected_consumer_behavior: "Terminalize or recover with explicit evidence."
      migration_or_notification_required: false
      verification:
        - "workflowOrchestratorCodeChangeSet and durable restart tests."

    - name: "Operator release process"
      type: "external_consumer"
      owner: "maintainer"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "CI, docs, runbook and readiness checks."
      compatibility_obligation: "Commands must be deterministic on a clean checkout."
      expected_consumer_behavior: "Run verify/audit/readiness before claiming production readiness."
      migration_or_notification_required: true
      verification:
        - "README/docs/runbook update."

  bidirectional_integrations:
    - name: "HTTP security boundary and route handlers"
      participants:
        - "securityBoundary middleware"
        - "route modules"
      shared_contract: "HorusSecurityContext and route policy matrix"
      consistency_rule: "Every /api route must either declare a policy or explicitly be public."
      verification:
        - "route policy coverage test."

    - name: "Workflow events and durable projections"
      participants:
        - "PersistentWorkflowEventStream"
        - "WorkflowEventProjector"
        - "chat/memory repositories"
      shared_contract: "WorkflowEvent, dedupe key, projection outbox payload"
      consistency_rule: "A user-visible projection must be deduped, retryable and observable."
      verification:
        - "projection retry/dead-letter tests."

  data_flow:
    inbound:
      - source: "HTTP request"
        payload_or_state: "Authorization bearer token, tenant header, route body"
        validation: "security boundary, route schema, route policy, body limit, rate limit"
      - source: "Workflow event"
        payload_or_state: "WorkflowEvent"
        validation: "shared schema and projection policy"
      - source: "CI runner"
        payload_or_state: "repo checkout and pnpm workspace"
        validation: "lint, type-check, tests, docs tests, audit, secret scan"
    outbound:
      - target: "API response"
        payload_or_state: "success payload or non-secret error envelope"
        compatibility: "No secret values, no internal paths in production errors"
      - target: "durable stores"
        payload_or_state: "workflow state, event log, chat projection, memory projection"
        compatibility: "Idempotent, deduped, recoverable"
      - target: "CI status"
        payload_or_state: "pass/fail"
        compatibility: "Fail on vulnerabilities or missing package gates"

  sequencing_dependencies:
    - dependency: "Introduce route policy matrix before broad route tests."
      reason: "Tests need a single source of truth for expected permissions."
      validation: "policy coverage test enumerates mounted routers."
    - dependency: "Fix dependency audit before marking release gate clean."
      reason: "CI cannot include audit as required until audit can pass or approved suppressions exist."
      validation: "pnpm audit --audit-level low passes."
    - dependency: "Make projection failures observable before making them blocking."
      reason: "Blocking without diagnostics would make workflow incidents harder to recover."
      validation: "projection failure test returns terminal evidence."

  integration_risks:
    - risk: "Adding auth/rate limit can break local development."
      severity: "medium"
      mitigation: "Keep local dev unauthenticated by default, but production fails closed."
    - risk: "Dependency upgrades can break Monaco/Next/Vite builds."
      severity: "high"
      mitigation: "Use targeted pnpm overrides/upgrades and run web/docs builds plus tests."
    - risk: "Projection durability can double-write chat/memory events."
      severity: "high"
      mitigation: "Use dedupe keys and idempotency tests before enabling retries."
    - risk: "Typed persistence errors can expose sensitive internal paths."
      severity: "medium"
      mitigation: "Use redacted error envelopes and structured low-cardinality metadata."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Do not claim production-ready while audit, auth, persistence, CI or readiness blockers remain."
    - "Follow existing repository patterns before introducing new abstractions."
    - "Separate application, domain, infrastructure and presentation concerns."
    - "Prefer dependency injection over direct construction of concrete services."
    - "Do not introduce circular dependencies."
    - "Do not silently swallow persistence failures."
    - "Do not expose secret values, env values, filesystem paths or provider credentials in logs/errors."
  project_specific:
    - "Postgres is the only production-safe multi-process persistence driver."
    - "File repositories are local/dev unless explicitly allowed and surfaced in readiness metadata."
    - "All /api routes must be auth-governed in production."
    - "Every release gate must have a local command and CI equivalent."
    - "Agent/workflow failures must produce durable, compact evidence."
    - "Do not expand prompts or agent responsibilities while closing production blockers."
```

## 8. Required Contracts and Invariants

```yaml
contracts:
  security:
    - name: "RoutePolicy"
      shape: |
        type RoutePolicy = {
          pathPrefix: string;
          methods: HttpMethod[] | "all";
          requiredRole: "member" | "admin";
          rateLimit: RateLimitPolicy;
          publicInProduction: boolean;
        }
      invariants:
        - "No /api route is unclassified in production."
        - "Admin-only mutation routes reject member tokens."
        - "Rate limits are keyed by tenantId + token role + route group."

  persistence:
    - name: "WorkflowPersistenceResult"
      shape: |
        type WorkflowPersistenceResult =
          | { ok: true; status: WorkflowStatus }
          | { ok: false; error: HorusError; terminalStatus: "error" | "blocked" };
      invariants:
        - "Callers cannot confuse persistence failure with successful completion."
        - "Errors are redacted and low-cardinality."

  projection:
    - name: "DurableProjectionEvent"
      shape: |
        type DurableProjectionEvent = {
          id: string;
          dedupeKey: string;
          workflowThreadId: string;
          projectionType: "event_log" | "chat_progress" | "agent_memory";
          payload: unknown;
          status: "pending" | "processing" | "processed" | "failed" | "dead_letter";
        }
      invariants:
        - "Projection writes are idempotent by dedupeKey."
        - "Dead-letter entries are visible through readiness or diagnostics."

  readiness:
    - name: "ReadinessReport"
      shape: |
        type ReadinessReport = {
          status: "ready" | "degraded" | "not_ready";
          persistenceDriver: "file" | "postgres";
          authEnabled: boolean;
          tenantBoundary: boolean;
          checks: Array<{ name: string; status: "pass" | "warn" | "fail"; message?: string }>;
        }
      invariants:
        - "Production returns not_ready when required dependencies fail."
        - "No secret, DATABASE_URL, token or local absolute secret path is returned."
```

## 9. Execution Plan

### Phase 1 - Security Boundary Closure

1. Add route policy matrix covering all mounted `/api` routers.
2. Add `authorizeRoutePolicy` middleware consuming `HorusSecurityContext`.
3. Add rate limiting for write/LLM/workflow/agent-skill routes.
4. Add tests for unauthenticated, wrong tenant, member-only and admin-only cases.
5. Ensure local dev remains usable without auth unless `HORUS_AUTH_MODE=token`.

### Phase 2 - Secret Hygiene Closure

1. Add a local env audit mode that scans `.env` files but reports only key names and line numbers.
2. Add docs/runbook step requiring rotation of any exposed local provider key.
3. Keep default `security:secrets` suitable for CI without reading ignored local env files.
4. Add a separate explicit command such as `pnpm security:secrets:local` for operator use.
5. Never print the value of `OPENAI_API_KEY`, `DATABASE_URL`, tokens or credential-store contents.

### Phase 3 - Persistence and Projection Closure

1. Refactor `WorkflowStatePersister.persist` away from `undefined` on failure.
2. Update callers to terminalize or surface typed persistence errors.
3. Replace event/chat/memory fire-and-forget projections with durable projection events or outbox jobs.
4. Add idempotency/dedupe keys for chat progress and memory projection.
5. Add retry/dead-letter tests and readiness checks for stuck projection jobs.

### Phase 4 - Release Gate Closure

1. Add real lint scripts or explicit zero-work lint scripts for server/web/shared so `turbo run lint` covers all packages.
2. Add docs tests and `pnpm audit --audit-level low` to `verify:ci`.
3. Resolve dependency audit failures through targeted upgrades or overrides.
4. Keep web/docs/server builds in the root test path.
5. Document any intentionally accepted advisory with owner, expiry date and mitigation; default is no accepted advisory.

### Phase 5 - Readiness and Observability Minimum

1. Replace `/ready` metadata-only response with repository/persistence/outbox checks.
2. Add request correlation ID and structured low-cardinality logs at HTTP and workflow boundaries.
3. Add counters/timers for LLM calls, tool calls, preview starts, outbox claims, projection failures and persistence failures.
4. Keep `/health` lightweight and non-secret.
5. Add tests proving readiness does not leak secrets.

### Phase 6 - Critical Decomposition Only

1. Do not start broad decomposition until P0/P1 safety issues above are closed.
2. If a file must be touched heavily, extract only the responsibility required by this SPEC.
3. Priority extraction candidates:
   - `WorkflowOrchestrator`: projection/recovery/persistence coordination only.
   - `SubmitHorusChatTurnUseCase`: chat intent execution/security handling only.
   - `StorySpecWorkspace`: action panels/hooks only if CI/frontend work needs it.
4. Add regression tests before each extraction.

## 10. Validation Commands

```yaml
validation_commands:
  required_before_implementation:
    - "git status --short"
    - "pnpm audit --audit-level low"
    - "pnpm verify:ci"
  required_during_implementation:
    - "pnpm --filter @u-build/server build"
    - "pnpm --filter @u-build/web build"
    - "pnpm --filter @u-build/docs test -- --run"
    - "pnpm --filter @u-build/web test:guards"
    - "node --test apps/server/test/serverSecurity.test.mjs"
    - "node --test apps/server/test/durable-restart-recovery.test.mjs"
  required_for_completion:
    - "pnpm lint"
    - "pnpm type-check"
    - "pnpm security:secrets"
    - "pnpm test"
    - "pnpm --filter @u-build/docs test -- --run"
    - "pnpm --filter @u-build/web test:guards"
    - "pnpm audit --audit-level low"
    - "pnpm verify:ci"
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  - "No real secret value is printed, committed, copied into specs, copied into docs or included in test snapshots."
  - "Local secret audit reports local secret presence with redacted metadata only."
  - "Every /api route is covered by an explicit route policy or explicitly marked public."
  - "Admin-only mutation routes reject member tokens."
  - "Write/LLM/workflow routes have rate limiting coverage."
  - "Workflow state persistence failure cannot return silent undefined to callers."
  - "Workflow event, chat progress and memory projections are retryable or emit durable failure evidence."
  - "Readiness returns degraded/not_ready for failed production dependencies."
  - "pnpm audit --audit-level low passes or has a documented temporary exception with owner and expiry."
  - "verify:ci includes docs tests, audit and package-level lint coverage."
  - "File driver remains blocked in production unless explicitly allowed and reported as degraded/warn."
  - "No central file grows while implementing this SPEC; heavily touched sections are extracted."
```

## 12. Error Mitigation Rules for Executing Agents

```yaml
agent_execution_rules:
  - "Do not delete or overwrite the user's local .env without explicit approval."
  - "If a secret is found, report only file, line and env key name; never report value."
  - "Do not broaden scope into advanced RAG, memory ranking or UI polish."
  - "Do not mark a blocker resolved unless a command or test proves it."
  - "Prefer small vertical slices with tests over broad rewrites."
  - "If dependency upgrades break builds, stop and report the exact package conflict before forcing major migrations."
  - "Preserve existing successful HTTP response contracts."
  - "Use Postgres paths for production guarantees; keep file-mode behavior local-first and explicitly limited."
```

## 13. Implementation Log

```yaml
implementation_log:
  - version: "0.1.0"
    date: "2026-05-28"
    changes:
      - "Created SPEC from verified production-critical residual blockers."
      - "Sequenced remediation into security, secrets, persistence/projection, release gates, readiness/observability and minimal decomposition."
    validation:
      - "Spec-only change; runtime validation not required yet."
```

## 14. Output Contract for Implementation Agent

When implementing this SPEC, the executing agent must return:

1. Files changed.
2. Which acceptance criteria were closed.
3. Commands run and exact pass/fail result.
4. Remaining blockers, if any.
5. Confirmation that no secret value was printed or persisted in generated artifacts.
6. Updated `spec/README.md`, `spec/CHANGELOG.md` and this implementation log.
