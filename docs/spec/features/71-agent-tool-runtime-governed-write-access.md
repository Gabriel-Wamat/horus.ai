---
format_version: "agentic_sdd.v1"
task_id: "feature-71-agent-tool-runtime-governed-write-access"
title: "Agent Tool Runtime With Governed Edit Save Delete Update"
created_at_utc: "2026-05-27T23:59:00Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented"
depends_on:
  - "spec/features/21-isolated-code-memory-context-tools.md"
  - "spec/features/22-chat-driven-agent-code-change-loop.md"
  - "spec/features/37-project-file-editing-persistence.md"
  - "spec/features/43-specialized-subagents-tool-boundaries.md"
  - "spec/features/45-structured-agent-tools-no-shell.md"
  - "spec/features/46-agent-progress-ux-evidence.md"
  - "spec/features/47-validation-gates-true-success.md"
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "spec/features/67-artifact-validation-self-healing-and-observability-control-plane.md"
  - "spec/features/70-code-change-set-delete-and-safe-file-mutations.md"
---

# 71 - Agent Tool Runtime With Governed Edit Save Delete Update

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec para resolver esses problemas, se precisar crie mais de uma
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar uma SPEC executavel para transformar o Horus em um runtime onde agentes tenham acesso real e
  governado a edit, save, delete e update. Hoje existem ferramentas e contratos parciais, mas o loop
  LangGraph padrao usa apenas leitura de contexto e aplica CodeChangeSet somente depois da curadoria.
  A solucao deve introduzir tool runtime, politicas por agente, contexto de workspace, modo ReAct
  opcional, validacao, rollback, eventos de progresso e protecoes de seguranca.

expected_user_visible_result: |
  Quando o usuario pedir uma alteracao no Preview chat, o agente deve realmente editar/salvar/remover
  arquivos permitidos, validar o resultado, recarregar/refletir o preview e mostrar status fiel:
  lendo, editando, salvando, validando, aplicado, falhou ou rollback.

expected_engineering_result: |
  O Horus ganha um Agent Tool Runtime tipado, seguro e testavel. Ferramentas mutaveis deixam de ser
  apenas registradas em testes e passam a estar disponiveis no runtime dos agentes autorizados, com
  write roots, command catalog, max payload size, path policy, event tracing, fallback estruturado e
  compatibilidade com o fluxo CodeChangeSet existente.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O Preview chat aceita pedidos de alteracao, mas o usuario ve o projeto sem mudanca quando o patch fica preso em proposta/curadoria ou quando o agente nao tem tools reais."
  target_user: "Operador do Horus que espera que agentes Spec/Odin/Front/QA/Curator trabalhem sobre projetos gerados com evidencia real."
  expected_outcome: "Agentes executores conseguem editar com seguranca, validam antes de concluir e nunca mascaram proposta como alteracao aplicada."
  product_surface:
    - "Preview chat"
    - "Agent flow map"
    - "Project Files"
    - "Workflow run events"
    - "Generated project preview"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph StateGraph"
      - "AgentProfileRegistry"
      - "AgentToolRegistry"
      - "registerProjectAgentTools"
      - "WorkflowOrchestrator"
      - "FrontAgentImpl"
      - "CuratorAgentImpl"
      - "ProjectFileBrowserService"
      - "ProjectExecutionService"
      - "SafeCliRunner"
    frontend:
      - "React"
      - "Vite"
      - "PreviewConversationPanel"
      - "VisualPreviewConsole"
      - "Agent Flow map"
    database:
      - "agent_execution_turns"
      - "agent_workflow_runs"
      - "agent_workflow_attempts"
      - "agent_artifacts"
      - "workflow_events"
      - "code_change_sets"
      - "chat_messages"
    infrastructure:
      - "file-mode persistence"
      - "Postgres persistence"
      - "project workspaces"
      - "preview runtime manager"
  known_entrypoints:
    - "apps/server/src/application/services/AgentToolRegistry.ts"
    - "apps/server/src/application/services/AgentProfileRegistry.ts"
    - "apps/server/src/application/tools/registerProjectAgentTools.ts"
    - "apps/server/src/infrastructure/langgraph/dependencies.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
    - "apps/server/src/infrastructure/project/ProjectConfigService.ts"
    - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
  known_existing_patterns:
    - "Agent profiles define allowedTools and forbiddenTools."
    - "AgentToolRegistry can enforce tool access and validate input/output schemas."
    - "registerProjectAgentTools already wraps read/list/search/save/propose/apply/validation/diff tools."
    - "LangGraph dependencies currently expose only read-only context building to FrontAgent."
    - "Mutable project work must remain controlled by selected project root and workflow evidence."
