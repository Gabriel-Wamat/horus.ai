---
format_version: "agentic_sdd.v1"
task_id: "32-zup-style-project-construction-workspace"
title: "Zup-style project construction workspace"
created_at_utc: "2026-05-26T21:02:01Z"
author: "agent"
target_mode: "architecture_migration"
priority: "p0"
risk_level: "critical"
reference_source: "spec/reference-zup-sdd-agents"
---

# 1. Original User Request

```yaml
raw_user_request: |
  crie um plano para fazer exatamente igual ao da zup, copie para cá os arquivos dentro de uma pasta para você consultar eles e garantir que estará fazendo corretamente
```

# 2. System Interpretation

```yaml
system_translation: |
  Criar um plano executável para migrar o Horus para o mesmo padrão arquitetural do zup-sdd-agents para construção real de software:
  workspaces isolados, pastas físicas de projeto, contratos fortes de execução, git/worktree, catálogo de comandos, quality gates,
  code intelligence com AST e rastreabilidade por execução.

expected_user_visible_result: |
  O usuário conseguirá selecionar user stories/specs, iniciar a construção e ver um projeto real sendo criado em uma pasta própria,
  versionada e conectável ao preview.

expected_engineering_result: |
  O Horus deixará de aplicar CodeChangeSet solto no próprio app e passará a executar agentes contra um Project Workspace isolado,
  com validação de path, comandos permitidos, logs, commits e evidências.
```

# 3. Reference Files Copied Locally

Os arquivos do `zup-sdd-agents` foram copiados para consulta local em:

```text
spec/reference-zup-sdd-agents/
```

Essa pasta está dentro de `spec/`, que já está ignorada pelo Git. Ela deve ser usada como referência de implementação, não como código de produção.

Arquivos principais de referência:

```text
app/core/worktree_manager.py
app/schemas/target_repo.py
app/services/target_repo/workspace_service.py
app/services/target_repo/config_service.py
app/services/target_repo/execution_service.py
app/services/target_repo/project_bootstrap_service.py
app/services/target_repo/git_executor.py
app/services/target_repo/repo_state_manager.py
app/services/target_repo/workspace_synchronizer.py
app/services/quality_gate_service.py
app/services/code_intelligence_service.py
app/services/code_intelligence/ast_parser_service.py
app/services/code_intelligence/dependency_graph_service.py
app/services/code_intelligence/impact_analyzer.py
app/services/odin/run_orchestrator.py
```

# 4. Scope

```yaml
scope:
  in_scope:
    - "Criar arquitetura equivalente ao target_repo do zup, adaptada para TypeScript/Node."
    - "Criar pasta física por projeto gerado."
    - "Criar isolamento por execução com git/worktree ou git init para novo projeto."
    - "Criar contratos para planos dos agentes: file operations e command requests."
    - "Criar catálogo de comandos permitido por projeto."
    - "Criar validação de write roots, comandos, paths e .git."
    - "Criar quality gates com evidência persistida."
    - "Criar code intelligence com AST para TS/TSX."
    - "Conectar preview ao projeto construído."
  out_of_scope:
    - "Copiar Python do zup diretamente como runtime do Horus."
    - "Permitir shell livre para agentes."
    - "Escrever no repositório principal do Horus como destino de projeto gerado."
    - "Usar regex como mecanismo primário de análise de código."
```

# 5. Target Architecture

```yaml
new_backend_modules:
  domain_entities:
    - "ProjectWorkspace"
    - "ProjectConstructionRun"
    - "ProjectExecutionPlan"
    - "ProjectCommandCatalog"
    - "ProjectQualityGate"
  application_services:
    - "ProjectWorkspaceService"
    - "ProjectConstructionRunService"
    - "ProjectExecutionService"
    - "ProjectConfigService"
    - "ProjectQualityGateService"
    - "ProjectCodeIntelligenceService"
  infrastructure:
    - "GitWorktreeExecutor"
    - "ProjectFileOperationApplier"
    - "ProjectCommandExecutor"
    - "TypeScriptAstAnalyzer"
    - "PostgresProjectWorkspaceRepository"
    - "PostgresProjectConstructionRunRepository"
```

# 6. Zup-to-Horus Mapping

