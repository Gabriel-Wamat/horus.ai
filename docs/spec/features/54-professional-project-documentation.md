# SPEC 54 - Professional Project Documentation

```yaml
format_version: "agentic_sdd.v1"
task_id: "54-professional-project-documentation"
title: "Professional Project Documentation"
created_at_utc: "2026-05-27T03:37:38Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
spec_version: "0.1.0"
```

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec para você fazer uma documentação rigorosa desse projeto, com alto padrão de engenharia de software, com detalhamentos cronológicos. além disso um readme bem feito, robusto, explicando como rodar o projeto etc. quero algo altamente profissional
```

## 2. System Interpretation

```yaml
system_translation: |
  Create an execution-ready documentation plan for Horus.AI. The implementation must
  produce a professional, evidence-backed documentation set, including a robust root
  README, detailed architecture and operations docs, chronological project evolution,
  local/Docker startup instructions, environment variable references, persistence modes,
  agent workflow explanations, validation commands, troubleshooting, and maintenance
  guidance. The docs must be grounded in the repository's actual code, scripts, packages,
  specs, tests, and runtime behavior.

expected_user_visible_result: |
  A new engineer can understand what Horus.AI is, why it exists, how it is structured,
  how to run it, how to validate it, how persistence works, how the agent workflow works,
  and how the project evolved chronologically.

expected_engineering_result: |
  Add or rewrite documentation artifacts so they become a reliable engineering reference,
  not marketing prose. The README must be complete enough for first-run onboarding, and
  supporting docs must preserve deeper architecture and operational details.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "The project lacks a single professional documentation surface for onboarding, operations, architecture, and historical context."
  target_user: "New contributors, maintainers, agentic coding agents, reviewers, and operators running Horus.AI locally or in containers."
  expected_outcome: "Horus.AI has documentation worthy of a serious software project: accurate, navigable, chronological, and operationally useful."
  product_surface:
    - "Root README"
    - "Architecture documentation"
    - "Local setup/runbook"
    - "Docker setup/runbook"
    - "Persistence documentation"
    - "Agent workflow documentation"
    - "Chronological changelog/evolution document"
    - "Troubleshooting and validation documentation"

technical_context:
  repository_root: "<repo-root>"
  relevant_stack:
    backend:
      - "Node.js >=20"
      - "TypeScript"
      - "Express"
      - "LangGraph"
      - "LangChain provider integrations"
      - "Postgres optional persistence"
      - "File-mode JSON persistence"
    frontend:
      - "React 19"
      - "Vite 6"
      - "TanStack Query"
      - "Monaco editor"
      - "XYFlow"
      - "Tailwind CSS"
    shared:
      - "Zod schemas"
      - "Shared entities and ports"
    infrastructure:
      - "pnpm workspace"
      - "Turbo"
      - "Docker planned by SPEC 53"
  known_entrypoints:
    - "Root package scripts: pnpm dev, pnpm build, pnpm test, pnpm type-check"
    - "Server: apps/server/src/main.ts"
    - "HTTP app: apps/server/src/infrastructure/http/server.ts"
    - "LangGraph graph: apps/server/src/infrastructure/langgraph/graph.ts"
    - "Web app: apps/web/src/main.tsx and apps/web/src/App.tsx"
    - "Shared contracts: packages/shared/src/index.ts"
    - "Env template: .env.example"
    - "Project-local agent skills: skills/README.md and skills/agents/*/SKILL.md"
  known_existing_patterns:
    - "Specs live under spec/ and are local-only."
    - "Project-local skills live under skills/ and are runtime product instructions."
    - "Runtime paths must be env-driven and portable."
    - "File-mode persistence uses HORUS_DATA_DIR."
    - "Postgres mode uses PERSISTENCE_DRIVER=postgres and DATABASE_URL."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create or rewrite the root README.md."
    - "Create professional docs under docs/ with clear navigation."
    - "Document project purpose, capabilities, architecture, execution flow, data flow, persistence, runtime config, agent roles, validation, and troubleshooting."
    - "Create a chronological engineering history based on specs/changelog and current code."
    - "Document how to run the project locally with pnpm."
    - "Document how to run with Docker, coordinating with SPEC 53 if Docker artifacts exist or are pending."
    - "Document required and optional environment variables without secrets."
    - "Document test/build/type-check commands with expected results."
    - "Document known limitations and operational caveats truthfully."
    - "Add documentation quality checks where feasible."
  out_of_scope:
    - "Changing application runtime behavior unless needed only to expose already-existing run information."
    - "Implementing Docker itself; Docker implementation belongs to SPEC 53."
    - "Adding marketing-style landing copy."
    - "Inventing features not present in code or specs."
    - "Publishing docs externally."
    - "Committing ignored local specs."