```

## 4. Observed Evidence

```yaml
observed_evidence:
  tools_exist_but_are_not_runtime_loop:
    - file: "apps/server/src/application/tools/registerProjectAgentTools.ts"
      finding: "read_file, list_files, search_code, save_file, propose_code_change_set, apply_code_change_set, run_validation_command and get_git_diff are implemented as registry tools."
    - file: "apps/server/src/infrastructure/langgraph/dependencies.ts"
      finding: "defaultLangGraphDependencies registers search_code_readonly and buildFrontendCodeContext executes only that read-only tool."
    - file: "apps/server/src/infrastructure/http/server.ts"
      finding: "createApp instantiates ProjectFileBrowserService but does not wire registerProjectAgentTools into the active default tool registry for agent execution."
  permissions_are_partial:
    - file: "apps/server/src/application/services/AgentProfileRegistry.ts"
      finding: "front_agent can propose but cannot save/apply; curator_agent can save/apply; qa_agent can validate but not write."
    - file: "apps/server/src/application/services/AgentToolRegistry.ts"
      finding: "Registry can deny forbidden tools but no ReAct tool invocation loop currently gives agents the tools during generation."
  structured_flow_is_still_needed:
    - file: "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
      finding: "FrontAgent returns operations/codeChangeSet as structured output; this path should remain as fallback and audit trail."
    - file: "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
      finding: "Curator gates deterministic preflight/visual evidence and should remain the final approval boundary."
  chat_status_must_be_truthful:
    - file: "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      finding: "patch_applied is emitted only after applier success; chat progress must continue to rely on real events."
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Introduce a TypeScript Agent Tool Runtime for Horus."
    - "Wire project tools into active LangGraph dependencies through dependency injection."
    - "Expose real edit/save/delete/update capabilities only to authorized agents and contexts."
    - "Implement writeRoots, maxWriteFileBytes, sensitive path denylist, symlink denial and command catalog enforcement."
    - "Add optional ReAct/tool mode behind environment flag and per-agent capability gate."
    - "Preserve existing structured CodeChangeSet path as fallback and audit artifact."
    - "Emit durable tool events and chat/activity progress for tool start, tool finish, file change, validation, rollback and failure."
    - "Use feature 70 delete semantics for delete_file/apply_code_change_set."
    - "Add tests proving front_agent can edit allowed files and cannot touch forbidden paths; qa_agent cannot write; chat_agent is read-only; curator can apply approved changes."
  out_of_scope:
    - "Removing the Curator approval model."
    - "Allowing arbitrary shell commands."
    - "Making every agent writable."
    - "Changing public README/docs."
    - "Rewriting the whole agent prompting stack."
    - "Adding external workflow infrastructure."
    - "Hardcoding local machine paths, ports or project ids."