```yaml
zup_to_horus:
  "target_repo/workspace_service.py":
    horus_equivalent: "ProjectWorkspaceService"
    responsibility: "preflight, workspace creation, worktree isolation, sync/cleanup"

  "target_repo/config_service.py":
    horus_equivalent: "ProjectConfigService"
    responsibility: "load and validate .horus-project.yaml"

  "target_repo/execution_service.py":
    horus_equivalent: "ProjectExecutionService"
    responsibility: "validate agent execution plan, apply file operations, execute command catalog items"

  "target_repo/project_bootstrap_service.py":
    horus_equivalent: "ProjectBootstrapService"
    responsibility: "create new project folder, initialize package manager, write baseline config, initialize git"

  "target_repo/default_contract.py":
    horus_equivalent: "ProjectDefaultContractBuilder"
    responsibility: "detect write roots, infer command catalog from manifests, create safe default .horus-project.yaml"

  "target_repo/git_executor.py":
    horus_equivalent: "GitCommandExecutor"
    responsibility: "run git commands through one safe abstraction and ensure local commit identity"

  "target_repo/repo_state_manager.py":
    horus_equivalent: "ProjectRepoStateManager"
    responsibility: "collect dirty paths, checkpoint dirty worktree, detect conflicts inside write roots"

  "target_repo/checkpoint_manager.py":
    horus_equivalent: "ProjectCheckpointManager"
    responsibility: "create checkpoints, rollback to checkpoint, commit workspace changes"

  "target_repo/diff_analyzer.py":
    horus_equivalent: "ProjectDiffAnalyzer"
    responsibility: "read diffs, changed files, diff stats, language hints and redacted previews"

  "target_repo/workspace_synchronizer.py":
    horus_equivalent: "ProjectWorkspaceSynchronizer"
    responsibility: "sync isolated workspace changes back to target repo only after validation"

  "core/worktree_manager.py":
    horus_equivalent: "GitWorktreeExecutor"
    responsibility: "create per-run branches/worktrees, commit, merge/sync, cleanup"

  "quality_gate_service.py":
    horus_equivalent: "ProjectQualityGateService"
    responsibility: "run lint/typecheck/test/build/smoke checks and persist evidence"

  "code_intelligence_service.py":
    horus_equivalent: "ProjectCodeIntelligenceService"
    responsibility: "facade for AST, dependency graph, impact analysis, affected tests"

  "code_intelligence/ast_parser_service.py":
    horus_equivalent: "TypeScriptAstAnalyzer"
    responsibility: "parse TS/TSX with TypeScript compiler API or ts-morph"

  "code_intelligence/dependency_graph_service.py":
    horus_equivalent: "TypeScriptDependencyGraphService"
    responsibility: "build import/export graph, dependents, dependencies and cycle checks"

  "code_intelligence/impact_analyzer.py":
    horus_equivalent: "ProjectImpactAnalyzer"
    responsibility: "infer affected files, related tests and risk level from changed files"

  "odin_workflow/specialist/code_intelligence_adapter.py":
    horus_equivalent: "AgentCodeIntelligenceAdapter"
    responsibility: "provide bounded code context to agents without leaking other projects or chats"

  "odin/run_orchestrator.py":
    horus_equivalent: "WorkflowOrchestrator + ProjectConstructionRunService"
    responsibility: "route user stories/specs to agents and coordinate construction lifecycle"
```

# 7. Contracts and Invariants

```yaml
contracts:
  project_config:
    filename: ".horus-project.yaml"
    required_fields:
      - "projectName"
      - "projectStack"
      - "baseRef"
      - "writeRoots"
      - "commandCatalog"
      - "testRunnerIds"
      - "roleProfiles"
    invariants:
      - "writeRoots must be relative paths inside the project root."
      - "commandCatalog must not contain destructive commands."
      - "testRunnerIds must reference commandCatalog entries."
      - "roleProfiles must define allowed command ids per agent role."

  agent_execution_plan:
    shape:
      fileOperations:
        - "operation: write | delete"
        - "path: relative project path"
        - "reason: string"
        - "content?: string"
        - "contentBase64?: string"
      commandRequests:
        - "commandId: string"
        - "reason: string"
    invariants:
      - "No absolute paths."
      - "No .git writes."
      - "No writes outside writeRoots."
      - "No raw shell from agents."
      - "Every commandId must exist in commandCatalog."

  construction_run:
    target_modes:
      - "new_project"
      - "existing_project"
    invariants:
      - "new_project must create a physical project folder."
      - "existing_project must use git worktree."
      - "Every run must persist status, selected stories, selected specs, workspace path, commands, quality gates and commits."
```

