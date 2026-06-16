---
format_version: "agentic_sdd.v1"
task_id: "qa-execution-verification-agent"
title: "QA As Execution And Verification Agent"
created_at_utc: "2026-05-30T00:00:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
---

## 1. Original User Request

```yaml
raw_user_request: |
  Depois: transformar QA em Execution/Verification Agent: sempre roda install quando necessário, build/test/lint definidos pelo project manifest, diagnostica erro, tenta correção uma vez, e só então falha.
```

## 2. Technical Interpretation

QA must use the project manifest command catalog as the source of truth. Validation should include install/bootstrap commands when dependency setup is available, then build/lint/typecheck/test commands from the manifest. Failed dependency-shaped validation may run one repair command and retry the failing validation once.

## 3. Scope

```yaml
in_scope:
  - "Prepend manifest install/setup commands to QA validation plans when validation commands exist."
  - "Keep ProjectExecutionService one-shot dependency repair and retry evidence."
  - "Expose all command runs as RuntimeValidationCommandEvidence."
out_of_scope:
  - "LLM-driven arbitrary code repair in this step."
  - "Multiple self-healing loops beyond one deterministic retry."
```

## 4. Integration Contract

```yaml
source_of_truth: "ProjectContextSnapshot.inspection + HorusProjectConfig.commandCatalog"
qa_command_order:
  - "install/setup if detected and allowed"
  - "typecheck/check/build/lint/test from validation strategy"
repair_limit: 1
failure_behavior: "Fail only after bootstrap/validation/repair evidence is captured."
```

## 5. Validation

```yaml
checks:
  - "qaRuntimeValidationPlanner includes install before validation."
  - "ProjectExecutionService tests cover dependency repair and retry."
```

## 6. Acceptance Criteria

```yaml
functional:
  - "QA uses the project manifest/context snapshot as command source of truth."
  - "Install/bootstrap runs before build/lint/typecheck/test when dependencies are detected."
  - "Failed dependency-shaped validation may repair once and retry once."
integration:
  - "RuntimeValidationCommandEvidence preserves every install, validation, repair, and retry run."
  - "Curator sees latest QA runtime evidence and can block on failed validation."
quality:
  - "No LLM-only claim can mark QA as passed without command evidence."
```

## 7. Completion Checklist

```yaml
implementation:
  - "Planner prepends install-root-dependencies only when validation commands exist."
  - "Runtime evidence retains repair history and latest successful attempts."
validation:
  - "QA planner and runtime evidence tests pass."
```
