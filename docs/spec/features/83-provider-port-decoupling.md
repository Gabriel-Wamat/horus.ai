---
format_version: "agentic_sdd.v1"
task_id: "feature-83-provider-port-decoupling"
title: "Provider Port Decoupling"
created_at_utc: "2026-05-28T15:35:42Z"
author: "agent"
target_mode: "refactor"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented-partial"
depends_on:
  - "spec/features/75-monolith-decomposition.md"
  - "spec/features/79-agentic-runtime-isolation.md"
  - "spec/features/81-agentic-llm-tool-abort-and-distributed-breaker.md"
---

# 83 - Provider Port Decoupling

## 1. Original User Request

```yaml
raw_user_request: |
  você deve remover TODO acoplamento, faça um mapeamento detalhado, e em seguida corrija

  Isso muda completamente o futuro do projeto.

  Peça para:

  * remover dependências diretas
  * criar interfaces
  * criar providers
  * criar adapters
  * criar abstrações de modelos LLM
  * abstrações de vector DB
  * abstrações de embeddings
  * abstrações de storage
  * abstrações de filas
```

## 2. System Interpretation

```yaml
system_translation: |
  Mapear acoplamentos diretos que impedem evolução production-grade e iniciar uma migração por portas,
  providers e adapters. A correção desta SPEC não promete eliminar todo acoplamento histórico em uma
  única alteração; ela cria os contratos corretos, remove o acoplamento crítico de LLM da camada de
  aplicação do Horus/Odin e define os próximos cortes obrigatórios.

expected_user_visible_result: |
  Nenhuma mudança visual. O comportamento do chat/intent router deve continuar o mesmo, mas agora
  a implementação pode receber provider de LLM por injeção.

expected_engineering_result: |
  Application layer deixa de depender diretamente de infrastructure/llm no intent router; existem
  portas explícitas para LLM, embeddings, vector DB, storage e filas; infrastructure fornece o adapter
  LangChain atual; testes impedem regressão do acoplamento crítico.
```

## 3. Coupling Map

