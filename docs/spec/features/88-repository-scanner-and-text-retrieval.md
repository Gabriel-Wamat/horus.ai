---
format_version: "agentic_sdd.v1"
task_id: "feature-88-repository-scanner-and-text-retrieval"
title: "Repository Scanner And Text Retrieval"
created_at_utc: "2026-05-28T18:21:43Z"
author: "agent"
target_mode: "new_project"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_1_minimal_viable_coding_agent"
depends_on:
  - "spec/features/35-project-code-intelligence-ast.md"
  - "spec/features/38-grounded-chat-code-intelligence.md"
  - "spec/features/49-project-files-ide-experience.md"
  - "spec/features/83-provider-port-decoupling.md"
  - "spec/features/87-coding-runtime-orchestrator-state-machine.md"
---

# 88 - Repository Scanner And Text Retrieval

## 1. Original User Request

```yaml
raw_user_request: |
  crie as specs 87 até 91

source_feature_request: |
  Phase 1 must include basic repository scanning, grep/text retrieval and frontend/backend task routing
  as part of the pipeline before AST analysis and patch planning.
```

## 2. System Interpretation

```yaml
system_translation: |
  Build the repository access and lexical retrieval foundation for the coding assistant. This SPEC must
  replace broad file reads with bounded, policy-driven scanning and grep retrieval that feeds the coding
  runtime with relevant file candidates, path evidence and routing hints.

expected_user_visible_result: |
  Coding requests become grounded in real repository files. The user should see relevant files/sources
  and explicit empty or partial retrieval states instead of fabricated context.

expected_engineering_result: |
  The application gains a RepositoryScannerPort and TextRetrievalPort that enforce ignore rules, file size
  budgets, sensitive path exclusions, path safety, task routing hints and retrieval evidence.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "Agents waste tokens and make bad edits when they read too many files or irrelevant files."
  target_user: "Developer/operator asking Horus to inspect and modify local frontend/backend projects."
  expected_outcome: "The coding runtime retrieves small, relevant, auditable context before AST analysis."
  product_surface:
    - "Horus coding task execution"
    - "Preview chat grounding/evidence"
    - "Project Files code intelligence"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Node fs/path"
      - "Zod"
    frontend:
      - "React evidence display as downstream consumer"
    database:
      - "No migration required for minimal scanner unless retrieval snapshots are persisted."
    infrastructure:
      - "rg optional via child process only if policy permits"
      - "Node filesystem fallback required"
  known_entrypoints:
    - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
    - "apps/server/src/infrastructure/project/ProjectFileTreeCollector.ts"
    - "apps/server/src/infrastructure/project/ProjectFileBrowserService.ts"
    - "apps/server/src/infrastructure/project/ProjectPathSafety.ts"
    - "packages/shared/src/entities/CodeContext.ts"
  known_existing_patterns:
    - "Code context bundles already expose inspected files, excerpts, limits and retrieval status."
    - "Project file browser already enforces sensitive path and symlink checks."
    - "No production flow may use mock project ids, files or chat records."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create RepositoryScannerPort and TextRetrievalPort under application/coding or application/ports."
    - "Create shared RepositoryScan and RetrievalCandidate contracts."
    - "Consolidate ignore rules for node_modules, build output, cache folders, secrets, binaries and oversized files."
    - "Support path-explicit retrieval, grep term retrieval and fallback priority files."
    - "Return routing hints for frontend, backend, full-stack, config-only or unknown task surfaces."
    - "Add token/byte/file budgets before any content reaches LLM prompts."
    - "Expose retrieval status as matched, partial, no_match or blocked."
  out_of_scope:
    - "Vector search, embeddings and semantic ranking."
    - "Tree-sitter parsing or AST symbol extraction."
    - "LSP diagnostics, definitions or references."
    - "Writing files."
    - "Reading files outside the selected project root."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/CodeContext.ts"
      - "packages/shared/src/entities/RepositoryRetrieval.ts"
      - "apps/server/src/application/ports/RepositoryRetrievalPort.ts"
      - "apps/server/src/application/coding/RepositoryScanner.ts"
      - "apps/server/src/application/coding/TextRepositoryRetriever.ts"
      - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
      - "apps/server/src/infrastructure/project/ProjectFileTreeCollector.ts"
    services:
      - "ReadOnlyCodeContextService"
      - "RepositoryScanner"
      - "TextRepositoryRetriever"
    database:
      migrations_required: false
  frontend:
    files:
      - "apps/web/src/features/visual-preview/previewChatMessages.ts"
    components:
      - "PreviewConversationPanel evidence rendering"
    routes: []
  workflow:
    graph_nodes: []
    agents:
      - "Future planner and patch planner consumers."
  tests:
    unit:
      - "packages/shared/test/repositoryRetrieval.test.mjs"
      - "apps/server/test/repositoryScanner.test.mjs"
      - "apps/server/test/textRepositoryRetriever.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This SPEC feeds the coding runtime with bounded repository context. It consumes project root/path-safety
    services and exposes candidate files to the AST analysis spine in SPEC 89.

  depends_on:
    - name: "Project path safety"
      type: "internal_module"
      owner: "apps/server/infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "resolveInsideRoot, isInsideRoot, sensitive path checks"
      required_for: "Prevent retrieval from escaping selected project roots or reading secrets."
      assumptions: []
      failure_modes:
        - "Scanner may leak host files or sensitive env/cert material."
      fallback_or_recovery: "Fail retrieval with blocked status and audit event."
      verification:
        - "node --test apps/server/test/repositoryScanner.test.mjs"

    - name: "CodeContextBundle"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "CodeContextBundleSchema"
      required_for: "Preserve current chat grounding behavior while adding scanner contracts."
      assumptions: []
      failure_modes:
        - "Frontend evidence cards lose retrieval status or file excerpts."
      fallback_or_recovery: "Keep additive fields and map new statuses back to existing status enum initially."
      verification:
        - "node --test packages/shared/test/*.test.mjs"

    - name: "CodingRuntimeOrchestrator"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "this_spec_consumes_dependency"
      contract_used: "CodingRuntimeStepContext"
      required_for: "Run scanning/retrieval at the correct lifecycle stage."
      assumptions:
        - "SPEC 87 has defined the runtime step context."
      failure_modes:
        - "Scanner gets called directly from agents and bypasses lifecycle."
      fallback_or_recovery: "Expose scanner only as a port consumed by orchestrator."
      verification:
        - "node --test apps/server/test/codingRuntimeOrchestrator.test.mjs"

  depended_on_by:
    - name: "Tree-sitter AST analysis"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "RetrievalCandidate[] and RepositoryScanSnapshot"
      compatibility_obligation: "Must include path, language, byte size, snippet ranges and safety decision."
      expected_consumer_behavior: "AST parser only parses candidates marked readable and supported."
      migration_or_notification_required: false
      verification:
        - "SPEC 89 parser tests consume fixture retrieval candidates."

    - name: "Chat evidence UI"
      type: "frontend_component"
      owner: "apps/web/features/visual-preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "retrieval status, sources, omitted counts and notes"
      compatibility_obligation: "Additive evidence fields must not break existing message rendering."
      expected_consumer_behavior: "Show real sources or explicit no-source/blocked state."
      migration_or_notification_required: false
      verification:
        - "pnpm --filter @u-build/web test:guards"

  data_flow:
    inbound:
      - source: "Coding task"
        payload_or_state: "project root, user prompt, selected paths, byte/token budgets"
        validation: "Runtime state and project path checks."
    outbound:
      - target: "AST analyzer"
        payload_or_state: "candidate file paths, language, excerpts and retrieval scores"
        compatibility: "Candidates are immutable evidence snapshots."
      - target: "Chat/frontend"
        payload_or_state: "retrieval notes, status and visible sources"
        compatibility: "Never fabricate files or ids."

  integration_risks:
    - risk: "Scanner duplicates ProjectFileBrowserService rules and drifts."
      severity: "high"
      mitigation: "Extract shared ignore/sensitive/path-policy helpers instead of copying rules."
    - risk: "Retrieval becomes expensive on large generated projects."
      severity: "high"
      mitigation: "Limit file count, byte count, concurrency and content scans; expose partial status."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Repository scanning is read-only."
    - "All paths must be canonicalized and validated inside the selected project root."
    - "Retrieval must be bounded before content is loaded into memory."
    - "Sensitive and binary files are blocked by policy, not by prompt instruction."
    - "No full repository dumps may be sent to an LLM."
  project_specific:
    - "Reuse existing project path safety and file browser policies where possible."
    - "Preserve CodeContextBundle compatibility for existing chat grounding."
    - "Expose explicit no_match/partial states instead of synthetic fallback sources."
```

