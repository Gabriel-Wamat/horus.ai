---
format_version: "agentic_sdd.v1"
task_id: "feature-55-project-download-zip"
title: "Project Files Download ZIP"
created_at_utc: "2026-05-27T04:49:05Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
depends_on:
  - "spec/features/33-project-file-browser-backend.md"
  - "spec/features/34-project-file-browser-frontend.md"
  - "spec/features/37-project-file-editing-persistence.md"
  - "spec/features/49-project-files-ide-experience.md"
---

# 55 - Project Files Download ZIP

## 1. Original User Request

```yaml
raw_user_request: |
  em seguida, planeje um botão de download para o usuário caso queira, baixe a pasta com todos os arquivos e diretórios organizados direitinho do determinado projeto que ele criou. use a skill de criar spec pra planejar essa tarefa, versione essa implementação na pasta de specs
```

## 2. System Interpretation

```yaml
system_translation: |
  Planejar uma feature para a tela Files que permita ao usuário baixar um arquivo ZIP contendo a pasta
  completa do projeto criado/selecionado no Horus, preservando a estrutura de diretórios e arquivos
  úteis do projeto. O ZIP deve ser produzido pelo backend com a mesma política de segurança do navegador
  de arquivos: raiz resolvida com segurança, bloqueio de path traversal, bloqueio de symlink escape,
  exclusão de arquivos sensíveis e exclusão de diretórios pesados/gerados.

expected_user_visible_result: |
  Na tela Files, o usuário deve ver um botão discreto de download associado ao projeto selecionado.
  Ao clicar, o navegador baixa um ZIP nomeado de forma clara, como horus-project-<project-slug>-<date>.zip.
  Ao abrir o ZIP, ele deve encontrar a pasta do projeto com arquivos e diretórios organizados exatamente
  como no workspace gerado, sem lixo operacional, secrets, .git, node_modules, dist, build ou caches.

expected_engineering_result: |
  O backend deve expor um endpoint seguro para stream de ZIP por projectId e runId opcional.
  A feature Project Files deve consumir esse endpoint por uma função dedicada no api client e exibir
  um botão de download no toolbar. Testes devem cobrir segurança de caminho, exclusão de arquivos,
  content disposition, estrutura do ZIP e integração frontend mínima.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "O usuário consegue visualizar e editar arquivos, mas ainda não consegue exportar o projeto gerado como uma pasta completa para uso fora do Horus."
  target_user: "Usuário do Horus que gerou um projeto e quer baixar o código final localmente."
  expected_outcome: "Exportar o projeto criado com confiança, sem baixar artefatos internos ou arquivos sensíveis."
  product_surface:
    - "Project Files screen"
    - "Generated project workspace"
    - "Project file backend"
    - "Project export/download action"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "Express"
      - "ProjectFileBrowserService"
      - "ProjectFileTreeCollector"
      - "ProjectConstructionRepository"
      - "archiver already available and used by workflow artifact download"
    frontend:
      - "React"
      - "Vite"
      - "@tanstack/react-query"
      - "Project Files feature under apps/web/src/features/project-files"
    database:
      - "No migration required"
      - "Project metadata already comes from ProjectConstructionRepository"
    infrastructure:
      - "Generated project roots live on local filesystem"
      - "Existing-repo runs may resolve to a registered git worktree"
  known_entrypoints:
    - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
    - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
    - "apps/server/src/infrastructure/project/ProjectFileTreeCollector.ts"
    - "packages/shared/src/entities/ProjectFiles.ts"
    - "apps/web/src/api/projectFilesApi.ts"
    - "apps/web/src/features/project-files/ProjectFilesPage.tsx"
    - "apps/web/src/features/project-files/components/ProjectFilesToolbar.tsx"
  known_existing_patterns:
    - "Project Files routes live under /api/project-files."
    - "ProjectFileBrowserService is the backend boundary for safe project-root reads and writes."
    - "The file tree collector already defines ignored directories, sensitive paths and symlink escape rules."
    - "The older workflow artifact ZIP route downloads synthesized artifacts by threadId, not the real project folder."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add a backend endpoint to stream a ZIP of the selected project root."
    - "Support optional runId so the download can target the latest run worktree when applicable."
    - "Reuse the same safe root resolution rules used by ProjectFileBrowserService."
    - "Reuse or extract shared project export ignore rules from ProjectFileTreeCollector."
    - "Exclude sensitive files and generated/heavy directories from the ZIP."
    - "Preserve project directory structure inside the ZIP under one top-level folder."
    - "Add frontend API client method for the download URL or blob download action."
    - "Add a button in ProjectFilesToolbar with a clear icon and accessible label."
    - "Show loading/disabled/error feedback for download start failures."
    - "Add tests for backend ZIP safety and frontend integration guard."
  out_of_scope:
    - "Cloud upload or sharing links."
    - "Partial file/folder selection in this phase."
    - "Password-protected ZIPs."
    - "Downloading secrets, .env files, .git metadata, node_modules, dist, build, coverage or caches."
    - "Changing ProjectWorkspace storage schema."
    - "Changing how agents generate files."
    - "Replacing the existing workflow artifact download by threadId."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
      - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
      - "apps/server/src/infrastructure/project/ProjectFileTreeCollector.ts"
      - "packages/shared/src/entities/ProjectFiles.ts"
    new_files:
      - "apps/server/src/infrastructure/project/ProjectArchiveService.ts"
    services:
      - "ProjectFileBrowserService"
      - "ProjectArchiveService"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "apps/web/src/api/projectFilesApi.ts"
      - "apps/web/src/features/project-files/ProjectFilesPage.tsx"
      - "apps/web/src/features/project-files/components/ProjectFilesToolbar.tsx"
      - "apps/web/src/features/project-files/styles/project-files.css"
    components:
      - "ProjectFilesToolbar"
      - "ProjectFilesPage"
    routes:
      - "/?mode=files&projectId=..."
  workflow:
    graph_nodes: []
    agents: []
  tests:
    unit:
      - "apps/server/test/projectArchiveService.test.mjs"
      - "apps/server/test/projectFileBrowser.test.mjs"
      - "apps/web/test/frontendRegressionGuards.test.mjs"
    integration:
      - "apps/server/test/projectFileRoutes.test.mjs or equivalent route-level test"
    e2e:
      - "Browser smoke: open Files screen, click download button, confirm ZIP request starts"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    The download feature sits on top of the same project-files backend boundary used by Files.
    It must consume project/run root resolution from ProjectFileBrowserService or a shared resolver,
    then stream a ZIP through Express. The frontend must expose a user action without bypassing
    backend security or duplicating root/path logic in the browser.

  depends_on:
    - name: "ProjectConstructionRepository"
      type: "backend_service"
      owner: "project construction persistence"
      direction: "this_spec_consumes_dependency"
      contract_used: "getProjectWorkspace(projectId), getConstructionRun(runId)"
      required_for: "Resolve the project root or run workspace being downloaded."
      assumptions: []
      failure_modes:
        - "project_not_found"
        - "run_not_found"
        - "run does not belong to selected project"
      fallback_or_recovery: "Return JSON error before ZIP headers are sent."
      verification:
        - "Backend route tests for 404 project and run mismatch."

    - name: "ProjectFileBrowserService root resolution"
      type: "backend_service"
      owner: "project-files backend"
      direction: "this_spec_consumes_dependency"
      contract_used: "resolve readable root semantics for projectId and optional runId"
      required_for: "Avoid downloading an unregistered path or unrelated worktree."
      assumptions:
        - "The existing private resolveReadableRoot may need extraction to a public method or a dedicated ProjectRootResolver."
      failure_modes:
        - "Path outside selected project."
        - "Run worktree not registered under project git metadata."
      fallback_or_recovery: "Return 403 with project file error code."
      verification:
        - "Unit test that existing-repo run worktree must belong to selected project."

    - name: "ProjectFileTreeCollector ignore policy"
      type: "internal_module"
      owner: "project-files backend"
      direction: "this_spec_consumes_dependency"
      contract_used: "isSensitiveProjectPath and ignored/generated path rules"
      required_for: "Prevent sensitive or heavy files from entering ZIP."
      assumptions:
        - "Ignored directory constants may need to be exported through a safe function instead of duplicated."
      failure_modes:
        - "Secrets leak in ZIP."
        - "ZIP becomes huge due to node_modules/dist/build."
      fallback_or_recovery: "Skip ignored entries and include ignoredCount in logs."
      verification:
        - "ZIP test proving .env, .git, node_modules and dist are absent."

    - name: "archiver"
      type: "external_dependency"
      owner: "server infrastructure"
      direction: "this_spec_consumes_dependency"
      contract_used: "stream ZIP archive to Express response"
      required_for: "Produce ZIP without buffering entire project into memory."
      assumptions:
        - "archiver is already installed because workflowRoutes uses it."
      failure_modes:
        - "Stream error after headers are sent."
        - "Archive finalization failure."
      fallback_or_recovery: "Abort response if possible, log error, do not claim success."
      verification:
        - "Route integration test downloads and inspects ZIP entries."

    - name: "ProjectFilesToolbar"
      type: "frontend_component"
      owner: "project-files frontend"
      direction: "this_spec_consumes_dependency"
      contract_used: "props for selectedProject, tree, refresh/search actions"
      required_for: "Place download action near project selector and refresh/search controls."
      assumptions: []
      failure_modes:
        - "Button appears without selected project."
        - "Button is ambiguous or visually noisy."
      fallback_or_recovery: "Disable button until selectedProjectId exists."
      verification:
        - "Frontend guard test checks accessible download action and API URL."

  depended_on_by:
    - name: "Files screen user workflow"
      type: "workflow"
      owner: "frontend UX"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Download selected project as ZIP"
      compatibility_obligation: "must preserve existing file browsing/editing behavior"
      expected_consumer_behavior: "User clicks the download button and receives a ZIP of the selected project."
      migration_or_notification_required: false
      verification:
        - "Browser smoke confirms the button is visible, labelled and does not break Files layout."

    - name: "External user filesystem"
      type: "external_consumer"
      owner: "user"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "ZIP file with top-level project folder and relative paths preserved"
      compatibility_obligation: "must not include secrets or generated dependency folders"
      expected_consumer_behavior: "User extracts the ZIP and sees a coherent project directory."
      migration_or_notification_required: false
      verification:
        - "Automated ZIP entry inspection."

  bidirectional_integrations:
    - name: "Files frontend to Project Files backend"
      participants:
        - "projectFilesApi"
        - "ProjectFileRouter"
      shared_contract: "GET /api/project-files/projects/:projectId/download?runId=..."
      consistency_rule: "Frontend projectId/runId must map to the same root that tree/file views use."
      verification:
        - "Open tree for project, download ZIP for same project, compare selected expected files exist in ZIP."

  data_flow:
    inbound:
      - source: "ProjectFilesToolbar download button"
        payload_or_state: "projectId and optional latestRunId"
        validation: "Frontend disables without selected project; backend validates UUID params."
      - source: "ProjectConstructionRepository"
        payload_or_state: "ProjectWorkspace and optional ProjectConstructionRun"
        validation: "Shared schemas and root resolver checks."
    outbound:
      - target: "Browser download manager"
        payload_or_state: "application/zip stream"
        compatibility: "Content-Disposition attachment with sanitized filename."
      - target: "Server logs"
        payload_or_state: "project_export_zip_started/completed/failed"
        compatibility: "No secrets or absolute paths in user-visible response; logs may include safe project_id/run_id/counts."

  sequencing_dependencies:
    - dependency: "Root resolver extraction or public method"
      reason: "Archive service must not duplicate project/run path trust logic."
      validation: "Tests for project root and run worktree resolution still pass."
    - dependency: "Ignore policy reuse"
      reason: "The ZIP must match Files security posture."
      validation: "ZIP excludes the same sensitive/generated paths as tree browsing."

  integration_risks:
    - risk: "Secrets leak through archive traversal."
      severity: "critical"
      mitigation: "Use shared ignore/sensitive rules, skip symlinks, assert every realpath is inside root."
    - risk: "Large archives exhaust memory."
      severity: "high"
      mitigation: "Stream via archiver; enforce file count and total uncompressed byte limits."
    - risk: "Headers already sent before an archive error."
      severity: "medium"
      mitigation: "Pre-walk and validate entries before setting ZIP headers, or use cautious stream error handling."
    - risk: "User downloads stale project while Files has unsaved local edits."
      severity: "medium"
      mitigation: "Frontend warns or disables download when dirtyPaths.size > 0, with copy: Save pending edits before downloading."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Separate application, domain, infrastructure, and presentation concerns."
    - "Do not duplicate security-sensitive path logic."
    - "Do not introduce circular dependencies."
    - "Do not refactor unrelated project-files behavior."
  project_specific:
    - "All project file access must remain behind backend services."
    - "The frontend must never receive or construct absolute project root paths."
    - "The download route must live under /api/project-files to match the Files surface."
    - "The archive service must stream ZIP data; do not buffer the full archive in memory."
    - "The ZIP must use one top-level folder named from a sanitized project name/root label."
    - "Sensitive/generated path rules must be shared with or extracted from ProjectFileTreeCollector."
```