```

## 5. Documentation Deliverables

```yaml
deliverables:
  root_readme:
    path: "README.md"
    required_sections:
      - "Project name and concise product summary"
      - "What Horus.AI does"
      - "Core capabilities"
      - "Architecture at a glance"
      - "Monorepo structure"
      - "Prerequisites"
      - "Environment setup"
      - "Run locally"
      - "Run with Docker"
      - "Persistence modes"
      - "LLM provider configuration"
      - "Common workflows"
      - "Validation and tests"
      - "Troubleshooting"
      - "Security and secrets"
      - "Further documentation links"

  architecture_doc:
    path: "docs/architecture.md"
    required_sections:
      - "System overview"
      - "Backend layers"
      - "Frontend layers"
      - "Shared schemas/contracts"
      - "LangGraph orchestration"
      - "Agent responsibilities"
      - "Eventing and run-flow observability"
      - "Preview runtime"
      - "Project construction/runtime"
      - "Persistence abstractions"
      - "Critical invariants"

  runbook_doc:
    path: "docs/runbook.md"
    required_sections:
      - "First run from a clean machine"
      - "Local development loop"
      - "Production-like build/start"
      - "Docker workflow"
      - "Postgres workflow"
      - "Resetting local data"
      - "Inspecting logs and state"
      - "Common failure modes"

  configuration_doc:
    path: "docs/configuration.md"
    required_sections:
      - "Environment variable table"
      - "Provider-specific variables"
      - "Persistence variables"
      - "HTTP/CORS variables"
      - "Preview/runtime variables"
      - "Generated project workspace variables"
      - "Secret-handling rules"

  chronology_doc:
    path: "docs/chronology.md"
    required_sections:
      - "Chronological project evolution"
      - "Major architecture milestones"
      - "Persistence and portability timeline"
      - "Agent workflow hardening timeline"
      - "Frontend/runtime UX timeline"
      - "Validation and observability timeline"
      - "Known future work"

  contributing_doc:
    path: "docs/contributing.md"
    required_sections:
      - "Development principles"
      - "Branch/change hygiene"
      - "Testing expectations"
      - "Adding schemas"
      - "Adding repositories/persistence"
      - "Adding agent tools"
      - "Updating skills"
      - "Updating docs"