# 8. Zup Fidelity Requirements

```yaml
zup_fidelity_requirements:
  target_modes:
    - "Match Zup's separation between existing repo and new project modes."
    - "existing_project requires a repo path and must use git worktree."
    - "new_project requires an output folder and must initialize a real git repository."

  preflight:
    - "Validate target path exists and is a directory."
    - "Validate target path is inside a git work tree for existing_project."
    - "Validate baseRef exists before creating worktree."
    - "Block dirty target repos by default."
    - "Allow dirty target repos only when configured and only if dirty paths are outside writeRoots."
    - "Report conflicting dirty paths before execution."

  workspace_lifecycle:
    - "Resolve workspace root from environment/config, never from hardcoded OS paths."
    - "If configured workspace root is inside target repo, relocate to a sibling hidden workspace folder."
    - "Create per-run branch names with timestamp and run id."
    - "Refuse non-empty workspace paths."
    - "Support cleanup through git worktree remove and filesystem fallback."

  bootstrap:
    - "For new_project, create minimal runtime scaffold before agents write code."
    - "Write .gitignore, project metadata and .horus-project.yaml."
    - "Initialize git and create an initial bootstrap commit."
    - "Detect default write roots and command catalog from manifests when possible."
    - "Preserve user-provided config while normalizing missing managed fields."

  execution:
    - "Build agent context only from configured writeRoots."
    - "Limit context by max files and max bytes."
    - "Redact secrets from command catalog, stdout, stderr and diff previews."
    - "Validate every file operation before applying any unsafe write."
    - "Support text and base64 writes, but not both in the same operation."
    - "Support delete operations only without content."
    - "Mark new paths for git diff visibility."
    - "Execute command requests once, deduplicated by command id."
    - "Use sandboxed command execution scoped to the workspace path."
    - "Persist command start, command output tail, exit code, duration and sandbox metadata."

  role_permissions:
    - "Every role profile must define allowed command ids."
    - "backend_specialist, frontend_specialist and qa_specialist profiles are mandatory."
    - "Specialists can only request command ids allowed by their role profile."
    - "Default validation commands must reference known command ids."

  quality_and_recovery:
    - "Create checkpoints before risky multi-step execution."
    - "Rollback to checkpoint when a step fails after partial writes."
    - "Commit successful changes and persist commit hash."
    - "Read diff, changed files and diff stats after each agent run."
    - "Run role default validation commands and requested validation commands."
    - "Retry dependency repair only through allowed install/setup command ids."
    - "Never treat generated files as successful without quality gate evidence."

  sync:
    - "Do not sync isolated workspace changes back to target repo until validation passes."
    - "Sync only changed/untracked/deleted files detected by git."
    - "Deletion sync must be opt-in by config."
    - "Every synced path must be boundary-checked against the target repo."
```

# 9. Data Model and Persistence

