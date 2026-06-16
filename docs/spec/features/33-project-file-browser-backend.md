---
format_version: "agentic_sdd.v1"
task_id: "33-project-file-browser-backend"
title: "Project file browser backend"
created_at_utc: "2026-05-26T21:42:08Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "planned"
companion_frontend_spec: "spec/features/34-project-file-browser-frontend.md"
reference_repo: "/Users/wamat/Desktop/zup-sdd-agents"
---

# 1. Original User Request

```yaml
raw_user_request: |
  use a skill de spec e crie uma extremamente rigorosa para construir o bakcend e outra para construir o frontend. funcionando perfeitamente como no zup-sdd-agents. Ressalto, se você identificar boas práticas que não foi feito no projeto da zup, mas poderíamos encaixar no nosso então faça, e atenção para não copiar nada de ruim ou mal feito
```

# 2. System Interpretation

```yaml
system_translation: |
  Construir o backend seguro para uma tela de visualização de arquivos de projeto no Horus, equivalente em capacidade
  à tela de arquivos do zup-sdd-agents, mas adaptada à arquitetura TypeScript/Express/ProjectConstruction do Horus.
  O backend deve fornecer seleção de projetos, árvore de arquivos, leitura segura de conteúdo, metadados suficientes
  para UI de editor, e integração com specs/user stories/runs sem expor arquivos sensíveis nem permitir path traversal.

expected_user_visible_result: |
  O usuário consegue abrir a tela Arquivos, escolher um projeto real do Horus, ver a árvore de arquivos desse projeto,
  abrir arquivos com conteúdo correto e alternar para SPEC/User Stories sem erros de contrato.

expected_engineering_result: |
  O Horus passa a expor APIs typed e testadas para project file browsing, com segurança de path, ignore lists,
  truncamento, contratos compartilhados e integração explícita com ProjectWorkspace/ProjectConstructionRun.
```

# 3. Product and Technical Context

```yaml
business_context:
  user_problem: "O usuário precisa inspecionar os arquivos produzidos/manipulados pelos agentes sem sair do Horus."
  target_user: "Usuário operador do Horus acompanhando projeto, specs, user stories e código gerado."
  expected_outcome: "Experiência de inspeção de código parecida com IDE, confiável e segura."
  product_surface:
    - "Tela Arquivos"
    - "Project Construction workspaces"
    - "Preview/project execution workflow"
    - "SPEC/User Stories project context"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Node.js"
      - "Express"
      - "TypeScript"
      - "Zod shared schemas"
    frontend:
      - "React"
      - "Vite"
      - "@tanstack/react-query"
    database:
      - "Existing persistence driver: file or postgres"
      - "ProjectConstructionRepository"
    infrastructure:
      - "ProjectWorkspaceService"
      - "ProjectPathSafety"
      - "ProjectConstruction routes"
  known_entrypoints:
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/infrastructure/http/routes/projectConstructionRoutes.ts"
    - "apps/server/src/infrastructure/http/routes/workspaceRoutes.ts"
    - "apps/server/src/infrastructure/project/ProjectWorkspaceService.ts"
    - "apps/server/src/infrastructure/project/ProjectPathSafety.ts"
    - "packages/shared/src/entities/ProjectConstruction.ts"
  known_existing_patterns:
    - "Expose API contracts through packages/shared entities."
    - "Mount backend routes under /api/*."
    - "Keep project construction concerns inside infrastructure/project and projectConstruction routes."
    - "Use ProjectPathSafety for root boundary and .git safety."
```

# 4. Scope

```yaml
scope:
  in_scope:
    - "Define shared schemas/types for project file browsing."
    - "Expose project list/tree/file endpoints needed by the frontend."
    - "Resolve project roots from ProjectWorkspace and ProjectConstructionRun without guessing paths in the frontend."
    - "Apply strict path safety, hidden/sensitive filtering, generated/vendor ignores, byte limits, and binary detection."
    - "Return stable, UI-friendly errors for missing project, missing file, forbidden file, oversized/binary file, and invalid path."
    - "Add unit/integration tests for success, security boundaries, filtering, truncation, and project-root resolution."
  out_of_scope:
    - "Editing files from the UI."
    - "Running arbitrary shell commands from the file browser."
    - "Replacing existing User Stories or Preview APIs."
    - "Copying Python services from zup-sdd-agents."
    - "Reading files outside registered Horus project roots."
    - "Serving .env, secrets, .git internals, node_modules, dist, build output, or generated caches unless explicitly allowlisted later."
```