## 8. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Prefer small, cohesive services."
    - "Keep public API compatibility unless explicitly extending a contract."
    - "Use typed schemas for request/query validation."
    - "Handle errors explicitly with actionable messages."
  backend:
    - "Validate projectId and runId with shared Zod schemas."
    - "Resolve and realpath the archive root before traversal."
    - "Skip symlinks and any realpath outside the selected root."
    - "Skip sensitive paths, dotfiles except .gitignore, git metadata, dependency folders, build outputs and caches."
    - "Add total file count and total uncompressed bytes limits."
    - "Use Content-Type application/zip and Content-Disposition attachment."
    - "Sanitize filenames to prevent header injection and unsafe archive names."
  frontend:
    - "Use an icon + short label button consistent with Project Files toolbar."
    - "Disable or warn when there are unsaved local edits."
    - "Use an accessible label such as Baixar projeto (.zip)."
    - "Do not add modal complexity unless needed for dirty-file confirmation."
    - "Do not make the toolbar taller or visually noisy."
  tests:
    - "Cover success and denied paths."
    - "Inspect actual ZIP entries, not just HTTP status."
    - "Do not mark work complete without typecheck, tests and browser smoke."
```

## 9. Contracts and Invariants

```yaml
contracts:
  api_contracts:
    - name: "Download Project ZIP"
      producer: "ProjectFileRouter"
      consumers:
        - "projectFilesApi"
        - "ProjectFilesToolbar"
        - "Browser download manager"
      request_shape: |
        GET /api/project-files/projects/:projectId/download?runId=<optional uuid>
      response_shape: |
        200 application/zip
        Content-Disposition: attachment; filename="horus-project-<safe-name>-<YYYYMMDD-HHmmss>.zip"
        Body: zip stream with one top-level project folder.
      compatibility: "can extend Project Files API; must not break existing routes"

    - name: "Project file error response"
      producer: "ProjectFileRouter"
      consumers:
        - "projectFilesApi"
      request_shape: "Invalid projectId/runId or unavailable root"
      response_shape: |
        JSON { error: ProjectFileBrowserErrorCode, message: string }
      compatibility: "must preserve existing ProjectFileBrowserErrorResponse shape"

  domain_contracts:
    - name: "Archive root safety"
      producer: "ProjectArchiveService"
      consumers:
        - "ProjectFileRouter"
      invariant: "Every archived file realpath must be inside the resolved project/run root."

    - name: "Archive exclusion policy"
      producer: "ProjectArchiveService"
      consumers:
        - "Downloaded ZIP"
      invariant: "Sensitive/generated paths are never included."

    - name: "Archive size limits"
      producer: "ProjectArchiveService"
      consumers:
        - "Express response"
      invariant: "Archive must refuse export before streaming if file count or total bytes exceeds configured limits."

  ui_contracts:
    - name: "Files download action"
      producer: "ProjectFilesToolbar"
      consumers:
        - "Project Files user"
      requirement: "A clear download button is visible when a project is selected and starts a ZIP download."

    - name: "Dirty file guard"
      producer: "ProjectFilesPage"
      consumers:
        - "Project Files user"
      requirement: "If any open file has unsaved changes, downloading must require confirmation or show a disabled state with explanation."

  data_contracts:
    - name: "ZIP structure"
      producer: "ProjectArchiveService"
      consumers:
        - "User filesystem"
      migration_required: false
      compatibility_notes: "Archive paths must be relative and nested under a single safe top-level folder."
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current download and project-files patterns"
    agent: "repo_explorer"
    action: "Read workflowRoutes download, projectFileRoutes, ProjectFileBrowserService, ProjectFileTreeCollector, ProjectFilesToolbar, ProjectFilesPage and projectFilesApi."
    expected_output: "Confirmed implementation map and route/service/frontend boundaries."

  - step: 2
    name: "Extract archive-safe traversal policy"
    agent: "backend_specialist"
    action: "Create or extend reusable helpers so archive traversal reuses sensitive/generated path exclusion and inside-root checks."
    expected_output: "Shared ignore/safety helpers with no duplicated secret/path logic."

  - step: 3
    name: "Implement ProjectArchiveService"
    agent: "backend_specialist"
    action: "Create a service that resolves project/run root, pre-walks allowed files, enforces limits, and streams ZIP entries with normalized relative paths."
    expected_output: "ProjectArchiveService with typed input/output, logs and testable file list planning."

  - step: 4
    name: "Add backend route"
    agent: "backend_specialist"
    action: "Add GET /api/project-files/projects/:projectId/download with optional runId, sanitized filename and ProjectFileBrowserError handling."
    expected_output: "Express route wired through createProjectFileRouter dependencies."

  - step: 5
    name: "Add shared/API client contract"
    agent: "frontend_specialist"
    action: "Extend shared schemas only if necessary and add projectFilesApi.getDownloadUrl or downloadProjectZip."
    expected_output: "Frontend has one typed place to build the download URL/action."

  - step: 6
    name: "Add Files toolbar button"
    agent: "frontend_specialist"
    action: "Add a compact accessible download button to ProjectFilesToolbar and wire it from ProjectFilesPage using selectedProjectId/runId/dirtyPaths."
    expected_output: "User can start ZIP download from Files without disturbing layout."

  - step: 7
    name: "Add tests"
    agent: "qa_specialist"
    action: "Add backend ZIP tests, route tests and frontend guard tests."
    expected_output: "Regression coverage for ZIP structure, exclusions, route headers and toolbar integration."

  - step: 8
    name: "Validate runtime"
    agent: "qa_specialist"
    action: "Run typecheck/build/tests and a browser smoke against localhost Files screen."
    expected_output: "Validation evidence with commands, exit codes and observed behavior."
