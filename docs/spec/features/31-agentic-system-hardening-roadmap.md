# SPEC 31 - Agentic System Hardening Roadmap

```yaml
format_version: "agentic_sdd.v1"
task_id: "31-agentic-system-hardening-roadmap"
title: "Correção rigorosa do sistema agêntico Horus/Odin"
created_at_utc: "2026-05-26T17:18:55Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
spec_version: "0.5.0"
status: "phase_1_phase_2_phase_3_apply_foundation_phase_4_code_aware_foundation_phase_5_guardrail_phase_6_guardrail_phase_7_phase_8_partial_completed"
```

## 1. Original User Request

```yaml
raw_user_request: |
  retire qualquer coisa determinística com regex, implemente uma forma morderna de fazer isso. pegue todos esses achados e crie um plano de correção altamente rigoroso, respeitando modularidade, integridade e seguindo a risca contratos bem feitos e que contemplem bem a demanda lógica do projeto
```

## 2. System Interpretation

```yaml
system_translation: |
  Remover roteamento determinístico baseado em regex do fluxo Horus/Odin e substituir por classificação moderna baseada em LLM com saída estruturada, validação por contrato e injeção de dependência.
  Consolidar todos os problemas identificados no sistema agêntico em um roadmap de correção sequenciado, modular, auditável e protegido contra quebra de contratos, vazamento de contexto e falsa execução.

expected_user_visible_result: |
  O chat do Horus deve diferenciar conversa e ação com comportamento natural, sem cair em mensagens genéricas ou regras frágeis. O usuário deve ter fluxos claros para gerar specs, iniciar execução, acompanhar agentes, validar preview e pedir alterações por chat com isolamento.

expected_engineering_result: |
  O sistema deve evoluir de geração textual de artefatos para execução real: checkpoint persistente, roteador LLM estruturado, executor de patches, agentes code-aware, QA runtime, curadoria com evidência, eventos auditáveis e persistência íntegra por workspace/chat/story/spec.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "O sistema aparenta executar agentes, mas ainda possui pontos frágeis: roteamento regex, checkpoint volátil, outputs textuais sem patch real e QA/curadoria sem runtime."
  target_user: "Usuário do Horus que cria user stories, gera specs, conversa com o orquestrador e espera construção real do projeto."
  expected_outcome: "Execução agêntica confiável, rastreável, isolada e compatível com o stack real."
  product_surface:
    - "Preview chat"
    - "UserStories screen"
    - "Spec generation workflow"
    - "Horus/Odin executor"
    - "Front Agent"
    - "QA Agent"
    - "Curator Agent"
    - "Preview runtime"
    - "Workspace persistence"

technical_context:
  repository_root: "<repo-root>"
  relevant_stack:
    backend:
      - "Node.js"
      - "Express"
      - "TypeScript"
      - "LangGraph"
      - "LangChain"
      - "Zod"
    frontend:
      - "React"
      - "TypeScript"
      - "Vite"
    database:
      - "Postgres"
      - "SQL migrations"
    infrastructure:
      - "Process-backed preview runtime"
      - "Safe CLI policy"
  known_entrypoints:
    - "apps/server/src/main.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/infrastructure/langgraph/graph.ts"
  known_existing_patterns:
    - "Application use cases depend on interfaces."
    - "Infrastructure provides concrete repositories/adapters."
    - "Shared contracts live in packages/shared."
    - "Specs and user stories are versioned by workspace folder and story."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Remove regex-based Horus/Odin intent routing."
    - "Introduce LLM structured intent classification with Zod validation and dependency injection."
    - "Define a sequenced correction roadmap for all known agentic-system risks."
    - "Preserve existing public API shapes unless adding backward-compatible fields."
    - "Define contracts for checkpointing, executor patches, QA runtime evidence, curadoria, chat isolation and observability."
  out_of_scope:
    - "Rewrite the entire frontend in this spec."
    - "Drop file persistence immediately."
    - "Remove existing tests without equivalent coverage."
    - "Introduce OS-specific commands, paths, or hardcoded machine values."
    - "Allow arbitrary shell execution from chat."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/langgraph/checkpointer.ts"
      - "apps/server/src/infrastructure/langgraph/graph.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/*.ts"
      - "apps/server/src/infrastructure/agents/*.ts"
      - "apps/server/src/infrastructure/tools/*.ts"
      - "apps/server/src/infrastructure/repositories/*.ts"
    services:
      - "HorusOdinIntentRouter"
      - "SubmitHorusChatTurnUseCase"
      - "WorkflowOrchestrator"
      - "ReadOnlyCodeContextService"
      - "SafeCliRunner"
    database:
      migrations_required: true
      tables:
        - "workflow_states"
        - "chat_sessions"
        - "chat_messages"
        - "agent_runs"
        - "agent_run_steps"
        - "code_change_sets"
        - "runtime_validation_runs"
  frontend:
    files:
      - "apps/web/src/App.tsx"
      - "apps/web/src/features/**"
    components:
      - "Preview chat"
      - "UserStories workspace"
      - "Workflow monitor"
    routes:
      - "current single-page shell"
  workflow:
    graph_nodes:
      - "specAgent"
      - "odinAgent"
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
      - "hitlCheckpoint"
      - "retryCheckpoint"
    agents:
      - "Horus"
      - "Odin"
      - "Spec"
      - "Front"
      - "QA"
      - "Curator"
  tests:
    unit:
      - "intent router contract"
      - "workflow state persistence"
      - "patch planner"
      - "context isolation"
    integration:
      - "chat to executor"
      - "spec generation"
      - "preview lifecycle"
      - "agent run monitor"
    e2e:
      - "user story folder -> specs -> execution -> preview -> QA evidence"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    Horus is the chat and action boundary. Odin is the executor planner. Spec, Front, QA, and Curator must consume explicit, versioned contracts, not ad hoc messages. Runtime state must be persisted enough to resume safely and diagnose every agent run.

  depends_on:
    - name: "LLM provider factory"
      type: "internal_module"
      owner: "infrastructure/llm"
      direction: "this_spec_consumes_dependency"
      contract_used: "createChatModel(role, defaults, runtimeSettings, env)"
      required_for: "Structured intent routing and agent reasoning."
      assumptions: []
      failure_modes:
        - "Missing provider/model/key blocks LLM-backed routing or agents."
      fallback_or_recovery: "Fail closed with actionable configuration error; do not mock responses."
      verification:
        - "providerConfig tests"
        - "LLM smoke with configured env when available"

    - name: "Workspace repositories"
      type: "database"
      owner: "infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "WorkspaceRepository, ChatMemoryRepository, IStorageProvider"
      required_for: "Isolation by folder/story/spec/chat and context snapshots."
      assumptions: []
      failure_modes:
        - "Cross-folder or cross-chat context leak."
        - "Stale spec/story revision in executor."
      fallback_or_recovery: "Block action when scope ids do not match."
      verification:
        - "repository contract tests"
        - "Postgres integration smoke"

    - name: "LangGraph"
      type: "external_dependency"
      owner: "workflow runtime"
      direction: "this_spec_consumes_dependency"
      contract_used: "graph.stream, graph.getState, checkpointer"
      required_for: "Agent graph execution, HITL interrupts and retry loop."
      assumptions:
        - "A persistent checkpointer can replace MemorySaver or be wrapped by project-owned persistence."
      failure_modes:
        - "Process restart loses interrupt state."
      fallback_or_recovery: "Persist checkpoints and reject resume only when checkpoint cannot be reconstructed."
      verification:
        - "restart/resume integration test"

  depended_on_by:
    - name: "Preview chat UI"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "HorusChatTurnResponse.intent/outcome"
      compatibility_obligation: "Backward-compatible additions only; existing kind/mode/action/status remain stable."
      expected_consumer_behavior: "Display chat answers, blocked actions, preview control results and executor progress."
      migration_or_notification_required: false
      verification:
        - "web type-check"
        - "browser smoke when UI changes"

    - name: "Workflow monitor"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "workflow events and persisted agent run status"
      compatibility_obligation: "May extend event payloads; do not remove current event types without migration."
      expected_consumer_behavior: "Render started/running/succeeded/failed/blocked per agent."
      migration_or_notification_required: false
      verification:
        - "server event route tests"
        - "frontend state tests or browser smoke"

  bidirectional_integrations:
    - name: "Chat executor loop"
      participants:
        - "SubmitHorusChatTurnUseCase"
        - "WorkflowOrchestrator"
      shared_contract: "chatSessionId, sourceMessageId, workflowThreadId, workspaceFolderId, userStoryId, active spec revision"
      consistency_rule: "Every executor run must be traceable to exactly one chat message, workspace folder and user story."
      verification:
        - "chat-driven code change integration test"

    - name: "Agent artifact loop"
      participants:
        - "Front Agent"
        - "QA Agent"
        - "Curator Agent"
      shared_contract: "agentResults plus future code_change_sets and runtime_validation_runs"
      consistency_rule: "Curator must validate the same artifact versions produced by Front and tested by QA."
      verification:
        - "curator input selection tests"
        - "runtime evidence integration tests"

  data_flow:
    inbound:
      - source: "Preview chat"
        payload_or_state: "HorusChatTurnInput"
        validation: "Zod schema plus context mismatch guards."
      - source: "UserStories screen"
        payload_or_state: "StartWorkflowInput"
        validation: "Zod schema plus workspace story resolution."
    outbound:
      - target: "Frontend chat UI"
        payload_or_state: "HorusChatTurnResponse"
        compatibility: "Additive fields only."
      - target: "Workflow monitor"
        payload_or_state: "WorkflowEvent stream"
        compatibility: "Existing event names remain valid."

  sequencing_dependencies:
    - dependency: "Structured LLM intent router"
      reason: "Must replace regex routing before expanding executor actions."
      validation: "No regex action classifier remains in chat routing/usecase."
    - dependency: "Persistent checkpoint"
      reason: "Must exist before relying on long-running HITL workflows."
      validation: "Workflow resumes after server restart."
    - dependency: "Patch executor"
      reason: "Must exist before claiming agents build code."
      validation: "Generated changes appear as reviewed file diffs."

  integration_risks:
    - risk: "LLM classifier misroutes destructive request."
      severity: "critical"
      mitigation: "Structured schema, explicit unsupported kind, command policy gate, action allowlist and no arbitrary shell path."
    - risk: "Agent result claims success without patch/test evidence."
      severity: "critical"
      mitigation: "Require code_change_set and validation_run before success state."
    - risk: "Context from another chat/project leaks into executor."
      severity: "critical"
      mitigation: "Persist and check workspaceFolderId, userStoryId, specRevisionId, projectId and chatSessionId on every action."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "No regex or keyword routing for Horus/Odin intent decisions."
    - "Use LLM structured output with schema validation for semantic classification."
    - "Every mutable action must pass through a typed command/use-case contract."
    - "Every concrete dependency must be injectable at the application boundary."
    - "Never claim code was built unless files changed and validation ran."
    - "Never run arbitrary shell commands from chat."
    - "Preserve OS portability: no user paths, shell-specific syntax, platform-specific assumptions or machine ports as required config."
  project_specific:
    - "Shared schemas live in packages/shared."
    - "Application services should depend on interfaces, not infrastructure classes."
    - "Infrastructure adapters may wrap LangChain, LangGraph, Postgres, filesystem and process execution."
    - "Agent outputs must be versioned and tied to workspace artifact context."
```

