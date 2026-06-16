---
format_version: "agentic_sdd.v1"
task_id: "feature-102-agent-tool-profiles-capability-registry"
title: "Agent Tool Profiles Capability Registry"
created_at_utc: "2026-05-28T22:30:10Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.2.0"
status: "implemented"
phase: "phase_3_agent_code_execution_runtime"
depends_on:
  - "spec/features/43-specialized-subagents-tool-boundaries.md"
  - "spec/features/60-agent-skill-registry-backend.md"
  - "spec/features/71-agent-tool-runtime-governed-write-access.md"
source_reuse_note: "spec/notes/opencode-source-reuse-map.md"
---

# 102 - Agent Tool Profiles Capability Registry

## 1. Original User Request

```yaml
raw_user_request: |
  crie 12 specs para implementar exatamente tudo isso abaixo, quero que use fortemente o codigo do opencode como inspiracao e em alguns casos pode inclusve copiar para que voce nao demora muito

source_priority_item: |
  Perfis de tools por agente. Front, QA, Curator e ODIN nao devem ter os mesmos poderes.
```

## 2. System Interpretation

```yaml
system_translation: |
  Convert agent tool access into explicit profiles. Each agent receives a bounded set of tools, policy
  scopes, command permissions and mutation capabilities. Startup must fail fast when a profile references
  missing tools or unsafe capabilities.

expected_user_visible_result: |
  Agent behavior is easier to understand: Front edits, QA validates, Curator reviews evidence, ODIN routes.

expected_engineering_result: |
  AgentProfileRegistry becomes the source of truth for tool capabilities, validation, prompt injection and
  runtime enforcement.
```

## 3. Context, Scope, Entities

```yaml
business_context:
  user_problem: "Agents with excessive tools are risky and hard to audit."
  target_user: "Horus operator and developer maintaining agent architecture."
  expected_outcome: "Each agent has least-privilege capabilities."
  product_surface:
    - "Agent Flow"
    - "Preview chat"
    - "Runtime diagnostics"
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "AgentProfileRegistry"
      - "AgentToolRegistry"
      - "LangGraph nodes"
    frontend:
      - "Agent capability/status display"
    database:
      - "No required migration"
    infrastructure:
      - "Startup validation"
  known_entrypoints:
    - "apps/server/src/application/services/AgentProfileRegistry.ts"
    - "apps/server/src/application/services/AgentToolRegistry.ts"
    - "apps/server/src/application/services/AgentToolRuntime.ts"
    - "apps/server/src/agents"
    - "packages/shared/src/entities/AgentSkill.ts"
scope:
  in_scope:
    - "Define explicit ToolCapability and AgentToolProfile schemas."
    - "Map tools to Spec, ODIN, Front, QA and Curator profiles."
    - "Enforce tool access at AgentToolRuntime execution time."
    - "Validate profiles at startup and test registry consistency."
    - "Expose profile summary in runtime diagnostics."
  out_of_scope:
    - "New agent roles."
    - "User-configurable arbitrary tool permissions."
    - "Granting Curator write access by default."
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/AgentToolProfile.ts"
      - "apps/server/src/application/services/AgentProfileRegistry.ts"
      - "apps/server/src/application/services/AgentToolRegistry.ts"
      - "apps/server/src/application/services/AgentToolRuntime.ts"
      - "apps/server/src/agents"
    services:
      - "AgentProfileRegistry"
      - "AgentToolRuntime"
    database:
      migrations_required: false
  frontend:
    files:
      - "apps/web/src/features/agent-flow"
    components:
      - "Agent capability badges if applicable"
  workflow:
    agents:
      - "Spec Agent"
      - "ODIN Agent"
      - "Front Agent"
      - "QA Agent"
      - "Curator Agent"
  tests:
    unit:
      - "packages/shared/test/agentToolProfile.test.mjs"
      - "apps/server/test/agentProfileRegistry.test.mjs"
      - "apps/server/test/agentToolRuntimePolicy.test.mjs"
```

## 4. Integration Context Map

```yaml
integration_context:
  summary: |
    Agent profiles sit between agent prompts and tool runtime. They define what each agent may request and
    what AgentToolRuntime may execute.
  depends_on:
    - name: "Agent tool registry"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "registered tool names and schemas"
      required_for: "Validate profile references."
      assumptions: []
      failure_modes:
        - "Agent profile includes unavailable or unsafe tool."
      fallback_or_recovery: "Fail startup validation."
      verification:
        - "apps/server/test/agentProfileRegistry.test.mjs"
  depended_on_by:
    - name: "AgentToolRuntime"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "allowedTools and policy scopes"
      compatibility_obligation: "Tool execution must deny unavailable capabilities."
      expected_consumer_behavior: "Check profile before running any tool."
      migration_or_notification_required: false
      verification:
        - "apps/server/test/agentToolRuntimePolicy.test.mjs"
    - name: "Agent prompts"
      type: "agent"
      owner: "apps/server/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "tool availability instructions"
      compatibility_obligation: "Prompts must not advertise tools outside profile."
      expected_consumer_behavior: "Ask only for tools the profile permits."
      migration_or_notification_required: false
      verification:
        - "prompt builder tests"
```