```

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/application/services/AgentToolRegistry.ts"
      - "apps/server/src/application/services/AgentProfileRegistry.ts"
      - "apps/server/src/application/tools/registerProjectAgentTools.ts"
      - "apps/server/src/infrastructure/langgraph/dependencies.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
      - "apps/server/src/infrastructure/project/ProjectConfigService.ts"
      - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
      - "apps/server/src/infrastructure/tools/SafeCliRunner.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    services:
      - "AgentToolRuntime"
      - "AgentToolRegistry"
      - "AgentProfileRegistry"
      - "ProjectFileBrowserService"
      - "ProjectExecutionService"
      - "WorkflowOrchestrator"
      - "PromptContextAssembler"
    database:
      migrations_required: false
      tables:
        - "workflow_events"
        - "agent_workflow_runs"
        - "agent_workflow_attempts"
        - "agent_artifacts"
        - "code_change_sets"
  frontend:
    files:
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/features/agent-flow-map/utils/agentFlowApi.ts"
    components:
      - "Preview chat status"
      - "Agent Flow map"
      - "Project Files"
    routes:
      - "?mode=preview"
      - "?mode=agents"
      - "?mode=files"
  workflow:
    graph_nodes:
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
      - "odinAgent"
    agents:
      - "Chat Agent"
      - "Spec Agent"
      - "Odin Agent"
      - "Front Agent"
      - "QA Agent"
      - "Curator Agent"
  tests:
    unit:
      - "apps/server/test/agentToolRegistry.test.mjs"
      - "apps/server/test/projectAgentTools.test.mjs"
      - "apps/server/test/agentToolRuntime.test.mjs"
    integration:
      - "apps/server/test/frontAgentNodeToolRuntime.test.mjs"
      - "apps/server/test/horusChatTurn.test.mjs"
      - "apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
    e2e:
      - "Preview chat request applies visible text change"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec connects agent generation, project file mutation, validation commands, workflow events,
    chat projection and preview refresh. The key architecture rule is that tools are real, but never
    ungoverned: every tool call must be scoped to a selected project, authorized by agent profile,
    validated by schema/policy and observable through durable events.

  depends_on:
    - name: "Feature 70 CodeChangeSet mutation semantics"
      type: "internal_module"
      owner: "packages/shared and apps/server code runtime"
      direction: "this_spec_consumes_dependency"
      contract_used: "create/update/delete CodeChangeSet operation semantics"
      required_for: "delete_file and apply_code_change_set must share one mutation contract."
      assumptions:
        - "Feature 70 has already landed or will be implemented first."
      failure_modes:
        - "Tool runtime can delete files but workflow applier cannot persist/replay delete operations."
      fallback_or_recovery: "Do not enable delete tool until CodeChangeSet delete tests pass."
      verification:
        - "node --test apps/server/test/projectCodeChangeSetApplier.test.mjs"

    - name: "AgentProfileRegistry"
      type: "internal_module"
      owner: "apps/server application services"
      direction: "this_spec_consumes_dependency"
      contract_used: "allowedTools, forbiddenTools, agent profile ids"
      required_for: "Deny-by-default tool authorization."
      assumptions: []
      failure_modes:
        - "Wrong profile can mutate files."
        - "Allowed tool list drifts from registered tool list."
      fallback_or_recovery: "Startup validation fails if a profile references unregistered mutable tools."
      verification:
        - "node --test apps/server/test/agentToolRegistry.test.mjs"

    - name: "ProjectConfigService and project command catalog"
      type: "backend_service"
      owner: "apps/server infrastructure project"
      direction: "this_spec_consumes_dependency"
      contract_used: ".horus-project config, write roots, command catalog, role profiles"
      required_for: "Tool runtime needs write roots and command ids before allowing write/exec tools."
      assumptions: []
      failure_modes:
        - "Agent executes command by shell string instead of command id."
        - "Agent writes outside intended generated project area."
      fallback_or_recovery: "No write/exec tools are exposed if config cannot be resolved."
      verification:
        - "Project fixture tests with explicit command catalog and writeRoots."

    - name: "Workflow event stream"
      type: "event_stream"
      owner: "apps/server domain/infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "workflow_events and SSE consumers"
      required_for: "User-visible tool progress and truthful terminal status."
      assumptions: []
      failure_modes:
        - "Tool succeeds but UI stays stale."
        - "Tool fails but chat reports success."
      fallback_or_recovery: "Persist failure event and chat failure message whenever tool runtime aborts."
      verification:
        - "Event projection tests and Preview browser smoke."

  depended_on_by:
    - name: "FrontAgent"
      type: "agent"
      owner: "apps/server infrastructure agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "optional tool-capable execution path"
      compatibility_obligation: "must preserve structured output fallback"
      expected_consumer_behavior: "Can inspect, edit and validate allowed frontend files when tool mode is enabled."
      migration_or_notification_required: false
      verification:
        - "frontAgent node test with fake tool runtime"

    - name: "QA Agent"
      type: "agent"
      owner: "apps/server infrastructure agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "read/validation tools without write access"
      compatibility_obligation: "write_project_file remains forbidden"
      expected_consumer_behavior: "Can run configured validation command ids and read diffs, not mutate files."
      migration_or_notification_required: false
      verification:
        - "qa_agent write denial test"

    - name: "Curator Agent"
      type: "agent"
      owner: "apps/server infrastructure agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "apply_code_change_set with approved candidate context"
      compatibility_obligation: "Curator can apply approved changes but must not author arbitrary new changes silently."
      expected_consumer_behavior: "Applies candidate only after gates pass and records evidence."
      migration_or_notification_required: false
      verification:
        - "curator apply allowed and arbitrary save denied unless explicitly scoped"

    - name: "Preview chat UI"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "tool progress events and terminal apply/failure messages"
      compatibility_obligation: "must continue rendering old workflow events"
      expected_consumer_behavior: "Shows real edit/save/delete/update progress."
      migration_or_notification_required: false
      verification:
        - "pnpm --filter @u-build/web test:guards"

  bidirectional_integrations:
    - name: "Agent runtime and Project workspace"
      participants:
        - "AgentToolRuntime"
        - "ProjectFileBrowserService"
      shared_contract: "ToolExecutionContext with projectId, projectRootPath, writeRoots and role permissions"
      consistency_rule: "Every mutating call must be authorized by profile and project config before filesystem access."
      verification:
        - "Allowed write, forbidden write, path escape and sensitive path tests."

    - name: "Tool runtime and workflow evidence"
      participants:
        - "AgentToolRuntime"
        - "WorkflowOrchestrator/event projector"
      shared_contract: "tool_started/tool_finished/file_change/validation events"
      consistency_rule: "A user-visible success message requires successful mutation and validation evidence."
      verification:
        - "Chat projection test for edit success and edit failure."

  data_flow:
    inbound:
      - source: "Preview chat mutable request"
        payload_or_state: "chat session, project id, user story/spec context, execution brief"
        validation: "SubmitHorusChatTurnUseCase context guard and AgentProfileRegistry"
      - source: "LangGraph FrontAgent node"
        payload_or_state: "userStory, spec, feedback, codeContext, designContext, promptContext"
        validation: "runtime setting decides structured vs tool mode"
    outbound:
      - target: "Generated project filesystem"
        payload_or_state: "authorized edit/save/delete/update"
        compatibility: "Only selected project root and configured writeRoots can be touched"
      - target: "Preview/chat/activity UI"
        payload_or_state: "durable progress and terminal events"
        compatibility: "Must be schema-safe and backward compatible with current events"

  sequencing_dependencies:
    - dependency: "Feature 70 implemented first"
      reason: "delete_file and apply_code_change_set need shared mutation semantics."
      validation: "Feature 70 required tests pass."
    - dependency: "Tool runtime hidden behind env flag"
      reason: "Allows incremental rollout and fallback if ReAct behavior is unstable."
      validation: "Tests cover disabled and enabled modes."
    - dependency: "Path/command policy before tool exposure"
      reason: "Tools must never be exposed before their safety boundary exists."
      validation: "Write/exec denial tests pass before agent runtime tests."

  integration_risks:
    - risk: "Agents overuse tools or loop indefinitely"
      severity: "high"
      mitigation: "Recursion limit, timeout, max tool calls, fallback to structured mode and explicit failure event."
    - risk: "Tool mode bypasses Curator approval"
      severity: "critical"
      mitigation: "FrontAgent may edit candidate workspace or produce CodeChangeSet; final delivery still requires Curator/deterministic gates unless scoped as direct safe edit."
    - risk: "Tool writes secrets or local-only files"
      severity: "critical"
      mitigation: "Sensitive path denylist, content redaction scanner and no process.env inheritance for project commands."
    - risk: "UI shows success before disk mutation"
      severity: "high"
      mitigation: "Success chat messages derive only from patch_applied/tool_finished success events."
```

