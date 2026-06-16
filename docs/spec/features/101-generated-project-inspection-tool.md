---
format_version: "agentic_sdd.v1"
task_id: "feature-101-generated-project-inspection-tool"
title: "Generated Project Inspection Tool"
created_at_utc: "2026-05-28T22:30:10Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_3_agent_code_execution_runtime"
depends_on:
  - "spec/features/88-repository-scanner-and-text-retrieval.md"
  - "spec/features/89-tree-sitter-ast-analysis-spine.md"
  - "spec/features/96-index-memory-lifecycle-and-context-budget.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 101 - Generated Project Inspection Tool

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  Tool de inspecao de projeto gerado. O agente precisa descobrir framework, scripts, entrypoints, package
  manager, rotas e arquivos editaveis antes de agir.
```

## 2. System Interpretation

```yaml
system_translation: |
  Add an inspect_project tool that builds a compact, typed project profile before agents edit or run commands.
  It must identify package manager, framework, scripts, source roots, entrypoints, routes, editable files,
  test/build commands and known unsafe paths.

expected_user_visible_result: |
  Before changing a project, the agent can explain what project it detected and which files/scripts it will use.

expected_engineering_result: |
  Horus exposes a ProjectInspectionProfile contract and runtime tool built on existing repository scan,
  AST, symbol graph and index lifecycle services.
```

## 3. Context And Scope

```yaml
business_context:
  user_problem: "Agents fail or edit wrong files when they do not understand the generated project structure."
  target_user: "Horus operator asking chat to modify a selected preview project."
  expected_outcome: "Agents ground their plan in the actual selected project."
  product_surface:
    - "Preview project selector"
    - "Preview chat coding flow"
    - "Agent tool progress"
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "RepositoryScanner"
      - "TextRepositoryRetriever"
      - "Tree-sitter AST"
      - "Repository index lifecycle"
    frontend:
      - "Project context cards"
    database:
      - "Project metadata repositories"
    infrastructure:
      - "Node filesystem"
  known_entrypoints:
    - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
    - "apps/server/src/application/tools/registerProjectAgentTools.ts"
    - "apps/server/src/application/coding/RepositoryIndexLifecycleService.ts"
    - "packages/shared/src/entities/RepositoryIndex.ts"
    - "packages/shared/src/entities/CodeContext.ts"
scope:
  in_scope:
    - "Define ProjectInspectionProfile shared schema."
    - "Create inspect_project tool available before mutable tools."
    - "Detect package manager from lockfiles."
    - "Detect framework and routes for React/Vite/Next-style projects when evidence exists."
    - "Detect scripts: dev, build, test, typecheck, lint, check."
    - "Detect source roots, test roots, entrypoints and editable text files."
    - "Return missing/ambiguous evidence explicitly."
  out_of_scope:
    - "Deep semantic code generation."
    - "Running install commands."
    - "Guaranteeing support for every framework."
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/ProjectInspection.ts"
      - "apps/server/src/application/services/ProjectInspectionService.ts"
      - "apps/server/src/application/tools/registerProjectAgentTools.ts"
      - "apps/server/src/application/services/AgentToolLoop.ts"
    services:
      - "ProjectInspectionService"
      - "RepositoryScanner"
    database:
      migrations_required: false
  frontend:
    files:
      - "apps/web/src/features/visual-preview/workflowProgress.ts"
    components:
      - "Inspection progress summary"
  workflow:
    agents:
      - "Front Agent"
      - "QA Agent"
  tests:
    unit:
      - "packages/shared/test/projectInspection.test.mjs"
      - "apps/server/test/projectInspectionService.test.mjs"
      - "apps/server/test/agentToolRuntimeInspectProject.test.mjs"