```

## 11. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm backend/frontend contract, service boundary and safety invariants."
    inputs:
      - "This SDD"
      - "Project Files backend implementation"
      - "Project Files frontend implementation"
    outputs:
      - "Implementation boundary notes"

  - agent_name: "backend_specialist"
    responsibility: "Implement secure ZIP export route and archive service."
    inputs:
      - "ProjectFileBrowserService"
      - "ProjectFileTreeCollector"
      - "ProjectPathSafety"
      - "ProjectConstructionRepository"
    outputs:
      - "Backend diff"
      - "Backend tests"

  - agent_name: "frontend_specialist"
    responsibility: "Expose download button in Files UI with clear UX and no layout regression."
    inputs:
      - "ProjectFilesPage"
      - "ProjectFilesToolbar"
      - "projectFilesApi"
    outputs:
      - "Frontend diff"
      - "Guard tests"

  - agent_name: "qa_specialist"
    responsibility: "Validate export correctness, security exclusions and browser behavior."
    inputs:
      - "Diff"
      - "Acceptance criteria"
    outputs:
      - "Test report"
      - "Remaining risks"
```

## 12. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Files toolbar shows a clear download action when a project is selected."
    - "Clicking the action downloads a ZIP for the selected project."
    - "ZIP contains one top-level folder with the project files organized by their original relative directories."
    - "ZIP includes ordinary source files such as package.json, README.md, src files and docs when present."
    - "ZIP excludes .git, node_modules, dist, build, coverage, caches, .env files and known sensitive key/cert files."
    - "ZIP does not include symlinks or files whose realpath escapes the project root."
    - "If dirty files exist in the editor, user must be warned before downloading or download must be disabled with explanation."
  integration:
    - "Download target matches the same projectId and optional runId currently used by Files tree/file queries."
    - "Backend validates project/run ownership before streaming."
    - "Existing project-files list/tree/file/save routes keep working."
  architectural:
    - "No absolute filesystem path is exposed to the frontend."
    - "Path safety and ignore logic is reused or centralized, not copied ad hoc."
    - "Archive generation streams data and enforces limits."
  quality:
    - "Server tests cover archive success, exclusion policy and invalid project/run cases."
    - "Frontend guard tests cover toolbar/API integration."
    - "Typecheck and build pass."
  observability:
    - "Backend logs archive start/completion/failure with project_id, run_id, file_count, skipped_count, total_bytes and duration_ms."
    - "User sees a clear failure state if download cannot start."
