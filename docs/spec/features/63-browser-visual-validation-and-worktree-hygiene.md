---
format_version: "agentic_sdd.v1"
task_id: "feature-63-browser-visual-validation-and-worktree-hygiene"
title: "Browser Visual Validation And Worktree Hygiene"
created_at_utc: "2026-05-27T14:18:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "1.1.0"
status: "implemented"
depends_on:
  - "spec/features/17-visual-preview-frontend-console.md"
  - "spec/features/27-preview-runtime-observability.md"
  - "spec/features/28-qa-preview-smoke-validation.md"
  - "spec/features/56-visual-contract-design-system.md"
  - "spec/features/57-visual-curator-screenshot-gate.md"
  - "spec/features/62-preview-project-registry-hygiene.md"
---

# 63 - Browser Visual Validation And Worktree Hygiene

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec para resolver esse problema:

  Validação visual real no browser
  Eu tentei Playwright, mas o pacote não está instalado no repo. A validação foi por pnpm test, guards e API smoke. Se quiser fechar 100%, vale instalar/usar uma automação de browser e tirar screenshot da Preview.

  Worktree está misturado com mudanças anteriores
  O git status mostra arquivos da spec 62 junto com mudanças de specs anteriores de skills/agent-skills. Não é erro da 62, mas antes de commit/push precisa separar bem o que entra em cada commit.
```

## 2. System Interpretation

```yaml
system_translation: |
  Planejar duas correções de fechamento para o fluxo de entrega do Horus:
  1. Adicionar uma validação visual real, reprodutível e versionada para a tela Preview usando browser automation com screenshot/evidência.
  2. Criar uma política e ferramenta de higiene de worktree para separar alterações por spec antes de commit/push, evitando commits misturados entre specs 60/61/62/63 ou mudanças antigas.

expected_user_visible_result: |
  Ao finalizar uma mudança que afeta Preview/UI, o agente consegue abrir o Horus em browser real, capturar screenshot, validar seletor/canvas/estado de erro e anexar evidência clara. Antes de commit, o usuário recebe um plano de commit separado por spec, com arquivos agrupados e riscos de mistura apontados.

expected_engineering_result: |
  O repositório passa a ter scripts/testes e documentação local para validação visual real do Preview, além de um comando/checklist que audita o worktree e classifica arquivos por spec/feature antes de staging. A spec não deve misturar implementação visual com limpeza destrutiva de Git.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "O usuário não quer confiar apenas em testes unitários/API quando a falha é visual e aparece no browser; também não quer commits contaminados por mudanças de specs anteriores."
  target_user: "Operador/desenvolvedor do Horus que revisa, valida, commita e faz push de mudanças feitas por agentes."
  expected_outcome: "Cada entrega visual tem evidência de browser real e cada commit/push pode ser separado por escopo com baixo risco de incluir arquivos indevidos."
  product_surface:
    - "Tela Preview em ?mode=preview"
    - "Preview project selector"
    - "Preview canvas/iframe"
    - "Preview chat/status panel"
    - "Fluxo local de commit/push"
    - "Spec/changelog local"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "PreviewRuntimeManager"
      - "PreviewProjectHealthService"
    frontend:
      - "React"
      - "Vite"
      - "CSS modularizado em apps/web/src/index.css"
    database:
      - "Postgres migrations under apps/server/src/infrastructure/database/migrations"
      - "File-mode fallback under HORUS_DATA_DIR/data"
    infrastructure:
      - "pnpm monorepo"
      - "Turbo build"
      - "Browser validation currently missing a repo-local automation dependency"
      - "Git worktree can contain unrelated prior changes"
  known_entrypoints:
    - "apps/web/src/components/VisualPreviewConsole.tsx"
    - "apps/web/src/components/PreviewConversationPanel.tsx"
    - "apps/web/src/components/PreviewCanvas.tsx"
    - "apps/web/src/api/previewApi.ts"
    - "apps/server/src/infrastructure/http/routes/previewRoutes.ts"
    - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
    - "apps/server/src/infrastructure/preview/PreviewProjectHealthService.ts"
    - "spec/README.md"
    - "spec/CHANGELOG.md"
  known_existing_patterns:
    - "Specs are numbered under spec/features and indexed in spec/README.md."
    - "Implementation logs go into the spec file when work is completed."
    - "Frontend guards live under apps/web/test and run with node --test."
    - "Server tests live under apps/server/test and run after pnpm build."
    - "The repo may have a dirty worktree; unrelated changes must not be reverted."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add repo-local browser automation capability for Preview validation."
    - "Define deterministic browser checks for visible project list, invalid-project toggle, canonical preview render and blocked project error state."
    - "Capture screenshots or traces into ignored local artifact folders."
    - "Add scripts/docs so agents can run visual validation without relying on globally installed Playwright."
    - "Add a worktree audit command/checklist that groups changed files by spec and flags mixed commit risk."
    - "Document a safe staging/commit plan for dirty worktrees with unrelated changes."
    - "Update local spec versioning when implemented."
  out_of_scope:
    - "Commit or push existing changes."
    - "Delete unrelated worktree changes."
    - "Rewrite the Preview UI."
    - "Add cloud CI requirements unless explicitly requested later."
    - "Mandate one browser library forever; implementation may choose Playwright or another repo-local browser runner if it satisfies the contract."
    - "Persist registry repair from spec 62; that remains a separate optional follow-up."
