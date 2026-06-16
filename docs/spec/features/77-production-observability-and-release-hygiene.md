---
format_version: "agentic_sdd.v1"
task_id: "feature-77-production-observability-and-release-hygiene"
title: "Production Observability And Release Hygiene"
created_at_utc: "2026-05-28T14:19:19Z"
author: "agent"
target_mode: "refactor"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "spec/features/74-error-taxonomy-and-recovery-engine.md"
  - "spec/features/75-monolith-decomposition.md"
  - "spec/features/76-durable-restart-and-chaos-validation.md"
---

# 77 - Production Observability And Release Hygiene

## 1. Original User Request

```yaml
raw_user_request: |
  estado da arte de boas práticas de engenharia de software... produto final
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar o acabamento operacional de produto: logs estruturados, tracing/correlation IDs, metricas de runtime,
  bundle budget, artifact cleanup, CI gates, release checklist e higiene do worktree.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Introduce structured logger with traceId/threadId/runId/attemptId/agentProfileId/error.type."
    - "Replace production console.* with logger adapter."
    - "Add release gates for lint, type-check, focused tests, full tests, build and bundle budget."
    - "Add clean:artifacts script for dist/.next/.turbo/local runtime artifacts."
    - "Add release checklist for dirty worktree, migrations, env, ports, generated assets and local-only specs."
    - "Add frontend bundle splitting for oversized chunks."
  out_of_scope:
    - "Deploying to cloud."
    - "Changing product UX beyond status/reporting polish."
```

## 4. Validation

```yaml
validation:
  required_commands:
    - "pnpm lint"
    - "pnpm type-check"
    - "pnpm build"
    - "pnpm --filter @u-build/web test:guards"
  acceptance_criteria:
    - "No production console logging remains outside CLI/dev-only scripts."
    - "Release commands are documented and reproducible."
    - "Generated/cache artifacts are ignored or cleanable."
```

