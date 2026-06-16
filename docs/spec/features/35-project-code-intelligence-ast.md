---
format_version: "agentic_sdd.v1"
task_id: "35-project-code-intelligence-ast"
title: "Project Code Intelligence AST backend"
created_at_utc: "2026-05-26T22:11:14Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
depends_on:
  - "spec/features/33-project-file-browser-backend.md"
reference_repo: "<REFERENCE_REPO_ROOT>"
reference_files:
  - "<REFERENCE_REPO_ROOT>/app/services/code_intelligence/ast_parser_service.py"
  - "<REFERENCE_REPO_ROOT>/app/services/code_intelligence/tree_sitter_parser.py"
  - "<REFERENCE_REPO_ROOT>/app/services/code_intelligence/dependency_graph_service.py"
  - "<REFERENCE_REPO_ROOT>/app/services/code_intelligence/impact_analyzer.py"
  - "<REFERENCE_REPO_ROOT>/app/services/code_intelligence_service.py"
  - "<REFERENCE_REPO_ROOT>/app/services/odin_workflow/specialist/code_intelligence_adapter.py"
---

# 1. Original User Request

```yaml
raw_user_request: |
  gere uma spec para esse ajuste então
```

# 2. System Interpretation

```yaml
system_translation: |
  Criar uma SPEC rigorosa para adicionar ao Horus uma camada backend de Code Intelligence baseada em AST,
  inspirada no zup-sdd-agents, mas adaptada ao stack TypeScript/Node do Horus. Essa camada deve ser separada
  do file browser: o file browser lista e lê arquivos; o Code Intelligence entende símbolos, imports,
  dependências, dependentes, referências, definições, impacto de mudanças e testes relacionados.

expected_user_visible_result: |
  Depois da implementação, o Horus consegue enriquecer a tela Arquivos, agentes e fluxos de planejamento com
  informações estruturais do projeto: símbolos por arquivo, definições, referências, dependências, arquivos
  afetados, testes relacionados e risco de breaking change.

expected_engineering_result: |
  O backend passa a ter contratos compartilhados, serviços modulares, APIs read-only e testes para análise AST
  segura em workspaces reais, consumindo o mesmo resolvedor de projeto/run da spec 33 sem duplicar regras de path.
```

# 3. Product and Technical Context

```yaml
business_context:
  user_problem: "O usuário e os agentes precisam entender o código além de ver arquivos como texto."
  target_user: "Usuário operador do Horus e agentes especialistas que planejam alterações no projeto."
  expected_outcome: "Planejamento mais preciso, menor leitura linear, navegação por símbolo e impacto de mudança mais confiável."
  product_surface:
    - "Backend Code Intelligence API"
    - "Tela Arquivos, em implementação pela spec 34"
    - "Planejamento dos agentes de projeto"
    - "Quality/risk analysis de mudanças"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "Node.js"
      - "Express"
      - "TypeScript"
      - "Zod shared schemas"
      - "Existing ProjectFileBrowserService from spec 33"
    frontend:
      - "React"
      - "Vite"
      - "Future consumer only in this spec"
    database:
      - "No migration required for initial in-memory/cache implementation"
      - "ProjectConstructionRepository for project/run identity"
    infrastructure:
      - "ProjectPathSafety"
      - "GitCommandExecutor"
      - "Project file browser resolver from spec 33"
  known_entrypoints:
    - "packages/shared/src/entities/ProjectFiles.ts"
    - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
    - "apps/server/src/infrastructure/project/ProjectFileTreeCollector.ts"
    - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/infrastructure/repositories/contracts.ts"
  known_existing_patterns:
    - "Shared contracts live in packages/shared/src/entities/* and are exported from packages/shared/src/index.ts."
    - "Express route modules live under apps/server/src/infrastructure/http/routes."
    - "Project filesystem services live under apps/server/src/infrastructure/project."
    - "Routes are mounted under /api/* in server.ts."
    - "Project identity and run workspace identity must be resolved server-side."
```

# 4. Scope

