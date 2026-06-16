---
format_version: "agentic_sdd.v1"
task_id: "feature-66-agent-memory-and-runtime-skills-governance"
title: "Agent Memory And Runtime Skills Governance"
created_at_utc: "2026-05-27T17:09:18Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "implemented"
depends_on:
  - "spec/features/60-agent-skill-registry-backend.md"
  - "spec/features/61-agent-skill-catalog-frontend.md"
  - "spec/features/64-durable-agent-execution-ledger-and-outbox.md"
  - "spec/features/65-event-sourced-chat-and-progress-streaming.md"
research_catalog: "spec/notes/ai-agent-engineering-strategy-catalog.md"
---

# 66 - Agent Memory And Runtime Skills Governance

## 1. Original User Request

```yaml
raw_user_request: |
  quero que faça uma revisão rigorosa de todos os pontos que precisam ser refatorados na parte de agentes, chat, salvamento de dados, memória dos agentes e da conversa etc. todas as boas práticas que faltam

  pesquise quais são melhores práticas de engenharia de IA(no arxiv, medium, github, fóruns, reddit) para resolver esse tipo de problema, após isso catalogue as estratégias. em seguida, use a skill de criar spec para planeja a solução desse problema, (analise quantas specs são necessárias, para que você consiga detalhar rigorosamente e ter o máximo de contexto para solucionar de forma cirúrgica)
```

## 2. System Interpretation

```yaml
system_translation: |
  Planejar uma camada explícita de memória para agentes e conversa, separando working memory, event/episodic memory,
  semantic memory, procedural skills e project constraints. Conectar a AgentSkillRegistry ao runtime real dos agentes
  para que skills criadas pelo usuário sejam usadas, auditadas e versionadas.

expected_user_visible_result: |
  O Horus lembra decisões relevantes do projeto, não carrega histórico bruto infinito, usa skills ativas de forma previsível
  e permite ao usuário entender quais memórias/skills influenciaram uma resposta ou execução.

expected_engineering_result: |
  Criar contratos de memória, summarization, retrieval, skill injection, budget e auditoria. Remover dependência de prompts
  com chat cru e skills hardcoded como única fonte procedural.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Agentes perdem contexto, confundem projetos, usam histórico cru demais e não usam skills cadastradas como uma ferramenta real."
  target_user: "Usuário que espera continuidade entre conversas, execução por projeto e agentes especializados."
  expected_outcome: "Memória fica útil, auditável e limitada por escopo."
  product_surface:
    - "Horus chat"
    - "Agent workflow prompts"
    - "Skills catalog"
    - "Agent flow inspector"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "AgentSkillRegistryService"
      - "loadAgentSkill"
      - "LangGraph nodes"
      - "HorusOdinIntentRouter"
    frontend:
      - "Skills catalog UI"
      - "Preview chat evidence"
    database:
      - "agent_skills"
      - "agent_skill_revisions"
      - "agent_skill_usage_events"
      - "chat_messages/chat events"
      - "new memory tables"
    infrastructure:
      - "Zod contracts"
      - "Postgres/file mode"
  known_entrypoints:
    - "apps/server/src/infrastructure/agentSkills/AgentSkillRegistryService.ts"
    - "apps/server/src/infrastructure/agentSkills/loadAgentSkill.ts"
    - "apps/server/src/infrastructure/langgraph/dependencies.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/*AgentNode.ts"
    - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
    - "packages/shared/src/entities/AgentSkill.ts"
    - "packages/shared/src/entities/ChatMemory.ts"
  known_existing_patterns:
    - "Static filesystem skills under skills/agents are currently loaded directly."
    - "Runtime skill registry exists but is not wired into LangGraph agent prompt construction."
    - "Chat context currently exposes all messages and previousAgentResults."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Define memory taxonomy and storage contracts for Horus."
    - "Add rolling conversation summaries scoped by session/project/user story."
    - "Add agent episodic memory from workflow events and validation outcomes."
    - "Add semantic/project fact memory with source and confidence."
    - "Wire AgentSkillRegistry runtime skills into Spec/Front/QA/Curator/Odin prompts."
    - "Audit skill use with run/attempt IDs."
    - "Add context budget policy and prompt assembly diagnostics."
    - "Add poisoning/staleness controls for memories."
  out_of_scope:
    - "Vector database vendor integration as a hard requirement."
    - "Replacing source-code search with semantic memory."
    - "Making private chain-of-thought visible."
    - "UI-heavy memory browser beyond minimal evidence/diagnostics."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/ChatMemory.ts"
      - "packages/shared/src/entities/AgentSkill.ts"
      - "apps/server/src/infrastructure/agentSkills/AgentSkillRegistryService.ts"
      - "apps/server/src/infrastructure/agentSkills/loadAgentSkill.ts"
      - "apps/server/src/infrastructure/langgraph/dependencies.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/specAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
      - "apps/server/src/application/services/HorusOdinIntentRouter.ts"
    services:
      - "AgentMemoryService"
      - "PromptContextAssembler"
      - "AgentSkillRegistryService"
    database:
      migrations_required: true
      tables:
        - "agent_memory_items"
        - "agent_memory_summaries"
        - "agent_memory_links"
        - "agent_skill_usage_events"
  frontend:
    files:
      - "apps/web/src/components/PreviewConversationPanel.tsx"
      - "apps/web/src/features/agent-skills/*"
    components:
      - "Skill catalog"
      - "Chat evidence"
  workflow:
    graph_nodes:
      - "all agent nodes"
    agents:
      - "Spec"
      - "Odin"
      - "Front"
      - "QA"
      - "Curator"
      - "Horus"
  tests:
    unit:
      - "prompt context budget tests"
      - "runtime skill injection tests"
      - "memory summarization tests"
    integration:
      - "chat uses summary and scoped facts"
      - "agent run audits skill usage"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    This spec makes memory and skills first-class inputs to agent prompts, but only after spec 64/65 provide durable
    run and chat event identities. It must not let memory override real code evidence, specs or validation gates.

  depends_on:
    - name: "Chat event stream"
      type: "database"
      owner: "spec 65"
      direction: "this_spec_consumes_dependency"
      contract_used: "sequenced chat events with session/project/story/run metadata"
      required_for: "Build summaries and episodic memory from durable history."
      assumptions:
        - "Legacy chat messages can be adapted during migration."
      failure_modes:
        - "Memory summary misses recent execution."
      fallback_or_recovery: "Use recent raw messages only and mark summary unavailable."
      verification:
        - "Context assembly test with missing summary."

    - name: "Agent skill registry"
      type: "backend_service"
      owner: "agent-skills"
      direction: "this_spec_consumes_dependency"
      contract_used: "resolveRuntimeSkillsForAgent(agent, { workflowThreadId, auditUsage })"
      required_for: "Inject active user-created procedural skills into agents."
      assumptions: []
      failure_modes:
        - "Invalid skill injected."
        - "Skill too large for prompt."
      fallback_or_recovery: "Only published/passed skills; byte budget clipping with explicit notice."
      verification:
        - "Runtime skill injection tests."

  depended_on_by:
    - name: "Agent prompts"
      type: "agent"
      owner: "server/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "PromptContextBundle with memories, summaries, skills, budget diagnostics"
      compatibility_obligation: "must preserve required existing static skills"
      expected_consumer_behavior: "Agents consume bounded context and report used memory/skill IDs."
      migration_or_notification_required: false
      verification:
        - "Prompt snapshot tests."

  bidirectional_integrations:
    - name: "Memory extraction and agent execution"
      participants:
        - "workflow events"
        - "agent memory store"
      shared_contract: "event source id and memory item provenance"
      consistency_rule: "Every memory fact must cite a source event/message/spec/file."
      verification:
        - "Memory provenance test."

  data_flow:
    inbound:
      - source: "Chat/workflow events"
        payload_or_state: "messages, progress, validation evidence"
        validation: "event schema and source IDs"
      - source: "Agent skills"
        payload_or_state: "published SKILL.md and support files"
        validation: "skill validation report passed"
    outbound:
      - target: "Agent prompt assembler"
        payload_or_state: "bounded memory and skill bundle"
        validation: "token/byte budget and provenance checks"
```