## 8. Correction Roadmap

### Phase 1 - Structured Horus/Odin Intent Router

```yaml
status: "implemented_in_this_iteration"
goal: "Remove regex/keyword routing from chat intent and preview lifecycle decisions."
changes:
  - "Replace HorusOdinIntentRouter regex patterns with LlmHorusIntentClassifier."
  - "Use structured output schema for kind/mode/confidence/rationale/previewAction."
  - "Make SubmitHorusChatTurnUseCase await async classification."
  - "Move start/stop/reload selection from regex to intent.previewAction."
contracts:
  - "HorusChatIntent.previewAction?: start | stop | reload"
  - "HorusIntentClassifier.classify(input): Promise<HorusChatIntent>"
acceptance:
  - "No regex action classifier remains in HorusOdinIntentRouter."
  - "No regex preview lifecycle inference remains in SubmitHorusChatTurnUseCase."
  - "Malformed classifier output is rejected by shared schema."
```

### Phase 2 - Persistent LangGraph Checkpoint

```yaml
status: "implemented_in_this_iteration"
goal: "Make HITL approval and retry checkpoints resumable after server restart."
tasks:
  - "Replace or wrap MemorySaver with a Postgres-backed checkpointer."
  - "Persist interrupt payloads and next nodes with workflowThreadId."
  - "Add restart/resume integration tests."
contracts:
  - "Workflow checkpoint table keyed by thread_id and checkpoint namespace."
  - "Resume must verify checkpoint node, workspace folder and user story."
acceptance:
  - "Approve a spec after backend restart."
  - "Continue retry checkpoint after backend restart."
implementation_notes:
  - "When PERSISTENCE_DRIVER=postgres, createApp now builds a LangGraph PostgresSaver with the configured repository pool and calls setup() during bootstrap."
  - "When PERSISTENCE_DRIVER=file, createApp keeps MemorySaver for local file-mode compatibility."
  - "WorkflowState now records pendingCheckpoints for persisted/auditable state."
```