```

## 6. Affected Entities

```yaml
affected_entities:
  documentation:
    files:
      - "README.md"
      - "docs/architecture.md"
      - "docs/runbook.md"
      - "docs/configuration.md"
      - "docs/chronology.md"
      - "docs/contributing.md"
      - "docs/local-persistence-plan.md"
      - "docs/specs/llm-multiprovider-persistence-refactor.md"
      - "tools/README.md"
      - "skills/README.md"
  backend:
    files_to_read:
      - "apps/server/src/main.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/langgraph/graph.ts"
      - "apps/server/src/infrastructure/repositories/createRepositories.ts"
      - "apps/server/src/infrastructure/config/runtimeConfig.ts"
      - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
      - "apps/server/src/infrastructure/project/ProjectWorkspaceService.ts"
      - "apps/server/src/infrastructure/llm/providerConfig.ts"
  frontend:
    files_to_read:
      - "apps/web/src/App.tsx"
      - "apps/web/src/api/*.ts"
      - "apps/web/src/features/*"
      - "apps/web/src/components/*"
  shared:
    files_to_read:
      - "packages/shared/src/entities/*.ts"
      - "packages/shared/src/ports/*.ts"
      - "packages/shared/src/index.ts"
  workflow:
    graph_nodes:
      - "Spec Agent"
      - "ODIN Agent"
      - "Front Agent"
      - "QA Agent"
      - "Curator Agent"
      - "Call CLI / project execution"
    agents:
      - "skills/agents/spec-frontend-sdd/SKILL.md"
      - "skills/agents/front-design-frontend/SKILL.md"
      - "skills/agents/qa-frontend-testing/SKILL.md"
      - "skills/agents/curator-quality-gate/SKILL.md"
  tests:
    validation:
      - "pnpm test"
      - "pnpm build"
      - "pnpm type-check"
      - "documentation link/path sanity check"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    Documentation is an integration layer for humans and coding agents. It must accurately
    connect repo structure, runtime commands, environment contracts, persistence modes,
    agent workflows, generated project behavior, and validation expectations.

  depends_on:
    - name: "Root package scripts"
      type: "internal_module"
      owner: "repo"
      direction: "this_spec_consumes_dependency"
      contract_used: "package.json scripts and engines"
      required_for: "Document exact run/build/test commands."
      assumptions: []
      failure_modes:
        - "README instructs commands that do not exist."
      fallback_or_recovery: "Inspect package.json before writing commands."
      verification:
        - "Run or inspect pnpm scripts."

    - name: "Runtime configuration"
      type: "backend_service"
      owner: "apps/server"
      direction: "this_spec_consumes_dependency"
      contract_used: ".env.example, runtimeConfig.ts, providerConfig.ts, pool.ts"
      required_for: "Document environment variables and portability requirements."
      assumptions: []
      failure_modes:
        - "Operators configure wrong persistence mode, path, database, provider, host, or port."
      fallback_or_recovery: "Generate configuration table from code and env example."
      verification:
        - "Cross-check docs against .env.example and config source."

    - name: "LangGraph workflow"
      type: "workflow"
      owner: "apps/server/infrastructure/langgraph"
      direction: "this_spec_consumes_dependency"
      contract_used: "graph nodes, state schema, checkpointer, workflow orchestrator"
      required_for: "Document how user stories move through agents and validation loops."
      assumptions: []
      failure_modes:
        - "Docs misrepresent the actual agent routing or validation gate."
      fallback_or_recovery: "Read graph.ts, state.ts, WorkflowOrchestrator.ts, and agent skill files."
      verification:
        - "Architecture doc maps nodes to code files."

    - name: "Persistence repositories"
      type: "backend_service"
      owner: "apps/server/infrastructure/repositories"
      direction: "this_spec_consumes_dependency"
      contract_used: "createRepositories.ts and repository contracts"
      required_for: "Document file mode, Postgres mode, local data paths, and restart behavior."
      assumptions: []
      failure_modes:
        - "Docs omit data-loss or migration-relevant behavior."
      fallback_or_recovery: "Cross-check with SPEC 51 and SPEC 52 implementation."
      verification:
        - "Persistence section names HORUS_DATA_DIR and PERSISTENCE_DRIVER accurately."

    - name: "Project-local skills"
      type: "agent"
      owner: "skills/agents"
      direction: "this_spec_consumes_dependency"
      contract_used: "SKILL.md files and skills/README.md"
      required_for: "Document agent responsibilities and prompt/runtime boundaries."
      assumptions: []
      failure_modes:
        - "Docs describe agents in generic terms instead of actual project roles."
      fallback_or_recovery: "Read each skill before documenting agent behavior."
      verification:
        - "Agent docs link each role to skill path."

    - name: "Specs and changelog"
      type: "internal_module"
      owner: "spec/"
      direction: "this_spec_consumes_dependency"
      contract_used: "spec/README.md, spec/CHANGELOG.md, feature specs"
      required_for: "Build chronological engineering history."
      assumptions:
        - "spec/ is local-only and ignored; public docs must not require local-only files to understand core usage."
      failure_modes:
        - "Chronology becomes incomplete, speculative, or references unavailable local-only docs as required public context."
      fallback_or_recovery: "Use specs as source evidence but make final chronology self-contained."
      verification:
        - "Chronology has dates, milestones, and links only where appropriate."

  depended_on_by:
    - name: "New contributors"
      type: "external_consumer"
      owner: "users"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "README and docs"
      compatibility_obligation: "Must be accurate and runnable from a fresh clone."
      expected_consumer_behavior: "Follow docs to install, configure, run, and validate the project."
      migration_or_notification_required: false
      verification:
        - "First-run instructions are command-complete."

    - name: "Maintainers"
      type: "external_consumer"
      owner: "users"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Architecture, runbook, contributing, chronology"
      compatibility_obligation: "Must preserve historical and architectural accuracy."
      expected_consumer_behavior: "Use docs to make future changes without rediscovering architecture."
      migration_or_notification_required: false
      verification:
        - "Docs explain where to update when architecture changes."

    - name: "Coding agents"
      type: "agent"
      owner: "agent runtime"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Documentation constraints, architecture map, validation commands"
      compatibility_obligation: "Must reduce ambiguity and prevent false assumptions."
      expected_consumer_behavior: "Read docs to orient implementation and validation work."
      migration_or_notification_required: false
      verification:
        - "Docs include exact files and commands rather than vague prose."

  bidirectional_integrations:
    - name: "Docs and codebase"
      participants:
        - "Documentation"
        - "Source code"
      shared_contract: "Commands, env vars, API surfaces, architecture descriptions"
      consistency_rule: "Docs must be updated whenever commands, env vars, persistence modes, or agent flow change."
      verification:
        - "Manual cross-check against package scripts, .env.example, and key source files."

  data_flow:
    inbound:
      - source: "Codebase inspection"
        payload_or_state: "Scripts, env vars, modules, schemas, routes, workflows"
        validation: "Read actual files before writing claims."
      - source: "Spec changelog"
        payload_or_state: "Chronological implementation milestones"
        validation: "Use dates and feature numbers; do not invent history."
    outbound:
      - sink: "README.md"
        payload_or_state: "First-run and project overview documentation"
        validation: "Commands and paths checked against repo."
      - sink: "docs/*.md"
        payload_or_state: "Architecture, operations, configuration, chronology, contributing"
        validation: "Internal links and referenced files exist."
