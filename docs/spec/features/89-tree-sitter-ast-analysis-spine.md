---
format_version: "agentic_sdd.v1"
task_id: "feature-89-tree-sitter-ast-analysis-spine"
title: "Tree-sitter AST Analysis Spine"
created_at_utc: "2026-05-28T18:21:43Z"
author: "agent"
target_mode: "new_project"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_1_minimal_viable_coding_agent"
depends_on:
  - "spec/features/35-project-code-intelligence-ast.md"
  - "spec/features/83-provider-port-decoupling.md"
  - "spec/features/87-coding-runtime-orchestrator-state-machine.md"
  - "spec/features/88-repository-scanner-and-text-retrieval.md"
---

# 89 - Tree-sitter AST Analysis Spine

## 1. Original User Request

```yaml
raw_user_request: |
  crie as specs 87 até 91

source_feature_request: |
  Phase 1 must include Tree-sitter parsing, AST analysis and structural code understanding before
  diff planning and code generation. The assistant must never rely purely on naive text replacement.
```

## 2. System Interpretation

```yaml
system_translation: |
  Create the AST analysis spine for the coding assistant. This SPEC must introduce Tree-sitter-backed
  parsing for candidate files, syntax diagnostics, symbol extraction and structural ranges. It must not
  perform edits yet; it prepares the safe structural inputs consumed by SPEC 90.

expected_user_visible_result: |
  Coding tasks can explain which symbols/files are being modified and fail early on unsupported or
  syntactically invalid files instead of attempting fragile text edits.

expected_engineering_result: |
  Horus gains an AstAnalyzerPort, TreeSitterAstAnalyzer implementation, language adapters for TS/JS first,
  and shared AST analysis contracts that feed patch planning and validation.
```

## 3. Product and Technical Context

```yaml
business_context:
  user_problem: "Naive string replacement breaks code, imports and syntax in coding-agent systems."
  target_user: "Developer/operator asking Horus to safely refactor or modify TypeScript/React projects."
  expected_outcome: "The runtime grounds planned edits in structural code facts before patch generation."
  product_surface:
    - "Coding assistant runtime"
    - "Project Files code intelligence"
    - "Preview chat evidence"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Tree-sitter"
      - "Zod"
    frontend:
      - "React/TypeScript generated projects as primary target"
    database:
      - "No migration required for initial analysis unless analysis cache is persisted."
    infrastructure:
      - "Optional parser cache under runtime data, not committed source."
  known_entrypoints:
    - "packages/shared/src/entities/CodeContext.ts"
    - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
    - "apps/server/src/infrastructure/project/ProjectDiffAnalyzer.ts"
    - "apps/server/src/infrastructure/code/FrontendChangeSetQualityGate.ts"
  known_existing_patterns:
    - "Shared contracts are Zod schemas."
    - "Generated target projects are primarily TypeScript/React/Vite."
    - "Future Python/Swift support must be adapter-based, not hardcoded into TypeScript parser code."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create shared AstAnalysisResult, AstDocument, AstSymbol and AstDiagnostic contracts."
    - "Create AstAnalyzerPort with language-adapter architecture."
    - "Implement Tree-sitter parser adapter for TypeScript, TSX, JavaScript and JSX."
    - "Extract top-level and nested symbols relevant to patch planning: imports, exports, functions, classes, variables, JSX components and hooks."
    - "Return stable structural ranges with byte offsets and line/column locations."
    - "Detect parse errors and unsupported languages explicitly."
    - "Feed analysis results into coding runtime artifacts."
  out_of_scope:
    - "Editing ASTs or applying patches."
    - "Full semantic type checking."
    - "LSP integration."
    - "Python/Swift parser implementation in this slice."
    - "Persisted semantic index or vector store."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/AstAnalysis.ts"
      - "apps/server/src/application/ports/AstAnalyzerPort.ts"
      - "apps/server/src/application/coding/AstAnalysisService.ts"
      - "apps/server/src/infrastructure/ast/TreeSitterAstAnalyzer.ts"
      - "apps/server/src/infrastructure/ast/languages/typescriptAdapter.ts"
    services:
      - "AstAnalysisService"
      - "TreeSitterAstAnalyzer"
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
      - "Future patch planner consumes AST facts."
  tests:
    unit:
      - "packages/shared/test/astAnalysis.test.mjs"
      - "apps/server/test/treeSitterAstAnalyzer.test.mjs"
      - "apps/server/test/astAnalysisService.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This SPEC sits between repository retrieval and patch planning. It turns retrieved files into structural
    evidence. It must not read arbitrary files independently except through validated retrieval candidates.

  depends_on:
    - name: "Repository retrieval candidates"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "this_spec_consumes_dependency"
      contract_used: "RetrievalCandidate[]"
      required_for: "Know which files are safe and relevant to parse."
      assumptions:
        - "SPEC 88 provides safe, project-local candidates."
      failure_modes:
        - "AST parser re-reads unsafe or irrelevant files and defeats retrieval budgets."
      fallback_or_recovery: "Reject candidates without readable safe path metadata."
      verification:
        - "apps/server/test/astAnalysisService.test.mjs"

    - name: "Tree-sitter language grammars"
      type: "external_dependency"
      owner: "npm dependency"
      direction: "this_spec_consumes_dependency"
      contract_used: "Parser.parse(source) and syntax tree traversal"
      required_for: "Language-agnostic syntax tree parsing."
      assumptions:
        - "Chosen Tree-sitter packages support Node 20 and ESM build."
      failure_modes:
        - "Native grammar install fails on local machines."
      fallback_or_recovery: "Fail adapter initialization with clear unsupported_parser error; do not fall back to regex edits."
      verification:
        - "pnpm --filter @u-build/server build"

  depended_on_by:
    - name: "AST patch planner"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "AstAnalysisResult"
      compatibility_obligation: "Must preserve symbol ids, ranges, import/export facts and diagnostics."
      expected_consumer_behavior: "Planner references symbols and ranges instead of brittle text snippets."
      migration_or_notification_required: false
      verification:
        - "SPEC 90 patch planner tests."

    - name: "AST validation gate"
      type: "backend_service"
      owner: "apps/server/application/coding"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "parse diagnostics and syntax error status"
      compatibility_obligation: "Diagnostics are additive and must include file path and range."
      expected_consumer_behavior: "Fail candidate patches that introduce parse errors."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/treeSitterAstAnalyzer.test.mjs"

  data_flow:
    inbound:
      - source: "Text retrieval"
        payload_or_state: "safe candidate path and bounded source content"
        validation: "Candidate path, language and byte budget."
    outbound:
      - target: "Patch planner"
        payload_or_state: "symbols, imports, exports, syntax tree ranges, diagnostics"
        compatibility: "Stable schema with explicit unsupported language state."

  integration_risks:
    - risk: "AST layer grows into a language-specific monolith."
      severity: "high"
      mitigation: "Use language adapter registry and keep shared result schema language-neutral."
    - risk: "Parser errors are ignored and planner generates unsafe patches."
      severity: "critical"
      mitigation: "Diagnostics must block structural edits unless user explicitly asks for syntax repair."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "AST analysis is read-only."
    - "Tree-sitter handles syntax structure; LLMs do not invent symbol locations."
    - "Language support must be adapter-based."
    - "Unsupported languages fail explicitly."
    - "Parse diagnostics must be first-class runtime artifacts."
  project_specific:
    - "TS/TSX/JS/JSX are the first supported languages."
    - "No regex-only symbol extraction for supported languages."
    - "AST analysis output must be compact enough for context budgeting."
```