```

## 5. Problem Scenario Matrix

| Scenario | Current Symptom | Risk | Required Behavior |
| --- | --- | --- | --- |
| Browser dependency missing | `import('playwright')` fails with `ERR_MODULE_NOT_FOUND` | Agents claim visual validation without doing it | Repo provides local install/script or detects missing dependency and fails with clear instruction |
| App server not running | Browser test cannot open `<HORUS_PUBLIC_HOST>:5174` | False visual failure | Script checks `/health` first and prints actionable startup requirement |
| Preview selected project is canonical | API passes but UI selector/canvas may still be broken | API-only validation misses real user bug | Browser asserts select contains curated options and screenshot includes Preview surface |
| Invalid-project toggle | Hidden projects exist but UI toggle may not render or may overflow | User cannot inspect archived/broken entries | Browser toggles all/invalid mode and verifies blocked labels/reasons fit |
| Canonical preview loads | `preview_ready` API can pass while iframe is blank/occluded | Blank visual delivery | Browser captures canvas screenshot and checks non-empty iframe/container dimensions |
| Blocked project start | API blocks scaffold-only project but UI may not show reason | User sees generic error | Browser selects invalid project in debug mode, starts it and verifies specific error text |
| Browser smoke flakes | Local machine slow, Vite still starting | Intermittent failures | Use bounded retries, wait for explicit UI state, store failure screenshot |
| Screenshot folder tracked by Git | Evidence artifacts pollute commits | Accidental binary churn | Artifact directory must be ignored by `.gitignore` or `.git/info/exclude` |
| Worktree has prior specs | Spec 62 files mixed with spec 60/61 files | Wrong commit content | Audit groups changes by path/spec and prints staged plan before staging |
| Untracked files from previous feature | New files from agent skills appear alongside preview hygiene | Missing or oversized commit | Tool flags untracked files separately and requires explicit grouping |
| Same file touched by two specs | `packages/shared/src/index.ts` or server bootstrap changed by multiple specs | Cannot safely isolate without reviewing hunks | Audit marks shared files as `mixed_hunk_review_required` |
| Spec files ignored | `spec/` may be local-only and not tracked | User still expects local versioning, not Git commit | Audit treats spec versioning as local artifact and reports ignored status clearly |
| Commit requested after long thread | Agent may stage everything | Regression or accidental push | Final commit workflow must require `git status --short`, scoped `git diff --`, and path-limited staging |

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/http/routes/previewRoutes.ts"
      - "apps/server/src/infrastructure/preview/PreviewRuntimeManager.ts"
      - "apps/server/src/infrastructure/preview/PreviewProjectHealthService.ts"
    services:
      - "PreviewRuntimeManager"
      - "PreviewProjectHealthService"
    database:
      migrations_required: false
      tables:
        - "frontend_projects"
        - "preview_sessions"
  frontend:
    files:
      - "apps/web/src/components/VisualPreviewConsole.tsx"
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/components/PreviewCanvas.tsx"
      - "apps/web/src/api/previewApi.ts"
      - "apps/web/src/index.css"
    components:
      - "VisualPreviewConsole"
      - "PreviewConversationPanel"
      - "PreviewCanvas"
    routes:
      - "?mode=preview"
  workflow:
    graph_nodes: []
    agents:
      - "Codex local implementation agent"
      - "Future verification agent"
  tests:
    unit:
      - "apps/web/test/frontendRegressionGuards.test.mjs"
      - "apps/server/test/previewProjectHealthService.test.mjs"
    integration:
      - "apps/server/test/previewRuntimeEvidence.test.mjs"
      - "apps/server/test/processBrowserPreviewAdapter.test.mjs"
    e2e:
      - "new browser validation suite for Preview"
      - "new worktree audit script tests"
  tooling:
    files:
      - "package.json"
      - "apps/web/package.json or root package.json"
      - "new scripts/preview-browser-smoke.*"
      - "new scripts/worktree-spec-audit.*"
      - ".gitignore"
      - "docs or spec implementation log"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    This work does not change the core agent graph. It adds a verification layer above the existing Preview runtime and a Git hygiene layer around local delivery. Browser validation consumes the running app and preview APIs. Worktree hygiene consumes Git status/diff and spec ownership metadata.

  depends_on:
    - name: "Preview HTTP API"
      type: "api"
      owner: "preview backend"
      direction: "this_spec_consumes_dependency"
      contract_used: "GET /api/preview/projects?visibility=visible|all, POST /api/preview/sessions, POST /api/preview/sessions/:id/start"
      required_for: "Seed deterministic UI states before browser screenshot checks."
      assumptions:
        - "Server runs on <HORUS_PUBLIC_HOST>:5174 during local validation."
      failure_modes:
        - "Browser test fails because backend is down, not because UI is broken."
      fallback_or_recovery: "Preflight /health check with explicit startup instructions."
      verification:
        - "curl /health"
        - "curl /api/preview/projects?visibility=visible"

    - name: "VisualPreviewConsole"
      type: "frontend_component"
      owner: "apps/web"
      direction: "this_spec_consumes_dependency"
      contract_used: "DOM labels, project selector, debug toggle, preview canvas and error state"
      required_for: "Validate the actual user-visible Preview surface."
      assumptions:
        - "Selectors must prefer accessible labels/roles over brittle CSS when possible."
      failure_modes:
        - "DOM changes make visual validation brittle."
      fallback_or_recovery: "Use semantic labels first; only use CSS selectors for stable internal anchors."
      verification:
        - "Browser smoke assertions"
        - "Screenshot artifact review"

    - name: "Repo package manager"
      type: "external_dependency"
      owner: "pnpm monorepo"
      direction: "this_spec_consumes_dependency"
      contract_used: "package.json scripts and devDependencies"
      required_for: "Install and run browser automation reliably from the repo."
      assumptions:
        - "Implementation may use @playwright/test or playwright as a devDependency."
      failure_modes:
        - "No browser binaries installed; tests fail with dependency error."
      fallback_or_recovery: "Script checks dependency and prints install/bootstrap command; browser install artifacts remain local."
      verification:
        - "pnpm install"
        - "pnpm exec playwright --version or equivalent"

    - name: "Git CLI"
      type: "external_dependency"
      owner: "developer tooling"
      direction: "this_spec_consumes_dependency"
      contract_used: "git status --short, git diff --name-only, git diff --cached --name-only"
      required_for: "Detect mixed worktree and produce safe commit grouping."
      assumptions:
        - "Implementation runs inside <REPOSITORY_ROOT>."
      failure_modes:
        - "Tool sees changes outside repo or misclassifies ignored spec files."
      fallback_or_recovery: "Abort when not inside repo; report ignored/local spec files separately."
      verification:
        - "Fixture tests using temporary Git repo"

  depended_on_by:
    - name: "Future UI/spec agents"
      type: "agent"
      owner: "local agent workflow"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Documented browser validation command and required evidence output"
      compatibility_obligation: "Must keep command stable enough for future final reports."
      expected_consumer_behavior: "Run browser validation for Preview/UI changes before claiming completion."
      migration_or_notification_required: false
      verification:
        - "Agent final answer includes screenshot path/result summary."

    - name: "Commit/push workflow"
      type: "workflow"
      owner: "developer/operator"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Worktree audit report grouped by spec/feature"
      compatibility_obligation: "Must not stage unrelated files automatically."
      expected_consumer_behavior: "Use path-scoped staging and separate commits by spec."
      migration_or_notification_required: false
      verification:
        - "Dry-run audit before any commit"

  bidirectional_integrations:
    - name: "Browser smoke and Preview runtime"
      participants:
        - "Browser validation script"
        - "PreviewRuntimeManager/API"
      shared_contract: "Selected project id, session id, preview status, UI render state, screenshot artifact"
      consistency_rule: "A browser success must correspond to a running/blocked Preview API state and visible UI evidence."
      verification:
        - "Browser script validates API response and DOM/screenshot in the same run."

    - name: "Worktree audit and local spec workflow"
      participants:
        - "spec/README.md + spec/CHANGELOG.md"
        - "git status/diff"
      shared_contract: "Spec number, feature title, changed file ownership group"
      consistency_rule: "A commit plan cannot claim spec 62-only if it includes files belonging exclusively to spec 60/61/63."
      verification:
        - "Audit test with synthetic mixed file list."

  data_flow:
    inbound:
      - source: "Preview API"
        payload_or_state: "project list, session state, error messages"
        validation: "HTTP status, schema-like field checks, expected project names/reasons"
      - source: "Browser DOM"
        payload_or_state: "selector options, buttons, canvas/iframe state, error text"
        validation: "role/label selectors, visibility checks, screenshot capture"
      - source: "Git status"
        payload_or_state: "changed paths and staged state"
        validation: "path normalization, ignored/local file classification"
    outbound:
      - target: "Local artifacts"
        payload_or_state: "screenshots, JSON report, optional trace"
        compatibility: "stored under ignored artifact directory"
      - target: "Final agent report"
        payload_or_state: "browser validation summary and commit grouping"
        compatibility: "plain text plus file paths"

  sequencing_dependencies:
    - dependency: "Browser dependency before browser script"
      reason: "The current failure is missing repo-local automation package."
      validation: "Dependency command succeeds from repo root."
    - dependency: "Server health before UI checks"
      reason: "Avoid confusing app-down with UI-regression."
      validation: "GET /health returns ok."
    - dependency: "Worktree audit before staging"
      reason: "Prevent accidental mixed commits."
      validation: "Audit produces explicit groups and no automatic staging."

  integration_risks:
    - risk: "Browser tests become flaky and slow."
      severity: "medium"
      mitigation: "Use a small smoke suite, bounded waits, screenshots on failure, and keep it outside default fast guards unless needed."
    - risk: "Screenshots are committed accidentally."
      severity: "medium"
      mitigation: "Use ignored artifact directory and add guard test/check."
    - risk: "Worktree audit gives false confidence on files touched by multiple specs."
      severity: "high"
      mitigation: "Mark shared/hunk-overlap files as manual review required instead of assigning blindly."
```