```yaml
scope:
  in_scope:
    - "Define shared Code Intelligence schemas/types for symbols, locations, parsed files, dependency graph, references and impact analysis."
    - "Implement AST parsing for TypeScript, TSX, JavaScript and JSX using the TypeScript compiler API or a vetted parser available in the project."
    - "Implement a conservative fallback parser only when the primary parser cannot parse, and mark fallback usage in the response."
    - "Optionally support Python parsing only if a low-risk dependency-free parser is available; otherwise explicitly return unsupported language for Python in Horus."
    - "Build dependency graph from imports between supported project files."
    - "Expose read-only APIs for symbols, definitions, references, dependencies and impact analysis."
    - "Reuse the project/run root resolution and path safety from spec 33."
    - "Add bounded workspace discovery, ignore rules, cache invalidation and performance tests."
    - "Add tests for symbols, imports, dynamic imports, re-exports, aliases, dependency fan-out, affected files, related tests, traversal rejection and cache invalidation."
  out_of_scope:
    - "Editing files."
    - "Executing user commands."
    - "Replacing the file browser API."
    - "Implementing frontend UI for symbols/AST."
    - "Persisting AST indexes in database in the first version."
    - "Using regex as the primary parser for TypeScript/JavaScript."
    - "Copying Python code from zup-sdd-agents."
    - "Exposing absolute filesystem paths in API responses."
```

# 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/ProjectCodeIntelligence.ts"
      - "packages/shared/src/index.ts"
      - "apps/server/src/infrastructure/project/ProjectWorkspaceRootResolver.ts"
      - "apps/server/src/infrastructure/project/ProjectAstParserService.ts"
      - "apps/server/src/infrastructure/project/ProjectDependencyGraphService.ts"
      - "apps/server/src/infrastructure/project/ProjectImpactAnalyzer.ts"
      - "apps/server/src/infrastructure/project/ProjectCodeIntelligenceService.ts"
      - "apps/server/src/infrastructure/http/routes/projectCodeIntelligenceRoutes.ts"
      - "apps/server/src/infrastructure/http/server.ts"
    services:
      - "ProjectFileBrowserService"
      - "ProjectConstructionRepository"
      - "ProjectPathSafety"
      - "GitCommandExecutor"
    database:
      migrations_required: false
      tables:
        - "project_workspaces"
        - "project_construction_runs"
  frontend:
    files:
      - "None in this spec"
    components:
      - "Future ProjectFilesPage symbols/dependencies panel"
    routes:
      - "Future /arquivos or app file screen consumer"
  workflow:
    graph_nodes:
      - "Future specialist planning consumers"
    agents:
      - "future frontend_specialist"
      - "future backend_specialist"
      - "future qa_specialist"
  tests:
    unit:
      - "apps/server/test/projectAstParser.test.mjs"
      - "apps/server/test/projectDependencyGraph.test.mjs"
      - "apps/server/test/projectImpactAnalyzer.test.mjs"
    integration:
      - "apps/server/test/projectCodeIntelligenceRoutes.test.mjs"
      - "apps/server/test/projectCodeIntelligenceService.test.mjs"
    e2e:
      - "Future frontend smoke once spec 34 consumes this API"
