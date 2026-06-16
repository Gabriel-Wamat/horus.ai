---
format_version: "agentic_sdd.v1"
task_id: "feature-96-index-memory-lifecycle-and-context-budget"
title: "Index Memory Lifecycle And Context Budget"
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
  - "spec/features/66-agent-memory-and-runtime-skills-governance.md"
  - "spec/features/88-repository-scanner-and-text-retrieval.md"
  - "spec/features/95-embeddings-vector-retrieval-and-ranking.md"
---

# 96 - Index Memory Lifecycle And Context Budget

## 1. Original User Request

```yaml
raw_user_request: |
  Phase 2 — Repository Intelligence Layer: specs 92 a 96.
  Entrega inteligência real sobre o repositório: LSP, símbolos, grafo, embeddings, ranking e memória/index lifecycle.
```

## 2. System Interpretation

```yaml
system_translation: |
  Add lifecycle management for repository indexes and coding context memory so Horus can keep retrieval fresh,
  bounded and isolated across projects/tasks without context explosion or stale vectors.

expected_user_visible_result: |
  Horus responses stay grounded and fast across long sessions, with fewer irrelevant files and no unbounded
  memory growth.

expected_engineering_result: |
  Implement index versioning, invalidation, TTL cleanup, task-scoped memory, token budgeting and context packing
  contracts for the repository intelligence layer.
```

## 3. Product And Technical Context

```yaml
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  known_entrypoints:
    - "apps/server/src/application/services/AgentMemoryService.ts"
    - "apps/server/src/application/services/ChatContextAssembler.ts"
    - "apps/server/src/application/coding/RepositoryScanner.ts"
    - "apps/server/src/application/coding/SemanticRepositoryIndexer.ts"
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create RepositoryIndexManifest and ContextBudget contracts."
    - "Track index version, source file hashes, chunk hashes, embedding model id and createdAt."
    - "Invalidate stale chunks when file hashes change."
    - "Add task-scoped ephemeral memory for coding executions."
    - "Add context budgeter that packs user request, symbols, graph evidence, semantic chunks and recent chat history."
    - "Add cleanup policy for old index/memory records."
  out_of_scope:
    - "Cloud distributed indexing."
    - "Long-term product analytics."
    - "Changing LLM provider behavior."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/RepositoryIndex.ts"
      - "packages/shared/src/entities/ContextBudget.ts"
      - "apps/server/src/application/coding/RepositoryIndexLifecycleService.ts"
      - "apps/server/src/application/coding/ContextBudgeter.ts"
      - "apps/server/src/application/services/AgentMemoryService.ts"
  tests:
    unit:
      - "packages/shared/test/repositoryIndex.test.mjs"
      - "packages/shared/test/contextBudget.test.mjs"
      - "apps/server/test/repositoryIndexLifecycleService.test.mjs"
      - "apps/server/test/contextBudgeter.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  depends_on:
    - name: "Repository scanner"
      type: "backend_service"
      direction: "this_spec_consumes_dependency"
      contract_used: "RepositoryScanSnapshot.files modifiedAt/size/path"
      required_for: "Detect stale index records."
    - name: "Semantic indexer"
      type: "backend_service"
      direction: "this_spec_consumes_dependency"
      contract_used: "RepositoryChunk records and vector store ids"
      required_for: "Invalidate/rebuild embeddings."
    - name: "Agent memory"
      type: "backend_service"
      direction: "this_spec_consumes_dependency"
      contract_used: "AgentMemoryService scoped records"
      required_for: "Separate task-scoped context from long-term project memory."
  depended_on_by:
    - name: "ChatCodingPlanner"
      type: "backend_service"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "PackedCodingContext"
      compatibility_obligation: "Planner receives bounded context with token estimates and source labels."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  - "Context packing must be budgeted before LLM calls."
  - "Ephemeral task memory must not pollute long-term project memory by default."
  - "Stale semantic chunks must not outrank fresh lexical/symbol evidence."
  - "Index records must use relative paths and project ids, not absolute machine paths as stable ids."
```

## 8. Contracts And Invariants

```yaml
contracts:
  - name: "Repository index manifest"
    invariant: "Manifest records project id, index version, file hashes, chunk count and embedding model id."
  - name: "Context budget"
    invariant: "Packed context includes token estimate, included sources, omitted sources and truncation reasons."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Define index and context budget contracts"
  - step: 2
    name: "Implement lifecycle service with invalidation"
  - step: 3
    name: "Implement cleanup/TTL policy"
  - step: 4
    name: "Implement task-scoped memory and context budgeter"
  - step: 5
    name: "Integrate packed context into ChatCodingPlanner"
```