```

## 13. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate shared schemas/types if changed."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Compile backend route/service changes."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Run backend tests covering archive service and routes."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend types."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web test:guards"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate frontend regression guard."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate production bundle."
      success_condition: "Exit code 0."
  runtime_checks:
    - name: "Download button visible"
      method: "browser"
      expected: "Files toolbar includes accessible action Baixar projeto (.zip)."
    - name: "ZIP starts downloading"
      method: "browser or direct fetch"
      expected: "GET endpoint returns 200 application/zip and attachment filename."
    - name: "ZIP content inspection"
      method: "test or script"
      expected: "Archive entries contain project source files and exclude forbidden paths."
  integration_checks:
    - name: "Files tree and ZIP agree on safe visible files"
      surfaces:
        - "ProjectFileTreeCollector"
        - "ProjectArchiveService"
      method: "unit/integration test"
      expected: "Representative visible source files are present in ZIP; ignored files are absent."
    - name: "Run worktree ownership"
      surfaces:
        - "ProjectFileBrowserService"
        - "ProjectArchiveService"
      method: "backend test"
      expected: "Run from another project is rejected."
  manual_checks:
    - "Open downloaded ZIP locally and confirm the top-level folder name is readable and safe."
    - "Confirm toolbar layout does not become crowded on normal desktop width."
```

