---
format_version: "agentic_sdd.v1"
task_id: "feature-95-embeddings-vector-retrieval-and-ranking"
title: "Embeddings Vector Retrieval And Ranking"
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
  - "spec/features/83-provider-port-decoupling.md"
  - "spec/features/88-repository-scanner-and-text-retrieval.md"
  - "spec/features/94-repository-symbol-graph-and-dependency-map.md"
---

# 95 - Embeddings Vector Retrieval And Ranking

## 1. Original User Request

```yaml
raw_user_request: |
  Phase 2 — Repository Intelligence Layer: specs 92 a 96.
  Entrega inteligência real sobre o repositório: LSP, símbolos, grafo, embeddings, ranking e memória/index lifecycle.
```

## 2. System Interpretation

```yaml
system_translation: |
  Add semantic retrieval with embeddings and vector search, but keep it grounded by lexical matches, symbols
  and repository graph evidence. Embeddings are a ranking signal, not the only source of truth.

expected_user_visible_result: |
  Horus finds relevant code even when the user describes behavior semantically rather than naming files.

expected_engineering_result: |
  Implement chunking, embedding provider usage, vector store adapter, hybrid ranking and retrieval evidence.
```

## 3. Product And Technical Context

```yaml
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  known_entrypoints:
    - "apps/server/src/application/ports/EmbeddingProviderPort.ts"
    - "apps/server/src/application/ports/VectorStorePort.ts"
    - "apps/server/src/application/coding/TextRepositoryRetriever.ts"
    - "apps/server/src/application/coding/RepositoryGraphBuilder.ts"
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create RepositoryChunk and SemanticRetrieval contracts."
    - "Implement code-aware chunking by file, symbol and bounded text ranges."
    - "Use EmbeddingProviderPort and VectorStorePort rather than direct provider coupling."
    - "Implement hybrid ranking: lexical score + symbol score + graph proximity + vector similarity."
    - "Return retrieval evidence with score breakdown."
  out_of_scope:
    - "Hosted vector DB deployment."
    - "Training custom embeddings."
    - "Replacing AST/LSP/graph retrieval."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/SemanticRetrieval.ts"
      - "apps/server/src/application/coding/RepositoryChunker.ts"
      - "apps/server/src/application/coding/SemanticRepositoryIndexer.ts"
      - "apps/server/src/application/coding/HybridRetrievalRanker.ts"
  tests:
    unit:
      - "packages/shared/test/semanticRetrieval.test.mjs"
      - "apps/server/test/repositoryChunker.test.mjs"
      - "apps/server/test/hybridRetrievalRanker.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  depends_on:
    - name: "EmbeddingProviderPort"
      type: "application_port"
      direction: "this_spec_consumes_dependency"
      contract_used: "embed(text[])"
      required_for: "Create semantic vectors without coupling to OpenAI or any vendor."
    - name: "VectorStorePort"
      type: "application_port"
      direction: "this_spec_consumes_dependency"
      contract_used: "upsert/query/delete"
      required_for: "Store and query repository chunks."
    - name: "Repository graph"
      type: "backend_service"
      direction: "this_spec_consumes_dependency"
      contract_used: "RepositoryGraphSnapshot"
      required_for: "Boost nearby files and avoid semantically similar but disconnected noise."
  depended_on_by:
    - name: "ChatCodingPlanner"
      type: "backend_service"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "HybridRetrievalResult"
      compatibility_obligation: "Planner receives score breakdown and bounded context."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  - "Embeddings are optional and must fail soft to lexical/symbol retrieval."
  - "Never send entire files to embeddings when symbol/chunk boundaries exist."
  - "Ranking must expose score breakdown for debugging."
  - "Vector records must include content hash and index version."
```

## 8. Contracts And Invariants

```yaml
contracts:
  - name: "Repository chunk"
    invariant: "Chunk has path, range, symbol ids, content hash, token estimate and index version."
  - name: "Hybrid score"
    invariant: "Final score is explainable from lexical, vector, symbol and graph components."
```