```

## 4. Integration Context Map

```yaml
integration_context:
  summary: |
    inspect_project is a read-only grounding tool. Mutable tools and command selection depend on it to avoid
    stale or wrong-project assumptions.
  depends_on:
    - name: "Repository scanner"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "this_spec_consumes_dependency"
      contract_used: "safe repository scan and file classification"
      required_for: "Find project files without unsafe traversal."
      assumptions: []
      failure_modes:
        - "Generated profile misses important files or includes ignored folders."
      fallback_or_recovery: "Return partial profile with warnings."
      verification:
        - "apps/server/test/projectInspectionService.test.mjs"
  depended_on_by:
    - name: "AgentToolLoop mutable planning"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "ProjectInspectionProfile"
      compatibility_obligation: "Profile must be stable and compact enough for prompts."
      expected_consumer_behavior: "Require inspection before edit/run command when session lacks project profile."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/agentToolLoop.test.mjs"
    - name: "Validation command selector"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "scripts and package manager"
      compatibility_obligation: "Unknown scripts must be represented as unknown, not invented."
      expected_consumer_behavior: "Choose validation commands from real scripts only."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/validationCommandSelector.test.mjs"
```

## 5. Architecture, Plan, Acceptance

```yaml
architecture_rules:
  project_specific:
    - "Inspection is read-only and may run before any mutable tool."
    - "Unknown evidence must stay explicit; never infer package scripts that do not exist."
contracts:
  data_contracts:
    - name: "ProjectInspectionProfile"
      producer: "ProjectInspectionService"
      consumers:
        - "AgentToolLoop"
        - "ValidationCommandSelector"
        - "Preview UI"
      migration_required: false
      compatibility_notes: "Additive shared schema."
execution_plan:
  - step: 1
    name: "Inspect current repository intelligence services"
    agent: "repo_explorer"
    action: "Read scanner, retrieval, index and project config code."
    expected_output: "Reusable service map."
  - step: 2
    name: "Add shared inspection schema"
    agent: "backend_specialist"
    action: "Define profile, evidence, warnings and detection status."
    expected_output: "Shared contract."
  - step: 3
    name: "Implement inspection service"
    agent: "backend_specialist"
    action: "Detect package manager, scripts, framework, roots and entrypoints from real files."
    expected_output: "Deterministic project profile."
  - step: 4
    name: "Register inspect_project tool"
    agent: "backend_specialist"
    action: "Expose read-only tool and require it in mutable sessions."
    expected_output: "Agents inspect before edits."
acceptance_criteria:
  functional:
    - "inspect_project returns package manager, scripts, roots, entrypoints and editable files."
    - "Missing evidence is represented as unknown/partial."
    - "Mutable tool sessions can require a recent inspection profile."
  quality:
    - "Fixture tests cover Vite/React and missing package.json cases."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server test -- projectInspectionService"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate project inspection."
      success_condition: "Exit code 0."
    - command: "pnpm typecheck"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate types."
      success_condition: "Exit code 0."
implementation_notes:
  preferred_approach: |
    Copy/adapt opencode file ignore, ripgrep, glob, grep and ls behavior where it is generic. The output must
    become a typed Horus ProjectInspectionProfile, not a loose tool transcript.
risks:
  - risk: "Heuristic framework detection overclaims support."
    severity: "medium"
    mitigation: "Attach evidence paths and confidence to every detected field."
```

## 6. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T23:52:00Z"
implementation_summary:
  - "Added shared ProjectInspectionProfile contracts for package manager, framework, scripts, roots, entrypoints, routes, editable files, unsafe paths, warnings and scan stats."
  - "Added ProjectInspectionService backed by RepositoryScanner to detect package manager lockfiles, React/Vite/Next/React/Node evidence, package scripts, source/test/public/editable roots, entrypoints and route evidence."
  - "Added inspect_project as a read-only agent tool with bounded editable-file output."
  - "Added inspect_project to all agent profile read capabilities and server startup tool validation."
  - "Wired AgentToolLoop to inspect the selected project before registering or applying a mutable CodeChangeSet."
  - "Recorded compact project inspection metadata in the operational session as decision evidence."
  - "Added regression coverage for shared schemas, inspection service behavior, runtime tool exposure and AgentToolLoop inspection-before-mutation behavior."
validation_evidence:
  - command: "pnpm build"
    status: "passed"
  - command: "node --test packages/shared/test/projectInspection.test.mjs apps/server/test/projectInspectionService.test.mjs apps/server/test/agentToolRuntimeInspectProject.test.mjs apps/server/test/projectAgentTools.test.mjs apps/server/test/agentToolRuntime.test.mjs apps/server/test/agentToolLoop.test.mjs apps/server/test/agentToolRuntimeRunCommand.test.mjs apps/server/test/agentToolRegistry.test.mjs"
    status: "passed"
```