```

# 6. Integration Context Map

```yaml
integration_context:
  summary: |
    Code Intelligence is a read-only structural analysis layer over the same registered project/run roots used by
    the file browser. It must not own project identity, path safety, worktree validation or file serving. It consumes
    those capabilities and returns compact structural metadata for agents and future UI consumers.

  depends_on:
    - name: "Project file root resolution from spec 33"
      type: "backend_service"
      owner: "project infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "resolve projectId/runId into a real, safe root path"
      required_for: "Analyze only registered Horus project roots and validated run worktrees."
      assumptions:
        - "Spec 33 implementation exposes or can be refactored to expose a reusable root resolver."
      failure_modes:
        - "Duplicated root resolution drifts and permits AST scanning outside registered roots."
      fallback_or_recovery: "Extract root resolution into ProjectWorkspaceRootResolver before implementing AST APIs."
      verification:
        - "Route tests for project root, run root and rejected cross-project run."
        - "Traversal tests using the same projectId/runId paths as file browser."

    - name: "ProjectConstructionRepository"
      type: "backend_service"
      owner: "project construction bounded context"
      direction: "this_spec_consumes_dependency"
      contract_used: "getProjectWorkspace(projectId), getConstructionRun(runId), listConstructionRuns(projectId?)"
      required_for: "Resolve project metadata and run ownership."
      assumptions: []
      failure_modes:
        - "Symbols or dependencies are generated for the wrong project."
      fallback_or_recovery: "Return project_not_found or run_not_found with safe error body."
      verification:
        - "Repository stub tests."
        - "Postgres/file repository build compatibility."

    - name: "TypeScript parser capability"
      type: "external_dependency"
      owner: "server package"
      direction: "this_spec_consumes_dependency"
      contract_used: "TypeScript compiler API or project-approved parser"
      required_for: "Parse TS/TSX/JS/JSX with real syntax tree instead of regex."
      assumptions:
        - "The TypeScript package is available in the workspace as a dev dependency and can be promoted if runtime import is needed."
      failure_modes:
        - "No AST parsing at runtime; fallback loses accuracy."
      fallback_or_recovery: "Use explicit parse_error/fallbackUsed fields; do not silently claim AST results."
      verification:
        - "Parser unit tests for class, function, variable, import, dynamic import, re-export, JSX component and alias imports."

    - name: "ProjectPathSafety"
      type: "internal_module"
      owner: "project infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "resolveInsideRoot(), isInsideRoot(), isGitMetadataPath()"
      required_for: "Reject unsafe file paths and keep all returned paths relative."
      assumptions: []
      failure_modes:
        - "Secret leakage or filesystem traversal through symbol/dependency endpoints."
      fallback_or_recovery: "Reject with forbidden_path and no absolute path in response."
      verification:
        - "Tests for absolute path, ../, encoded traversal, .git, .env and symlink escape."

  depended_on_by:
    - name: "Future ProjectFilesPage symbol/dependency UI"
      type: "frontend_component"
      owner: "web app"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Project Code Intelligence API schemas"
      compatibility_obligation: "Can extend with optional fields; must not remove stable fields without frontend migration."
      expected_consumer_behavior: "Show symbol outline, jump-to-definition metadata, dependency/dependent lists and impact summary."
      migration_or_notification_required: false
      verification:
        - "Future frontend typecheck imports shared contracts."

    - name: "Future specialist planning payload"
      type: "agent"
      owner: "agent runtime"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Impact analysis payload with changed_files, affected_files, related_tests, breaking_change_risk, reasoning."
      compatibility_obligation: "Must remain compact and optional; planning must continue if Code Intelligence fails."
      expected_consumer_behavior: "Agents inspect affected files/tests before producing execution plans."
      migration_or_notification_required: false
      verification:
        - "Future runtime test proving payload is attached only when changed files are known."

  bidirectional_integrations:
    - name: "File browser root resolver and Code Intelligence"
      participants:
        - "ProjectWorkspaceRootResolver"
        - "ProjectCodeIntelligenceService"
      shared_contract: "ResolvedProjectRoot { project, run, rootPath, rootLabel }"
      consistency_rule: "The same projectId/runId must resolve to the same safe root for file browser and AST APIs."
      verification:
        - "Shared resolver tests reused by both feature test suites."

  data_flow:
    inbound:
      - source: "Frontend or agent runtime"
        payload_or_state: "projectId, optional runId, optional path, optional symbol, optional changedFiles"
        validation: "Zod schemas, UUID validation, path normalization and root containment"
    outbound:
      - target: "Frontend or agent runtime"
        payload_or_state: "relative paths, symbols, references, dependencies, dependents, impact metadata"
        compatibility: "No absolute paths; optional parse errors are explicit; failures are safe and typed"

  sequencing_dependencies:
    - dependency: "Spec 33 backend must exist before this spec"
      reason: "AST scanning must reuse the same project/run root trust boundary."
      validation: "Project file browser tests pass before Code Intelligence implementation starts."
    - dependency: "Parser dependency choice must be verified before coding"
      reason: "Runtime import of a dev-only package may fail in production if dependency is misclassified."
      validation: "Inspect package.json and build output; add dependency deliberately if needed."

  integration_risks:
    - risk: "Accidental full-repo scan freezes server."
      severity: "high"
      mitigation: "Hard limits for file count, file size, depth, timeout and supported extensions."
    - risk: "Regex fallback is mistaken for AST."
      severity: "medium"
      mitigation: "Expose parserMode: ast | fallback | unsupported and parse_error per file."
    - risk: "AST API leaks absolute paths."
      severity: "critical"
      mitigation: "Convert all paths to root-relative POSIX paths before leaving service."