### Phase 3 - Real Patch Executor

```yaml
status: "apply_foundation_implemented"
goal: "Convert agent output into reviewed workspace file changes."
tasks:
  - "Introduce CodeChangeSet entity with proposed patches, target files, rationale and source agent."
  - "Add PatchPlanner/ApplyPatch use cases using project-root-safe paths."
  - "Reject path escape, binary overwrite, unrelated files and missing spec context."
  - "Persist diff, status, validation commands and rollback metadata."
contracts:
  - "code_change_sets(id, workflow_thread_id, story_id, spec_revision_id, status, files, diff, created_at)"
  - "Patch operation must be atomic per change set."
acceptance:
  - "A chat code-change request produces file diffs."
  - "No success event is emitted before patch + validation."
implementation_notes:
  - "Added shared CodeChangeSet contract with operations, diffs, status and validation commands."
  - "Added code_change_sets Postgres migration and file/Postgres repositories."
  - "Front Agent now emits a proposed CodeChangeSet for generated HTML artifacts."
  - "WorkflowOrchestrator persists CodeChangeSet outputs through an injected sink."
  - "Chat code-change workflow now carries the selected frontend project id/root path into LangGraph state."
  - "WorkflowOrchestrator applies Front Agent CodeChangeSet operations through an injected project-root-safe applier before persistence."
  - "ProjectCodeChangeSetApplier validates all target paths before writing, rejects absolute paths/directory escapes and rolls back already written files if an operation fails."
remaining_work:
  - "Replace generated standalone HTML artifacts with code-aware React/TypeScript/CSS patch operations in Phase 4."
  - "Promote status from applied to validated only after controlled validation runner evidence."
```