## 8. Contracts and Invariants

```yaml
contracts:
  domain_contracts:
    - name: "Repository scan snapshot"
      producer: "RepositoryScanner"
      consumers:
        - "TextRepositoryRetriever"
        - "AstAnalyzer"
        - "CodingRuntimeOrchestrator"
      invariant: "Snapshot contains only safe, project-local, budget-accounted file metadata."
    - name: "Retrieval candidate"
      producer: "TextRepositoryRetriever"
      consumers:
        - "AstAnalyzer"
        - "PatchPlanner"
        - "Chat evidence UI"
      invariant: "Candidate content is excerpted, scored, path-stable and never read from blocked files."
  data_contracts:
    - name: "Retrieval budgets"
      producer: "CodingRuntimeOrchestrator"
      consumers:
        - "RepositoryScanner"
        - "TextRepositoryRetriever"
      migration_required: false
      compatibility_notes: "Budget fields may extend but cannot be ignored silently."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect existing code context and file browser policies"
    agent: "repo_explorer"
    action: "Read ReadOnlyCodeContextService, ProjectFileTreeCollector, ProjectFileBrowserService and path safety helpers."
    expected_output: "Policy map for ignored dirs, sensitive files, binary checks and limits."
  - step: 2
    name: "Define shared retrieval contracts"
    agent: "backend_specialist"
    action: "Add RepositoryScanSnapshot, RepositoryFileEntry, RetrievalCandidate and RetrievalStatus schemas."
    expected_output: "Shared exports with contract tests."
  - step: 3
    name: "Implement scanner port and service"
    agent: "backend_specialist"
    action: "Create bounded scanner with path safety, ignore policy, file metadata and language inference."
    expected_output: "Scanner tests for normal files, ignored dirs, symlink escape, binary and sensitive files."
  - step: 4
    name: "Implement text retrieval"
    agent: "backend_specialist"
    action: "Rank candidates using explicit paths, path terms, grep-style term matches and priority files."
    expected_output: "Retriever tests for matched, partial, no_match and budget exhaustion."
  - step: 5
    name: "Integrate with coding runtime and existing context service"
    agent: "architect"
    action: "Adapt ReadOnlyCodeContextService to consume or delegate to the scanner/retriever."
    expected_output: "Existing chat tests continue to pass with real retrieval evidence."
  - step: 6
    name: "Validate"
    agent: "qa_specialist"
    action: "Run shared/server build and focused retrieval tests."
    expected_output: "Validation evidence and any retrieval limits documented."
```