## 14. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent routes or services without checking existing Project Files code."
    - "Do not claim security coverage without tests that inspect ZIP entries."
    - "Do not assume all files can be archived; inspect ignore/sensitive rules."
  read_before_write:
    - "Read ProjectFileBrowserService and ProjectFileTreeCollector before editing archive logic."
    - "Read ProjectFilesToolbar and ProjectFilesPage before adding UI."
    - "Find all project-files route references before changing router dependencies."
  failure_handling:
    - "If archiver errors after headers are sent, log and abort; do not send a JSON error into a ZIP stream."
    - "If archive is too large, return a clear 413 before streaming."
    - "If project/run cannot be resolved, return existing project file error response shape."
  state_consistency:
    - "Do not update frontend download URL without backend route."
    - "Do not add backend route without frontend access and tests."
    - "Do not duplicate path safety logic."
  scope_control:
    - "Do not redesign the entire Files toolbar."
    - "Do not alter Monaco/editor save behavior except for dirty download guard."
    - "Do not change existing workflow artifact download."
```

## 15. Recovery and Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "Temporary dev server restart"
    - "Browser download prompt not observable in automation"
    - "Transient filesystem ENOENT from files changing during traversal"
  non_retryable_failures:
    - "Project root cannot be resolved"
    - "Run does not belong to project"
    - "Archive would exceed configured file count or byte limit"
    - "Path safety invariant fails"
  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only files changed by this feature if a security invariant cannot be met."
    - "If unsure whether a dirty change belongs to another agent, stop and report before editing."
  escalation_rules:
    - "Escalate if user wants secrets included."
    - "Escalate if downloading existing external repository may include proprietary files outside generated project scope."
    - "Escalate if archive size exceeds safe configured limits and product decision is needed."
```

