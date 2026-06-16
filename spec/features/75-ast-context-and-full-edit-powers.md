---
format_version: "agentic_sdd.v1"
task_id: "75-ast-context-and-full-edit-powers"
title: "AST Context And Full Edit Powers"
created_at_utc: "2026-05-29T00:00:00.000Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
status: "implemented"
---

# 1. Original User Request

```yaml
raw_user_request: |
  impement

  verifique se ele tá com plenos poderes de edicao, para n ter que reescreve tudo de novo sempre. caso n, levante as condições necessárias e coloque no plano
```

# 2. System Interpretation

The Horus coding agents must stop behaving like full-file generators when a narrow code change is enough. They need first-class structural context from AST/repository retrieval and a governed editing path that can create, update, delete, run validation, and report evidence without depending on manual user intervention.

Expected user-visible result: when an agent changes code, the UI/runbook should show targeted reads, targeted edits, deletes, commands, diffs, and validation outcomes instead of vague summaries or full-file rewrites.

Expected engineering result: `search_code`/preloaded code context exposes compact AST/semantic evidence; `AgentToolLoop` uses read-before-write for all mutations; full-file `CodeChangeSet` updates are translated into minimal line-range replacements when safe; delete operations are unblocked by mandatory read evidence.

# 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Agents inspect generated projects but still miss obvious runtime/code errors or rewrite too much."
  target_user: "Horus operators using the preview chat to ask agents to edit generated projects."
  expected_outcome: "Agents can reason from project structure, edit narrowly, delete safely, run validation, and show evidence."
  product_surface:
    - "Preview chat code-change loop"
    - "Front Agent workflow tool loop"
    - "Runbook/file-operation telemetry"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph"
      - "Tree-sitter AST analyzer"
    frontend:
      - "React/Vite preview console"
    infrastructure:
      - "Governed AgentToolRuntime"
      - "FileMutationPreflightApplier"
  known_entrypoints:
    - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
    - "apps/server/src/application/services/AgentToolLoop.ts"
    - "apps/server/src/application/tools/registerProjectAgentTools.ts"
    - "apps/server/src/infrastructure/agents/HorusChatToolAgent.ts"
  known_existing_patterns:
    - "Read-before-write evidence is required by AgentToolRuntime for edit/save/overwrite/delete."
    - "Front Agent direct mutation goes through AgentToolLoop when tool mode is enabled."
    - "CodeChangeSet remains the auditable contract between generated output and file mutation."
```

# 4. Scope

```yaml
scope:
  in_scope:
    - "Audit and fix missing full-edit-power conditions in the current tool loop."
    - "Make delete CodeChangeSet operations read the file before calling delete_file."
    - "Translate safe full-file update CodeChangeSet operations into minimal replace_file_range calls."
    - "Include replace_file_range in AgentToolLoop changed-file bookkeeping and operational session evidence."
    - "Add compact AST/semantic project context to ReadOnlyCodeContextService and chat prompts."
    - "Add focused tests for delete, minimal update translation, and structural code context."
  out_of_scope:
    - "Grant mutation powers to QA, Curator, or ODIN."
    - "Allow arbitrary shell or direct filesystem writes."
    - "Bypass protected paths, write roots, preflight, or read-before-write policy."
    - "Implement global rename automation without explicit symbol-resolution review."
```

# 5. Current Edit Power Audit

```yaml
verified_current_capabilities:
  horus_chat_executor:
    has:
      - "inspect_project"
      - "read_file"
      - "search_code"
      - "list_files"
      - "get_git_diff"
      - "run_validation_command"
      - "run_command"
      - "edit_file"
      - "replace_file_range"
      - "write_file"
      - "delete_file"
      - "propose_code_change_set"
    missing_by_design:
      - "apply_code_change_set"
      - "git_push"
      - "direct_fs_write"
      - "arbitrary_shell"
  front_agent:
    has:
      - "inspect_project"
      - "read/search/list"
      - "write_file"
      - "edit_file"
      - "save_file"
      - "delete_file"
      - "propose_code_change_set"
      - "run_command"
      - "run_validation_command"
    missing_by_design:
      - "direct_fs_write"
      - "arbitrary_shell"
      - "git_push"
      - "apply_code_change_set"

gaps_found:
  - "AgentToolLoop calls delete_file without first calling read_file, but AgentToolRuntime requires read evidence for delete_file."
  - "AgentToolLoop maps update CodeChangeSet operations to edit_file with oldString=entire beforeContent and newString=entire afterContent."
  - "replace_file_range exists as a targeted edit tool but is not used by AgentToolLoop for full-file CodeChangeSet diffs."
  - "replace_file_range is not included in some AgentToolLoop file-change bookkeeping helpers."
  - "ReadOnlyCodeContextService currently returns lexical excerpts only; AST, symbol, graph, and semantic context exist elsewhere but are not yet attached to generic search_code context."