# 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/ProjectFiles.ts"
      - "packages/shared/src/index.ts"
      - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
      - "apps/server/src/infrastructure/project/ProjectFileTreeCollector.ts"
      - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/repositories/contracts.ts"
    services:
      - "ProjectWorkspaceService"
      - "ProjectConstructionRepository"
      - "ProjectPathSafety"
    database:
      migrations_required: false
      tables:
        - "project_workspaces if already persisted"
        - "project_construction_runs if already persisted"
  frontend:
    files:
      - "apps/web/src/api/projectFilesApi.ts"
    components:
      - "ProjectFilesPage consumes this backend contract."
    routes:
      - "/api/project-files/* or /api/project-construction/* extension"
  workflow:
    graph_nodes: []
    agents: []
  tests:
    unit:
      - "apps/server/test/projectFileTreeCollector.test.mjs"
      - "apps/server/test/projectFileBrowserSecurity.test.mjs"
    integration:
      - "apps/server/test/projectFileRoutes.test.mjs"
    e2e:
      - "Frontend runtime smoke against API once frontend spec is implemented."
```

# 6. Integration Context Map

```yaml
integration_context:
  summary: |
    Backend file browsing is a read-only projection over registered Horus project workspaces/runs. It must connect
    existing ProjectConstruction project identity to a safe file tree/content API consumed by the new frontend Files screen.

  depends_on:
    - name: "ProjectConstructionRepository"
      type: "backend_service"
      owner: "project construction bounded context"
      direction: "this_spec_consumes_dependency"
      contract_used: "listProjectWorkspaces(), getConstructionRun(runId)"
      required_for: "Resolve which projects/runs are available and determine safe project roots."
      assumptions:
        - "ProjectWorkspace and ProjectConstructionRun already expose rootPath/workspacePath or equivalent root fields."
      failure_modes:
        - "No projects appear; file browsing cannot resolve disk roots."
      fallback_or_recovery: "Return empty project list or 404 with actionable message."
      verification:
        - "Route test with repository stub returning no workspaces."
        - "Route test with repository stub returning one workspace."

    - name: "ProjectPathSafety"
      type: "internal_module"
      owner: "project infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "resolveInsideRoot(), isInsideRoot(), isGitMetadataPath()"
      required_for: "Reject traversal and repository metadata access."
      assumptions: []
      failure_modes:
        - "Path traversal or secret leakage if bypassed."
      fallback_or_recovery: "Reject with 404/403 style safe error; never return raw absolute path in public error."
      verification:
        - "Security tests for ../, absolute paths, encoded traversal, .git, and symlink escape."

    - name: "packages/shared"
      type: "internal_module"
      owner: "shared contracts"
      direction: "this_spec_consumes_dependency"
      contract_used: "Zod schemas exported for frontend/backend parity."
      required_for: "Keep API request/response types consistent."
      assumptions: []
      failure_modes:
        - "Frontend/backend drift."
      fallback_or_recovery: "Typecheck and schema tests."
      verification:
        - "pnpm --filter @u-build/shared build"
        - "pnpm --filter @u-build/server build"

  depended_on_by:
    - name: "ProjectFilesPage frontend"
      type: "frontend_component"
      owner: "web app"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "GET project list/tree/file responses"
      compatibility_obligation: "Must preserve once implemented; can extend by adding optional fields."
      expected_consumer_behavior: "Render project selector, tree, file tabs, read-only editor, and error states."
      migration_or_notification_required: false
      verification:
        - "Frontend typecheck consumes shared types."
        - "Browser smoke loads tree and file content."

    - name: "Preview and project execution workflows"
      type: "workflow"
      owner: "preview/project construction"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Project root identity and run workspace resolution."
      compatibility_obligation: "Must not mutate project state; read-only only."
      expected_consumer_behavior: "Can link from project/run into files view with projectId/runId/file query params."
      migration_or_notification_required: false
      verification:
        - "Existing preview tests still pass."

  bidirectional_integrations:
    - name: "Backend file API <-> frontend file browser"
      participants:
        - "ProjectFileBrowserService"
        - "ProjectFilesPage"
      shared_contract: "ProjectFiles shared Zod schemas"
      consistency_rule: "Every frontend state must correspond to a backend status: loading, empty, forbidden, not_found, truncated, binary, success."
      verification:
        - "Contract test and browser smoke."

  data_flow:
    inbound:
      - source: "Frontend"
        payload_or_state: "projectId/runId/path query params"
        validation: "Zod schemas plus path normalization and root containment"
    outbound:
      - target: "Frontend"
        payload_or_state: "tree entries and file content metadata"
        compatibility: "Fields may be extended, existing fields must remain stable"

  sequencing_dependencies:
    - dependency: "Backend shared contracts before frontend implementation"
      reason: "Frontend must not invent API shapes."
      validation: "Shared package builds and frontend imports generated/declared types."

  integration_risks:
    - risk: "Leaking secrets through file viewer."
      severity: "critical"
      mitigation: "Denylist sensitive paths, block hidden files by default, block binary/large files, test traversal."
    - risk: "Frontend loads enormous trees causing UI freeze."
      severity: "high"
      mitigation: "Limit tree entries, add pagination/partial flag, ignore vendor/generated dirs."