### Phase 4 - Code-Aware Front Agent

```yaml
status: "code_aware_foundation_implemented"
goal: "Make Front Agent modify the actual React/TypeScript app, not standalone HTML."
tasks:
  - "Replace vanilla HTML prompt with project-aware planning prompt."
  - "Feed selected source files, design skill, visual identity rules and active spec."
  - "Output structured patch plan instead of raw HTML."
  - "Preserve components, routes and styles already present."
contracts:
  - "FrontAgentOutput = { changePlan, patches, affectedFiles, validationHints }"
acceptance:
  - "Front Agent changes React/TS/CSS files."
  - "Build/typecheck validates changed frontend."
implementation_notes:
  - "FrontAgent now accepts CodeContextBundle and uses structured output for file operations."
  - "frontAgentNode builds bounded code context from frontendProjectId/frontendProjectRootPath when a selected project exists."
  - "Added buildFrontendCodeChangeSet to convert Front file operation plans into auditable CodeChangeSet diffs using inspected file contents."
  - "Generated standalone HTML remains only as compatibility fallback when no selected project context is available."
remaining_work:
  - "Add controlled frontend validation runner to promote applied CodeChangeSet to validated."
  - "Tune code context retrieval beyond priority-file selection in Phase 10."
```

### Phase 5 - Real QA Runtime

