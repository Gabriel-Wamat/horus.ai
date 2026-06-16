---
format_version: "agentic_sdd.v1"
task_id: "cli-hardening-no-arbitrary-shell"
title: "CLI Hardening Without Arbitrary Shell"
created_at_utc: "2026-05-30T00:00:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
---

## 1. Original User Request

```yaml
raw_user_request: |
  Depois: endurecer CLI com parser/sandbox/permission rules, sem abrir shell arbitrário.
```

## 2. Technical Interpretation

Ad-hoc command text may remain as an input convenience, but it must be parsed into a single simple executable plus arguments and executed with `shell:false`. Shell separators, pipes, redirections, command substitution, and background operators are denied before spawn.

## 3. Scope

```yaml
in_scope:
  - "Normalize simple command text into direct executable/args."
  - "Deny pipelines, redirection, command substitution, and unmanaged background."
  - "Keep profile permissions: QA can install/build/test; Front cannot install; Curator requires approval."
out_of_scope:
  - "Full POSIX shell parser."
  - "Network-capable executables."
```

## 4. Integration Contract

```yaml
runtime: "ExecutionTaskRuntime"
spawn_mode: "shell:false"
accepted_text_command: "single simple command"
denied_text_command:
  - "a | b"
  - "a && b"
  - "a > file"
  - "a $(b)"
  - "a &"
permission_decision: "allow | deny | ask"
```

## 5. Validation

```yaml
checks:
  - "ShellCommandRuntime no longer spawns /bin/bash for simple command text."
  - "Pipeline/redirection tests are rejected before spawn."
  - "Profile permission tests remain green."
```

## 6. Acceptance Criteria

```yaml
functional:
  - "Simple command text is parsed to executable + args and spawned with shell:false."
  - "Pipes, chaining, redirection, command substitution, unmanaged background, and inline env assignments are denied before spawn."
  - "Profile policies still distinguish QA, Front, Curator, ODIN, Spec, and chat execution."
integration:
  - "ExecutionTaskRuntime, ShellCommandRuntime, and run_command share the same permission decision path."
  - "Rejected or approval-waiting commands are persisted as task evidence."
quality:
  - "No arbitrary shell is opened for accepted command text."
```

## 7. Completion Checklist

```yaml
implementation:
  - "CommandPermissionEngine normalizes accepted command text without /bin/bash -lc."
  - "ExecutionTaskRuntime keeps shell:false and supports approval/retry/kill/output polling."
validation:
  - "Shell runtime and execution task tests pass."
```