## 16. Observability Requirements

```yaml
observability:
  logs:
    - event: "project_archive_requested"
      fields:
        - "project_id"
        - "run_id"
        - "root_label"
    - event: "project_archive_completed"
      fields:
        - "project_id"
        - "run_id"
        - "file_count"
        - "skipped_count"
        - "total_bytes"
        - "duration_ms"
    - event: "project_archive_failed"
      fields:
        - "project_id"
        - "run_id"
        - "error_type"
        - "duration_ms"
  audit_trail:
    required: true
    must_capture:
      - "files read"
      - "files changed"
      - "commands executed"
      - "test results"
      - "browser/runtime checks"
  user_visible_failures:
    - "Show download unavailable when no project is selected."
    - "Show or surface a clear error if backend rejects project/run/download."
    - "Warn that unsaved local edits are not included until saved."
```

## 17. Risks and Unknowns

```yaml
risks:
  - risk: "Sensitive file leak through archive."
    severity: "critical"
    mitigation: "Centralize ignore/sensitive rules and inspect ZIP entries in tests."
  - risk: "Huge ZIP blocks server or browser."
    severity: "high"
    mitigation: "Pre-walk, count files, sum bytes, enforce limits and stream archive."
  - risk: "Stale dirty editor content is not included."
    severity: "medium"
    mitigation: "Dirty guard before download; require save or explicit confirmation."
  - risk: "Route sends JSON after ZIP headers on stream error."
    severity: "medium"
    mitigation: "Precompute archive manifest before headers; attach stream error handler."
  - risk: "Existing-repo mode downloads too much."
    severity: "medium"
    mitigation: "Use same root/run semantics and ignore policy; consider future folder selection out of scope."
unknowns:
  - question: "Should the ZIP include hidden non-sensitive files besides .gitignore?"
    resolution_strategy: "Default to current tree policy: exclude dotfiles except .gitignore; ask only if product needs more."
  - question: "Should unsaved dirty files block download or show confirm?"
    resolution_strategy: "Prefer disable/warn for safer UX; implementation may use confirm if it fits current UI better."
  - question: "What maximum archive size is acceptable?"
    resolution_strategy: "Start conservative: max 10,000 files and max 100 MB uncompressed; expose constants for adjustment."
```