```yaml
status: "guardrail_implemented_in_this_iteration"
goal: "Make QA Agent execute meaningful frontend validation."
tasks:
  - "Generate Playwright/browser checks when UI changes."
  - "Run build/typecheck and browser smoke through controlled validation runner."
  - "Capture DOM/screenshot/runtime evidence."
  - "Fail the QA node when tests cannot be generated or executed."
contracts:
  - "RuntimeValidationRun = { commands, browserChecks, screenshots?, status, evidence }"
acceptance:
  - "QA failure blocks curator pass."
  - "No empty testCases fallback counts as success."
implementation_notes:
  - "QA Agent no longer returns empty testCases after structured-output parsing failures; it throws and fails the node."
remaining_work:
  - "Add controlled build/typecheck/browser runtime runner and evidence capture."
```

### Phase 6 - Evidence-Based Curator

```yaml
status: "guardrail_implemented_in_this_iteration"
goal: "Make Curator validate source diffs, test evidence and runtime output."
tasks:
  - "Curator input must include spec, changed files, diffs, QA results, preview evidence and screenshots when available."
  - "Curator cannot pass without runtime evidence for UI changes."
  - "Curator emits structured missingItems mapped to front/qa/both/odin."
contracts:
  - "CuratorOutput adds evidenceRefs and blockingReasons."
acceptance:
  - "Curator rejects text-only HTML artifacts for React app changes."
implementation_notes:
  - "Curator now receives CodeChangeSet evidence and blocks missing CodeChangeSet or empty QA test evidence before LLM evaluation."
  - "Curator prompt now includes CodeChangeSet operations and diff evidence."
remaining_work:
  - "Require actual runtime validation evidence and screenshot/DOM evidence for UI changes after Phase 5 runtime runner lands."
```

### Phase 7 - Spec Generation Execution

```yaml
status: "implemented_in_this_iteration"
goal: "Make generate_spec intent actually start the spec workflow."
tasks:
  - "Connect chat generate_spec to StartWorkflowUseCase with workflowMode=spec_generation."
  - "Pass selected workspace folder stories, not free-form chat message."
  - "Support forceRegenerate when user explicitly asks regeneration."
contracts:
  - "HorusChatOutcome.action=spec_requested must include workflowThreadId when accepted."
acceptance:
  - "Click/button/chat spec generation starts SpecAgent for selected folder stories."
implementation_notes:
  - "Chat generate_spec now calls an injected SpecGenerationExecutor."
  - "WorkflowOrchestrator implements startSpecGeneration() and starts workflowMode=spec_generation with the active user story from chat context."
  - "Accepted outcome includes workflowThreadId and chat memory stores that thread id."
```

### Phase 8 - Chat/Project Context Anchoring

```yaml
status: "partial_context_anchor_implemented"
goal: "Prevent context loss and cross-project leakage."
tasks:
  - "Persist projectId and previewSessionId on chat_sessions, not only message snapshots."
  - "Persist active spec/story revision ids for each executor run."
  - "Block action when selected project does not match chat scope."
contracts:
  - "chat_sessions.project_id nullable"
  - "chat_sessions.preview_session_id nullable"
acceptance:
  - "A later chat message can run preview without resending projectId when session scope is set."
implementation_notes:
  - "SubmitHorusChatTurnUseCase now passes the validated selected FrontendProject to chat code-change execution."
  - "WorkflowState records frontendProjectId and frontendProjectRootPath for executor auditability."
  - "chat_code_change runs initialize userStoryId from the input story so CodeChangeSet persistence does not depend on SpecAgent execution."
```

