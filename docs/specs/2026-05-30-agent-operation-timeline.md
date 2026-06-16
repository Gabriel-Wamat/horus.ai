---
format_version: "agentic_sdd.v1"
task_id: "agent-operation-timeline"
title: "Unified Agent Operation Timeline"
created_at_utc: "2026-05-30T00:00:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
---

## 1. Original User Request

```yaml
raw_user_request: |
  Depois: criar uma projeção única AgentOperationTimeline: arquivos, comandos, diffs, failures, retry e validação agrupados por operationalSessionId/taskId.
```

## 2. Technical Interpretation

The run snapshot must expose one canonical projection for operational narration. It groups workflow events, file operations, command output, validation, failures, retry, and diffs by `operationalSessionId` first, `taskId` second, and event identity as fallback.

## 3. Scope

```yaml
in_scope:
  - "Add AgentOperationTimeline schemas to shared Horus run flow contracts."
  - "Build timeline groups in HorusRunFlowSnapshotBuilder."
  - "Keep existing runbook/evidence/file projections compatible."
out_of_scope:
  - "Replacing all frontend panels in this step."
  - "Persisting a new database table."
```

## 4. Integration Contract

```yaml
snapshot_field: "HorusRunSnapshot.operationTimeline"
grouping_order:
  - "operationalSessionId"
  - "taskId"
  - "toolCallId"
  - "event id"
item_kinds:
  - "file"
  - "command"
  - "diff"
  - "failure"
  - "retry"
  - "validation"
  - "event"
status_values:
  - "running"
  - "succeeded"
  - "failed"
  - "blocked"
  - "awaiting_approval"
  - "info"
```

## 5. Validation

```yaml
checks:
  - "Shared schema build must pass."
  - "Run snapshot creation must parse with operationTimeline defaulted."
```

## 6. Acceptance Criteria

```yaml
functional:
  - "A run snapshot exposes operationTimeline as a canonical grouped narrative."
  - "Timeline groups prefer operationalSessionId, then taskId, then toolCallId, then event id."
integration:
  - "Existing evidence summaries, runbook entries, and file operations remain compatible."
  - "Frontend fallback snapshot derives operationTimeline as an empty typed array."
quality:
  - "Timeline items are bounded per group to avoid oversized payloads."
```

## 7. Completion Checklist

```yaml
implementation:
  - "Shared schemas export timeline group, item, kind, and status types."
  - "HorusRunFlowSnapshotBuilder creates operationTimeline from events and file operations."
validation:
  - "Shared workflow projection tests pass."
  - "Web build passes."
```