```

# 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Separate shared schemas, route handlers, service logic, and filesystem utilities."
    - "Do not introduce circular dependencies."
    - "Do not duplicate path safety rules across layers."
  project_specific:
    - "Do not place filesystem traversal logic in route handlers."
    - "Do not let the frontend send absolute paths as authority; absolute roots must be resolved server-side from project/run identity."
    - "Use packages/shared for contracts consumed by frontend."
    - "Keep APIs read-only until an edit flow has its own SPEC."
    - "Use existing ProjectPathSafety and extend it only when necessary."
    - "Do not expose raw secret filenames or absolute system paths in user-facing errors."
```

# 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Prefer small cohesive modules: route, service, tree collector, shared schema."
    - "Keep public API compatibility by adding new endpoints instead of changing existing ones."
    - "Handle errors explicitly with stable error codes."
  backend:
    - "Validate all route params/query params with Zod."
    - "Normalize path separators to POSIX-style relative paths in API responses."
    - "Resolve requested files with root containment after decoding."
    - "Reject symlink escapes by resolving real paths before read."
    - "Use async fs APIs."
    - "Limit tree collection by entry count and depth."
    - "Limit file content bytes and return truncated metadata."
    - "Detect binary files and return metadata without content unless later explicitly supported."
  frontend:
    - "Frontend must not reconstruct absolute paths."
  tests:
    - "Cover success and every security failure mode."
```

# 9. Contracts and Invariants

```yaml
contracts:
  api_contracts:
    - name: "List file browser projects"
      producer: "Project file backend"
      consumers:
        - "ProjectFilesPage"
      request_shape: "GET /api/project-files/projects"
      response_shape: |
        { projects: Array<{ id, name, rootLabel, projectRootPath?, latestRunId?, status?, updatedAt? }> }
      compatibility: "can extend with optional fields; must preserve id/name/rootLabel"

    - name: "Project tree"
      producer: "ProjectFileBrowserService"
      consumers:
        - "ProjectFilesPage FileTree"
      request_shape: "GET /api/project-files/projects/:projectId/tree?runId=&limit=&depth="
      response_shape: |
        {
          projectId: string;
          runId?: string | null;
          rootLabel: string;
          entries: Array<{ path: string; kind: 'dir' | 'file'; sizeBytes?: number; modifiedAt?: string; language?: string }>;
          partial: boolean;
          ignoredCount: number;
          generatedAt: string;
        }
      compatibility: "must preserve entries path/kind"

    - name: "Project file content"
      producer: "ProjectFileBrowserService"
      consumers:
        - "ProjectFilesPage CodeViewer"
      request_shape: "GET /api/project-files/projects/:projectId/file?path=&runId=&maxBytes="
      response_shape: |
        {
          projectId: string;
          runId?: string | null;
          path: string;
          content: string | null;
          encoding: 'utf-8';
          language: string;
          sizeBytes: number;
          truncated: boolean;
          binary: boolean;
          generatedAt: string;
        }
      compatibility: "must preserve success fields; binary content must remain null"

  domain_contracts:
    - name: "Read-only file browser"
      producer: "ProjectFileBrowserService"
      consumers:
        - "User"
        - "ProjectFilesPage"
      invariant: "No endpoint in this spec may write, delete, execute, or mutate project files."

    - name: "Root containment"
      producer: "ProjectPathSafety"
      consumers:
        - "ProjectFileBrowserService"
      invariant: "Every listed or read path must resolve inside the selected project/run root."

  data_contracts:
    - name: "Project file tree entries"
      producer: "Filesystem collector"
      consumers:
        - "Frontend tree builder"
      migration_required: false
      compatibility_notes: "Flat entries are acceptable; frontend builds hierarchy."