## 10. Pseudo-Code

```ts
interface RepositoryScannerPort {
  scan(input: {
    projectRoot: string;
    selectedPaths?: string[];
    budget: RepositoryScanBudget;
    signal: AbortSignal;
  }): Promise<RepositoryScanSnapshot>;
}

interface TextRetrievalPort {
  retrieve(input: {
    scan: RepositoryScanSnapshot;
    query: string;
    requestedPaths?: string[];
    budget: RetrievalBudget;
  }): Promise<RetrievalResult>;
}

class TextRepositoryRetriever implements TextRetrievalPort {
  async retrieve(input: RetrieveInput): Promise<RetrievalResult> {
    const terms = extractTerms(input.query);
    const candidates = rankByExplicitPathThenPathScoreThenContentScore(input.scan.files, terms);
    return enforceBudget(candidates);
  }
}
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "Scanner returns a real bounded file inventory for a selected project."
    - "Retriever returns relevant candidate excerpts for explicit path and lexical queries."
    - "No-match and blocked retrieval states are explicit and user-visible."
  integration:
    - "Existing chat context still renders retrieval evidence."
    - "SPEC 89 can consume retrieval candidates without reading the filesystem again for metadata."
  architectural:
    - "No LLM call is required for repository scanning or text retrieval."
    - "Scanner/retriever remain read-only and do not mutate project files."
  quality:
    - "Path escape, symlink, sensitive file, binary file, budget and concurrency tests exist."
  observability:
    - "Retrieval logs include project id, task id, total files, scanned files, omitted count and duration without file contents."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate shared retrieval contracts."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate scanner/retriever compilation."
      success_condition: "Exit code 0."
    - command: "node --test packages/shared/test/repositoryRetrieval.test.mjs apps/server/test/repositoryScanner.test.mjs apps/server/test/textRepositoryRetriever.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Validate safe repository access and retrieval ranking."
      success_condition: "All tests pass."
```