## 5. Architecture, Plan, Acceptance

```yaml
architecture_rules:
  project_specific:
    - "Tool permission is enforced by runtime, not just prompt text."
    - "Profiles are least privilege by default."
    - "Startup validation fails closed."
contracts:
  domain_contracts:
    - name: "Least privilege"
      producer: "AgentProfileRegistry"
      consumers:
        - "AgentToolRuntime"
      invariant: "Agent cannot execute a tool not present in its profile."
execution_plan:
  - step: 1
    name: "Inventory current tools and agents"
    agent: "repo_explorer"
    action: "Read tool registry, profile registry and agent nodes."
    expected_output: "Current capability matrix."
  - step: 2
    name: "Define shared profile contracts"
    agent: "backend_specialist"
    action: "Add schemas and strict allowed capability enums."
    expected_output: "Typed profile contract."
  - step: 3
    name: "Implement profile enforcement"
    agent: "backend_specialist"
    action: "Check profile for every tool execution."
    expected_output: "Runtime denies out-of-profile tools."
  - step: 4
    name: "Wire profile prompts and tests"
    agent: "qa_specialist"
    action: "Validate prompts, startup and denied tool behavior."
    expected_output: "Registry coverage."
acceptance_criteria:
  functional:
    - "Front Agent can inspect/read/edit/run allowed validation commands."
    - "QA Agent can inspect/read/run tests but cannot mutate by default."
    - "Curator can inspect/read/diff/evidence but cannot write by default."
    - "ODIN can route and inspect state but cannot directly write files by default."
  quality:
    - "Profile registry tests fail when a referenced tool is missing."
validation_protocol:
  required_commands:
    - command: "pnpm --filter @u-build/server test -- agentProfileRegistry"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate profile registry."
      success_condition: "Exit code 0."
    - command: "pnpm --filter @u-build/server test -- agentToolRuntimePolicy"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate runtime enforcement."
      success_condition: "Exit code 0."
implementation_notes:
  preferred_approach: |
    Use opencode tool registry, schema and permission evaluation code as a strong implementation reference.
    Copy reusable registry/permission primitives only after converting them to Horus agent profiles,
    capability names and startup validation.
risks:
  - risk: "Prompt advertises a tool unavailable at runtime."
    severity: "high"
    mitigation: "Generate prompt tool list from the same profile registry used at runtime."
```

## 6. Implementation Log

```yaml
implemented_at_utc: "2026-05-28T00:00:00Z"
implemented_by: "codex"
summary:
  - "Added shared AgentToolProfile, AgentToolCapability, capability-definition and profile-summary contracts."
  - "Converted AgentProfileRegistry into the capability source of truth, including tool mutability definitions, derived capability scopes, least-privilege validation and profile diagnostics."
  - "Tightened tool profiles: Front Agent can inspect/read/edit/delete/write/run governed commands; QA Agent can inspect/read/run validation without mutation; Curator can inspect/read/diff/validate without write/apply/delete; ODIN remains routing/read oriented."
  - "Updated AgentToolRegistry to reject registration mutability drift against the capability registry."
  - "Updated AgentToolRuntime to use registry mutability evidence and preserve runtime denial for out-of-profile tool calls."
  - "Expanded runtime diagnostics by carrying capability scopes into agent profiles and showing capability chips in the Agent Flow drawer."
  - "Added focused shared/server regression tests for profile schemas, capability summaries, startup availability validation and runtime policy blocking."
validation:
  - command: "pnpm build"
    result: "passed"
  - command: "node --test packages/shared/test/agentToolProfile.test.mjs packages/shared/test/agentProfileIsolationPolicy.test.mjs apps/server/test/agentProfileRegistry.test.mjs apps/server/test/agentToolRuntimePolicy.test.mjs apps/server/test/agentToolRegistry.test.mjs apps/server/test/agentToolRuntime.test.mjs apps/server/test/agentToolLoop.test.mjs apps/server/test/projectAgentTools.test.mjs apps/server/test/agentToolRuntimeRunCommand.test.mjs apps/server/test/agentToolRuntimeInspectProject.test.mjs"
    result: "passed"
```