```yaml
findings:
  - name: "Application service acoplado a provider concreto de LLM"
    severity: "critical"
    locations:
      - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
    evidence: "Importava createChatModel e invokeChatModel de infrastructure/llm."
    impact: "Bloqueia DI, testes sem LLM real, troca de provider, isolamento por tenant e fallback por provider."
    correction_this_slice: "Introduzir LlmModelProviderPort e injetar provider no LlmHorusIntentClassifier."
    future_risk_if_left: "Cada caso de uso novo tende a chamar infra diretamente e espalhar provider-specific code."
    priority: 1

  - name: "Agentes concretos ainda instanciam LLM diretamente"
    severity: "high"
    locations:
      - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/HorusChatAgentImpl.ts"
    evidence: "Chamadas diretas a createChatModel/invokeChatModel permanecem dentro de infrastructure."
    impact: "Aceitável temporariamente por estarem na camada de infra, mas dificulta composição de adapters por tenant e fallback centralizado."
    correction_next_slice: "Fazer agents receberem LlmModelProvider no construtor pelo composition root."
    priority: 2

  - name: "Application/usecases importam contratos de repositories de infrastructure"
    severity: "critical"
    locations:
      - "apps/server/src/application/services/AgentMemoryService.ts"
      - "apps/server/src/application/services/ArtifactCandidateService.ts"
      - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
      - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
      - "apps/server/src/application/usecases/StartProjectConstructionUseCase.ts"
      - "apps/server/src/application/tools/registerProjectAgentTools.ts"
    evidence: "Importavam ../../infrastructure/repositories/contracts.js."
    impact: "Inverte Clean Architecture: application passa a conhecer pacote de infra."
    correction_this_slice: "Contratos movidos para application/ports/RepositoryPorts.ts; infrastructure/repositories/contracts.ts virou re-export de compatibilidade."
    priority: 3

  - name: "Preview runtime tratado como classe concreta em usecases"
    severity: "high"
    locations:
      - "apps/server/src/application/usecases/ListFrontendProjectsUseCase.ts"
      - "apps/server/src/application/usecases/CreatePreviewSessionUseCase.ts"
      - "apps/server/src/application/usecases/StartPreviewSessionUseCase.ts"
      - "apps/server/src/application/usecases/StopPreviewSessionUseCase.ts"
      - "apps/server/src/application/usecases/ReloadPreviewSessionUseCase.ts"
      - "apps/server/src/application/usecases/GetPreviewSessionUseCase.ts"
      - "apps/server/src/application/usecases/SetPreviewDeviceUseCase.ts"
      - "apps/server/src/application/usecases/ListPreviewTimelineUseCase.ts"
      - "apps/server/src/application/usecases/CreateVisualInstructionDraftUseCase.ts"
    evidence: "Usecases dependiam de PreviewRuntimeManager em infrastructure/preview."
    impact: "Dificulta mocks, alternate runtimes, multi-process runtime e contratos estáveis de preview."
    correction_this_slice: "Criado PreviewRuntimePort e usecases migrados para a porta."
    priority: 4

  - name: "Domain orchestration conhece detalhes de infra LangGraph/LLM runtime"
    severity: "critical"
    locations:
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    evidence: "Importava PendingRetryApproval de infrastructure/langgraph/state e runtimeLlmSettings de infrastructure/llm."
    impact: "O domínio fica preso ao framework e ao modo atual de resolução de settings."
    correction_this_slice: "Introduzidos RuntimeLlmSettingsStore e WorkflowGraphStatePort; WorkflowOrchestrator não importa mais infrastructure."
    priority: 5

  - name: "Embeddings e vector DB inexistem como contratos formais"
    severity: "high"
    locations:
      - "apps/server/src/application/ports"
    evidence: "Não havia interfaces para embedding provider ou vector store."
    impact: "Qualquer RAG/memória semântica futura tenderia a nascer acoplada ao primeiro vendor."
    correction_this_slice: "Criar EmbeddingProviderPort e VectorStorePort sem implementar provider falso."
    priority: 6

  - name: "Fila/outbox sem abstração genérica de queue"
    severity: "high"
    locations:
      - "apps/server/src/infrastructure/repositories/contracts.ts"
      - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
      - "apps/server/src/infrastructure/repositories/*AgentExecutionLedger*"
    evidence: "Sem QueueProviderPort genérico; ledger/outbox mistura persistência de execução com semântica de fila."
    impact: "Dificulta trocar outbox por queue externa, testar lease/DLQ e operar múltiplas réplicas."
    correction_this_slice: "Criar QueueProviderPort com enqueue/lease/ack/release/deadLetter."
    priority: 7

  - name: "Storage parcialmente abstraído, mas espalhado em shared/domain"
    severity: "medium"
    locations:
      - "packages/shared/src/ports/IStorageProvider.ts"
      - "apps/server/src/infrastructure/storage/*"
    evidence: "Já existe IStorageProvider; faltava porta local explícita no mapa de aplicação."
    impact: "Menor que os demais, mas o contrato precisa aparecer junto aos demais ports."
    correction_this_slice: "Criar StorageProviderPort reexportando WorkflowStateStorageProvider."
    priority: 8
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create application provider ports for LLM, embeddings, vector DB, storage and queue."
    - "Create a LangChain adapter implementing the LLM provider port."
    - "Remove direct infrastructure LLM dependency from HorusOdinIntentRouter."
    - "Wire the infrastructure composition root to inject the LLM provider."
    - "Add regression tests for injected classifier and application boundary."
    - "Document remaining decoupling backlog with severity."
  out_of_scope:
    - "Rewrite every agent implementation in this slice."
    - "Move all repository contracts in this slice."
    - "Add a real vector database or embedding provider before a product use case exists."
    - "Change public HTTP behavior."
    - "Rename stable shared entities."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/application/ports/*"
      - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
      - "apps/server/src/infrastructure/llm/LangChainLlmModelProvider.ts"
      - "apps/server/src/infrastructure/http/server.ts"
    services:
      - "HorusOdinIntentRouter"
      - "LlmHorusIntentClassifier"
      - "LangChainLlmModelProvider"
    database:
      migrations_required: false
  frontend:
    files: []
    components: []
  workflow:
    graph_nodes: []
    agents:
      - "Horus conversational intent classifier"
  tests:
    unit:
      - "apps/server/test/providerPorts.test.mjs"
      - "apps/server/test/horusOdinIntentRouter.test.mjs"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This work inserts stable application ports between Horus application services and vendor/framework
    implementations. Infrastructure remains responsible for LangChain, concrete model providers and
    Express composition.

  depends_on:
    - name: "LangChain chat model infrastructure"
      type: "internal_module"
      owner: "apps/server/infrastructure/llm"
      direction: "this_spec_consumes_dependency"
      contract_used: "createChatModel(role, defaults, settings) and invokeChatModel(model, input, signal)"
      required_for: "Preserve current LLM behavior behind a provider adapter."
      failure_modes:
        - "Provider env missing or model invocation fails."
      fallback_or_recovery: "Existing provider config errors remain surfaced; fallback policy is a later provider-level enhancement."
      verification:
        - "pnpm --filter @u-build/server build"

    - name: "Express composition root"
      type: "backend_service"
      owner: "apps/server/infrastructure/http"
      direction: "this_spec_consumes_dependency"
      contract_used: "createApp(options)"
      required_for: "Inject LangChainLlmModelProvider into HorusOdinIntentRouter."
      failure_modes:
        - "createApp without injected router must still compose a working classifier."
      fallback_or_recovery: "Tests cover injected classifier path; createApp composition is type-checked."
      verification:
        - "server build"

  depended_on_by:
    - name: "Horus preview chat turn use case"
      type: "internal_module"
      owner: "apps/server/application/usecases"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "HorusOdinIntentRouter.classify(input)"
      compatibility_obligation: "Must preserve classify contract and shared HorusChatIntent schema."
      expected_consumer_behavior: "Use case keeps receiving a router, unaware of provider details."
      migration_or_notification_required: false
      verification:
        - "horusOdinIntentRouter tests"

    - name: "Future semantic memory and RAG features"
      type: "future_internal_module"
      owner: "unknown"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "EmbeddingProvider and VectorStore ports"
      compatibility_obligation: "Do not bind future RAG to a vendor-specific SDK at application boundary."
      expected_consumer_behavior: "Use ports and receive concrete adapters from composition root."
      migration_or_notification_required: false
      verification:
        - "type-check"

  data_flow:
    inbound:
      - source: "Preview chat HTTP route"
        payload_or_state: "ChatAgentContextBundle and user message"
        validation: "HorusChatIntentSchema"
    outbound:
      - target: "LLM provider adapter"
        payload_or_state: "structured prompt and zod schema"
        persistence: "none"
```