## 8. Architecture Rules

```yaml
architecture_rules:
  browser_validation:
    - "Browser validation must run from repo-local dependencies, not a global package."
    - "Browser validation must verify the actual loopback host app, not mocked HTML."
    - "Prefer semantic selectors and user-visible assertions."
    - "Store screenshots/traces in a local ignored artifact directory."
    - "A browser smoke failure must include a screenshot path and concise diagnosis."
    - "Do not make all unit tests depend on browser binaries; keep browser smoke opt-in or in a named script."
  worktree_hygiene:
    - "Never run destructive Git commands."
    - "Never stage the full worktree when unrelated changes exist."
    - "Use path-limited git diff/status before any staging."
    - "Separate commits by spec/feature ownership."
    - "Shared files require manual hunk review when touched by multiple specs."
    - "Spec files may be local-only; report them but do not assume they are commit candidates."
  project_specific:
    - "Respect AGENTS.md: do not revert user or prior-agent changes."
    - "Preserve spec/README.md and spec/CHANGELOG.md version discipline."
    - "Preview validation must cover both healthy canonical project and blocked invalid project paths introduced by spec 62."
```

## 9. Proposed Contracts

```yaml
contracts:
  browser_validation_command:
    name: "Preview browser smoke"
    proposed_script: "pnpm preview:smoke"
    inputs:
      - "HORUS_BASE_URL default http://<HORUS_PUBLIC_HOST>:5174"
      - "artifact directory default .horus/artifacts/browser-smoke/<timestamp>"
    outputs:
      - "JSON report with status, checked project ids, screenshot paths and failure reasons"
      - "PNG screenshot of Preview page visible mode"
      - "PNG screenshot of Preview page all/invalid mode"
      - "Optional trace/video if configured"
    invariants:
      - "Fails if browser dependency is missing."
      - "Fails if /health is not reachable."
      - "Fails if visible project selector includes known scaffold-only duplicates by default."
      - "Fails if blocked project start does not show a specific reason."

  worktree_audit_command:
    name: "Spec worktree audit"
    proposed_script: "pnpm spec:worktree-audit"
    inputs:
      - "optional --spec 62 or --spec 63"
      - "optional --json"
    outputs:
      - "changed files grouped by likely spec/feature"
      - "untracked files grouped separately"
      - "shared files requiring manual hunk review"
      - "recommended path-limited staging commands"
    invariants:
      - "Read-only by default."
      - "Must not stage, commit, checkout or reset."
      - "Must warn when files from multiple specs are present."
      - "Must identify spec/ files as local-only when ignored."

  evidence_report:
    name: "Validation evidence in final response"
    required_fields:
      - "browser_command"
      - "browser_result"
      - "screenshot_paths"
      - "worktree_audit_summary"
      - "remaining_risks"
```