## 8. Required Architecture Rules

```yaml
architecture_rules:
  - "Deny by default: a tool is unavailable unless registered, allowed by profile, allowed by project config and valid for current workflow context."
  - "Read-only agents must never receive mutating tools."
  - "Mutating tools must require projectId and projectRootPath or resolvable selected project context."
  - "writeRoots are mandatory for write/delete/update/save."
  - "Command execution must use commandId from project command catalog; raw shell strings are forbidden."
  - "No tool may inherit full process.env when executing project code."
  - "Tool mode must be optional and feature-flagged until stable."
  - "Structured CodeChangeSet mode remains the fallback and audit path."
  - "Every tool call must emit auditable evidence with redacted inputs/outputs."
  - "The frontend must never infer success from assistant prose alone."
```

## 9. Tool Capability Matrix

```yaml
tool_capability_matrix:
  chat_agent:
    read:
      - "list_files"
      - "read_file"
      - "search_code"
    write: []
    exec: []
    forbidden:
      - "save_file"
      - "edit_file"
      - "delete_file"
      - "apply_code_change_set"
      - "run_validation_command"

  spec_agent:
    read:
      - "read_file"
      - "search_code"
      - "get_user_story"
      - "get_spec"
    write:
      - "save_spec_revision"
    exec: []
    forbidden:
      - "save_file"
      - "delete_file"
      - "apply_code_change_set"

  front_agent:
    read:
      - "list_files"
      - "read_file"
      - "search_code"
      - "get_git_diff"
    write:
      - "edit_file"
      - "save_file"
      - "propose_code_change_set"
    exec:
      - "run_validation_command"
    forbidden:
      - "apply_code_change_set"
      - "git_push"
      - "arbitrary_shell"

  qa_agent:
    read:
      - "read_file"
      - "search_code"
      - "get_git_diff"
      - "read_code_change_set"
    write: []
    exec:
      - "run_validation_command"
    forbidden:
      - "save_file"
      - "edit_file"
      - "delete_file"
      - "apply_code_change_set"

  curator_agent:
    read:
      - "read_file"
      - "search_code"
      - "get_git_diff"
      - "read_validation_evidence"
    write:
      - "apply_code_change_set"
    exec:
      - "run_validation_command"
    forbidden:
      - "git_push"
      - "arbitrary_shell"
      - "unscoped_save_file"
```

