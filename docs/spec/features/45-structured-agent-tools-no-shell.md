---
format_version: "agentic_sdd.v1"
task_id: "feature-45-structured-agent-tools-no-shell"
title: "Structured Agent Tools Without Free Shell"
created_at_utc: "2026-05-26T23:45:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented"
depends_on:
  - "spec/features/24-real-cli-capability-gate.md"
  - "spec/features/26-preview-command-policy-and-catalog.md"
  - "spec/features/37-project-file-editing-persistence.md"
  - "spec/features/43-specialized-subagents-tool-boundaries.md"
---

# 45 - Structured Agent Tools Without Free Shell

## 1. Original User Request

```yaml
raw_user_request: |
  minha preocupação é no 4, 5, 6, 8, 9 e 10. destrinche como podemos corrigir o projeto com base o que foi listar. e crie uma spec para cada cenário que expressei preocupação
concern_mapped_from_previous_answer: "8. Ferramentas estruturadas em vez de bash livre"
```

## 2. System Interpretation

```yaml
system_translation: |
  Trocar qualquer caminho informal de execução/edição por tools estruturadas com schema, auditoria,
  política de permissão, validação de path, redaction e resultados persistidos. Agentes não devem receber
  shell livre; devem pedir tools com nomes e inputs controlados.

expected_user_visible_result: |
  Horus consegue ler, buscar, salvar, validar e obter diff com segurança. O usuário vê quais tools foram
  usadas e por que uma tool foi bloqueada.

expected_engineering_result: |
  O backend passa a ter AgentToolRegistry, schemas de input/output por tool e logs de tool calls. SafeCliRunner
  continua existindo, mas só é chamado por tools de comando allowlisted.
```

## 3. Current Project Fit

```yaml
verified_existing_surfaces:
  - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
  - "apps/server/src/infrastructure/tools/CliCommandPolicy.ts"
  - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
  - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
  - "apps/server/src/infrastructure/code/ProjectCodeChangeSetApplier.ts"
  - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"

good_existing_parts:
  - "SafeCliRunner and command policy exist."
  - "Project file save has path/hash conflict protection."
  - "ReadOnlyCodeContextService protects project root."

gaps_to_fix:
  - "Tools are implementation classes, not a unified agent-facing registry."
  - "Tool call evidence is not normalized across read/write/command/diff operations."
  - "Agent permissions are not checked at a single execution boundary."
  - "There is no consistent user-facing blocked-tool reason."
```

## 4. Tool Catalog

```yaml
required_tools:
  read_file:
    mutates_state: false
    input: "{ projectId, path }"
    output: "{ path, content, versionHash, truncated }"
  search_code:
    mutates_state: false
    input: "{ projectId, query, maxResults }"
    output: "{ excerpts[] }"
  list_files:
    mutates_state: false
    input: "{ projectId, rootPath? }"
    output: "{ tree }"
  save_file:
    mutates_state: true
    input: "{ projectId, path, content, expectedVersionHash }"
    output: "{ path, newVersionHash, changed }"
  propose_code_change_set:
    mutates_state: false
    input: "{ operations[] }"
    output: "{ changeSetId, status }"
  apply_code_change_set:
    mutates_state: true
    input: "{ changeSetId, projectId }"
    output: "{ appliedOperations[], failedOperations[] }"
  run_validation_command:
    mutates_state: false
    input: "{ projectId, commandId }"
    output: "{ exitCode, stdoutTail, stderrTail, durationMs }"
  get_git_diff:
    mutates_state: false
    input: "{ projectId, baseRef? }"
    output: "{ files[], patchSummary }"
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Create shared AgentToolCall and AgentToolResult schemas."
    - "Create backend AgentToolRegistry with schema validation and permission checks."
    - "Wrap existing services as tools instead of duplicating logic."
    - "Persist tool call start/success/failure events."
    - "Redact secrets from tool outputs before prompts/UI."
    - "Block unknown tools and forbidden tools by profile."
  out_of_scope:
    - "Direct LLM function-calling provider migration."
    - "Remote execution or cloud sandbox."
    - "User-defined arbitrary scripts."
```