### Phase 9 - Agent Run Observability

```yaml
goal: "Expose reliable started/running/succeeded/failed/blocked state per agent."
tasks:
  - "Create agent_runs and agent_run_steps tables."
  - "Emit node_started before each agent and node_failed on exceptions."
  - "Store LLM latency, model/provider, token usage when available, retry count and evidence refs."
contracts:
  - "AgentRunStatus = queued | running | succeeded | failed | blocked | cancelled"
acceptance:
  - "Frontend can monitor all agent steps until code construction finishes."
```

### Phase 10 - Code Context Retrieval Upgrade

```yaml
goal: "Replace path-term heuristics with a code-aware context retriever."
tasks:
  - "Build project index from package.json, tsconfig, imports and route/component files."
  - "Use symbol/path/file ownership scoring without regex routing decisions."
  - "Expose requested context sources and omitted files."
contracts:
  - "CodeContextBundle adds selectionReason per file."
acceptance:
  - "Questions about a component select the actual component and its imported dependencies."
```

## 9. Validation Protocol

```yaml
validation_protocol:
  static_checks:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "<repo-root>"
      required: true
    - command: "pnpm --filter @u-build/server type-check"
      cwd: "<repo-root>"
      required: true
    - command: "pnpm --filter @u-build/server build"
      cwd: "<repo-root>"
      required: true
  tests:
    - command: "node --test apps/server/test/horusOdinIntentRouter.test.mjs apps/server/test/horusChatTurn.test.mjs apps/server/test/providerConfig.test.mjs"
      cwd: "<repo-root>"
      required: true
    - command: "node --test apps/server/test/*.test.mjs"
      cwd: "<repo-root>"
      required: true
  runtime_checks:
    - command: "PERSISTENCE_DRIVER=postgres pnpm --filter @u-build/server start"
      cwd: "<repo-root>"
      expected: "server starts and health endpoint responds"
  manual_checks:
    - "When frontend changes are made, open the UI and verify chat/workflow state visually."
```

## 10. Agent Error Mitigation

```yaml
agent_error_mitigation:
  anti_hardcode:
    - "No user-specific path, host, port, provider model, API key or OS-specific command may be required."
    - "Defaults may be project-relative only when env override exists."
  anti_false_execution:
    - "Do not report code construction complete without code_change_set, file diff and validation evidence."
  anti_regex_routing:
    - "Do not add regex/keyword classifiers for ASK/ACTION, preview lifecycle or agent routing."
    - "Use structured LLM classification or typed user-controlled UI actions."
  anti_context_leak:
    - "Every action must validate chatSessionId, workspaceFolderId, userStoryId, specRevisionId and projectId."
  anti_silent_failure:
    - "Parsing failures in QA/Curator/Front must fail the agent run, not return empty success payloads."
```

## 11. Implementation Log