```yaml
database_tables:
  project_workspaces:
    purpose: "Represents a physical project folder controlled by Horus."
    fields:
      - "id uuid primary key"
      - "workspace_id uuid nullable references workspaces(id)"
      - "name text not null"
      - "slug text not null"
      - "target_mode text not null"
      - "root_path text not null"
      - "config_path text not null"
      - "git_repository_path text nullable"
      - "current_branch text nullable"
      - "base_ref text nullable"
      - "project_stack text nullable"
      - "created_at timestamptz not null"
      - "updated_at timestamptz not null"
    constraints:
      - "unique(root_path)"
      - "target_mode in ('new_project', 'existing_project')"

  project_construction_runs:
    purpose: "Represents one execution that turns selected stories/specs into code."
    fields:
      - "id uuid primary key"
      - "project_workspace_id uuid not null references project_workspaces(id)"
      - "workflow_run_id uuid nullable"
      - "status text not null"
      - "workspace_path text not null"
      - "branch_name text nullable"
      - "base_ref text nullable"
      - "selected_user_story_ids jsonb not null"
      - "selected_spec_ids jsonb not null"
      - "started_at timestamptz nullable"
      - "finished_at timestamptz nullable"
      - "error text nullable"
    constraints:
      - "status in ('pending','bootstrapping','running','validating','passed','failed','cancelled')"

  project_agent_assignments:
    purpose: "Tracks each specialist contribution within a construction run."
    fields:
      - "id uuid primary key"
      - "construction_run_id uuid not null references project_construction_runs(id)"
      - "agent_role text not null"
      - "status text not null"
      - "input_snapshot jsonb not null"
      - "execution_plan jsonb nullable"
      - "result_snapshot jsonb nullable"
      - "created_at timestamptz not null"
      - "finished_at timestamptz nullable"

  project_file_operations:
    purpose: "Audit trail of agent-requested file writes/deletes."
    fields:
      - "id uuid primary key"
      - "assignment_id uuid not null references project_agent_assignments(id)"
      - "operation text not null"
      - "path text not null"
      - "reason text not null"
      - "applied boolean not null"
      - "error text nullable"

  project_command_runs:
    purpose: "Structured evidence for every command id executed."
    fields:
      - "id uuid primary key"
      - "assignment_id uuid nullable references project_agent_assignments(id)"
      - "construction_run_id uuid not null references project_construction_runs(id)"
      - "command_id text not null"
      - "command text not null"
      - "cwd text not null"
      - "exit_code int nullable"
      - "stdout_tail text not null"
      - "stderr_tail text not null"
      - "started_at timestamptz not null"
      - "finished_at timestamptz nullable"
      - "containerized boolean not null default false"
      - "sandbox_profile text nullable"

  project_quality_gates:
    purpose: "Validation summary for run or assignment."
    fields:
      - "id uuid primary key"
      - "construction_run_id uuid not null references project_construction_runs(id)"
      - "assignment_id uuid nullable references project_agent_assignments(id)"
      - "status text not null"
      - "checks jsonb not null"
      - "failed_checks jsonb not null"
      - "diff_stats jsonb nullable"
      - "commit_sha text nullable"
      - "created_at timestamptz not null"
```

# 10. API and Event Contracts

```yaml
api_contracts:
  create_project_workspace:
    route: "POST /api/project-workspaces"
    request:
      name: "string"
      targetMode: "new_project | existing_project"
      projectStack: "string?"
      rootPath: "string?"
      existingRepoPath: "string?"
    response:
      projectWorkspace: "ProjectWorkspace"
    rules:
      - "new_project may derive rootPath from HORUS_PROJECT_WORKSPACE_ROOT."
      - "existing_project must validate repo path before persistence."

  start_project_construction:
    route: "POST /api/project-construction-runs"
    request:
      projectWorkspaceId: "uuid"
      userStoryFolderId: "uuid"
      userStoryIds: "uuid[]"
      specIds: "uuid[]"
    response:
      constructionRun: "ProjectConstructionRun"
    rules:
      - "Reject if selected user stories are empty."
      - "Reject if any selected story has no generated spec unless user explicitly starts spec generation first."
      - "Reject if specs are stale relative to edited user stories."

  get_project_construction_run:
    route: "GET /api/project-construction-runs/:id"
    response:
      constructionRun: "ProjectConstructionRun"
      assignments: "ProjectAgentAssignment[]"
      commandRuns: "ProjectCommandRun[]"
      qualityGates: "ProjectQualityGate[]"
      changedFiles: "DiffStatsSnapshot"

event_stream_contracts:
  required_events:
    - "project_workspace.created"
    - "project_run.started"
    - "project_run.workspace_preflight_passed"
    - "project_run.bootstrap_completed"
    - "project_run.agent_started"
    - "project_run.file_operation_applied"
    - "project_run.command_started"
    - "project_run.command_output"
    - "project_run.command_finished"
    - "project_run.quality_gate_completed"
    - "project_run.commit_created"
    - "project_run.preview_registered"
    - "project_run.failed"
```

# 11. Integration Context