```

# 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current Horus project construction persistence"
    agent: "repo_explorer"
    action: "Read ProjectConstructionRepository contracts, entity schemas, route mounting, and tests."
    expected_output: "Exact source of project ids, root paths, run ids, and available persistence fields."

  - step: 2
    name: "Create shared ProjectFiles schemas"
    agent: "backend_specialist"
    action: "Add ProjectFiles entity schemas/types and export them from packages/shared."
    expected_output: "Typed request/response contracts consumed by server and web."

  - step: 3
    name: "Implement safe tree collector"
    agent: "backend_specialist"
    action: "Create collector with ignore rules, limits, symlink handling, metadata, and sorted stable output."
    expected_output: "Pure utility with unit tests."

  - step: 4
    name: "Implement ProjectFileBrowserService"
    agent: "backend_specialist"
    action: "Resolve selected project/run root and expose listProjects, getTree, getFileContent use-case methods."
    expected_output: "Service with explicit domain errors."

  - step: 5
    name: "Expose HTTP routes"
    agent: "backend_specialist"
    action: "Mount new read-only routes under /api/project-files or clearly documented project-construction namespace."
    expected_output: "Express router with Zod validation and stable status codes."

  - step: 6
    name: "Validate backend"
    agent: "qa_specialist"
    action: "Run shared/server builds, route tests, and security tests."
    expected_output: "Validation evidence with exit codes."
```

# 11. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm route namespace, contract shape, and root-resolution policy."
    inputs:
      - "This SPEC"
      - "ProjectConstruction existing code"
    outputs:
      - "Final integration map"

  - agent_name: "backend_specialist"
    responsibility: "Implement schemas, service, routes, filesystem collector, and tests."
    inputs:
      - "Affected backend files"
      - "Zup reference behavior"
    outputs:
      - "Backend diff"
      - "Backend tests"

  - agent_name: "qa_specialist"
    responsibility: "Attack path safety and contract drift."
    inputs:
      - "Backend diff"
      - "Security acceptance criteria"
    outputs:
      - "Test report"
      - "Remaining risks"
```

# 12. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "API lists selectable Horus projects with stable ids and labels."
    - "API returns a sorted tree of visible project files and directories."
    - "API returns UTF-8 text content for a selected file."
    - "API returns truncated=true when file exceeds maxBytes."
    - "API returns binary=true and content=null for binary files."
  integration:
    - "Frontend can consume all responses through shared types without local shape duplication."
    - "Existing project construction and preview tests still pass."
  architectural:
    - "Route handlers do not contain filesystem traversal logic."
    - "Filesystem service is read-only."
    - "Path safety is centralized."
  quality:
    - "Shared build passes."
    - "Server build passes."
    - "Security tests pass."
  observability:
    - "Forbidden reads log project id, normalized path, reason, and request id if available, without secret contents."
```

# 13. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate shared API contracts."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate backend TypeScript."
      success_condition: "Exit code 0."
    - command: "pnpm test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Run regression suite."
      success_condition: "Exit code 0 or documented unrelated failures with evidence."

  runtime_checks:
    - name: "List projects"
      method: "curl"
      expected: "200 JSON with projects array."
    - name: "Read tree"
      method: "curl"
      expected: "200 JSON with entries and no ignored directories."
    - name: "Read file"
      method: "curl"
      expected: "200 JSON with content for safe text file."

  integration_checks:
    - name: "Path traversal rejection"
      surfaces:
        - "HTTP route"
        - "ProjectPathSafety"
      method: "automated test and curl"
      expected: "No file content returned for ../, encoded traversal, absolute paths, .git, .env."
    - name: "Frontend contract compile"
      surfaces:
        - "packages/shared"
        - "apps/web"
      method: "typecheck after frontend implementation"
      expected: "No TS errors."

  manual_checks:
    - "None required for backend-only completion, but frontend smoke must follow in companion spec."
```

# 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent project root fields. Inspect ProjectWorkspace and ProjectConstructionRun first."
    - "Do not claim zup behavior unless verified in /Users/wamat/Desktop/zup-sdd-agents."
  read_before_write:
    - "Read server route mounting and repository contracts before adding routes."
    - "Search for all ProjectPathSafety consumers before extending it."
  failure_handling:
    - "If path security tests fail, stop feature work and fix security first."
    - "If root resolution is ambiguous, implement explicit error rather than guessing."
  state_consistency:
    - "Update shared schemas, server route output, and frontend client together."
  scope_control:
    - "Do not add file editing, command execution, or project mutation."
```

