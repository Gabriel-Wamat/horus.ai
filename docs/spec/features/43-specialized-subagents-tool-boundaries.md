---
format_version: "agentic_sdd.v1"
task_id: "feature-43-specialized-subagents-tool-boundaries"
title: "Specialized Subagents And Tool Boundaries"
created_at_utc: "2026-05-26T23:45:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented"
depends_on:
  - "spec/features/13-agent-workspace-context-consumption.md"
  - "spec/features/22-chat-driven-agent-code-change-loop.md"
  - "spec/features/39-agentic-orchestration-integrity.md"
  - "spec/features/42-agentic-execution-loop.md"
---

# 43 - Specialized Subagents And Tool Boundaries

## 1. Original User Request

```yaml
raw_user_request: |
  minha preocupação é no 4, 5, 6, 8, 9 e 10. destrinche como podemos corrigir o projeto com base o que foi listar. e crie uma spec para cada cenário que expressei preocupação
concern_mapped_from_previous_answer: "5. Subagentes com ferramentas diferentes"
```

## 2. System Interpretation

```yaml
system_translation: |
  Formalizar agentes especializados com responsabilidades, inputs, outputs e ferramentas permitidas. Cada agente deve
  ter escopo mínimo: Chat responde e lê, Spec modela, Odin planeja, Front altera frontend, QA valida, Curator revisa.

expected_user_visible_result: |
  O usuário consegue entender qual agente está trabalhando e por quê. Falhas são atribuídas ao agente certo,
  sem o sistema misturar geração de spec, edição de código, execução de preview e revisão final.

expected_engineering_result: |
  O backend passa a declarar perfis de agente com tool access explícito, contratos de entrada/saída e guardrails.
  O orquestrador valida que cada agente só usa ferramentas compatíveis com seu papel.
```

## 3. Current Project Fit

```yaml
verified_existing_surfaces:
  - "apps/server/src/infrastructure/agents/HorusChatAgentImpl.ts"
  - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
  - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
  - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
  - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
  - "apps/server/src/infrastructure/langgraph/nodes/*.ts"
  - "apps/server/src/infrastructure/langgraph/dependencies.ts"

current_good_parts:
  - "Agent implementations are already physically separated."
  - "LangGraph nodes represent major agent responsibilities."
  - "Curator already consumes QA and CodeChangeSet evidence."

current_failures:
  - "Tool access is implicit in code, not declared as a first-class policy."
  - "Agent capabilities are not exposed in shared/runtime snapshots."
  - "There is no central check that prevents an agent from calling a tool outside its profile."
  - "Agent prompts can drift without a machine-readable contract."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create AgentProfile schema with role, allowed tools, forbidden tools, input contract and output contract."
    - "Declare profiles for Chat, Spec, Odin, Front, QA and Curator."
    - "Route tool execution through an AgentToolRegistry that enforces profile rules."
    - "Persist agent profile id on every assignment/event."
    - "Expose agent capability summary in run-flow drawer."
  out_of_scope:
    - "Adding new LLM providers."
    - "Letting users define arbitrary agents from UI."
    - "Replacing existing agents with plugins."
```

## 5. Agent Profiles

```yaml
agent_profiles:
  chat_agent:
    purpose: "Answer questions and classify intent."
    allowed_tools:
      - "search_code_readonly"
      - "read_file_readonly"
      - "list_project_files"
      - "get_user_story"
      - "get_spec"
    forbidden_tools:
      - "write_file"
      - "run_command"
      - "git_push"
      - "delete_file"
    output_contract: "HorusChatOutcome"

  spec_agent:
    purpose: "Create or update SDD/spec from user story and project context."
    allowed_tools:
      - "read_user_story"
      - "read_project_manifest"
      - "search_code_readonly"
      - "save_spec_revision"
    forbidden_tools:
      - "write_project_file"
      - "run_command"
    output_contract: "Spec"

  odin_agent:
    purpose: "Plan assignments and route specialists."
    allowed_tools:
      - "read_spec"
      - "read_agent_results"
      - "create_assignment"
      - "update_assignment"
    forbidden_tools:
      - "write_project_file"
      - "run_shell"
    output_contract: "AgentAssignmentPlan"

  front_agent:
    purpose: "Produce auditable frontend CodeChangeSet."
    allowed_tools:
      - "search_code_readonly"
      - "read_file_readonly"
      - "propose_code_change_set"
      - "run_static_analysis_readonly"
    forbidden_tools:
      - "direct_fs_write"
      - "arbitrary_shell"
      - "git_push"
    output_contract: "CodeChangeSet"

  qa_agent:
    purpose: "Produce test cases and runtime validation plan."
    allowed_tools:
      - "read_spec"
      - "read_code_change_set"
      - "run_validation_command"
      - "inspect_preview"
    forbidden_tools:
      - "write_project_file"
    output_contract: "QaResult"

  curator_agent:
    purpose: "Final review and approval/rejection."
    allowed_tools:
      - "read_spec"
      - "read_code_change_set"
      - "read_validation_evidence"
      - "emit_verdict"
    forbidden_tools:
      - "write_project_file"
      - "run_arbitrary_command"
    output_contract: "CuratorVerdict"
```

