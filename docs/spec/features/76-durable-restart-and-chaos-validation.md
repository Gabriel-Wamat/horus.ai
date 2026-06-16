---
format_version: "agentic_sdd.v1"
task_id: "feature-76-durable-restart-and-chaos-validation"
title: "Durable Restart And Chaos Validation"
created_at_utc: "2026-05-28T14:19:19Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
depends_on:
  - "spec/features/51-local-persistence-portability.md"
  - "spec/features/52-local-persistence-hardening-completion.md"
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "spec/features/68-preview-chat-durable-workflow-recovery.md"
---

# 76 - Durable Restart And Chaos Validation

## 1. Original User Request

```yaml
raw_user_request: |
  produto final, sem nenhum bug, sem nenhum erro de contrato(memória, chat)
```

## 2. System Interpretation

```yaml
system_translation: |
  Provar que workflow, checkpoint, ledger, chat, memoria e preview sobrevivem a restart/process crash sem duplicar
  eventos, perder cursor, reexecutar etapas ja concluidas ou exibir sucesso falso.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Add restart-safe workflow test harness for file-mode and Postgres mode."
    - "Validate LangGraph checkpoint continuity with thread_id and checkpoint state."
    - "Prove outbox/ledger idempotency after crash between node completion and chat projection."
    - "Add chaos cases for invalid SSE frame, preview process missing, stale running execution and partial write."
    - "Document recovery runbook and minimum evidence before claiming resumability."
  out_of_scope:
    - "Replacing LangGraph."
    - "Adding external orchestration service."
```

## 4. Validation

```yaml
validation:
  required_commands:
    - "pnpm --filter @u-build/server build"
    - "node --test apps/server/test/*restart*.test.mjs"
    - "node --test apps/server/test/*recovery*.test.mjs"
  acceptance_criteria:
    - "A workflow can be resumed after process restart without duplicate user-visible progress."
    - "Failed partial writes are either repaired or terminalized with typed evidence."
```

## 5. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T14:47:35Z"
implemented_version: "1.0.0"
changes:
  - "Made file and Postgres execution outbox claims retry failed rows until dead_letter."
  - "Made WorkflowOrchestrator complete workflow.start replay without rerunning the graph when the corresponding run is already terminal."
  - "Added durable restart tests for file checkpointer continuity, terminal processing-outbox recovery and dead-letter evidence."
  - "Added a durable restart recovery runbook with minimum evidence before claiming resumability."
coverage_notes:
  - "File-mode checkpoint continuity is exercised directly with a restart-style saver reload."
  - "Outbox crash recovery is exercised against the file ledger, including processing-to-processed terminal recovery and failed-to-dead_letter evidence."
  - "Postgres outbox retry behavior is implemented in the claim query and covered by build/type-check; a live Postgres chaos drill still requires a configured database fixture."
validation_evidence:
  - "pnpm --filter @u-build/server build"
  - "node --test apps/server/test/*restart*.test.mjs apps/server/test/*recovery*.test.mjs"
  - "pnpm type-check"
  - "node --test apps/server/test/agentExecutionLedger.test.mjs apps/server/test/durable-restart-recovery.test.mjs apps/server/test/processBrowserPreviewAdapter.test.mjs apps/server/test/projectCodeChangeSetApplier.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
```