## 10. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current scripts and dependency policy"
    agent: "repo_explorer"
    action: "Read root/package app package scripts, current test layout, .gitignore, runtime config and spec files."
    expected_output: "Decision on where to add browser dependency/script and artifact ignore rule."

  - step: 2
    name: "Add browser automation dependency and config"
    agent: "tooling_specialist"
    action: "Install/configure repo-local browser automation, preferably @playwright/test in the minimal workspace that owns the Preview UI, with deterministic local-server assumptions."
    expected_output: "Package scripts and config that run without global dependencies."

  - step: 3
    name: "Implement Preview browser smoke"
    agent: "frontend_validation_specialist"
    action: "Create a browser smoke that opens ?mode=preview, validates visible selector, toggles invalid projects, starts canonical preview, verifies blocked invalid state and captures screenshots."
    expected_output: "Browser smoke script/test with screenshot JSON report."

  - step: 4
    name: "Protect browser artifacts"
    agent: "tooling_specialist"
    action: "Add local artifact folder to .gitignore or documented .git/info/exclude path; ensure screenshots/traces do not appear in git status."
    expected_output: "Ignored artifacts and guard/check."

  - step: 5
    name: "Implement worktree audit"
    agent: "release_hygiene_specialist"
    action: "Create a read-only script that parses git status/diff, classifies files by known spec ownership, flags shared files, and prints path-scoped staging suggestions."
    expected_output: "Worktree audit command with JSON/text modes and fixture tests."

  - step: 6
    name: "Document commit separation policy"
    agent: "docs_specialist"
    action: "Update spec implementation workflow or add a local runbook note explaining how to split commits when worktree has prior changes."
    expected_output: "Clear local instructions for not staging unrelated files."

  - step: 7
    name: "Wire validation into completion checklist"
    agent: "integration_specialist"
    action: "Update spec 63 implementation log and future final-response checklist after implementation."
    expected_output: "Agents know exactly what evidence to report."

  - step: 8
    name: "Validate"
    agent: "qa_specialist"
    action: "Run unit tests, browser smoke and worktree audit against current dirty repo."
    expected_output: "Tests pass, screenshots exist locally, worktree audit identifies mixed spec changes without mutating Git."
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  browser_validation:
    - "A repo-local command exists to validate Preview in a real browser."
    - "The command fails clearly if the server is not reachable."
    - "The command captures at least one screenshot for the default Preview state."
    - "The command validates that only canonical/healthy projects appear in the default selector."
    - "The command can reveal invalid/hidden projects through the UI toggle."
    - "The command validates that starting a blocked project surfaces a specific reason instead of a generic timeout."
    - "Browser artifacts are ignored and do not appear in git status."
  worktree_hygiene:
    - "A read-only audit command lists changed files grouped by likely spec/feature."
    - "The audit command flags mixed worktree risk when files from multiple specs are present."
    - "The audit command prints path-limited staging suggestions and never stages automatically."
    - "Shared files are marked as requiring manual hunk review."
    - "The final report after implementation includes a commit separation plan."
  validation:
    - "pnpm test passes."
    - "pnpm --filter @u-build/web test:guards passes."
    - "new browser smoke passes against loopback host."
    - "new worktree audit tests pass."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  preflight:
    - command: "git status --short"
      purpose: "Record dirty worktree before implementation."
    - command: "pnpm --filter @u-build/web test:guards"
      purpose: "Confirm fast frontend guards before browser work."
  focused:
    - command: "pnpm preview:smoke"
      purpose: "Run real browser Preview validation and generate screenshots."
    - command: "pnpm spec:worktree-audit --json"
      purpose: "Verify worktree grouping without staging."
  full:
    - command: "pnpm test"
      purpose: "Full shared/server test suite."
  manual_review:
    - "Open generated screenshots for default Preview and invalid-project mode."
    - "Confirm audit output does not recommend staging unrelated agent-skill files into spec 62/63 commit."
