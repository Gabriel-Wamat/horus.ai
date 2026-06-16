---
format_version: "agentic_sdd.v1"
task_id: "qa-curator-shell-output"
title: "QA And Curator Shell Output Contract"
created_at_utc: "2026-05-30T00:00:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
---

## 1. Original User Request

```yaml
raw_user_request: |
  Primeiro: plugar onShellOutput no QA e Curator onde houver validação real, emitindo command_output no mesmo contrato do Front.
```

## 2. Technical Interpretation

QA and Curator validations must stream terminal output through the same `command_output` workflow event shape used by Front. The event must carry `commandId`, `taskId`, trace ids, project/agent ids, stream/chunk sequence, and `operationalSessionId` when the validation belongs to an operational session.

## 3. Scope

```yaml
in_scope:
  - "Propagate operationalSessionId through ShellCommandRequest/ShellCommandOutputEvent."
  - "Emit operationalSessionId in QA validation command_output/tool events."
  - "Emit operationalSessionId in Curator preflight command_output."
out_of_scope:
  - "Rewriting the whole event stream."
  - "Changing Front tool loop behavior."
```

## 4. Integration Contract

```yaml
producer:
  - "qaAgentNode.executeQaValidationCommands"
  - "curatorAgentNode preflight onCommandOutput"
consumer:
  - "WorkflowEventProjector"
  - "Execution Console"
  - "AgentOperationTimeline"
required_fields:
  - "threadId"
  - "agentName"
  - "agentProfileId"
  - "toolName"
  - "commandId"
  - "taskId"
  - "stream"
  - "chunk"
  - "chunkSequence"
  - "operationalSessionId"
```

## 5. Validation

```yaml
checks:
  - "TypeScript build must pass."
  - "Shell command runtime tests must pass."
  - "QA validation planner tests must pass."
```

## 6. Acceptance Criteria

```yaml
functional:
  - "QA validation emits command_output while commands stream stdout/stderr."
  - "Curator preflight emits command_output for real validation commands."
integration:
  - "command_output remains compatible with Front events."
  - "operationalSessionId is present when a validation belongs to a workflow operation."
quality:
  - "No UI inference is required to discover terminal output."
```

## 7. Completion Checklist

```yaml
implementation:
  - "ShellCommandRequest, ShellCommandOutputEvent, and ShellCommandResult include operationalSessionId."
  - "QA runtime passes onShellOutput and onShellCommandComplete through workflow events."
  - "Curator preflight passes onCommandOutput through workflow events."
validation:
  - "Targeted backend tests pass."
  - "Server build passes."
```