## 8. Contracts and Invariants

```yaml
contracts:
  domain_contracts:
    - name: "AST document"
      producer: "AstAnalyzerPort"
      consumers:
        - "PatchPlanner"
        - "AstValidationGate"
      invariant: "Document path, language, content hash and parse status must match the retrieved source."
    - name: "Symbol identity"
      producer: "TreeSitterLanguageAdapter"
      consumers:
        - "PatchPlanner"
        - "Future symbol index"
      invariant: "Symbol ids are deterministic for path, symbol kind, name and start position."
  data_contracts:
    - name: "AST diagnostics"
      producer: "TreeSitterAstAnalyzer"
      consumers:
        - "CodingRuntimeOrchestrator"
        - "Preview chat UI"
      migration_required: false
      compatibility_notes: "Diagnostics are append-only and can be displayed as evidence."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Choose Tree-sitter dependency strategy"
    agent: "architect"
    action: "Verify Node 20/ESM compatibility and decide grammar packages for TS/JS."
    expected_output: "Dependency plan with install/build risks."
  - step: 2
    name: "Define shared AST contracts"
    agent: "backend_specialist"
    action: "Add AstAnalysis schemas for documents, symbols, ranges and diagnostics."
    expected_output: "Shared contract tests."
  - step: 3
    name: "Create AST analyzer port and service"
    agent: "backend_specialist"
    action: "Add application-level AstAnalyzerPort and runtime service consuming retrieval candidates."
    expected_output: "Service tests with fake in-memory candidates only at test boundary."
  - step: 4
    name: "Implement TypeScript Tree-sitter adapter"
    agent: "backend_specialist"
    action: "Parse TS/TSX/JS/JSX and extract imports, exports, components, functions, classes, variables and hooks."
    expected_output: "Fixture tests for representative React/Node files."
  - step: 5
    name: "Connect AST artifacts to coding runtime"
    agent: "architect"
    action: "Make SPEC 87 orchestrator store AST results as runtime artifacts."
    expected_output: "Task event includes parse status and symbol counts."
  - step: 6
    name: "Validate"
    agent: "qa_specialist"
    action: "Run shared/server builds and AST focused tests."
    expected_output: "Validation evidence and unsupported-language notes."
```

## 10. Pseudo-Code