```

## 8. Documentation Quality Bar

```yaml
quality_bar:
  style:
    - "Professional, direct, engineering-grade prose."
    - "No exaggerated marketing language."
    - "No vague claims like 'scalable' unless backed by architecture details."
    - "Prefer precise nouns: workflow, repository, checkpointer, preview session, project workspace."
    - "Use diagrams only where they clarify execution flow."
  accuracy:
    - "Every command must exist in package.json or be clearly marked as future/pending."
    - "Every env var must be present in .env.example or source code, or marked as planned by another SPEC."
    - "Every path must exist or be planned explicitly."
    - "Do not document Docker as completed until SPEC 53 is implemented."
    - "Do not describe spec/ as public source of truth; it is local-only."
  chronology:
    - "Chronology must be ordered by date/version where available."
    - "Chronology must distinguish implemented, planned, and local-only spec work."
    - "Chronology must call out major architecture turning points, not every tiny change."
  portability:
    - "Docs must use <repo-root> or relative paths, not local absolute paths."
    - "Commands must be cross-platform where possible."
    - "When OS-specific commands are unavoidable, provide macOS/Linux and Windows equivalents."
```

## 9. README Content Contract

```yaml
readme_contract:
  title: "Horus.AI"
  opening:
    - "One-paragraph explanation of the autonomous multi-agent product."
    - "Short capability list."
    - "Status note if Docker support is planned but not yet implemented."
  required_commands:
    prerequisites:
      - "Node.js >=20"
      - "pnpm >=9, preferably through corepack"
    setup:
      - "corepack enable"
      - "pnpm install"
      - "cp .env.example .env"
    development:
      - "pnpm dev"
    production_like:
      - "pnpm build"
      - "pnpm --filter @u-build/server start"
    validation:
      - "pnpm type-check"
      - "pnpm build"
      - "pnpm test"
  required_explanations:
    - "Where the web app runs."
    - "Where the API runs."
    - "How CORS works in local mode."
    - "How to configure provider credentials."
    - "How file-mode persistence works."
    - "How to switch to Postgres."
    - "Where generated project workspaces are stored."
    - "How to reset local state."
    - "How to troubleshoot missing provider keys, port conflicts, Postgres errors, preview failures, and stale local data."
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    agent: "docs_specialist"
    action: "Inventory existing docs and source-of-truth files."
    files_to_read:
      - "package.json"
      - "pnpm-workspace.yaml"
      - "turbo.json"
      - ".env.example"
      - "apps/server/package.json"
      - "apps/web/package.json"
      - "packages/shared/package.json"
      - "tools/README.md"
      - "skills/README.md"
    expected_output: "Documentation source inventory with exact commands and package boundaries."

  - step: 2
    agent: "architecture_specialist"
    action: "Map backend, frontend, shared contracts, workflow, agents, persistence, and preview runtime."
    files_to_read:
      - "apps/server/src/infrastructure/langgraph/graph.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/repositories/createRepositories.ts"
      - "apps/server/src/infrastructure/config/runtimeConfig.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/web/src/App.tsx"
      - "packages/shared/src/index.ts"
    expected_output: "Architecture notes for docs/architecture.md."

  - step: 3
    agent: "docs_specialist"
    action: "Create or rewrite README.md."
    files_to_change:
      - "README.md"
    expected_output: "Professional root README with setup, run, architecture summary, config, validation, troubleshooting, and links."

  - step: 4
    agent: "docs_specialist"
    action: "Create supporting docs."
    files_to_change:
      - "docs/architecture.md"
      - "docs/runbook.md"
      - "docs/configuration.md"
      - "docs/contributing.md"
    expected_output: "Detailed documentation set with clear ownership boundaries."

  - step: 5
    agent: "history_specialist"
    action: "Create chronological engineering history."
    files_to_read:
      - "spec/CHANGELOG.md"
      - "spec/README.md"
      - "docs/local-persistence-plan.md"
    files_to_change:
      - "docs/chronology.md"
    expected_output: "Chronological narrative that distinguishes implemented changes, planned specs, and current limitations."

  - step: 6
    agent: "qa_specialist"
    action: "Validate documentation accuracy."
    expected_output: "Evidence that commands, paths, env vars, and links are consistent with the repo."

  - step: 7
    agent: "qa_specialist"
    action: "Run project validation if documentation changes do not require runtime changes."
    commands:
      - "pnpm build"
      - "pnpm test"
    expected_output: "Validation evidence or explicit reason if skipped."