## 18. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Implement a ProjectArchiveService that resolves the same readable root used by ProjectFileBrowserService,
    creates an archive manifest with allowed files, then streams the manifest through archiver. The route should
    set ZIP headers only after manifest validation passes. Frontend should use a direct anchor or programmatic
    click to the backend URL, because normal browser download behavior is appropriate for this feature.

  alternatives_considered:
    - option: "Zip in the browser from file tree/content endpoints"
      tradeoff: "Rejected because it would require fetching all files through the browser, duplicate security rules, expose more data and be slower."
    - option: "Reuse /api/workflow/download/:threadId"
      tradeoff: "Rejected because it downloads synthesized workflow artifacts by threadId, not the real generated project folder."
    - option: "Download a tarball instead of ZIP"
      tradeoff: "Rejected for now because ZIP is more familiar for non-technical users and already supported by archiver."
  migration_notes:
    - "No database migration is required."
    - "Existing file/tree/save APIs remain unchanged."
  backward_compatibility:
    required: true
    notes:
      - "Existing Project Files behavior must continue working."
      - "Existing workflow artifact download route must remain untouched."
```

## 19. Deliverables

```yaml
deliverables:
  code:
    - "apps/server/src/infrastructure/project/ProjectArchiveService.ts"
    - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
    - "packages/shared/src/entities/ProjectFiles.ts if query/response schemas need extension"
    - "apps/web/src/api/projectFilesApi.ts"
    - "apps/web/src/features/project-files/components/ProjectFilesToolbar.tsx"
    - "apps/web/src/features/project-files/ProjectFilesPage.tsx"
    - "apps/web/src/features/project-files/styles/project-files.css"
  tests:
    - "apps/server/test/projectArchiveService.test.mjs"
    - "apps/server/test/projectFileBrowser.test.mjs or route-level equivalent"
    - "apps/web/test/frontendRegressionGuards.test.mjs"
  docs:
    - "This SPEC"
  validation_evidence:
    - "Typecheck/build output"
    - "Backend test output"
    - "Frontend guard output"
    - "Browser smoke note"