## 6. Integration Context Map

```yaml
integration_context:
  depends_on:
    - name: "SafeCliRunner"
      type: "backend_service"
      contract_used: "run(commandSpec)"
      required_for: "Execute only validation/preview commands selected by commandId."
      failure_modes:
        - "Command injection if raw command reaches runner."
      fallback_or_recovery: "Reject tool call before runner."
      verification:
        - "Test run_validation_command rejects raw shell text."
    - name: "ProjectFileBrowserService"
      type: "backend_service"
      contract_used: "read/list/save safe project files"
      required_for: "Read/write files with existing path and hash safeguards."
      failure_modes:
        - "Overwrite external changes."
      fallback_or_recovery: "Return conflict result."
      verification:
        - "Test save_file conflict path."

  depended_on_by:
    - name: "AgentProfileRegistry"
      type: "backend_service"
      contract_exposed: "tool permission matrix"
      compatibility_obligation: "Deny by default."
      expected_consumer_behavior: "Every agent tool call includes agentProfileId."
    - name: "Agent run event stream"
      type: "event_stream"
      contract_exposed: "tool_call_started/tool_call_finished/tool_call_blocked"
      compatibility_obligation: "Event payloads must be serializable and redacted."
      expected_consumer_behavior: "UI displays tool activity."
```

## 7. Execution Plan

```yaml
execution_plan:
  - step: "Add AgentTool schemas."
    files:
      - "packages/shared/src/entities/AgentResult.ts"
      - "packages/shared/src/entities/HorusRunFlow.ts"
  - step: "Implement AgentToolRegistry and permission checks."
    files:
      - "apps/server/src/application/services/AgentToolRegistry.ts"
      - "apps/server/src/application/services/AgentProfileRegistry.ts"
  - step: "Wrap existing services as tools."
    files:
      - "apps/server/src/application/tools/*.ts"
  - step: "Emit tool events into workflow/run stream."
    files:
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
  - step: "Update agents to request tools through registry only."
    files:
      - "apps/server/src/infrastructure/langgraph/dependencies.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/*.ts"
```

## 8. Acceptance Checklist

```yaml
acceptance_checklist:
  - "No agent receives arbitrary shell execution."
  - "Every tool has zod-validated input and output."
  - "Every tool result is redacted before prompt/UI persistence."
  - "Forbidden tool call is persisted as blocked evidence."
  - "save_file requires version hash."
  - "run_validation_command only accepts commandId."
  - "Tests cover allowed, blocked, invalid input, redaction and conflict."

validation_commands:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "node --test apps/server/test/*tool* apps/server/test/*projectFile* apps/server/test/*previewCommand*"
  - "pnpm test"
```

## 9. Implementation Log

```yaml
implemented_at_utc: "2026-05-26T00:00:00Z"
implementation_summary:
  - "Added shared AgentToolCall and AgentToolResult schemas plus tool-call event vocabulary for run-flow snapshots."
  - "Upgraded AgentToolRegistry to support per-tool Zod input/output schemas, mutability metadata, permission checks, blocked evidence, audit sink events and output redaction."
  - "Kept deny-by-default profile enforcement and made blocked tool calls auditable without invoking handlers."
  - "Added structured project tool wrappers for read_file, list_files, search_code, save_file, propose_code_change_set, apply_code_change_set, run_validation_command and get_git_diff."
  - "Ensured run_validation_command accepts commandId only through schema validation, not raw shell text."
  - "Ensured save_file delegates to the existing hash/version conflict protection in ProjectFileBrowserService."
  - "Updated focused tests for schema validation, redaction, blocked tools, structured file tools and raw-shell rejection."
validation_record:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "pnpm --filter @u-build/web type-check"
  - "node --test apps/server/test/agentToolRegistry.test.mjs apps/server/test/projectAgentTools.test.mjs apps/server/test/projectFileBrowser.test.mjs apps/server/test/previewCommandPolicy.test.mjs"
  - "pnpm test"
```