```yaml
implementation_log:
  - date: "2026-05-26"
    status: "phase_1_completed"
    summary:
      - "Replaced regex-based Horus/Odin intent routing with async LLM structured classifier."
      - "Added previewAction to shared HorusChatIntent contract."
      - "Removed regex lifecycle inference from SubmitHorusChatTurnUseCase."
      - "Added focused tests for router delegation, previewAction contract and chat turn behavior."
    validation:
      - "pnpm --filter @u-build/shared build"
      - "pnpm --filter @u-build/server type-check"
      - "pnpm --filter @u-build/server build"
      - "node --test apps/server/test/horusOdinIntentRouter.test.mjs apps/server/test/horusChatTurn.test.mjs apps/server/test/providerConfig.test.mjs"
  - date: "2026-05-26"
    status: "phase_2_phase_7_completed"
    summary:
      - "Added @langchain/langgraph-checkpoint-postgres and replaced fixed MemorySaver bootstrap with an injected workflow checkpointer."
      - "Wired PostgresSaver setup into createApp for PERSISTENCE_DRIVER=postgres."
      - "Added WorkflowState.pendingCheckpoints to persist pending LangGraph nodes in the project state contract."
      - "Connected Horus chat generate_spec intent to real spec_generation workflow execution through SpecGenerationExecutor."
    validation:
      - "pnpm --filter @u-build/shared build"
      - "pnpm --filter @u-build/server type-check"
      - "pnpm --filter @u-build/server build"
      - "node --test apps/server/test/*.test.mjs"
      - "node --test packages/shared/test/*.test.mjs"
      - "pnpm --filter @u-build/server db:migrate"
      - "PORT=3101 pnpm --filter @u-build/server start"
      - "curl -sS http://127.0.0.1:3101/health"
  - date: "2026-05-26"
    status: "phase_3_foundation_phase_5_6_guardrails_completed"
    summary:
      - "Added CodeChangeSet shared contract and generated HTML change-set builder."
      - "Added code_change_sets Postgres migration plus file/Postgres repositories."
      - "Front Agent now emits proposed CodeChangeSet evidence with a file diff."
      - "WorkflowOrchestrator persists CodeChangeSet outputs via injected repository."
      - "QA Agent now fails instead of returning empty tests after structured-output parse exhaustion."
      - "Curator blocks missing CodeChangeSet and empty QA evidence and includes diff evidence in its prompt."
    validation:
      - "pnpm --filter @u-build/shared build"
      - "pnpm --filter @u-build/server build"
      - "pnpm --filter @u-build/server type-check"
      - "node --test apps/server/test/*.test.mjs"
      - "node --test packages/shared/test/*.test.mjs"
      - "pnpm --filter @u-build/server db:migrate"
  - date: "2026-05-26"
    status: "phase_3_apply_foundation_phase_8_partial_completed"
    summary:
      - "Added ProjectCodeChangeSetApplier to apply operations inside the selected frontend project root."
      - "Blocked absolute CodeChangeSet target paths and directory escapes with path API checks before writing."
      - "Added rollback for already applied operations when a CodeChangeSet write fails mid-application."
      - "Passed validated FrontendProject from Horus chat into WorkflowOrchestrator.startChatCodeChange."
      - "Persisted frontendProjectId/frontendProjectRootPath in WorkflowState for executor auditability."
      - "Fixed chat_code_change orchestration so CodeChangeSet persistence does not depend on a SpecAgent node."
    validation:
      - "pnpm --filter @u-build/shared build"
      - "pnpm --filter @u-build/server build"
      - "pnpm --filter @u-build/server type-check"
      - "node --test apps/server/test/projectCodeChangeSetApplier.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs apps/server/test/horusChatTurn.test.mjs"
      - "node --test apps/server/test/*.test.mjs"
      - "node --test packages/shared/test/*.test.mjs"
  - date: "2026-05-26"
    status: "phase_4_code_aware_foundation_completed"
    summary:
      - "FrontAgent now supports code-aware structured file operations when project context is present."
      - "frontAgentNode loads bounded source context from the selected frontend project root and passes it into FrontAgent."
      - "Added buildFrontendCodeChangeSet to build auditable diffs for existing or new frontend files."
      - "Preserved standalone generated HTML only as a fallback for workflows without selected project context."
    validation:
      - "pnpm --filter @u-build/shared build"
      - "pnpm --filter @u-build/server build"
      - "pnpm --filter @u-build/server type-check"
      - "node --test apps/server/test/buildFrontendCodeChangeSet.test.mjs apps/server/test/frontAgentNodeCodeContext.test.mjs apps/server/test/projectCodeChangeSetApplier.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
      - "node --test apps/server/test/*.test.mjs"
      - "node --test packages/shared/test/*.test.mjs"
```

## 12. Output Contract For Executing Agents

```yaml
final_report_required:
  status: "completed | partially_completed | blocked"
  phases_completed:
    - "<phase id>"
  files_changed:
    - "<path>"
  contracts_changed:
    - "<schema/interface/table/event>"
  validations_run:
    - command: "<command>"
      result: "<passed | failed>"
  remaining_risks:
    - "<risk>"
```