## 9. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Define semantic retrieval contracts"
  - step: 2
    name: "Implement chunker"
  - step: 3
    name: "Implement semantic indexer through provider ports"
  - step: 4
    name: "Implement hybrid ranker"
  - step: 5
    name: "Integrate with retrieval service and planner"
```

## 10. Pseudo-Code

```ts
class HybridRetrievalRanker {
  rank(input): RankedContext[] {
    return combine({
      lexical: lexicalScore(input),
      vector: vectorSimilarity(input),
      symbol: symbolMatch(input),
      graph: graphProximity(input),
    });
  }
}
```

## 11. Acceptance Criteria

```yaml
acceptance_criteria:
  - "Semantic retrieval can find behaviorally relevant fixture code without exact term match."
  - "Lexical exact path/name matches outrank weak vector matches."
  - "Ranking evidence is persisted in retrieval artifact payload."
```

## 12. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/semanticRetrieval.test.mjs apps/server/test/repositoryChunker.test.mjs apps/server/test/hybridRetrievalRanker.test.mjs apps/server/test/semanticRepositoryIndexer.test.mjs apps/server/test/chatCodingPlanner.test.mjs"
```

## 13. Error Mitigation And Handoff Rules

```yaml
error_mitigation:
  - "If embedding provider fails or budget is exhausted, mark semantic retrieval unavailable and continue with lexical/symbol/graph retrieval."
  - "If vector index is stale, prefer source-of-truth scan/AST over stale semantic result."
```

## 14. Implementation Log

```yaml
implementation_log:
  implemented_at_utc: "2026-05-28T23:59:00Z"
  summary:
    - "Added shared RepositoryChunk and SemanticRetrieval contracts with score breakdown evidence."
    - "Added RepositoryChunker for AST symbol chunks with bounded text-window fallback."
    - "Added SemanticRepositoryIndexer over EmbeddingProviderPort and VectorStorePort."
    - "Added HybridRetrievalRanker combining lexical, vector, symbol, graph and explicit-path evidence."
    - "Integrated optional semantic retrieval into ChatCodingPlanner without application-layer coupling to concrete providers."
    - "Added infrastructure adapters for local hash embeddings and in-memory vector search."
    - "Server composition enables semantic retrieval only when HORUS_SEMANTIC_EMBEDDING_DIMENSIONS is configured."
    - "Embedding model id is never hardcoded; it is only emitted when HORUS_SEMANTIC_EMBEDDING_MODEL_ID is explicitly configured."
  files_added:
    - "packages/shared/src/entities/SemanticRetrieval.ts"
    - "apps/server/src/application/ports/SemanticRetrievalPort.ts"
    - "apps/server/src/application/coding/RepositoryChunker.ts"
    - "apps/server/src/application/coding/HybridRetrievalRanker.ts"
    - "apps/server/src/application/coding/SemanticRepositoryIndexer.ts"
    - "apps/server/src/infrastructure/embeddings/LocalHashEmbeddingProvider.ts"
    - "apps/server/src/infrastructure/vector/InMemoryVectorStore.ts"
    - "apps/server/src/infrastructure/semantic/createSemanticRepositoryRetrieval.ts"
    - "apps/server/test/repositoryChunker.test.mjs"
    - "apps/server/test/hybridRetrievalRanker.test.mjs"
    - "apps/server/test/semanticRepositoryIndexer.test.mjs"
  files_changed:
    - "packages/shared/src/index.ts"
    - "apps/server/src/application/ports/index.ts"
    - "apps/server/src/application/ports/ChatCodingPlannerPort.ts"
    - "apps/server/src/application/coding/ChatCodingPlanner.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "packages/shared/test/semanticRetrieval.test.mjs"
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
    - command: "node --test packages/shared/test/semanticRetrieval.test.mjs apps/server/test/repositoryChunker.test.mjs apps/server/test/hybridRetrievalRanker.test.mjs apps/server/test/semanticRepositoryIndexer.test.mjs apps/server/test/chatCodingPlanner.test.mjs"
      status: "passed"
      result: "13 tests passed"
    - command: "pnpm test"
      status: "passed"
      result: "365 tests passed"
    - command: "git diff --check -- <spec_95_touched_files>"
      status: "passed"
```