## 10. Pseudo-Code

```ts
class ContextBudgeter {
  pack(input: {
    request: string;
    symbols: SymbolEvidence[];
    graph: GraphContext;
    chunks: RankedChunk[];
    memory: ScopedMemory[];
    maxTokens: number;
  }): PackedCodingContext;
}
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  - "Changed files invalidate affected chunks and graph records."
  - "Packed context never exceeds configured token budget."
  - "Omitted context includes reason and score."
  - "Task memory is isolated by coding task id."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/repositoryIndex.test.mjs packages/shared/test/contextBudget.test.mjs apps/server/test/repositoryIndexLifecycleService.test.mjs apps/server/test/contextBudgeter.test.mjs apps/server/test/agentMemoryService.test.mjs apps/server/test/chatCodingPlanner.test.mjs"
```

## 13. Error Mitigation And Handoff Rules

```yaml
error_mitigation:
  - "If index is unavailable, use fresh scan/AST retrieval and mark semantic context unavailable."
  - "If token budget is too small, prioritize user request, target symbols, validation errors and direct file context."
```

## 14. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-28T23:59:00Z"
  summary:
    - "Added shared RepositoryIndex contracts for manifests, invalidation plans and cleanup plans."
    - "Added shared ContextBudget contracts for budget configs, packed context items and omitted-context evidence."
    - "Extended AgentMemoryScope with codingTaskId for task-scoped ephemeral memory isolation."
    - "Implemented RepositoryIndexLifecycleService for manifest creation, stale path/chunk invalidation and TTL cleanup planning."
    - "Implemented ContextBudgeter to pack user request, task memory, lexical candidates, semantic chunks, symbols and graph evidence under explicit token budgets."
    - "Integrated optional packed context output into ChatCodingPlanner through CodingContextBudgeterPort."
    - "Server only enables packed context when HORUS_CODING_CONTEXT_MAX_TOKENS is configured; no hidden token budget default is applied."
    - "Removed active model ids from .env.example so model selection remains explicit."
  files_added:
    - "packages/shared/src/entities/RepositoryIndex.ts"
    - "packages/shared/src/entities/ContextBudget.ts"
    - "apps/server/src/application/ports/ContextBudgetPort.ts"
    - "apps/server/src/application/coding/RepositoryIndexLifecycleService.ts"
    - "apps/server/src/application/coding/ContextBudgeter.ts"
    - "packages/shared/test/repositoryIndex.test.mjs"
    - "packages/shared/test/contextBudget.test.mjs"
    - "apps/server/test/repositoryIndexLifecycleService.test.mjs"
    - "apps/server/test/contextBudgeter.test.mjs"
  files_changed:
    - ".env.example"
    - "packages/shared/src/entities/AgentMemory.ts"
    - "packages/shared/src/index.ts"
    - "apps/server/src/application/ports/index.ts"
    - "apps/server/src/application/ports/ChatCodingPlannerPort.ts"
    - "apps/server/src/application/services/AgentMemoryService.ts"
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/application/coding/ChatCodingPlanner.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/test/agentMemoryService.test.mjs"
    - "apps/server/test/chatCodingPlanner.test.mjs"
```

## 15. Validation Evidence

```yaml
validation_evidence:
  focused_commands:
    - command: "pnpm --filter @u-build/shared build"
      status: "passed"
    - command: "pnpm --filter @u-build/server build"
      status: "passed"
    - command: "node --test packages/shared/test/repositoryIndex.test.mjs packages/shared/test/contextBudget.test.mjs apps/server/test/repositoryIndexLifecycleService.test.mjs apps/server/test/contextBudgeter.test.mjs apps/server/test/agentMemoryService.test.mjs apps/server/test/chatCodingPlanner.test.mjs"
      status: "passed"
      result: "19 tests passed"
    - command: "pnpm test"
      status: "passed"
      result: "377 tests passed"
    - command: "git diff --check -- <spec_96_touched_files>"
      status: "passed"
    - command: "rg -n \"gpt-5-mini|text-embedding|local-hash-embedding|modelId:\\s*\\\"|embeddingModel:\\s*\\\"|LLM_MODEL=gpt|MODEL=.*gpt\" <spec_96_touched_files>"
      status: "passed"
      result: "no hardcoded model ids found"
```