## 10. Detailed Execution Plan

```yaml
execution_plan:
  phase_1_policy_contracts:
    owner: "backend agent"
    steps:
      - "Add ToolCapability and ToolPolicy types in TypeScript or extend AgentProfileRegistry contracts without breaking existing profiles."
      - "Define ToolExecutionContext with threadId, runId, attemptId, agentProfileId, projectId, projectRootPath, writeRoots, commandCatalog, allowedCommandIds, maxWriteFileBytes."
      - "Add policy helpers for path safety, sensitive path blocking, symlink blocking and command authorization."
      - "Add unit tests for policy decisions."

  phase_2_tool_registration:
    owner: "backend agent"
    steps:
      - "Wire registerProjectAgentTools in createApp/default dependencies using projectFileBrowser, codeContext, projectConstruction, codeChangeSets and applier."
      - "Add edit_file and delete_file tools if save_file alone is insufficient for precise operations."
      - "Ensure mutable tools require ToolExecutionContext and cannot run with only projectId when context is missing."
      - "Add startup/test validation that allowed profile tools are registered."

  phase_3_react_runtime:
    owner: "backend/langgraph agent"
    steps:
      - "Add AgentToolRuntime facade that can execute registered tools with context and emit events."
      - "Add optional invokeWithTools path for selected agents behind HORUS_ENABLE_TOOL_MODE."
      - "Set recursion limit, timeout, max tool calls and max payload bytes."
      - "Require final structured artifact after tool calls."
      - "Fallback to structured generation when tool mode is disabled or unavailable."

  phase_4_langgraph_integration:
    owner: "backend/langgraph agent"
    steps:
      - "Thread ToolExecutionContext through frontAgentNode, qaAgentNode and curatorAgentNode."
      - "Keep buildFrontendCodeContext read-only path for grounding."
      - "Allow FrontAgent tool mode for chat_code_change first, then project_construction after validation."
      - "Keep Curator as final apply authority for delivered CodeChangeSets."
      - "Ensure workflowMode and sourceChatSessionId are included in tool evidence."

  phase_5_events_and_ui:
    owner: "backend/frontend agent"
    steps:
      - "Persist tool_started/tool_finished/file_change/validation_started/rollback events."
      - "Project compact progress into chat messages."
      - "Update PreviewConversationPanel status labels to distinguish proposed, editing, saved, validating, applied, failed and rollback."
      - "Refresh Project Files/open editor if the active file is changed/deleted by a tool."
      - "Reload preview after successful applied mutation when a preview session exists."

  phase_6_validation_and_rollout:
    owner: "qa agent"
    steps:
      - "Add unit tests for each profile permission boundary."
      - "Add integration test where front_agent edits allowed file and qa_agent cannot write."
      - "Add chat workflow test proving user-visible success requires actual file mutation."
      - "Run disabled-mode tests to prove structured fallback still works."
      - "Run enabled-mode tests with deterministic fake LLM/tool calls."
      - "Keep tool mode disabled by default until all validation passes."
```

