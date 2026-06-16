---
format_version: "agentic_sdd.v1"
task_id: "run-history-ux"
title: "Scalable Run History UX"
created_at_utc: "2026-05-30T00:00:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
---

## 1. Original User Request

```yaml
raw_user_request: |
  Por fim: UX de histórico: default mostra runs recentes/ativos; histórico completo fica pesquisável e paginado.
```

## 2. Technical Interpretation

The default run picker must not dump the full historical corpus. It should prioritize active/recent runs and expose complete history through search and pagination. The backend list order must support this behavior regardless of frontend state.

## 3. Scope

```yaml
in_scope:
  - "Sort active/running/approval-waiting runs ahead of old completed runs."
  - "Preserve query, limit and offset."
  - "Keep existing history drawer/panel behavior compatible."
out_of_scope:
  - "Retention compaction storage policy."
  - "New database indexes in this step."
```

## 4. Integration Contract

```yaml
api: "GET /agent-runs"
default_behavior: "active first, then newest"
full_history_behavior: "searchable and paginated by query/limit/offset"
frontend_behavior: "default visible list remains small; history panel loads pages."
```

## 5. Validation

```yaml
checks:
  - "Run list tests prove active-first ordering."
  - "Frontend build remains green."
```

## 6. Acceptance Criteria

```yaml
functional:
  - "Default selector shows a compact active/recent list."
  - "Complete history is opened explicitly, searchable, grouped, and paginated."
integration:
  - "GET /agent-runs preserves project_id, q, limit, and offset."
  - "Frontend uses backend pagination instead of rendering every historical run."
quality:
  - "Long run titles are compacted so the selector remains usable after many runs."
```

## 7. Completion Checklist

```yaml
implementation:
  - "Backend sorts running and awaiting-human runs before completed history."
  - "Telemetry UI exposes a History panel with search and page controls."
validation:
  - "Frontend regression guards pass."
  - "Web build passes."
```