```ts
interface AstAnalyzerPort {
  analyze(input: {
    candidates: RetrievalCandidate[];
    signal: AbortSignal;
  }): Promise<AstAnalysisResult>;
}

interface TreeSitterLanguageAdapter {
  supports(language: string, path: string): boolean;
  parse(document: SourceDocument): Promise<AstDocument>;
  extractSymbols(document: AstDocument): AstSymbol[];
}

class AstAnalysisService {
  async analyze(input: AnalyzeInput): Promise<AstAnalysisResult> {
    return Promise.all(input.candidates.map((candidate) => {
      const adapter = this.registry.find(candidate.language, candidate.path);
      if (!adapter) return unsupported(candidate);
      return adapter.parse(toSourceDocument(candidate));
    }));
  }
}
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "TS, TSX, JS and JSX files parse into AST documents with symbol summaries."
    - "Syntax errors produce diagnostics and block unsafe patch planning."
    - "Unsupported languages return explicit unsupported status."
  integration:
    - "AST analyzer consumes SPEC 88 retrieval candidates without bypassing safety budgets."
    - "SPEC 90 can locate imports, exports and target symbols from AST results."
  architectural:
    - "No edit or write operation exists in the AST analysis service."
    - "Language support is registered through adapters."
  quality:
    - "Fixture tests cover React components, hooks, imports, exports, server functions and syntax errors."
  observability:
    - "AST analysis logs file count, language count, diagnostics count and duration without logging full source."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/shared build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate AST contract compilation."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate Tree-sitter integration compilation."
      success_condition: "Exit code 0."
    - command: "node --test packages/shared/test/astAnalysis.test.mjs apps/server/test/treeSitterAstAnalyzer.test.mjs apps/server/test/astAnalysisService.test.mjs"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate parser behavior and AST result contracts."
      success_condition: "All tests pass."
```

## 13. Error Mitigation And Handoff Rules

```yaml
error_mitigation:
  - "If Tree-sitter dependency fails locally, stop and report install/runtime blocker instead of implementing regex fallback."
  - "If a file has parse errors, mark diagnostics and block structural edits unless task is syntax repair."
  - "Do not send full AST trees to LLM prompts; summarize symbols and precise ranges."
  - "Do not parse files that SPEC 88 marked blocked, binary or over budget."

handoff_output_contract:
  - "List supported languages and unsupported-language behavior."
  - "Report parser dependencies added."
  - "Report fixture coverage and known grammar limitations."
```

## 14. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-28T20:10:00Z"
  implemented_by: "agent"
  summary:
    - "Added shared AST analysis contracts for ranges, diagnostics, symbols, documents, summaries and analysis status."
    - "Added AstAnalyzerPort and AstAnalysisService so AST analysis consumes SPEC 88 retrieval candidates without direct filesystem reads."
    - "Added TreeSitterAstAnalyzer with adapter registry and TypeScriptTreeSitterAdapter for TS, TSX, JS and JSX candidates."
    - "Extracted import/export/function/class/method/type/interface/variable/component/hook symbols with deterministic ids and Tree-sitter ranges."
    - "Wired AST analysis into the coding runtime composition as the astAnalyzer step."
  parser_dependencies:
    - "tree-sitter@0.21.1"
    - "tree-sitter-typescript@0.23.2"
  supported_languages:
    - "typescript"
    - "tsx"
    - "javascript"
    - "jsx"
  unsupported_language_behavior: "Returns explicit unsupported_language AST documents with blocking diagnostics; no regex fallback is used."
  files_changed:
    shared:
      - "packages/shared/src/entities/AstAnalysis.ts"
      - "packages/shared/src/index.ts"
    backend:
      - "apps/server/src/application/ports/AstAnalyzerPort.ts"
      - "apps/server/src/application/ports/index.ts"
      - "apps/server/src/application/coding/AstAnalysisService.ts"
      - "apps/server/src/infrastructure/ast/TreeSitterAstAnalyzer.ts"
      - "apps/server/src/infrastructure/ast/languages/TreeSitterLanguageAdapter.ts"
      - "apps/server/src/infrastructure/ast/languages/typescriptAdapter.ts"
      - "apps/server/src/types/tree-sitter-grammars.d.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/package.json"
      - "pnpm-lock.yaml"
    tests:
      - "packages/shared/test/astAnalysis.test.mjs"
      - "apps/server/test/treeSitterAstAnalyzer.test.mjs"
      - "apps/server/test/astAnalysisService.test.mjs"
      - "apps/server/test/codingRuntimeAstIntegration.test.mjs"
  validation:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/astAnalysis.test.mjs apps/server/test/treeSitterAstAnalyzer.test.mjs apps/server/test/astAnalysisService.test.mjs apps/server/test/codingRuntimeAstIntegration.test.mjs"
  known_limits:
    - "This slice analyzes structure only; AST editing, patch planning and rollback remain in SPEC 90."
    - "No semantic type checking or LSP diagnostics are performed in this slice."
```