# 15. Recovery and Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "Temporary dev server conflict"
    - "Transient file read during active generation"
  non_retryable_failures:
    - "Path escapes project root"
    - "Missing registered project"
    - "Sensitive file request"
    - "Unknown run/project ownership"
  rollback_rules:
    - "Rollback only changes introduced by this feature."
    - "Do not revert unrelated dirty files."
  escalation_rules:
    - "Escalate if frontend requires file editing."
    - "Escalate if project roots are not persisted anywhere."
```

# 16. Observability Requirements

```yaml
observability:
  logs:
    - event: "project_file_tree_requested"
      fields:
        - "project_id"
        - "run_id"
        - "entry_count"
        - "partial"
        - "duration_ms"
    - event: "project_file_read_denied"
      fields:
        - "project_id"
        - "run_id"
        - "normalized_path"
        - "reason"
    - event: "project_file_read_completed"
      fields:
        - "project_id"
        - "path"
        - "size_bytes"
        - "truncated"
        - "binary"
        - "duration_ms"
  audit_trail:
    required: true
    must_capture:
      - "files read by implementation agent"
      - "files changed"
      - "commands executed"
      - "security tests"
  user_visible_failures:
    - "Project not found."
    - "File not found."
    - "File cannot be displayed because it is binary."
    - "File content was truncated."
```

# 17. Risks and Unknowns

```yaml
risks:
  - risk: "Sensitive file disclosure."
    severity: "critical"
    mitigation: "Default-deny sensitive/hidden paths and add tests."
  - risk: "Reading active worktree while agents mutate it."
    severity: "medium"
    mitigation: "Read-only best effort, return generatedAt, tolerate not found."
  - risk: "Duplicating Zup limitations."
    severity: "medium"
    mitigation: "Improve by adding binary detection, symlink escape tests, explicit error codes, and optional metadata."

unknowns:
  - question: "What is the canonical project id for new and existing Horus projects?"
    resolution_strategy: "inspect ProjectWorkspace schema and repository implementations before implementation"
  - question: "Should the API namespace be /api/project-files or an extension of /api/project-construction?"
    resolution_strategy: "architect decides before frontend starts; prefer /api/project-files for clear read-only boundary"
```

# 18. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Implement a dedicated read-only ProjectFileBrowserService and route namespace. Reuse ProjectConstructionRepository
    for project/run identity but do not merge file browsing into construction mutation routes. Use flat tree entries
    like zup because this is simple and lets the frontend build hierarchy, but improve the contract with optional
    metadata, partial flag, binary detection, and explicit error codes.

  alternatives_considered:
    - option: "Expose direct filesystem path query API."
      tradeoff: "Rejected because it gives the frontend too much authority and increases path traversal risk."
    - option: "Copy zup endpoint names exactly."
      tradeoff: "Rejected because Horus already uses /api/project-construction and shared TS contracts."
    - option: "Generate nested tree server-side."
      tradeoff: "Not necessary; flat tree is easier to diff/cache and matches zup's working pattern."

  migration_notes:
    - "No database migration should be required unless project roots are not currently persisted."
  backward_compatibility:
    required: true
    notes:
      - "Do not change existing workspace folder APIs."
      - "Do not change preview APIs."
```

# 19. Deliverables

```yaml
deliverables:
  code:
    - "packages/shared/src/entities/ProjectFiles.ts"
    - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
    - "apps/server/src/infrastructure/project/ProjectFileTreeCollector.ts"
    - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
  tests:
    - "apps/server/test/projectFileTreeCollector.test.mjs"
    - "apps/server/test/projectFileBrowserSecurity.test.mjs"
    - "apps/server/test/projectFileRoutes.test.mjs"
  docs:
    - "This SPEC"
  validation_evidence:
    - "Shared build output"
    - "Server build output"
    - "Test output"
    - "Curl smoke output"
```

# 20. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "ProjectWorkspace schema and repository were read."
    - "Route mounting was read."
    - "ProjectPathSafety was read."
    - "Zup CodePage and project file backend were used only as reference."
  implementation:
    - "Backend contracts are shared and typed."
    - "Filesystem access is read-only."
    - "Sensitive paths are blocked."
    - "Binary/large files are handled."
    - "No unrelated refactor was introduced."
  validation:
    - "Relevant tests were run."
    - "Security checks passed."
    - "Build/typecheck passed."
    - "Runtime smoke passed."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

# 21. Minimal Output Contract For Executing Agents

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