```yaml
integration_context:
  depends_on:
    - name: "Workspace user stories and specs"
      type: "database_and_file_workspace"
      contract_used: "selected folder, userStoryIds, specIds and spec revision status"
      failure_modes:
        - "Construction starts with empty or stale specs."
      verification:
        - "API rejects empty story selection and stale specs."

    - name: "WorkflowOrchestrator"
      type: "application_service"
      contract_used: "start construction run and assign agents"
      failure_modes:
        - "Agents receive wrong project context or leak chat/project context."
      verification:
        - "Integration test with two projects ensures isolated context."

    - name: "PreviewRuntimeManager"
      type: "backend_service"
      contract_used: "frontend project registration with rootPath and command id"
      failure_modes:
        - "Preview shows Horus app instead of generated project."
      verification:
        - "Runtime smoke opens generated project preview."

  depended_on_by:
    - name: "UserStories screen"
      type: "frontend_component"
      contract_exposed: "construction run status, progress, error details and preview link"
      compatibility_obligation: "must preserve existing story/spec creation and editing"

    - name: "Preview chat"
      type: "frontend_component"
      contract_exposed: "projectWorkspaceId and constructionRunId for follow-up change requests"
      compatibility_obligation: "must isolate chat memory by project and run"

  bidirectional_integrations:
    - name: "Agent construction loop"
      participants:
        - "Horus/Odin orchestrator"
        - "Frontend/QA/Curator agents"
      shared_contract: "ProjectExecutionPlan + ProjectQualityGate"
      consistency_rule: "Curator may approve only execution plans whose file operations were applied and validated in the active project workspace."
```

# 12. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Create project workspace domain contracts"
    agent: "backend_specialist"
    action: "Add shared/domain entities for ProjectWorkspace, ProjectConstructionRun, ProjectExecutionPlan, command catalog, quality gate evidence."
    expected_output: "Typed contracts used by orchestrator, repositories and agents."

  - step: 2
    name: "Add Postgres persistence"
    agent: "backend_specialist"
    action: "Create migrations and repositories for project_workspaces, project_construction_runs, project_file_operations, project_command_runs, project_quality_gates."
    expected_output: "Durable storage with foreign keys to workspace/user stories/specs/workflow runs where applicable."

  - step: 3
    name: "Implement ProjectConfigService"
    agent: "backend_specialist"
    action: "Implement .horus-project.yaml loader and validator based on zup config_service.py semantics, including write root validation, command catalog validation, role profiles and test runner inference."
    expected_output: "Strict config validation with no hardcoded OS-specific paths."

  - step: 4
    name: "Implement ProjectBootstrapService and ProjectDefaultContractBuilder"
    agent: "backend_specialist"
    action: "Create new project folder bootstrap, .gitignore, .horus-project.yaml, git init and initial commit; infer default write roots and commands from manifests."
    expected_output: "New project mode produces a real initialized repository."

  - step: 5
    name: "Implement ProjectWorkspaceService"
    agent: "backend_specialist"
    action: "Implement existing repo preflight, dirty worktree checks, workspace root resolution and git worktree preparation."
    expected_output: "Safe isolated workspaces for each construction run."

  - step: 6
    name: "Implement GitWorktreeExecutor"
    agent: "backend_specialist"
    action: "Create branch/worktree, detect dirty state, commit run changes, expose rollback/cleanup hooks."
    expected_output: "Versioned isolated writes with clear commit hashes."

  - step: 7
    name: "Implement diff, checkpoint and sync services"
    agent: "backend_specialist"
    action: "Port the Zup responsibilities from CheckpointManager, DiffAnalyzer, RepoStateManager and WorkspaceSynchronizer."
    expected_output: "Runs can checkpoint, rollback, inspect diffs, commit and optionally sync safely."

  - step: 8
    name: "Implement ProjectExecutionService"
    agent: "backend_specialist"
    action: "Validate agent execution plans, apply file operations, execute command catalog requests, stream output and capture evidence."
    expected_output: "Agents can build real files only inside authorized project folders."

  - step: 9
    name: "Implement AST/code intelligence"
    agent: "backend_specialist"
    action: "Use TypeScript compiler API or ts-morph to parse TS/TSX imports/exports, dependency graph, affected files and unmounted components."
    expected_output: "No regex primary parsing; code reachability can be validated before curator approval."

  - step: 10
    name: "Update agent contracts"
    agent: "agent_architect"
    action: "Update Spec/Odin/Frontend/QA/Curator interfaces and prompts to return and consume ProjectExecutionPlan instead of loose CodeChangeSet for construction runs."
    expected_output: "Agents operate through structured file operations and command ids."

  - step: 11
    name: "Connect UserStories screen to construction run"
    agent: "frontend_specialist"
    action: "Make Iniciar projeto send selected folder user stories/specs into the construction API and monitor status."
    expected_output: "User can start project construction only when specs exist and sees progress."

  - step: 12
    name: "Connect preview to built project"
    agent: "backend_specialist"
    action: "Register the created project as a frontend project and start preview using command catalog."
    expected_output: "Preview iframe shows the generated project, not the Horus app."

  - step: 13
    name: "Validate end-to-end"
    agent: "qa_specialist"
    action: "Create a sample user stories folder, generate specs, run construction, validate generated files, commands, commits and preview."
    expected_output: "Evidence that agents produced a real project folder and runnable code."
