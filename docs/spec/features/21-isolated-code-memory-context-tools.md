# SPEC 21 - Isolated Code and Chat Memory Context Tools

```yaml
format_version: "agentic_sdd.v1"
task_id: "21-isolated-code-memory-context-tools"
title: "Provide isolated code-folder and chat-memory context to Horus"
created_at_utc: "2026-05-26T13:58:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
```

## 1. Original User Request

```yaml
raw_user_request: |
  caso o usuário queira saber algo do código, o Horus(orquestrador) deve acessar os arquivos de código ou memória do chat(isso tem que tá estritamente isolado para não haver vazamentos)
```

## 2. System Interpretation

```yaml
system_translation: |
  Build read-only context tools for Horus/Odin to answer questions using only the selected chat session, selected workspace story/spec context, and selected frontend project code folder. The system must reject cross-project and cross-folder access.

expected_user_visible_result: |
  The user can ask questions about the currently selected project/code/story and receive answers grounded in that context.

expected_engineering_result: |
  Add bounded file-read/search services and context assembly rules that prevent leaking data from other projects, chats, folders, or stories.
```

## 3. Scope

```yaml
scope:
  in_scope:
    - "Create a read-only code context service scoped to FrontendProject.rootPath."
    - "Allow bounded file listing, targeted search, and selected file reads."
    - "Combine code context with ChatAgentContextBundle."
    - "Reject paths outside the selected project root."
    - "Apply size limits and ignore generated/vendor directories."
  out_of_scope:
    - "Do not write files."
    - "Do not execute shell commands."
    - "Do not access arbitrary user filesystem paths."
```

## 4. Integration Context

```yaml
integration_context:
  depends_on:
    - name: "FileFrontendProjectRegistry"
      type: "backend_service"
      contract_used: "FrontendProject.rootPath"
      required_for: "Resolve allowed code root."
    - name: "FileChatMemoryStore"
      type: "backend_service"
      contract_used: "ChatAgentContextBundle"
      required_for: "Attach isolated chat and story memory."
  depended_on_by:
    - name: "Horus/Odin intent router and answer use case"
      type: "backend_service"
      contract_exposed: "CodeContextBundle"
      compatibility_obligation: "Read-only and root-scoped."
  integration_risks:
    - risk: "Path traversal or accidental root escape"
      severity: "critical"
      mitigation: "Resolve realpath and require it to remain under project root."
    - risk: "Prompt/context overflow"
      severity: "high"
      mitigation: "Enforce file count, byte count, and search result limits."
```

## 5. Acceptance Criteria

```yaml
acceptance_criteria:
  - "Horus can answer using current chat memory and selected project files."
  - "A request for ../ or another project path is rejected."
  - "Generated folders such as node_modules/dist are ignored by default."
  - "The context bundle includes source file paths used for the answer."
  - "No answer may claim file facts without listing inspected files in metadata/logs."
```

## 6. Validation

```yaml
validation_protocol:
  tests:
    - "Root escape rejection test."
    - "Ignored directory test."
    - "Context size limit test."
    - "Answer context includes chat session id and project id."
  commands:
    - "pnpm --filter @u-build/server build"
    - "pnpm test"
```

## 7. Implementation Log

```yaml
implemented_at_utc: "2026-05-26T14:35:00Z"
status: "completed"
files_changed:
  - "packages/shared/src/entities/CodeContext.ts"
  - "packages/shared/src/entities/HorusChat.ts"
  - "packages/shared/src/index.ts"
  - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
  - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
  - "apps/server/test/readOnlyCodeContextService.test.mjs"
  - "apps/server/test/horusChatTurn.test.mjs"
summary:
  - "Added shared code-context schemas and source metadata on Horus chat outcomes."
  - "Added a read-only code context service scoped to FrontendProject.rootPath."
  - "Implemented realpath-based root containment and controlled access errors."
  - "Ignored generated/vendor folders and enforced file/byte limits."
  - "Answer-question turns now include inspected source files through contextSources."
validation:
  passed:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "pnpm --filter @u-build/web build"
    - "pnpm test"
    - "Runtime API smoke: answer_question returned chat mode with projectId, chatSessionId, and contextSources."
```
