---
format_version: "agentic_sdd.v1"
task_id: "feature-94-repository-symbol-graph-and-dependency-map"
title: "Repository Symbol Graph And Dependency Map"
created_at_utc: "2026-05-28T22:30:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_2_repository_intelligence_layer"
depends_on:
  - "spec/features/88-repository-scanner-and-text-retrieval.md"
  - "spec/features/89-tree-sitter-ast-analysis-spine.md"
  - "spec/features/93-lsp-symbol-index-and-navigation.md"
---

# 94 - Repository Symbol Graph And Dependency Map

## 1. Original User Request

```yaml
raw_user_request: |
  Phase 2 — Repository Intelligence Layer: specs 92 a 96.
  Entrega inteligência real sobre o repositório: LSP, símbolos, grafo, embeddings, ranking e memória/index lifecycle.
```

## 2. System Interpretation

```yaml
system_translation: |
  Build a repository graph that connects files, imports, exports, symbols and package boundaries so retrieval
  and patch planning understand impact radius instead of reading disconnected files.

expected_user_visible_result: |
  Horus can explain why it selected files, avoid editing unreachable files and identify related tests/components.

expected_engineering_result: |
  Add RepositoryGraph contracts, graph builder, dependency resolver and graph-aware retrieval hints.
```

## 3. Product And Technical Context

```yaml
technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  known_entrypoints:
    - "apps/server/src/application/coding/RepositoryScanner.ts"
    - "apps/server/src/application/coding/TextRepositoryRetriever.ts"
    - "apps/server/src/infrastructure/code/FrontendChangeSetQualityGate.ts"
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create RepositoryGraph contracts: nodes, edges, symbols, imports, exports and package scopes."
    - "Build import/dependency graph from scanned files and AST symbols."
    - "Map related tests and source files using naming conventions and import edges."
    - "Expose graph neighborhoods to retrieval and ChatCodingPlanner."
    - "Detect disconnected new-file edits before patch generation."
  out_of_scope:
    - "Embeddings/vector retrieval; SPEC 95 owns this."
    - "Runtime command execution; SPEC 91 owns this."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/RepositoryGraph.ts"
      - "apps/server/src/application/coding/RepositoryGraphBuilder.ts"
      - "apps/server/src/application/coding/GraphAwareRetrievalService.ts"
  tests:
    unit:
      - "packages/shared/test/repositoryGraph.test.mjs"
      - "apps/server/test/repositoryGraphBuilder.test.mjs"
      - "apps/server/test/graphAwareRetrievalService.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  depends_on:
    - name: "Repository scanner"
      type: "backend_service"
      direction: "this_spec_consumes_dependency"
      contract_used: "RepositoryScanSnapshot"
      required_for: "Get file set and safety state."
    - name: "AST analysis"
      type: "backend_service"
      direction: "this_spec_consumes_dependency"
      contract_used: "AstDocument.symbols"
      required_for: "Extract imports, exports and symbols."
  depended_on_by:
    - name: "Hybrid retrieval"
      type: "backend_service"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "RepositoryGraphSnapshot"
      compatibility_obligation: "Graph is additive evidence for ranking and context selection."
  data_flow:
    inbound:
      - source: "scan + AST"
        payload_or_state: "files, symbols, imports, exports"
    outbound:
      - target: "retrieval/planner"
        payload_or_state: "rankable graph neighborhoods and impact paths"
```

## 7. Architecture Rules

```yaml
architecture_rules:
  - "Graph builder is read-only."
  - "Graph snapshots must be deterministic for the same repository content."
  - "Graph nodes reference relative paths only, never machine-specific absolute paths."
  - "Graph traversal must enforce max depth and node budget."
```

## 8. Contracts And Invariants

```yaml
contracts:
  - name: "Repository graph"
    invariant: "Edges include source, target, edge kind and confidence."
  - name: "Impact neighborhood"
    invariant: "Traversal returns bounded nodes ordered by graph distance then confidence."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Define shared graph contracts"
  - step: 2
    name: "Build import/export graph from AST"
  - step: 3
    name: "Add related-test and package-boundary heuristics"
  - step: 4
    name: "Expose graph-aware retrieval candidates"
  - step: 5
    name: "Validate deterministic graph snapshots"
```

## 10. Pseudo-Code

```ts
interface RepositoryGraphBuilder {
  build(input: { scan: RepositoryScanSnapshot; ast: AstAnalysisResult }): RepositoryGraphSnapshot;
}

class GraphAwareRetrievalService {
  neighborhood(seedPaths: string[], depth: number): GraphContext;
}
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  - "Graph builder links imports to existing files in fixture projects."
  - "Related test files are included when target source files are retrieved."
  - "Disconnected file additions are detectable before patch planning."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/repositoryGraph.test.mjs apps/server/test/repositoryGraphBuilder.test.mjs"
```

## 13. Error Mitigation And Handoff Rules

```yaml
error_mitigation:
  - "If graph resolution is partial, attach partial reason and fall back to lexical/symbol retrieval."
```

## 14. Implementation Log

```yaml
implemented_at_utc: "2026-05-29T00:35:00Z"
status: "implemented"
changes:
  shared_contracts:
    - "Added RepositoryGraph contracts for nodes, edges, imports, exports, package scopes, graph summaries, bounded neighborhoods and connectivity diagnostics."
  backend_ports:
    - "Added RepositoryGraphBuilderPort and GraphAwareRetrievalPort."
  backend_services:
    - "Added RepositoryGraphBuilder to build deterministic read-only graphs from RepositoryScanSnapshot, Tree-sitter AST symbols and optional SymbolIndex references."
    - "Resolved relative TS/JS imports to scanned files, separated external package imports, emitted export evidence and package-scope edges."
    - "Added related source/test edges using filename conventions and preserved bounded traversal rules."
    - "Added GraphAwareRetrievalService to compute bounded neighborhoods, add related file candidates and assess disconnected new-file intents."
  planner_integration:
    - "ChatCodingPlanner now scans the repository safely before retrieval, builds RepositoryGraph evidence after AST/symbol indexing, exposes graphContext in planner results and expands selectedPaths with graph-related files."
    - "Explicit intents targeting files absent from retrieval now receive graph-aware connectivity diagnostics, including disconnected_new_file_edit before patch generation."
  tests:
    - "Added shared RepositoryGraph schema coverage."
    - "Added RepositoryGraphBuilder import/export/test/external dependency coverage."
    - "Added GraphAwareRetrievalService neighborhood and disconnected edit coverage."
    - "Extended ChatCodingPlanner coverage for graph-aware selected paths and disconnected new-file detection."
implementation_note: |
  Graph evidence is additive. If graph resolution is partial or unavailable, the planner keeps lexical, AST and symbol-index fallbacks instead of failing closed for unrelated safe edits.
```

## 15. Validation Evidence

```yaml
commands:
  - command: "pnpm --filter @u-build/shared build"
    status: "passed"
  - command: "pnpm --filter @u-build/server build"
    status: "passed"
  - command: "node --test packages/shared/test/repositoryGraph.test.mjs apps/server/test/repositoryGraphBuilder.test.mjs apps/server/test/graphAwareRetrievalService.test.mjs apps/server/test/chatCodingPlanner.test.mjs apps/server/test/symbolIndexService.test.mjs apps/server/test/typeScriptLspClient.test.mjs"
    status: "passed"
known_limits:
  - "Graph construction currently uses scanned files and retrieved AST candidates; persistent full-repository index lifecycle belongs to SPEC 96."
  - "Embeddings/vector ranking remains out of scope and belongs to SPEC 95."
```