```

## 20. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Relevant Files backend and frontend files were read."
    - "Existing workflow artifact download route was checked and not confused with project download."
    - "Upstream root/project/run dependencies were mapped."
    - "Downstream user workflow and browser download behavior were mapped."
  implementation:
    - "Download route is under /api/project-files."
    - "Archive service uses safe project/run root resolution."
    - "Archive traversal skips sensitive/generated paths and symlinks."
    - "Archive has one safe top-level folder."
    - "Archive stream enforces count/byte limits."
    - "Frontend button is accessible and visually consistent."
    - "Dirty editor state is handled before download."
    - "No unrelated Files UI refactor was introduced."
  validation:
    - "Backend ZIP tests passed."
    - "Route error tests passed."
    - "Frontend guard tests passed."
    - "Typecheck/build passed."
    - "Browser smoke was performed."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

## 21. Minimal Output Contract for Executing Agent

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

## 22. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-27T04:49:05Z"
  status: "completed"
  summary: |
    Implemented secure project ZIP download for the Project Files screen. The backend now
    resolves the selected project/run root through ProjectFileBrowserService, builds a safe
    archive manifest, excludes sensitive/generated paths, skips symlinks and path escapes,
    enforces file count and total byte limits, and streams a ZIP attachment. The frontend now
    exposes a compact toolbar download action guarded by dirty-editor confirmation.
  files_changed:
    - "apps/server/src/infrastructure/project/ProjectArchiveService.ts"
    - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
    - "apps/server/src/infrastructure/project/ProjectFileTreeCollector.ts"
    - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/test/projectFileBrowser.test.mjs"
    - "apps/web/src/api/projectFilesApi.ts"
    - "apps/web/src/features/project-files/ProjectFilesPage.tsx"
    - "apps/web/src/features/project-files/components/ProjectFilesToolbar.tsx"
    - "apps/web/test/frontendRegressionGuards.test.mjs"
  validation:
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      result: "passed"
    - command: "node --test apps/server/test/projectFileBrowser.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      result: "passed"
    - command: "pnpm --filter @u-build/web type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      result: "passed"
    - command: "pnpm --filter @u-build/web test:guards"
      cwd: "/Users/wamat/Desktop/horus.ai"
      result: "passed"
    - command: "pnpm --filter @u-build/web build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      result: "passed"
    - check: "Browser smoke"
      result: "Files toolbar shows enabled Baixar button with aria-label Baixar projeto como ZIP."
  remaining_risks:
    - "The currently running backend process may need restart to expose the new download route if the dev watcher is not active."
```