```

# 6. Conditions For Full Edit Power

The agent has full practical editing power only when all conditions below hold:

1. It has a selected `projectId`/workspace and the project resolves to a real root.
2. The target path is inside allowed write roots and outside protected paths.
3. The agent can call `inspect_project`, `read_file`, `search_code`, `list_files`, `get_git_diff`, `edit_file`, `replace_file_range`, `write_file`, `delete_file`, `run_command`, and `run_validation_command`.
4. Every update/delete/overwrite has read evidence from the current file version.
5. For existing files, the agent prefers `edit_file` or `replace_file_range`; `write_file overwrite=true` is exceptional.
6. Full-file CodeChangeSet updates are converted to minimal patches when the current file equals the captured before snapshot.
7. Delete operations read the file first, including binary/truncated files, to seed version evidence.
8. Validation commands are registered in the project command catalog or supplied through the governed shell policy.
9. Runtime/build/terminal/preview errors are fed back as evidence for another read-edit-validate cycle.
10. The runbook stores reads, edits, deletes, commands, diffs, errors, and final status.

# 7. Integration Context

```yaml
integration_context:
  depends_on:
    - name: "AgentProfileRegistry"
      type: "internal_module"
      contract_used: "allowedTools/forbiddenTools per profile"
      required_for: "Determine whether each agent can mutate, validate, or only inspect."
      verification:
        - "apps/server/test/agentProfileRegistry.test.mjs"
    - name: "AgentToolRuntime"
      type: "backend_service"
      contract_used: "readEvidence mutation policy"
      required_for: "Prevent stale or blind mutation."
      verification:
        - "apps/server/test/agentToolRuntime.test.mjs"
    - name: "AgentToolLoop"
      type: "backend_service"
      contract_used: "CodeChangeSet to tool calls"
      required_for: "Execute front-agent changes through governed tools."
      verification:
        - "apps/server/test/agentToolLoop.test.mjs"
    - name: "ReadOnlyCodeContextService"
      type: "backend_service"
      contract_used: "CodeContextBundle"
      required_for: "Provide lexical and structural context to agents."
      verification:
        - "apps/server/test/readOnlyCodeContextService.test.mjs"
  depended_on_by:
    - name: "HorusChatToolAgent"
      type: "agent"
      contract_exposed: "Prompt context and tool specs"
      compatibility_obligation: "Must preserve existing chat behavior while adding structural evidence."
    - name: "Front Agent workflow node"
      type: "workflow"
      contract_exposed: "ToolLoop execution of CodeChangeSet"
      compatibility_obligation: "Must preserve CodeChangeSet as the audited artifact."
  data_flow:
    inbound:
      - source: "CodeChangeSet"
        payload_or_state: "create/update/delete operations"
        validation: "Zod schemas and mutation preflight"
      - source: "Repository scanner/retriever/AST analyzer"
        payload_or_state: "files, excerpts, symbols, diagnostics"
        validation: "bounded context schemas"
    outbound:
      - sink: "Agent operational session"
        payload_or_state: "file_read/file_changed/command_ran events"
      - sink: "Preview chat/runbook UI"
        payload_or_state: "tool calls, diffs, validation status"
```

# 8. Execution Plan

1. Fix governed delete execution:
   - In `AgentToolLoop`, call `read_file` before `delete_file`.
   - Preserve binary/truncated support for delete; evidence is enough.

2. Add minimal update translation:
   - Add a deterministic helper that compares current file content with proposed after content and computes the smallest contiguous 1-based line range replacement.
   - In `AgentToolLoop`, when `read.content === operation.beforeContent`, call `replace_file_range` with that minimal range instead of full-file `edit_file`.
   - Fall back to existing exact `edit_file` behavior when before snapshot does not match the full current file.

3. Update operational evidence:
   - Treat `replace_file_range` as a mutating file tool in changed-file extraction, session recording, and change-type inference.
   - Ensure result diffs/additions/deletions are captured in the same path as `edit_file`.

4. Add AST context to generic code search:
   - Extend `CodeContextBundle` with a bounded `structuralContext` object.
   - Let `ReadOnlyCodeContextService` optionally receive AST/semantic services.
   - Include compact symbols, parse diagnostics, and semantic/graph notes without dumping full AST trees.
   - Update chat prompt formatting to surface structural context as evidence.

5. Validate:
   - `pnpm --filter @u-build/shared build`
   - `pnpm --filter @u-build/server build`
   - `node --test apps/server/test/agentToolLoop.test.mjs apps/server/test/readOnlyCodeContextService.test.mjs apps/server/test/horusChatToolAgent.test.mjs`

# 9. Acceptance Criteria

- Delete CodeChangeSet operations succeed for `front_agent` when the file exists and path policy allows it.
- Update CodeChangeSet operations with full before/after snapshots use `replace_file_range` for localized changes.
- `replace_file_range` appears as a real file mutation in operational session projections/runbook evidence.
- Agents still cannot mutate without project context or read evidence.
- Agents still cannot mutate protected paths or outside configured write roots.
- `search_code` returns lexical context plus compact structural context when AST analysis is available.
- Build and focused tests pass.

# 10. Completion Output Contract

The executing agent must report:

- Files changed.
- Whether full edit powers are now satisfied or what remains intentionally out of scope.
- Validation commands and results.
- Any residual risk around full-file CodeChangeSet generation or AST availability.

# 11. Implementation Notes

- `front_agent` now has explicit `replace_file_range` permission.
- `AgentToolLoop` reads files before delete operations so runtime read-evidence policy is satisfied.
- `AgentToolLoop` converts safe full-snapshot updates into minimal `replace_file_range` calls instead of whole-file `edit_file` replacements.
- `replace_file_range` is now counted as a file mutation in loop bookkeeping and operational session evidence.
- `ReadOnlyCodeContextService` can attach compact AST symbols, diagnostics, and optional semantic matches to `CodeContextBundle`.
- The HTTP server and default LangGraph dependencies now wire the Tree-sitter analyzer into generic code context.
