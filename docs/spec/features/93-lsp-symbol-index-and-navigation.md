---
format_version: "agentic_sdd.v1"
task_id: "feature-93-lsp-symbol-index-and-navigation"
title: "LSP Symbol Index And Navigation"
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
  - "spec/features/89-tree-sitter-ast-analysis-spine.md"
  - "spec/features/92-chat-planner-structural-intent-runtime-bridge.md"
---

# 93 - LSP Symbol Index And Navigation

## 1. Original User Request

```yaml
raw_user_request: |
  Phase 2 — Repository Intelligence Layer: specs 92 a 96.
  Entrega inteligência real sobre o repositório: LSP, símbolos, grafo, embeddings, ranking e memória/index lifecycle.
```

## 2. System Interpretation

```yaml
system_translation: |
  Add an LSP-backed symbol intelligence layer so Horus can resolve definitions, references, diagnostics
  and safe rename candidates without relying only on lexical retrieval or Tree-sitter ranges.

expected_user_visible_result: |
  Coding edits become more precise: the planner can target real symbols, explain where they are defined and
  avoid applying local edits when references indicate a broader impact.

expected_engineering_result: |
  Add LspClientPort, TypeScript language-server adapter, symbol index contracts and tests for go-to-definition,
  references and diagnostics.
```

## 3. Product And Technical Context

```yaml
technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Language Server Protocol"
      - "Tree-sitter AST facts"
  known_entrypoints:
    - "apps/server/src/application/coding/AstAnalysisService.ts"
    - "apps/server/src/application/coding/AstPatchPlanner.ts"
    - "apps/server/src/application/ports/AstAnalyzerPort.ts"
  known_existing_patterns:
    - "AST analysis already extracts structural symbols."
    - "Patch planner currently supports local rename only."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create LspClientPort for initialize, documentSymbols, definition, references, diagnostics and shutdown."
    - "Add TypeScript/JavaScript LSP adapter using a local language server process."
    - "Create SymbolIndex contracts linking Tree-sitter symbols to LSP locations."
    - "Expose reference counts and definition locations to ChatCodingPlanner."
    - "Block global rename requests until references are fully resolved."
  out_of_scope:
    - "Python/Swift LSP adapters."
    - "Performing automatic global rename."
    - "Running arbitrary project commands through LSP."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/SymbolIndex.ts"
      - "apps/server/src/application/ports/LspClientPort.ts"
      - "apps/server/src/application/coding/SymbolIndexService.ts"
      - "apps/server/src/infrastructure/lsp/TypeScriptLspClient.ts"
  tests:
    unit:
      - "packages/shared/test/symbolIndex.test.mjs"
      - "apps/server/test/typeScriptLspClient.test.mjs"
      - "apps/server/test/symbolIndexService.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    LSP enriches AST symbols with project-aware semantics. Tree-sitter remains fast structural parsing;
    LSP answers language-aware questions that embeddings cannot answer reliably.

  depends_on:
    - name: "Tree-sitter AST analysis"
      type: "backend_service"
      direction: "this_spec_consumes_dependency"
      contract_used: "AstDocument, AstSymbol"
      required_for: "Seed symbol lookup and avoid scanning unrelated files."
      verification:
        - "apps/server/test/symbolIndexService.test.mjs"
  depended_on_by:
    - name: "ChatCodingPlanner"
      type: "backend_service"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "SymbolIndexResult with definitions/references/diagnostics"
      compatibility_obligation: "Planner receives additive symbol evidence; existing AST-only mode remains fallback."
      verification:
        - "apps/server/test/chatCodingPlanner.test.mjs"
```

## 7. Architecture Rules

```yaml
architecture_rules:
  - "LSP process lifecycle must be isolated and timeout-controlled."
  - "LSP diagnostics are evidence, not automatic writes."
  - "LSP must not replace Tree-sitter; it augments it."
  - "No project-wide rename without complete reference resolution and explicit user confirmation."
```

## 8. Contracts And Invariants