```

## 11. Validation Protocol

```yaml
validation_protocol:
  required_static_checks:
    - command: "test -f README.md"
      cwd: "<repo-root>"
      purpose: "Ensure root README exists."
      success_condition: "Exit code 0."
    - command: "test -f docs/architecture.md && test -f docs/runbook.md && test -f docs/configuration.md && test -f docs/chronology.md && test -f docs/contributing.md"
      cwd: "<repo-root>"
      purpose: "Ensure documentation package exists."
      success_condition: "Exit code 0."
    - command: "rg -n '/<USER_HOME>/wamat|/<USER_HOME>/|<WINDOWS_DRIVE_ROOT>\\Users|/home/[^ ]+' README.md docs"
      cwd: "<repo-root>"
      purpose: "Detect machine-specific paths in public docs."
      success_condition: "No runtime-instruction hardcodes; illustrative forbidden examples are allowed only when clearly labeled."
    - command: "rg -n 'pnpm dev|pnpm build|pnpm test|PERSISTENCE_DRIVER|HORUS_DATA_DIR|DATABASE_URL|OPENAI_API_KEY' README.md docs"
      cwd: "<repo-root>"
      purpose: "Check that essential commands/env vars are covered."
      success_condition: "Expected references exist."
  required_project_checks:
    - command: "pnpm build"
      cwd: "<repo-root>"
      purpose: "Confirm docs work did not disturb build."
      success_condition: "Exit code 0."
    - command: "pnpm test"
      cwd: "<repo-root>"
      purpose: "Confirm docs work did not disturb runtime contracts."
      success_condition: "Exit code 0."
  optional_checks:
    - command: "docker build -t horus-ai:docs-smoke ."
      cwd: "<repo-root>"
      purpose: "Only after SPEC 53 implementation exists."
      success_condition: "Exit code 0."
```

## 12. Acceptance Criteria

```yaml
acceptance_criteria:
  documentation:
    - "README.md exists and can onboard a new contributor from zero."
    - "README links to deeper docs instead of becoming an unmaintainable wall of text."
    - "Architecture doc maps major modules to real files."
    - "Runbook includes local, production-like, Docker/planned Docker, file-mode, and Postgres workflows."
    - "Configuration doc lists required/optional env vars and secret status."
    - "Chronology doc explains project evolution in dated/versioned order."
    - "Contributing doc explains how to change schemas, repositories, skills, tests, and docs."
  accuracy:
    - "No unverified feature claims."
    - "No absolute machine-specific paths."
    - "No secrets or fake API keys."
    - "Docker docs are labeled as pending if SPEC 53 has not yet been implemented."
    - "Local-only specs are not treated as public required docs."
  engineering_quality:
    - "Docs use consistent terminology."
    - "Docs distinguish development, production-like, Docker, and test workflows."
    - "Troubleshooting covers provider keys, ports, CORS, persistence, Postgres, preview runtime, and generated project workspace issues."
    - "Validation evidence is recorded in implementation log."
```

## 13. Risks and Unknowns

```yaml
risks:
  - risk: "Documentation may drift from code if generated from assumptions instead of inspection."
    severity: "high"
    mitigation: "Require file-by-file source inspection before writing architecture claims."
  - risk: "Chronology may overfit local-only specs that are ignored by git."
    severity: "medium"
    mitigation: "Use local specs as evidence, but make public chronology self-contained and label local-only material."
  - risk: "Docker instructions may get ahead of implementation."
    severity: "medium"
    mitigation: "Reference SPEC 53 as planned until Docker artifacts exist and are validated."
  - risk: "README becomes too long."
    severity: "low"
    mitigation: "Keep README as navigational entrypoint and move deep details into docs/."