```

# 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Separate shared contracts, HTTP routes, root resolution, parser, graph and impact analysis."
    - "Prefer dependency injection for parser, resolver and repository dependencies."
    - "Do not introduce circular dependencies."
    - "Do not duplicate path safety rules across layers."
  project_specific:
    - "Do not put AST parsing logic in route handlers."
    - "Do not put frontend/UI concerns in backend AST services."
    - "Do not expose raw absolute paths in API responses, logs or errors."
    - "Code Intelligence must be read-only and best-effort; it must not block project execution unless a future quality gate explicitly opts in."
    - "The parser must support bounded operation: max files, max bytes per file, max traversal depth and cache invalidation."
    - "Root resolution must be shared with the file browser or extracted from it; do not create a second trust model."
```

# 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read current spec 33 implementation before editing."
    - "Search for existing project/root resolver patterns before creating one."
    - "Keep modules small: parser, graph, impact, service, route."
    - "Use Zod schemas for every route query/body."
    - "Return stable error codes."
  backend:
    - "Use supported source extensions only: .ts, .tsx, .js, .jsx initially."
    - "Use real AST parser for TypeScript/JavaScript primary path."
    - "Record parserMode per parsed file."
    - "Never parse files above configured maxBytes."
    - "Skip ignored directories: .git, node_modules, dist, build, coverage, .next, .turbo, caches."
    - "Do not follow symlinks during workspace discovery."
    - "Protect every explicit path request with root containment and sensitive path filtering."
    - "Keep cache in memory for first version; invalidate by file metadata and git status/head where practical."
  frontend:
    - "No frontend implementation in this spec."
  tests:
    - "Cover parser output, graph output, impact output, API shape, security failures, limits and cache invalidation."
```

# 9. Contracts and Invariants

```yaml
contracts:
  api_contracts:
    - name: "Project symbols"
      producer: "ProjectCodeIntelligenceService"
      consumers:
        - "Future ProjectFilesPage"
        - "Future agent runtime"
      request_shape: "GET /api/project-code-intelligence/projects/:projectId/symbols?runId=&path=&limit="
      response_shape: |
        {
          projectId: string;
          runId: string | null;
          files: Array<{
            path: string;
            language: string;
            parserMode: 'ast' | 'fallback' | 'unsupported';
            parseError: string | null;
            symbols: Array<{ name, kind, location, parent?, importsFrom?, exported? }>;
            imports: string[];
          }>;
          partial: boolean;
          generatedAt: string;
        }
      compatibility: "Can extend; must preserve projectId/runId/files[].path/symbols/imports."

    - name: "Find definition"
      producer: "ProjectCodeIntelligenceService"
      consumers:
        - "Future symbol search UI"
        - "Future agent runtime"
      request_shape: "GET /api/project-code-intelligence/projects/:projectId/definitions?symbol=&runId="
      response_shape: "{ projectId, runId, symbol, definitions: Symbol[], generatedAt }"
      compatibility: "Can extend with confidence/ranking; must preserve definitions list."

    - name: "Find references"
      producer: "ProjectCodeIntelligenceService"
      consumers:
        - "Future symbol search UI"
        - "Future agent runtime"
      request_shape: "GET /api/project-code-intelligence/projects/:projectId/references?symbol=&runId=&limit="
      response_shape: "{ projectId, runId, symbol, references: Array<{ path, line, column, lineText }>, partial, generatedAt }"
      compatibility: "Can extend; must keep bounded response."

    - name: "Analyze dependencies"
      producer: "ProjectDependencyGraphService"
      consumers:
        - "Future file details panel"
        - "Future agent runtime"
      request_shape: "GET /api/project-code-intelligence/projects/:projectId/dependencies?path=&runId="
      response_shape: "{ projectId, runId, path, dependencies, transitiveDependencies, dependents, transitiveDependents, generatedAt }"
      compatibility: "Can extend; all paths must remain relative."

    - name: "Analyze impact"
      producer: "ProjectImpactAnalyzer"
      consumers:
        - "Future specialist planning"
        - "Future QA recommendations"
      request_shape: "POST /api/project-code-intelligence/projects/:projectId/impact { runId?, changedFiles: string[] }"
      response_shape: "{ projectId, runId, impact: { changedFiles, affectedFiles, relatedTests, breakingChangeRisk, reasoning }, generatedAt }"
      compatibility: "Can extend; impact keys must remain stable."

  domain_contracts:
    - name: "Read-only code intelligence"
      producer: "ProjectCodeIntelligenceService"
      consumers:
        - "All API clients"
      invariant: "No Code Intelligence endpoint writes, deletes, executes, stages, commits or mutates files."

    - name: "Relative-path-only outputs"
      producer: "ProjectCodeIntelligenceService"
      consumers:
        - "Frontend"
        - "Agent runtime"
      invariant: "All file paths returned by public APIs are POSIX relative paths inside the resolved root."

    - name: "Best-effort analysis"
      producer: "ProjectAstParserService"
      consumers:
        - "ProjectDependencyGraphService"
        - "ProjectImpactAnalyzer"
      invariant: "Syntax errors and unsupported languages produce parseError/parserMode, not uncaught workflow failures."

  data_contracts:
    - name: "In-memory AST cache"
      producer: "ProjectAstParserService"
      consumers:
        - "ProjectCodeIntelligenceService"
      migration_required: false
      compatibility_notes: "Cache is an optimization only; correctness must not depend on persistence."