```yaml
contracts:
  - name: "Symbol index"
    invariant: "Each indexed symbol includes path, range, language, definition evidence and reference count when available."
  - name: "LSP diagnostics"
    invariant: "Diagnostics are scoped to projectRootPath and include severity, message, code and range."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Define symbol index contracts"
  - step: 2
    name: "Implement TypeScript LSP adapter with timeout and shutdown"
  - step: 3
    name: "Map AST symbols to LSP definitions/references"
  - step: 4
    name: "Expose symbol evidence to planner/retrieval"
  - step: 5
    name: "Validate with fixture repository"
```

## 10. Pseudo-Code

```ts
interface LspClientPort {
  initialize(projectRootPath: string): Promise<void>;
  definition(location: SymbolLocation): Promise<SymbolLocation[]>;
  references(location: SymbolLocation): Promise<SymbolLocation[]>;
  diagnostics(path: string): Promise<LspDiagnostic[]>;
  shutdown(): Promise<void>;
}
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  - "SymbolIndexService resolves definitions for TS/TSX fixture symbols."
  - "Reference counts are available for planner evidence."
  - "LSP process is stopped after task completion or timeout."
  - "No network or shell command path is added."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/symbolIndex.test.mjs apps/server/test/symbolIndexService.test.mjs apps/server/test/typeScriptLspClient.test.mjs"
```

## 13. Error Mitigation And Handoff Rules

```yaml
error_mitigation:
  - "If LSP is unavailable, fall back to AST-only evidence and mark symbol intelligence partial."
  - "If references exceed budget, return ranked sample plus total count."
```

## 14. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T23:58:00Z"
status: "implemented"
changes:
  shared_contracts:
    - "Added SymbolIndex contracts: SymbolLocation, LspDocumentSymbol, LspDiagnostic, SymbolIndexEntry and SymbolIndexResult."
  backend_ports:
    - "Added LspClientPort for initialize, documentSymbols, definition, references, diagnostics and shutdown."
    - "Added SymbolIndexPort for repository-scoped symbol index builds."
  backend_services:
    - "Added SymbolIndexService to enrich Tree-sitter AST symbols with definition/reference/diagnostic evidence under timeout and shutdown rules."
    - "Added TypeScriptLspClient backed by the local TypeScript language service, with no shell command path and no network access."
    - "Wired SymbolIndexService into ChatCodingPlanner as additive evidence."
    - "ChatCodingPlanner now blocks implicit/global rename requests and explicit unsafe rename_local intents when references are unresolved or broader than the declaration."
  dependency:
    - "Promoted TypeScript to @u-build/server runtime dependency because the local semantic client is used by backend runtime code."
  tests:
    - "Added shared SymbolIndex schema tests."
    - "Added TypeScriptLspClient definition/reference/diagnostic tests."
    - "Added SymbolIndexService integration tests."
    - "Extended ChatCodingPlanner tests for symbol evidence and rename blocking."
implementation_note: |
  The adapter exposes the LspClientPort contract and LSP-shaped operations, but uses the local TypeScript language service instead of spawning an arbitrary language-server process. This avoids shell/network paths while preserving real definitions, references, document symbols and diagnostics for TS/JS projects.
```

## 15. Validation Evidence

```yaml
commands:
  - command: "pnpm install --lockfile-only --ignore-scripts"
    status: "passed"
  - command: "pnpm --filter @u-build/shared build"
    status: "passed"
  - command: "pnpm --filter @u-build/server build"
    status: "passed"
  - command: "pnpm --filter @u-build/web test:guards"
    status: "passed"
  - command: "node --test packages/shared/test/symbolIndex.test.mjs apps/server/test/typeScriptLspClient.test.mjs apps/server/test/symbolIndexService.test.mjs apps/server/test/chatCodingPlanner.test.mjs apps/server/test/horusChatCodingRuntimeBridge.test.mjs apps/server/test/codingRuntimeOrchestrator.test.mjs apps/server/test/astAnalysisService.test.mjs apps/server/test/treeSitterAstAnalyzer.test.mjs"
    status: "passed"
known_limits:
  - "Python/Swift LSP adapters remain out of scope."
  - "Global rename is intentionally blocked; it needs a later dedicated spec for full reference-safe edits."
  - "The current client indexes retrieved TS/JS candidates. SPEC 94/96 will broaden this with graph/index lifecycle."
```
