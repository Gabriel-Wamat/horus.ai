---
format_version: "agentic_sdd.v1"
task_id: "78-operational-memory-traceability-context-profiles"
title: "Operational Memory, Spec Traceability, And Agent Context Profiles"
created_at_utc: "2026-05-29T22:20:15Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
---

# Feature 78: Operational Memory, Spec Traceability, And Agent Context Profiles

## 1. Original User Request

```yaml
raw_user_request: |
  foque nesses casos:

  8. **Memória operacional da execução**
     Cada run precisa guardar: arquivos lidos, comandos rodados, diffs aplicados, erros vistos, tentativas, decisões do Curator e motivo do próximo passo.

  9. **Traceabilidade spec -> código**
     O agente precisa saber quais requisitos da spec viraram quais arquivos/componentes/testes. Sem isso ele edita “visualmente”, mas não sabe se preservou a intenção original.

  10. **Perfis de contexto por agente**
     Front Agent precisa de código, árvore, design e build errors. QA precisa de spec, comportamento esperado e test targets. Curator precisa de diff, evidência e requisitos. ODIN precisa de status e decisão, não de tudo.
```

## 2. System Interpretation

```yaml
system_translation: |
  Implement additive contracts and backend services that make each agent run replayable,
  make generated code traceable to explicit spec requirements, and provide a deterministic
  context envelope tailored to each agent role.

expected_user_visible_result: |
  Horus can expose why a run is taking a next step, which files/tools/errors were involved,
  and which spec requirements are covered by the generated files/tests.

expected_engineering_result: |
  Shared schemas, projection services, and agent prompt/context plumbing carry operational
  memory, spec trace links, and profile-specific context without breaking existing run
  flow, telemetry, or chat APIs.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Agents can edit but still lack durable reasoning memory, spec coverage awareness, and role-specific context."
  target_user: "Horus operator inspecting or correcting multi-agent frontend generation."
  expected_outcome: "Runs become auditable and agents receive the right evidence for their role."
  product_surface:
    - "LangGraph agent execution"
    - "Chat/code tool runtime"
    - "Run flow and telemetry APIs"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph"
      - "Express"
    frontend:
      - "React"
      - "Vite"
    database:
      - "File repositories"
      - "Postgres repositories"
    infrastructure:
      - "Optional Redis cache"
  known_entrypoints:
    - "apps/server/src/infrastructure/langgraph/nodes/*"
    - "apps/server/src/application/services/AgentToolLoop.ts"
    - "packages/shared/src/entities/*"
  known_existing_patterns:
    - "Shared zod contracts in packages/shared"
    - "Operational session projection from AgentOperationEvent"
    - "Runbook derived from workflow/operational events"
    - "Curator as quality choke point"
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Add a shared operational memory summary contract."
    - "Add shared spec-to-code traceability contracts."
    - "Add role-specific context profile contracts."
    - "Project operational memory from existing operational session events."
    - "Derive initial traceability records from CodeChangeSet operations and spec requirements."
    - "Provide context profile envelopes for Spec, ODIN, Front, QA, and Curator agents."
    - "Inject the profile guidance into relevant prompts without removing existing context."
  out_of_scope:
    - "Creating a new UI page."
    - "Adding a database migration unless a repository already needs persisted fields."
    - "Replacing the existing LangGraph flow."
    - "Implementing full cross-file semantic proof of every requirement."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/AgentOperationalSession.ts"
      - "packages/shared/src/entities/SpecTraceability.ts"
      - "packages/shared/src/entities/AgentContextProfile.ts"
      - "apps/server/src/application/services/OperationalMemoryProjector.ts"
      - "apps/server/src/application/services/SpecTraceabilityService.ts"
      - "apps/server/src/application/services/AgentContextProfileService.ts"
      - "apps/server/src/infrastructure/agents/*AgentImpl.ts"
    services:
      - "AgentToolLoop"
      - "CuratorAgentImpl"
      - "FrontAgentImpl"
      - "QaAgentImpl"
      - "OdinAgentImpl"
    database:
      migrations_required: false
      tables: []
  frontend:
    files: []
    components: []
    routes: []
  workflow:
    graph_nodes:
      - "specAgent"
      - "odinAgent"
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
    agents:
      - "spec"
      - "odin"
      - "front"
      - "qa"
      - "curator"
  tests:
    unit:
      - "packages/shared/test/agentOperationalSession.test.mjs"
      - "packages/shared/test/specTraceability.test.mjs"
      - "packages/shared/test/agentContextProfile.test.mjs"
      - "apps/server/test/operationalMemoryProjector.test.mjs"
      - "apps/server/test/specTraceabilityService.test.mjs"
      - "apps/server/test/agentContextProfileService.test.mjs"
    integration: []
    e2e: []
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    The feature sits between shared contracts, operational events, CodeChangeSet output,
    Spec requirements, and agent prompts. It should enrich context without changing existing
    mutation or validation behavior.

  depends_on:
    - name: "AgentOperationalSession projection"
      type: "internal_module"
      owner: "apps/server + packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "AgentOperationEvent, AgentOperationProjection"
      required_for: "Build durable operational memory from already persisted run events."
      assumptions: []
      failure_modes:
        - "Memory summary misses files/errors if operational events are not recorded."
      fallback_or_recovery: "Return empty arrays and explicit next-step reason."
      verification:
        - "node --test packages/shared/test/agentOperationalSession.test.mjs apps/server/test/operationalMemoryProjector.test.mjs"

    - name: "CodeChangeSet operations"
      type: "internal_module"
      owner: "packages/shared"
      direction: "this_spec_consumes_dependency"
      contract_used: "CodeChangeSet.operations metadata, diff, paths, sourceAgent"
      required_for: "Derive requirement coverage candidates for files and tests."
      assumptions: []
      failure_modes:
        - "Traceability is incomplete if agents do not emit requirement IDs."
      fallback_or_recovery: "Infer broad coverage from spec requirement text and operation target path."
      verification:
        - "node --test apps/server/test/specTraceabilityService.test.mjs"

    - name: "Agent prompts"
      type: "agent"
      owner: "apps/server/infrastructure/agents"
      direction: "this_spec_consumes_dependency"
      contract_used: "Prompt text assembled before LLM invocation"
      required_for: "Give each role the correct context without overloading all agents."
      assumptions: []
      failure_modes:
        - "Agent receives irrelevant context or misses critical evidence."
      fallback_or_recovery: "Profile service returns bounded required evidence sections."
      verification:
        - "pnpm --filter @u-build/server build"

  depended_on_by:
    - name: "Runbook and telemetry consumers"
      type: "workflow"
      owner: "apps/server + apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "OperationalMemorySummary and SpecTraceabilityRecord"
      compatibility_obligation: "Additive only; existing telemetry fields must remain valid."
      expected_consumer_behavior: "Consumers can display memory and trace links when available."
      migration_or_notification_required: false
      verification:
        - "Shared schema tests."

  bidirectional_integrations:
    - name: "Curator evidence loop"
      participants:
        - "CuratorAgentImpl"
        - "SpecTraceabilityService"
      shared_contract: "SpecTraceabilityReport"
      consistency_rule: "Curator should see uncovered requirements and evidence gaps before verdict."
      verification:
        - "Curator prompt unit/compile checks."

  data_flow:
    inbound:
      - source: "AgentOperationEvent"
        payload_or_state: "files read, file changes, commands, errors, decisions"
        validation: "AgentOperationEventSchema"
      - source: "Spec + CodeChangeSet"
        payload_or_state: "requirements and operations"
        validation: "Spec schemas and CodeChangeSetSchema"
    outbound:
      - target: "Agent prompts"
        payload_or_state: "AgentContextEnvelope"
        compatibility: "Textual prompt block must be bounded and role-specific."
      - target: "Run projections"
        payload_or_state: "OperationalMemorySummary"
        compatibility: "Additive optional fields."

  sequencing_dependencies:
    - dependency: "Shared schemas before server services"
      reason: "Server and tests import from @u-build/shared dist."
      validation: "pnpm --filter @u-build/shared build"

  integration_risks:
    - risk: "Traceability appears stronger than it is."
      severity: "high"
      mitigation: "Mark inferred links as low/medium confidence and expose uncovered requirements."
    - risk: "Context profiles become another prompt blob."
      severity: "medium"
      mitigation: "Use typed profile sections with explicit include/exclude lists."
```