## 11. Runtime Safety Requirements

```yaml
runtime_safety:
  path_policy:
    - "Reject absolute paths."
    - "Reject .. path escape."
    - "Reject .git and git metadata."
    - "Reject .env, .env.*, keys, certs, credentials, secrets and local-only instruction files."
    - "Reject node_modules, dist, build, coverage and cache directories unless explicitly read-only."
    - "Reject symlink traversal for write/delete."
  command_policy:
    - "Only commandId from project commandCatalog can be executed."
    - "Do not pass raw shell text from LLM to spawn."
    - "Use sanitized env allowlist, not process.env."
    - "Timeout every command."
    - "Capture stdout/stderr tail with redaction."
  tool_loop_policy:
    - "Max recursion limit."
    - "Max tool calls per agent turn."
    - "Max write payload bytes."
    - "Abort and emit failure on repeated same tool error."
    - "Require final structured output after tools."
```

## 12. Validation Commands

```yaml
validation_commands:
  required:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test apps/server/test/agentToolRegistry.test.mjs"
    - "node --test apps/server/test/projectAgentTools.test.mjs"
    - "node --test apps/server/test/agentToolRuntime.test.mjs"
    - "node --test apps/server/test/frontAgentNodeToolRuntime.test.mjs"
    - "node --test apps/server/test/horusChatTurn.test.mjs"
    - "node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
    - "pnpm --filter @u-build/web build"
    - "pnpm --filter @u-build/web test:guards"
    - "git diff --check"
  conditional:
    - "Browser smoke on Preview chat with HORUS_ENABLE_TOOL_MODE=true."
    - "Postgres schema test if tool evidence persistence touches database shape."
```