```

# 13. Required Validation

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @horus/shared test"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate shared contracts."
      success_condition: "exit code 0"
    - command: "pnpm --filter @horus/server test"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate services, repositories, orchestrator and quality gates."
      success_condition: "exit code 0"
    - command: "pnpm --filter @horus/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate TypeScript compilation."
      success_condition: "exit code 0"
    - command: "pnpm --filter @horus/web build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate UI contracts."
      success_condition: "exit code 0"

  runtime_checks:
    - name: "new project construction smoke"
      method: "API + filesystem + git + preview"
      expected: "A physical project folder is created, git initialized, files written, checks run, preview starts."
    - name: "path isolation smoke"
      method: "test malicious file operation paths"
      expected: "Absolute paths, .. traversal and .git writes are rejected."
    - name: "command catalog smoke"
      method: "test unknown commandId and disallowed command"
      expected: "Unknown or unsafe commands are rejected before execution."
    - name: "dirty repo smoke"
      method: "create dirty target path inside and outside writeRoots"
      expected: "Inside writeRoots blocks; outside writeRoots can proceed only when explicitly allowed."
    - name: "checkpoint rollback smoke"
      method: "force failure after a file operation"
      expected: "Workspace rolls back to checkpoint and records failed assignment evidence."
    - name: "context isolation smoke"
      method: "create two project workspaces and two chats"
      expected: "Agents for project A never receive files, command catalog, memory or specs from project B."
    - name: "preview target smoke"
      method: "start preview after construction"
      expected: "Preview rootPath equals constructed project root, not Horus app root."
```

# 14. Anti-Regression Rules

```yaml
anti_regression_rules:
  - "Do not remove current user story/spec generation or editing behavior."
  - "Do not remove existing preview runtime; extend it to support constructed project roots."
  - "Do not apply generated code directly to apps/web unless the selected project workspace is explicitly Horus itself."
  - "Do not store absolute machine-specific defaults in committed code."
  - "Do not bypass the command catalog when an agent asks to run a command."
  - "Do not approve Curator results without persisted quality gate evidence."
  - "Do not allow chat memory from one project to enter another construction run."
```

# 15. Completion Checklist

```yaml
completion_checklist:
  reference_alignment:
    - "The zup reference files in spec/reference-zup-sdd-agents were consulted before implementation."
    - "Each zup target_repo responsibility has a Horus equivalent or an explicit reason for deferral."
    - "Preflight, bootstrap, execution, diff, checkpoint, sync and quality gate behavior are all covered."
  project_workspace:
    - "New project mode creates a real folder with source code."
    - "Existing project mode uses git worktree."
    - "No generated code is written directly into the Horus app unless Horus itself is the selected target."
  contracts:
    - "Agents return structured execution plans."
    - "Commands are command ids, not raw shell."
    - "File operations are validated against write roots."
  validation:
    - "Quality gates persist command evidence."
    - "AST/code intelligence validates reachability for frontend code."
    - "Preview opens the generated project."
    - "Dirty repo, path traversal, command catalog, rollback and context isolation tests exist."
  safety:
    - "No hardcoded OS paths."
    - "No regex primary parser."
    - "No writes outside configured project workspace root."
    - "All command output and diff previews are redacted before persistence."
```