```

# 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current backend and parser dependency options"
    agent: "repo_explorer"
    action: "Read spec 33 files, package.json files, tsconfig, existing code context services and tests."
    expected_output: "Confirmed parser dependency, root resolver extraction plan and exact files to edit."

  - step: 2
    name: "Extract reusable project/run root resolver"
    agent: "backend_specialist"
    action: "Move root resolution from ProjectFileBrowserService into ProjectWorkspaceRootResolver or equivalent shared service."
    expected_output: "File browser and Code Intelligence can consume the same resolver without duplication."

  - step: 3
    name: "Create shared Code Intelligence contracts"
    agent: "backend_specialist"
    action: "Add ProjectCodeIntelligence schemas/types and export them."
    expected_output: "Typed API contracts for symbols, parsed files, dependencies, references and impact."

  - step: 4
    name: "Implement AST parser"
    agent: "backend_specialist"
    action: "Implement TypeScript/JavaScript AST parsing with symbol/import/export extraction, parserMode, errors and cache."
    expected_output: "ProjectAstParserService with unit tests."

  - step: 5
    name: "Implement dependency graph"
    agent: "backend_specialist"
    action: "Resolve relative and alias imports to root-relative files and compute dependencies/dependents/cycles."
    expected_output: "ProjectDependencyGraphService with tests."

  - step: 6
    name: "Implement impact analyzer"
    agent: "backend_specialist"
    action: "Compute affected files, related tests and risk from changed files and dependency graph."
    expected_output: "ProjectImpactAnalyzer with tests."

  - step: 7
    name: "Expose HTTP routes"
    agent: "backend_specialist"
    action: "Add /api/project-code-intelligence routes with Zod validation and stable errors."
    expected_output: "Read-only API available in server.ts."

  - step: 8
    name: "Validate rigorously"
    agent: "qa_specialist"
    action: "Run shared/server builds, focused tests, full pnpm test and security/limit tests."
    expected_output: "Validation evidence with exit codes."
```

# 11. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm that Code Intelligence remains separate from file browser and shares only root resolution."
    inputs:
      - "This SPEC"
      - "Spec 33 implementation"
      - "zup-sdd-agents Code Intelligence reference"
    outputs:
      - "Final architecture boundary notes"

  - agent_name: "backend_specialist"
    responsibility: "Implement contracts, parser, graph, impact analyzer, service, routes and resolver extraction."
    inputs:
      - "Affected backend files"
      - "Parser dependency decision"
      - "Security constraints"
    outputs:
      - "Backend diff"
      - "Focused backend tests"

  - agent_name: "qa_specialist"
    responsibility: "Stress parser limits, path safety, cache invalidation and API contract stability."
    inputs:
      - "Backend diff"
      - "Acceptance criteria"
    outputs:
      - "Validation report"
      - "Remaining risks"
```

# 12. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "API returns symbols/imports for TS, TSX, JS and JSX files."
    - "API finds definitions by symbol name."
    - "API finds bounded textual references by symbol name."
    - "API returns dependencies and dependents for a selected file."
    - "API returns impact analysis for changed files with affected files, related tests, risk and reasoning."
    - "Unsupported files return parserMode=unsupported or are skipped according to endpoint contract."
  integration:
    - "Root resolution matches file browser behavior for projectId/runId."
    - "Shared schemas build and are consumable by server."
    - "File and Postgres project construction repositories remain compatible."
  architectural:
    - "No AST parsing in route handlers."
    - "No duplicated root trust model."
    - "No file mutation or command execution."
    - "All public paths are relative."
  quality:
    - "Focused parser, graph, impact and route tests pass."
    - "Shared build passes."
    - "Server build passes."
    - "Full pnpm test passes or unrelated failures are documented with evidence."
  observability:
    - "Analysis requests log project id, run id, file count, partial flag, duration and parser error count without absolute paths."
```