## 13. Acceptance Criteria

```yaml
acceptance_criteria:
  - "Tool runtime is wired into the active server dependencies, not only unit tests."
  - "With tool mode disabled, current structured CodeChangeSet workflows still pass."
  - "With tool mode enabled for front_agent, an allowed edit mutates the selected project workspace and is visible in served preview source."
  - "front_agent cannot write outside writeRoots or touch sensitive files."
  - "qa_agent and chat_agent cannot save/edit/delete files."
  - "curator_agent can apply an approved CodeChangeSet but cannot perform unscoped arbitrary file writes."
  - "Every mutable tool call emits durable redacted evidence."
  - "Preview chat terminal success appears only after actual mutation/apply success."
  - "Tool failures produce user-visible failure or rollback state, not indefinite validating."
  - "All required validation commands pass."
```

## 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  - "Do not expose write tools before policy tests pass."
  - "Do not let LLM choose arbitrary shell commands."
  - "Do not remove Curator gates while adding ReAct tools."
  - "Do not report a UI change as completed unless the target file changed on disk."
  - "Do not hide tool mode behind prompt-only instructions; enforce in code."
  - "Do not make all agents share the same tool set."
  - "Do not hardcode local project ids, preview ports, absolute desktop paths or current generated project names."
  - "If ReAct integration is unstable, keep feature flag off and preserve structured fallback."
```

## 15. Minimal Output Contract For Implementing Agent

```yaml
implementation_output_contract:
  must_report:
    - "Which agents received which tools."
    - "How writeRoots and path policy are enforced."
    - "How command execution is constrained."
    - "How tool events appear in chat/Preview UI."
    - "Whether tool mode is enabled or still feature-flagged off."
    - "Validation commands and results."
  must_not_report:
    - "Paridade completa sem browser/runtime smoke."
    - "Edit/save/delete support without permission-boundary tests."
    - "Success based only on LLM text."
```

## 16. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T00:15:20Z"
status: "implemented"
summary:
  - "AgentToolRuntime introduced as a governed facade over AgentToolRegistry with selected project context, max tool call limits, max write payload limits and redacted tool events."
  - "Project tools are wired into active createApp LangGraph dependencies instead of existing only in tests."
  - "front_agent can use list/read/search/edit/save/delete/propose/get_diff/run_validation tools; qa_agent and chat_agent remain read/validation only for write boundaries."
  - "edit_file and delete_file tools now mutate selected project workspaces through ProjectExecutionService and project writeRoots."
  - "ProjectExecutionService now reuses CodeChangeSet path policy for write/delete, including path escape, sensitive file, build/cache and symlink denial."
  - "frontAgentNode can propose CodeChangeSet through governed runtime when HORUS_ENABLE_TOOL_MODE=true while preserving structured fallback."
tool_mode:
  default: "disabled"
  flag: "HORUS_ENABLE_TOOL_MODE=true"
  rollout_note: "Direct ReAct-style multi-step editing remains controlled by the runtime/tool facade; existing structured CodeChangeSet flow remains the default delivery path."
validation_evidence:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "node --test apps/server/test/agentToolRegistry.test.mjs apps/server/test/projectAgentTools.test.mjs apps/server/test/agentToolRuntime.test.mjs apps/server/test/frontAgentNodeToolRuntime.test.mjs apps/server/test/horusChatTurn.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
  - "node --test packages/shared/test/*.test.mjs"
  - "node --test apps/server/test/postgresSchema.test.mjs"
  - "pnpm --filter @u-build/web build"
  - "pnpm --filter @u-build/web test:guards"
  - "git diff --check"
remaining_rollout_guardrails:
  - "Browser smoke with HORUS_ENABLE_TOOL_MODE=true should be run before enabling tool mode as default."
  - "Curator approval remains the default final delivery gate."
```