```

## 13. Error Mitigation

```yaml
error_mitigation:
  browser_missing:
    detection: "Command cannot resolve browser package or executable."
    response: "Fail with install/bootstrap command and do not claim visual validation."
  server_down:
    detection: "/health request fails."
    response: "Stop browser test and print loopback host/server startup requirement."
  flaky_render:
    detection: "Selector not visible before timeout."
    response: "Retry bounded wait, capture failure screenshot, include DOM summary."
  screenshot_pollution:
    detection: "git status shows screenshot/trace artifacts."
    response: "Fail audit and require ignore rule update."
  mixed_worktree:
    detection: "changed files map to more than one spec group."
    response: "Print separate commit groups and mark full-stage unsafe."
  shared_hunk:
    detection: "file path appears in known shared files or has changes from multiple feature areas."
    response: "Require manual `git diff -- <file>` review; do not auto-assign."
```

## 14. Deliverables

```yaml
deliverables:
  code:
    - "Browser validation dependency/config/script."
    - "Preview browser smoke test/script."
    - "Worktree spec audit script."
    - "Artifact ignore rule."
  tests:
    - "Browser smoke runnable against local app."
    - "Worktree audit fixture tests."
    - "Existing test/guard suite remains green."
  docs:
    - "Spec 63 implementation log after completion."
    - "Changelog/README version update."
    - "Commit separation instructions or audit output contract."
  validation_evidence:
    - "Screenshot path(s)."
    - "Browser smoke report."
    - "Worktree audit report."
    - "Command outputs for tests."