## 6. Integration Context Map

```yaml
integration_context:
  depends_on:
    - name: "LangGraph nodes"
      type: "workflow"
      contract_used: "node functions invoke agent implementations"
      required_for: "Attach profile enforcement to each node."
      failure_modes:
        - "Node bypasses registry and calls infrastructure directly."
      verification:
        - "Test every node declares agentProfileId."
    - name: "Agent implementations"
      type: "agent"
      contract_used: "generate/validate/answer methods"
      required_for: "Validate outputs against declared contracts."
      failure_modes:
        - "Agent returns text instead of structured result."
      verification:
        - "Schema parse tests for each agent output."

  depended_on_by:
    - name: "Run flow drawer"
      type: "frontend_component"
      contract_exposed: "agentProfileId and allowedTools summary"
      compatibility_obligation: "Additive fields."
      expected_consumer_behavior: "Show what each agent can do and what it is doing now."
    - name: "Tool registry"
      type: "backend_service"
      contract_exposed: "execute(agentProfileId, toolName, input)"
      compatibility_obligation: "Deny by default for unknown tools."
      expected_consumer_behavior: "All agent tool calls go through registry."
```

## 7. Execution Plan

```yaml
execution_plan:
  - step: "Add shared AgentProfile and AgentToolName schemas."
    files:
      - "packages/shared/src/entities/AgentResult.ts"
      - "packages/shared/src/entities/HorusRunFlow.ts"
  - step: "Create backend AgentProfileRegistry."
    files:
      - "apps/server/src/application/services/AgentProfileRegistry.ts"
  - step: "Create AgentToolRegistry with deny-by-default enforcement."
    files:
      - "apps/server/src/application/services/AgentToolRegistry.ts"
  - step: "Route LangGraph node dependencies through the registry."
    files:
      - "apps/server/src/infrastructure/langgraph/dependencies.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/*.ts"
  - step: "Expose profile/capability metadata in run snapshots."
    files:
      - "apps/server/src/application/services/HorusRunFlowSnapshotBuilder.ts"
      - "apps/web/src/features/agents-flow/components/RunFlowDrawer.tsx"
```

## 8. Acceptance Checklist

```yaml
acceptance_checklist:
  - "Every agent has a declared AgentProfile."
  - "Unknown tool names are rejected."
  - "Agent cannot execute forbidden tool even if prompt requests it."
  - "Every agent event stores agentProfileId."
  - "Run drawer shows role and allowed capabilities."
  - "Tests cover allowed, forbidden and unknown tool access."
  - "No direct write/shell path remains reachable from Chat Agent."

validation_commands:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "node --test apps/server/test/*agent* apps/server/test/*tool*"
  - "pnpm test"
```

## 9. Implementation Log

```yaml
implemented_at_utc: "2026-05-26T00:00:00Z"
implementation_summary:
  - "Added shared AgentProfile, AgentProfileId and AgentToolName schemas."
  - "Declared Chat, Spec, Odin, Front, QA and Curator profiles with allowed and forbidden tools."
  - "Added AgentProfileRegistry and deny-by-default AgentToolRegistry."
  - "Routed frontend code-context lookup through the tool registry as the first enforced agent tool surface."
  - "Added agentProfileId and agentProfile metadata to run events and agent execution snapshots."
  - "Exposed profile purpose and allowed tools in the run-flow drawer."
  - "Added focused tests for declared profiles, allowed tools, forbidden tools, unknown tools and unregistered tools."
validation_record:
  - "node --test apps/server/test/agentToolRegistry.test.mjs packages/shared/test/horusRunFlow.test.mjs"
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "pnpm --filter @u-build/web type-check"
  - "node --test apps/server/test/workflowOrchestratorCodeChangeSet.test.mjs apps/server/test/horusChatTurn.test.mjs"
```