## 7. Execution Plan

1. Add shared schemas for operational memory, spec traceability, and context profile envelopes.
2. Add server projectors/services that derive those contracts from existing events/spec/change sets.
3. Wire context profile guidance into Front, QA, Curator, and ODIN prompt builders.
4. Add focused tests for projection, trace inference, and profile content boundaries.
5. Build shared/server and run targeted tests.

## 8. Acceptance Criteria

- Operational memory summary contains files read, files changed, commands, diffs, errors, attempts, curator decisions, and next-step reason.
- Spec traceability report maps requirement IDs/text to files/tests/components with confidence and uncovered requirements.
- Agent context profile service returns distinct context envelopes for Front, QA, Curator, and ODIN.
- Prompt builders can consume context profile blocks without changing existing agent output schemas.
- Shared and server packages build.
- Focused tests pass.

## 9. Implementation Evidence

```yaml
status: "implemented"
implemented_at_utc: "2026-05-29T22:48:00Z"
key_changes:
  shared_contracts:
    - "packages/shared/src/entities/OperationalMemory.ts"
    - "packages/shared/src/entities/SpecTraceability.ts"
    - "packages/shared/src/entities/AgentContextProfile.ts"
  server_services:
    - "apps/server/src/application/services/OperationalMemoryProjector.ts"
    - "apps/server/src/application/services/SpecTraceabilityService.ts"
    - "apps/server/src/application/services/AgentContextProfileService.ts"
  graph_integration:
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/odinAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/dependencies.ts"
validation:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "node --test packages/shared/test/operationalContextSchemas.test.mjs"
  - "node --test apps/server/test/operationalContextServices.test.mjs"
```