## 7. Architecture Rules

```yaml
architecture_rules:
  - "Application and domain layers must not import infrastructure/llm directly."
  - "Concrete vendor SDKs stay in infrastructure adapters."
  - "Ports must use domain/application language, not vendor-specific names."
  - "Do not create fake embedding/vector providers that silently pretend retrieval works."
  - "Composition roots may know both ports and adapters."
  - "Every new provider must support AbortSignal where the underlying SDK allows it."
  - "Queue contracts must model lease, ack, release and dead-letter explicitly."
```

## 8. Execution Plan

```yaml
execution_plan:
  phase_1_this_slice:
    - "Add LlmModelProviderPort, EmbeddingProviderPort, VectorStorePort, QueueProviderPort and StorageProviderPort."
    - "Add LangChainLlmModelProvider adapter over existing createChatModel/invokeChatModel."
    - "Refactor LlmHorusIntentClassifier to require LlmModelProvider injection."
    - "Wire createApp to instantiate LangChainLlmModelProvider and inject classifier."
    - "Add regression tests for provider injection and no infrastructure/llm import."
    - "Run focused build/tests."

  phase_2_required_next:
    - "Move repository contracts from infrastructure/repositories/contracts.ts to application/ports/repositories."
    - "Update application services/usecases to import repository ports from application."
    - "Keep infrastructure/repositories/contracts.ts as compatibility re-export during migration."
    status: "implemented"

  phase_3_required_next:
    - "Introduce PreviewRuntimePort and ProjectToolPort to remove concrete infrastructure preview/project imports from usecases."
    - "Make PreviewRuntimeManager implement the port."
    status: "implemented for application/usecase boundary; infrastructure manager remains structural adapter."

  phase_4_required_next:
    - "Introduce WorkflowGraphPort and LlmSettingsProviderPort to decouple WorkflowOrchestrator from LangGraph/runtime LLM infra."
    - "Move LangGraph-specific state details to infrastructure adapter boundaries."
    status: "partially implemented; domain no longer imports infrastructure, but WorkflowGraphRunner still models a LangGraph-like stream/getState contract."

  phase_5_required_next:
    - "Inject LlmModelProvider into Spec/Front/QA/Curator/Horus agents from composition root."
    - "Add provider fallback/circuit policy at provider layer, not inside each agent."
```

## 9. Validation

```yaml
validation_commands:
  focused:
    - "pnpm --filter @u-build/server build"
    - "node --test apps/server/test/horusOdinIntentRouter.test.mjs apps/server/test/providerPorts.test.mjs"
  full:
    - "pnpm verify:ci"

acceptance_criteria:
  - "HorusOdinIntentRouter.ts has no infrastructure/llm import."
  - "LlmHorusIntentClassifier receives LlmModelProvider through constructor."
  - "createApp composes the default LangChain provider only in infrastructure."
  - "Ports exist for LLM, embeddings, vector DB, storage and queue."
  - "Application and domain layers have zero direct infrastructure imports."
  - "Tests pass and protect the application boundary."
```

## 10. Implementation Log

```yaml
implemented:
  - "Added application provider ports under apps/server/src/application/ports."
  - "Moved repository contracts to application/ports/RepositoryPorts.ts and kept infrastructure contracts as a compatibility re-export."
  - "Added PreviewRuntimePort and ProjectServicesPort for preview/project/tool boundaries."
  - "Added LangChainLlmModelProvider adapter under apps/server/src/infrastructure/llm."
  - "Added RuntimeLlmSettingsStore domain port and infrastructure adapter."
  - "Added WorkflowGraphStatePort and removed domain import of infrastructure/langgraph/state."
  - "Refactored HorusOdinIntentRouter to depend on injected HorusIntentClassifier only."
  - "Refactored LlmHorusIntentClassifier to depend on injected LlmModelProvider."
  - "Updated HTTP composition root to inject LangChainLlmModelProvider and RuntimeLlmSettingsStoreAdapter."
  - "Updated project agent tool registration and project construction use case to receive project service ports."
  - "Added providerPorts regression tests."

residual_risk:
  - "Application/domain no longer import infrastructure directly, but some ports remain broad because they preserve existing contracts during migration."
  - "Vector DB and embeddings are now ports only; no product feature currently requires a concrete adapter."
  - "Provider-level fallback/routing policy remains future work."
  - "Infrastructure agents still instantiate LLM models directly inside infrastructure; provider injection into every concrete agent remains the next cleanup."
```