```

## 15. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Current dirty worktree was inspected before edits."
    - "Existing test scripts and package boundaries were inspected."
    - "Preview API and UI selectors were verified against current code."
  implementation:
    - "No unrelated changes were reverted."
    - "Browser artifacts are ignored."
    - "Worktree audit is read-only."
    - "Browser smoke covers both healthy and blocked Preview states."
  validation:
    - "Browser smoke passed and produced screenshot evidence."
    - "Worktree audit correctly reported mixed spec changes."
    - "pnpm test passed."
    - "Frontend guards passed."
  reporting:
    - "Final answer lists screenshots/report paths."
    - "Final answer lists which files belong to spec 63 vs previous specs."
    - "Remaining risks are disclosed."
```

## 16. Implementation Log

```yaml
implemented_at_utc: "2026-05-27T14:55:00Z"
implemented_by: "codex"
implementation_summary:
  - "Added repo-local Playwright dependency and `pnpm preview:smoke` for real browser Preview validation."
  - "Added `scripts/preview-browser-smoke.mjs` to validate health/projects APIs, visible project filtering, healthy preview rendering, invalid project surfacing, screenshots and JSON report artifacts."
  - "Added `pnpm spec:worktree-audit` with a read-only worktree classifier that groups dirty files by delivery area, flags manual review paths and prints path-limited staging suggestions."
  - "Added `pnpm spec:worktree-audit:test` with node:test coverage for status parsing, classification, mixed groups and focused spec filtering."
  - "Updated local spec README and changelog version to record the implementation."
files_changed:
  - "package.json"
  - "pnpm-lock.yaml"
  - "scripts/preview-browser-smoke.mjs"
  - "scripts/worktree-spec-audit.mjs"
  - "scripts/worktree-spec-audit.test.mjs"
  - "spec/README.md"
  - "spec/CHANGELOG.md"
  - "spec/features/63-browser-visual-validation-and-worktree-hygiene.md"
```

## 17. Minimal Output Contract For Executing Agents

```yaml
agent_result:
  status: "<completed | failed | blocked>"
  summary: "<short factual summary>"
  files_changed:
    - "<path>"
  commands_run:
    - command: "<command>"
      cwd: "<cwd>"
      exit_code: "<exit code>"
      result: "<short result>"
  browser_validation:
    status: "<passed | failed | skipped>"
    base_url: "<url>"
    screenshots:
      - "<path>"
    report_path: "<path>"
    failure_reason: "<reason or null>"
  worktree_audit:
    status: "<passed | warning | failed>"
    mixed_groups:
      - "<group>"
    manual_review_files:
      - "<path>"
    recommended_commits:
      - name: "<commit group>"
        files:
          - "<path>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```