## 7. Memory Taxonomy

| Memory Type | Storage | Example | Prompt Rule |
| --- | --- | --- | --- |
| Working memory | current run state | current attempt, active spec, candidate id | Always included if relevant |
| Episodic memory | append-only events | "Front changed src/App.ts in run X" | Retrieved by run/project/story |
| Semantic memory | distilled facts | "Project uses React/Vite and dark operational design" | Included with source/confidence |
| Procedural memory | skills | "front-design-frontend skill v3" | Inject only active bound skills |
| Preference memory | user/project preferences | "avoid highlighter green except primary actions" | Scoped by project/user story |
| Rejected decisions | decision log | "Do not use standalone HTML in React projects" | High priority when matching context |

## 8. Execution Plan

1. Define shared `AgentMemoryItem`, `AgentMemorySummary`, `PromptContextBundle`, `PromptBudgetReport` schemas.
2. Add DB/file repositories for memory items and summaries.
3. Implement `AgentMemoryService` that can append, summarize and retrieve by scope.
4. Implement `PromptContextAssembler` that composes spec/code/design/chat/memory/skills with budget.
5. Wire runtime skill resolution into LangGraph dependencies.
6. Update Spec/Front/QA/Curator/Odin nodes to request runtime skills and prompt context.
7. Record skill usage with workflow run/attempt IDs.
8. Add memory staleness, source confidence and "do not use if source missing" rules.
9. Add chat evidence showing memory/skill sources only when useful and compact.
10. Add tests for prompt budget, skill injection, source provenance and stale memory exclusion.

## 9. Memory Safety Rules