## 13. Error Mitigation And Handoff Rules

```yaml
error_mitigation:
  - "If project root cannot be resolved, fail retrieval instead of falling back to repository root."
  - "If selected paths are invalid, report blocked paths and continue only with remaining valid paths when safe."
  - "If budget is exceeded, return partial status and omitted counts, not unbounded content."
  - "Do not introduce fake files, canned project trees or mocked retrieval evidence in production code."

handoff_output_contract:
  - "List ignore and sensitive path policies."
  - "Report retrieval budget defaults."
  - "Report focused tests and any known unsupported languages."
```

## 14. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-28T19:10:00Z"
  implemented_by: "agent"
  summary:
    - "Added shared RepositoryRetrieval contracts with scan snapshots, file safety policy, retrieval candidates, excerpts, routing hints and blocked retrieval status."
    - "Added RepositoryScannerPort and TextRetrievalPort plus concrete read-only scanner/retriever services under application/coding."
    - "Centralized repository access policy for ignored dirs, sensitive files, binary detection, language inference, explicit path extraction, scoring and bounded concurrency."
    - "Refactored ReadOnlyCodeContextService to delegate scan/retrieval while preserving existing CodeContextBundle and chat evidence behavior."
    - "Wired scanner/retriever into CodingRuntimeOrchestrator composition so SPEC 87 lifecycle steps are real for scan and retrieval."
  files_changed:
    shared:
      - "packages/shared/src/entities/RepositoryRetrieval.ts"
      - "packages/shared/src/entities/CodeContext.ts"
      - "packages/shared/src/entities/HorusChat.ts"
      - "packages/shared/src/index.ts"
    backend:
      - "apps/server/src/application/ports/RepositoryRetrievalPort.ts"
      - "apps/server/src/application/ports/index.ts"
      - "apps/server/src/application/coding/RepositoryAccessPolicy.ts"
      - "apps/server/src/application/coding/RepositoryScanner.ts"
      - "apps/server/src/application/coding/TextRepositoryRetriever.ts"
      - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
      - "apps/server/src/infrastructure/http/server.ts"
    tests:
      - "packages/shared/test/repositoryRetrieval.test.mjs"
      - "apps/server/test/repositoryScanner.test.mjs"
      - "apps/server/test/textRepositoryRetriever.test.mjs"
  validation:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/repositoryRetrieval.test.mjs packages/shared/test/codingRuntime.test.mjs packages/shared/test/horusChat.test.mjs apps/server/test/repositoryScanner.test.mjs apps/server/test/textRepositoryRetriever.test.mjs apps/server/test/readOnlyCodeContextService.test.mjs apps/server/test/horusChatTurn.test.mjs apps/server/test/codingRuntimeOrchestrator.test.mjs apps/server/test/codingRoutes.test.mjs"
  known_limits:
    - "Retrieval is still lexical and path-symbol based; semantic embeddings and Tree-sitter AST evidence remain for SPEC 89+."
    - "Scanner/retriever are read-only and do not yet persist retrieval snapshots outside coding runtime artifacts."
```