unknowns:
  - question: "Will Docker artifacts be implemented before this documentation work?"
    resolution_strategy: "Check for Dockerfile/compose at implementation time and mark status accurately."
  - question: "Should docs be public-facing or internal-only?"
    resolution_strategy: "Default to professional public-safe docs with no secrets and no local-only dependency."
```

## 14. Error Mitigation Rules for Executing Agents

```yaml
error_mitigation:
  - "Do not write architecture claims without reading the source files they refer to."
  - "Do not document commands that were not found in package.json unless explicitly marked as planned."
  - "Do not claim Docker is ready unless Docker artifacts exist and validation ran."
  - "Do not expose secrets or placeholder keys that look real."
  - "Do not include local absolute paths in user-facing run instructions."
  - "Do not rewrite unrelated source code as part of docs work."
  - "Do not remove existing docs without preserving useful project-specific content."
  - "If tests are skipped because changes are docs-only, explain why; if build/test is cheap, run it."
```

## 15. Implementation Log

```yaml
implementation_log:
  completed:
    - "Adjusted .gitignore so README.md and official root docs can be tracked while local root files remain ignored."
    - "Explicitly kept AGENTS.md, CLAUDE.md, ID_VISUAL.md, and UNPROTECT.md ignored."
    - "Ignored output/ and docs/specs/ as local validation/planning artifacts."
    - "Created a professional root README.md with documentation map, system flow, first-run commands, validation, persistence, LLM providers, and troubleshooting."
    - "Created docs/index.md as a visual navigation page with Mermaid diagrams, quick maps, and reading paths."
    - "Created docs/architecture.md with visual system, LangGraph, and persistence diagrams."
    - "Created docs/runbook.md with operator flow diagram, command matrix, local run, Postgres, preview, reset, and troubleshooting."
    - "Created docs/configuration.md with env var tables, configuration map diagram, required/optional matrix, and secret-handling rules."
    - "Created docs/chronology.md with timeline diagram, milestone matrix, and chronological engineering narrative."
    - "Created docs/contributing.md with project boundaries, persistence rules, workflow rules, frontend rules, skill rules, docs rules, and Git hygiene."
  validation:
    - command: "test -f README.md && test -f docs/architecture.md && test -f docs/runbook.md && test -f docs/configuration.md && test -f docs/chronology.md && test -f docs/contributing.md"
      result: "passed"
    - command: "git check-ignore -v AGENTS.md CLAUDE.md ID_VISUAL.md UNPROTECT.md output/playwright/agents-simplified-odin-finalize.png docs/specs/llm-multiprovider-persistence-refactor.md README.md"
      result: "confirmed local files/artifacts are ignored and README.md is explicitly unignored"
    - command: "rg -n '/<USER_HOME>/wamat|/<USER_HOME>/|<WINDOWS_DRIVE_ROOT>\\Users|/home/[^ ]+' README.md docs --glob '!docs/specs/**'"
      result: "found only historical forbidden-path examples in docs/local-persistence-plan.md; new public docs do not contain local machine paths"
    - command: "rg -n '/<USER_HOME>/wamat|/<USER_HOME>/|<WINDOWS_DRIVE_ROOT>\\Users|/home/[^ ]+' README.md docs/index.md docs/architecture.md docs/runbook.md docs/configuration.md docs/chronology.md docs/contributing.md"
      result: "passed, no local machine paths in the new documentation package"
    - command: "pnpm test"
      result: "passed, build succeeded and 168 tests passed"
  remaining_risks:
    - "Docker documentation remains marked as planned until SPEC 53 is implemented."
    - "docs/local-persistence-plan.md is an older planning document and still contains historical examples of machine-specific paths."
```

## 16. Minimal Output Contract for Executing Agents

```yaml
agent_result:
  status: "<completed | failed | blocked>"
  summary: "<short factual summary>"
  files_read:
    - "<path>"
  files_changed:
    - "<path>"
  commands_run:
    - command: "<command>"
      cwd: "<cwd>"
      exit_code: "<exit code>"
      result: "<short result>"
  documentation_created:
    - path: "<path>"
      purpose: "<what this doc covers>"
  validation:
    passed:
      - "<check>"
    failed:
      - "<check>"
    blocked:
      - "<check>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```