# 13. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate shared Code Intelligence contracts."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate backend TypeScript."
      success_condition: "Exit code 0."
    - command: "node --test apps/server/test/projectAstParser.test.mjs apps/server/test/projectDependencyGraph.test.mjs apps/server/test/projectImpactAnalyzer.test.mjs apps/server/test/projectCodeIntelligenceRoutes.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate focused AST/Code Intelligence behavior."
      success_condition: "Exit code 0."
    - command: "pnpm test"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Run regression suite."
      success_condition: "Exit code 0 or documented unrelated failures."

  runtime_checks:
    - name: "Symbols endpoint"
      method: "curl or route test"
      expected: "200 JSON with files[].symbols for supported TS/JS project."
    - name: "Dependencies endpoint"
      method: "curl or route test"
      expected: "200 JSON with relative dependency/dependent paths."
    - name: "Impact endpoint"
      method: "curl or route test"
      expected: "200 JSON with affectedFiles and relatedTests for a fixture project."

  integration_checks:
    - name: "Path safety parity with file browser"
      surfaces:
        - "ProjectWorkspaceRootResolver"
        - "ProjectFileBrowserService"
        - "ProjectCodeIntelligenceService"
      method: "contract tests"
      expected: "Same project/run root; same rejection for invalid roots."
    - name: "Parser dependency packaging"
      surfaces:
        - "apps/server/package.json"
        - "pnpm-lock.yaml"
      method: "server build and runtime import test"
      expected: "Parser dependency is available at runtime."

  manual_checks:
    - "None required for backend-only completion."
```

# 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not claim zup behavior without inspecting the reference files."
    - "Do not invent parser support for languages not tested."
    - "Do not call regex extraction AST unless parserMode explicitly says fallback."
  read_before_write:
    - "Read spec 33 implementation before extracting root resolver."
    - "Read package.json before adding parser dependencies."
    - "Read tests and current route patterns before adding APIs."
  failure_handling:
    - "If parser dependency fails at runtime, fix packaging or mark parser unavailable explicitly."
    - "If path safety tests fail, stop and fix before continuing."
    - "If performance tests exceed bounds, add limits/cache before expanding scope."
  state_consistency:
    - "Update shared schemas, routes, services and tests together."
    - "Do not change file browser behavior without rerunning file browser tests."
  scope_control:
    - "Do not implement frontend UI in this spec."
    - "Do not integrate into agent planning until backend contracts are stable."
```

# 15. Recovery and Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "Parser cannot parse one file because of syntax error."
    - "Workspace changes while analysis runs."
    - "Cache miss or invalidation during active generation."
  non_retryable_failures:
    - "Requested path escapes project root."
    - "Requested project/run does not exist."
    - "Parser dependency is unavailable in production build."
    - "API contract mismatch."
  rollback_rules:
    - "Rollback only changes introduced by this spec."
    - "Do not revert user or other-agent changes."
    - "If root resolver extraction breaks file browser, stop and fix before continuing."
  escalation_rules:
    - "Escalate if parser dependency requires network install and approval is needed."
    - "Escalate if another agent is editing the same files."
```

# 16. Observability Requirements

```yaml
observability:
  logs:
    - event: "project_code_intelligence_symbols_requested"
      fields:
        - "project_id"
        - "run_id"
        - "file_count"
        - "partial"
        - "parser_error_count"
        - "duration_ms"
    - event: "project_code_intelligence_impact_completed"
      fields:
        - "project_id"
        - "run_id"
        - "changed_file_count"
        - "affected_file_count"
        - "related_test_count"
        - "breaking_change_risk"
        - "duration_ms"
    - event: "project_code_intelligence_denied"
      fields:
        - "project_id"
        - "run_id"
        - "normalized_path"
        - "reason"
  audit_trail:
    required: true
    must_capture:
      - "files read"
      - "files changed"
      - "commands executed"
      - "parser dependency decision"
      - "security tests"
  user_visible_failures:
    - "Project not found."
    - "Run not found."
    - "Path cannot be analyzed."
    - "Language unsupported."
    - "Analysis was partial because limits were reached."