- Memory never overrides current files, current spec or validation evidence.
- Every semantic memory item must have source IDs.
- Memory with stale project hash or superseded spec revision is excluded unless explicitly requested.
- User-created skills are inactive until validated and published.
- Runtime skills are clipped by budget, but clipping must be disclosed to the prompt assembler diagnostics.
- Prompt assembly must be deterministic for the same input snapshot.

## 10. Validation Commands

```bash
pnpm --filter @u-build/shared build
pnpm --filter @u-build/server build
node --test apps/server/test/agentSkillRegistry*.test.mjs
node --test apps/server/test/chatMemoryStore.test.mjs
pnpm test
git diff --check
```

## 11. Acceptance Criteria

- Runtime skills created in the registry can be injected into the correct agent prompts.
- Skill usage is audited with workflow/run context.
- Chat context no longer depends on unbounded raw message arrays.
- Memory summaries are scoped and source-backed.
- Agents receive a bounded prompt context with diagnostics.
- Stale or source-less memory is excluded from mutation decisions.

## 12. Minimal Output Contract For Implementing Agent

```yaml
implementation_output:
  changed_files:
    - "<exact paths>"
  memory_contracts:
    - "<schemas added>"
  skill_runtime:
    - "<agents wired>"
  validation:
    commands_run:
      - "<command>"
  caveats:
    - "<known future vector/retrieval limitation if any>"
```

## 13. Implementation Log

```yaml
implemented_at_utc: "2026-05-27T18:32:56Z"
implemented_by: "codex"
status: "implemented"
changed_files:
  shared_contracts:
    - "packages/shared/src/entities/AgentMemory.ts"
    - "packages/shared/src/entities/AgentSkill.ts"
    - "packages/shared/src/index.ts"
  backend_services:
    - "apps/server/src/application/services/AgentMemoryService.ts"
    - "apps/server/src/infrastructure/prompt/PromptContextAssembler.ts"
    - "apps/server/src/infrastructure/agentSkills/AgentSkillRegistryService.ts"
  persistence:
    - "apps/server/src/infrastructure/repositories/FileAgentMemoryRepository.ts"
    - "apps/server/src/infrastructure/repositories/PostgresAgentMemoryRepository.ts"
    - "apps/server/src/infrastructure/repositories/contracts.ts"
    - "apps/server/src/infrastructure/repositories/createRepositories.ts"
    - "apps/server/src/infrastructure/config/runtimeConfig.ts"
    - "apps/server/src/infrastructure/database/migrations/010_agent_memory.sql"
  runtime_wiring:
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/server/src/domain/services/WorkflowOrchestrator.ts"
    - "apps/server/src/application/usecases/SubmitHorusChatTurnUseCase.ts"
    - "apps/server/src/infrastructure/langgraph/dependencies.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/specAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/odinAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
  agent_prompts:
    - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
  tests:
    - "packages/shared/test/agentMemorySchema.test.mjs"
    - "apps/server/test/agentMemoryService.test.mjs"
    - "apps/server/test/promptContextAssembler.test.mjs"
    - "apps/server/test/postgresSchema.test.mjs"
memory_contracts:
  - "AgentMemoryItem: typed scoped memory with kind, confidence, sourceRefs, staleAt and supersededByMemoryId."
  - "AgentMemorySummary: rolling conversation summaries with source message sequence bounds."
  - "PromptContextBundle: bounded summaries, memories, runtime skills and budget diagnostics per agent profile."
skill_runtime:
  - "PromptContextAssembler resolves active/published runtime skills per agent and audits usage with workflowThreadId and runId when available."
  - "Spec, Odin, Front, QA and Curator nodes now request governed prompt context."
  - "Spec, Front, QA and Curator prompts receive runtime skill content plus memory/source diagnostics."
memory_runtime:
  - "Workflow events append episodic memory through the orchestrator memory sink."
  - "Horus chat turns persist compact rolling conversation summaries for the active chat scope."
  - "Prompt retrieval excludes stale and superseded memory by default."
validation:
  commands_run:
    - "pnpm --filter @u-build/shared build"
    - "pnpm --filter @u-build/server build"
    - "node --test packages/shared/test/agentMemorySchema.test.mjs packages/shared/test/agentSkillSchema.test.mjs"
    - "node --test apps/server/test/agentMemoryService.test.mjs apps/server/test/promptContextAssembler.test.mjs apps/server/test/agentSkillRegistryService.test.mjs apps/server/test/postgresSchema.test.mjs"
    - "node --test apps/server/test/frontAgentNodeCodeContext.test.mjs apps/server/test/curatorAgentNodePreflight.test.mjs apps/server/test/curatorAgentNodeVisualGate.test.mjs apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs"
    - "pnpm test"
caveats:
  - "This implementation intentionally keeps retrieval deterministic and file/Postgres-backed; vector similarity retrieval remains a future extension."
  - "Conversation summaries are compact deterministic rollups, not LLM abstractive summaries, to avoid source-less memory."
```