```

# 17. Risks and Unknowns

```yaml
risks:
  - risk: "Parsing large projects blocks server event loop."
    severity: "high"
    mitigation: "Hard file/byte limits, cache, short analysis timeout, partial responses."
  - risk: "AST parser dependency is dev-only and unavailable in production."
    severity: "high"
    mitigation: "Inspect and classify dependency deliberately; add runtime import test."
  - risk: "Path safety diverges from file browser."
    severity: "critical"
    mitigation: "Extract and reuse root resolver; shared tests."
  - risk: "False confidence from fallback parser."
    severity: "medium"
    mitigation: "Expose parserMode and parseError; document fallback as best-effort."

unknowns:
  - question: "Should Horus support Python AST in the first version?"
    resolution_strategy: "Inspect current target project languages; default to TS/JS only unless Python projects are first-class in Horus."
  - question: "Which TypeScript AST dependency should be used?"
    resolution_strategy: "Inspect package.json and build/runtime constraints; prefer TypeScript compiler API if already present and reliable."
  - question: "Should import aliases beyond '@/...' be read from tsconfig paths?"
    resolution_strategy: "Inspect generated project contracts and tsconfig patterns; implement '@/...' first, then tsconfig paths if needed."
```

# 18. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Implement a TypeScript-native Code Intelligence layer. Start by extracting a reusable root resolver from the
    file browser service. Then add shared contracts and a server-side parser using the TypeScript compiler API
    when available. Build a dependency graph from AST import declarations, expose compact read-only APIs and
    keep all outputs root-relative.

  alternatives_considered:
    - option: "Put symbols directly in the file browser response."
      tradeoff: "Rejected because file tree/content and structural analysis have different cost, cache and failure modes."
    - option: "Use regex-only parser like zup fallback."
      tradeoff: "Rejected as primary path because the user asked specifically about AST and zup already treats regex as fallback."
    - option: "Persist AST index in database immediately."
      tradeoff: "Rejected for first version because cache invalidation and migrations add risk; in-memory cache is enough to validate the contract."

  migration_notes:
    - "No database migration in v1."
    - "If persistent indexing is added later, create a separate spec."

  backward_compatibility:
    required: true
    notes:
      - "File browser endpoints from spec 33 must keep working."
      - "Project construction repository methods remain additive."
      - "Code Intelligence failures must not break project execution or preview."
```

# 19. Deliverables

```yaml
deliverables:
  code:
    - "packages/shared/src/entities/ProjectCodeIntelligence.ts"
    - "apps/server/src/infrastructure/project/ProjectWorkspaceRootResolver.ts"
    - "apps/server/src/infrastructure/project/ProjectAstParserService.ts"
    - "apps/server/src/infrastructure/project/ProjectDependencyGraphService.ts"
    - "apps/server/src/infrastructure/project/ProjectImpactAnalyzer.ts"
    - "apps/server/src/infrastructure/project/ProjectCodeIntelligenceService.ts"
    - "apps/server/src/infrastructure/http/routes/projectCodeIntelligenceRoutes.ts"
  tests:
    - "apps/server/test/projectAstParser.test.mjs"
    - "apps/server/test/projectDependencyGraph.test.mjs"
    - "apps/server/test/projectImpactAnalyzer.test.mjs"
    - "apps/server/test/projectCodeIntelligenceRoutes.test.mjs"
    - "Existing project file browser tests"
  docs:
    - "spec/README.md"
    - "spec/CHANGELOG.md"
  validation_evidence:
    - "Shared build output"
    - "Server build output"
    - "Focused AST/Code Intelligence tests"
    - "Full regression test output"
```

# 20. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Spec 33 files were read."
    - "zup Code Intelligence reference files were read."
    - "Parser dependency and runtime packaging were verified."
    - "Root resolver extraction impact was mapped."
  implementation:
    - "Changes are scoped to backend Code Intelligence."
    - "File browser behavior remains compatible."
    - "No frontend UI was introduced."
    - "No file mutation or command execution exists in the new API."
    - "All public paths are relative."
  validation:
    - "Focused parser tests passed."
    - "Focused graph tests passed."
    - "Focused impact tests passed."
    - "Route/security tests passed."
    - "Shared and server builds passed."
    - "Full regression suite was run."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Parser support and fallback behavior are disclosed."
    - "Known remaining risks are disclosed."
```

# Minimal Output Contract for Executing Agents

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
  validation:
    passed:
      - "<check>"
    failed:
      - "<check>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```
