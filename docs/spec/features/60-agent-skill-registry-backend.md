---
format_version: "agentic_sdd.v1"
task_id: "feature-60-agent-skill-registry-backend"
title: "Agent Skill Registry Backend And Persistence"
created_at_utc: "2026-05-27T07:09:34Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "1.0.0"
status: "planned"
depends_on:
  - "spec/features/43-specialized-subagents-tool-boundaries.md"
  - "spec/features/45-structured-agent-tools-no-shell.md"
  - "spec/features/47-validation-gates-true-success.md"
---

# 60 - Agent Skill Registry Backend And Persistence

## 1. Original User Request

```yaml
raw_user_request: |
  em seguida, quero que crie uma tela nova onde o usuário pode ver todas as skills do projeto, além disso criar novas skills de forma que os agentes possam usar. exatamente como funciona no codex ou claude code. pesquise na internet como isso é feito, em seguida use a skill de criar spec para planejar essa tarefa, crie primeiro a spec de back(incluindo BD) e depois a de front. garanta que ambas estarão versionadas em <REPOSITORY_ROOT>/spec/features
```

## 2. Research Basis

```yaml
research_summary: |
  Codex/OpenAI and Claude Code converge on the same core model: a skill is a filesystem-style bundle
  whose required entrypoint is SKILL.md, with metadata/instructions and optional supporting resources
  such as references, examples, templates, scripts, API specs, or UI assets. Skills are discovered by
  metadata, loaded progressively when relevant, can be invoked explicitly or automatically, and must be
  versionable/shareable. Claude Code adds project/personal/plugin locations, live change detection,
  frontmatter fields, optional allowed-tools, dynamic context injection, and subagent execution. OpenAI
  describes skills as versioned bundles retrievable by skill id and unpacked into the runtime container
  before model context is updated. Security research warns that SKILL.md metadata and natural language
  instructions can become a semantic supply-chain surface, so Horus must add validation, provenance,
  review, permission boundaries, and audit logs before allowing agents to use user-created skills.

sources:
  - "OpenAI: From model to agent - Agent skills, versioned bundles, metadata, resources, runtime loading"
  - "OpenAI: Introducing the Codex app - Codex skill library and dedicated skill management interface"
  - "OpenAI Academy: Skills - SKILL.md as reusable workflow playbook with inputs, steps, output format, checks"
  - "Claude Code Docs: Extend Claude with skills - SKILL.md, locations, live detection, supporting files"
  - "Claude Agent SDK Docs: skills as filesystem artifacts discovered at startup, full content loaded when triggered"
  - "arXiv 2605.11418: semantic supply-chain risk in agent skill registries"
```

## 3. System Interpretation

```yaml
system_translation: |
  Implement the backend foundation for a project skill system in Horus. The backend must discover
  existing repository skills, persist user-created skills, version every skill revision, validate
  SKILL.md bundles, expose APIs for catalog/detail/create/update/publish/archive, and make approved
  skills available to Horus agents through the existing agent skill loading and prompt construction path.

expected_user_visible_result: |
  After the backend exists, the UI can list all project skills, inspect metadata/revisions/files, create
  a new skill, publish it, and bind it to agents so future agent runs can use it.

expected_engineering_result: |
  New typed shared entities, database migrations, repository interfaces, Postgres/file repository
  implementations, HTTP routes, validation services, audit events, and agent-skill runtime integration.
  Agents must only consume active, validated, permission-compatible skill revisions.
```

## 4. Product And Technical Context

```yaml
business_context:
  user_problem: "Horus currently has repo-local agent skills but no product surface or persisted registry for users to create and manage skills."
  target_user: "Horus users who want to teach Spec, Front, QA, Curator, Odin, or future agents reusable workflows exactly as Codex/Claude Code skills do."
  expected_outcome: "Skills become first-class project assets: inspectable, versioned, auditable, and usable by agents."
  product_surface:
    - "Project skill catalog"
    - "Skill creation and publishing workflow"
    - "Agent runtime prompt and tool boundaries"
    - "Postgres-backed project configuration"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express routes"
      - "LangGraph agent orchestration"
      - "Zod shared schemas"
    frontend:
      - "React/Vite consumers in a later frontend spec"
    database:
      - "Postgres migrations in apps/server/src/infrastructure/database/migrations"
      - "File fallback repositories where existing patterns require portability"
    infrastructure:
      - "AgentSkillLoader"
      - "AgentProfileRegistry"
      - "AgentToolRegistry"
      - "PersistentWorkflowEventStream"
  known_entrypoints:
    - "skills/agents/*/SKILL.md"
    - "apps/server/src/infrastructure/agentSkills/loadAgentSkill.ts"
    - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/src/application/services/AgentProfileRegistry.ts"
    - "apps/server/src/infrastructure/repositories/contracts.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "packages/shared/src/entities"
  known_existing_patterns:
    - "Shared entities live in packages/shared and are exported through packages/shared/src/index.ts."
    - "Backend repository interfaces live in apps/server/src/infrastructure/repositories/contracts.ts."
    - "Postgres repositories mirror file repositories for portability."
    - "HTTP routes are mounted in apps/server/src/infrastructure/http/server.ts."
    - "Agent prompts currently load static markdown skills by agent role."
```

## 5. Scope

```yaml
scope:
  in_scope:
    - "Create a persistent skill registry with project/global/system skill sources."
    - "Create database tables and indexes for skills, revisions, files, bindings, validation reports, and audit events."
    - "Import existing repository skills from skills/agents/*/SKILL.md as system/project seed records without losing filesystem compatibility."
    - "Validate SKILL.md frontmatter, body, size, supporting-file references, security policy, and agent/tool compatibility."
    - "Expose CRUD-style APIs for list, detail, create draft, update draft, publish revision, archive, validate, and bind-to-agent."
    - "Expose read APIs agents can use to resolve active skills by agent role, explicit skill id, task intent, and project scope."
    - "Record skill usage/provenance in workflow events or dedicated audit rows."
    - "Keep execution of user-supplied scripts disabled by default until a later explicit safety spec enables it."
  out_of_scope:
    - "Building the frontend UI. Covered by spec 61."
    - "Public marketplace, remote install, or team sharing outside this Horus instance."
    - "Running arbitrary scripts from user-created skills."
    - "Replacing existing static skill files in this implementation pass."
    - "Changing model-provider settings or LLM credential storage."
```

## 6. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "packages/shared/src/entities/AgentSkill.ts"
      - "packages/shared/src/index.ts"
      - "apps/server/src/infrastructure/database/migrations/006_agent_skill_registry.sql"
      - "apps/server/src/infrastructure/repositories/contracts.ts"
      - "apps/server/src/infrastructure/repositories/PostgresAgentSkillRepository.ts"
      - "apps/server/src/infrastructure/repositories/FileAgentSkillRepository.ts"
      - "apps/server/src/infrastructure/repositories/createRepositories.ts"
      - "apps/server/src/infrastructure/agentSkills/AgentSkillRegistryService.ts"
      - "apps/server/src/infrastructure/agentSkills/AgentSkillValidationService.ts"
      - "apps/server/src/infrastructure/agentSkills/loadAgentSkill.ts"
      - "apps/server/src/infrastructure/http/routes/agentSkillRoutes.ts"
      - "apps/server/src/infrastructure/http/server.ts"
      - "apps/server/src/infrastructure/agents/*AgentImpl.ts"
    services:
      - "AgentSkillRegistryService"
      - "AgentSkillValidationService"
      - "AgentSkillLoader"
      - "AgentProfileRegistry"
      - "WorkflowOrchestrator"
    database:
      migrations_required: true
      tables:
        - "agent_skills"
        - "agent_skill_revisions"
        - "agent_skill_files"
        - "agent_skill_bindings"
        - "agent_skill_validation_reports"
        - "agent_skill_usage_events"
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
      - "Spec"
      - "Odin"
      - "Front"
      - "QA"
      - "Curator"
  tests:
    unit:
      - "packages/shared/test/agentSkillSchema.test.mjs"
      - "apps/server/test/agentSkillValidationService.test.mjs"
      - "apps/server/test/agentSkillRegistryService.test.mjs"
      - "apps/server/test/loadAgentSkillDynamicRegistry.test.mjs"
    integration:
      - "apps/server/test/agentSkillRoutes.test.mjs"
      - "apps/server/test/postgresAgentSkillRepository.test.mjs"
    e2e:
      - "Create skill -> publish -> bind Front agent -> start run -> event references skill revision"
```

## 7. Integration Context Map

```yaml
integration_context:
  summary: |
    The backend skill registry sits between persisted project configuration, filesystem seed skills,
    agent prompt construction, and future frontend management UI. It must preserve existing static
    agent skills while enabling user-created, versioned, validated skills.

  depends_on:
    - name: "Existing repo skills"
      type: "internal_module"
      owner: "skills/agents"
      direction: "this_spec_consumes_dependency"
      contract_used: "Directory containing SKILL.md plus optional references/scripts/assets"
      required_for: "Seed catalog with current project skills and preserve backward compatibility."
      assumptions: []
      failure_modes:
        - "Existing agents lose their current instructions."
        - "Filesystem and DB copies drift without clear source metadata."
      fallback_or_recovery: "Store source_type and source_path; treat filesystem seed skills as read-only unless explicitly imported as editable copy."
      verification:
        - "Repository seed test lists every skills/agents/*/SKILL.md entry."

    - name: "AgentProfileRegistry"
      type: "internal_module"
      owner: "apps/server/application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "agent ids, labels, purposes, allowedTools, forbiddenTools"
      required_for: "Validate skill bindings and allowed tool claims against actual agent profiles."
      assumptions: []
      failure_modes:
        - "A skill grants or requests tools an agent must never use."
      fallback_or_recovery: "Reject incompatible binding with explicit validation report."
      verification:
        - "Binding validation rejects disallowed tools."

    - name: "Postgres persistence"
      type: "database"
      owner: "apps/server/infrastructure/database"
      direction: "this_spec_consumes_dependency"
      contract_used: "schema_migrations and repository pattern"
      required_for: "Persist skill revisions, files, bindings, validation reports, and usage audit."
      assumptions:
        - "Next migration number is 006 at implementation time; executing agent must verify."
      failure_modes:
        - "Skill created in UI disappears after restart."
        - "Agents use stale or draft skill text."
      fallback_or_recovery: "File repository fallback must persist the same schema shape under HORUS_DATA_DIR."
      verification:
        - "Migration test"
        - "Repository roundtrip test"

    - name: "Agent prompt builders"
      type: "backend_service"
      owner: "apps/server/infrastructure/agents"
      direction: "this_spec_consumes_dependency"
      contract_used: "loadAgentSkill(agentSkillName) returns markdown instructions"
      required_for: "Inject active skill revisions into agent context."
      assumptions: []
      failure_modes:
        - "Agents never see the user-created skill."
        - "Agents receive too much skill content and exceed context budget."
      fallback_or_recovery: "Progressive loading: inject metadata/index first; full content only when skill is bound and relevant."
      verification:
        - "Prompt tests assert skill name, revision id, and selected content are included."

  depended_on_by:
    - name: "Spec 61 frontend skill catalog"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "HTTP APIs and shared schemas for skill catalog/create/publish/bind"
      compatibility_obligation: "must preserve response shapes once frontend starts consuming them"
      expected_consumer_behavior: "List, inspect, validate, create, publish, and bind skills through typed API client."
      migration_or_notification_required: false
      verification:
        - "Frontend API typecheck after shared schema export."

    - name: "Agent runtime"
      type: "agent"
      owner: "apps/server/infrastructure/agents"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "resolveSkillsForAgent(agentName, context) -> active revision summaries/content"
      compatibility_obligation: "must preserve existing static skill behavior; may extend with dynamic skills"
      expected_consumer_behavior: "Agents consume only active, validated, compatible skill revisions."
      migration_or_notification_required: false
      verification:
        - "Existing agent prompt tests still pass."
        - "Dynamic skill injection test passes."

    - name: "Workflow audit/events"
      type: "event_stream"
      owner: "PersistentWorkflowEventStream"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "skill_usage event or metadata on node_started/node_completed"
      compatibility_obligation: "must extend without breaking existing event consumers"
      expected_consumer_behavior: "UI and logs can show which skill revisions influenced a run."
      migration_or_notification_required: false
      verification:
        - "Event schema accepts skill usage metadata."

  bidirectional_integrations:
    - name: "Skill registry and filesystem seed skills"
      participants:
        - "skills/agents filesystem"
        - "agent_skills database"
      shared_contract: "Skill bundle identity, source path, revision hash, SKILL.md body"
      consistency_rule: "Filesystem seed records must have deterministic hashes and read-only source metadata; DB-created skills must not silently overwrite repo files."
      verification:
        - "Seed import idempotency test."

    - name: "Skill bindings and agent profiles"
      participants:
        - "agent_skill_bindings"
        - "AgentProfileRegistry"
      shared_contract: "agent_name/agent_profile_id and allowed tool policy"
      consistency_rule: "A binding is active only if the target agent exists and the skill validation report is passing."
      verification:
        - "Binding validation test."

  data_flow:
    inbound:
      - source: "Filesystem seed loader"
        payload_or_state: "Skill bundle path + SKILL.md + support files"
        validation: "Parse frontmatter, content hash, size limits, path safety."
      - source: "Frontend create/edit requests"
        payload_or_state: "Draft skill metadata, SKILL.md body, optional support files, target agents"
        validation: "Zod input schema + validation service + permission compatibility."
    outbound:
      - target: "Frontend catalog"
        payload_or_state: "Skill summary/detail/revisions/validation/bindings"
        compatibility: "Typed shared response schema."
      - target: "Agent prompt builders"
        payload_or_state: "Active skill metadata and selected content"
        compatibility: "Existing static skills continue to load if registry unavailable."
      - target: "Audit/events"
        payload_or_state: "skill_id, revision_id, agent_name, run_id, trigger_reason"
        compatibility: "Event additions are optional fields."

  sequencing_dependencies:
    - dependency: "Shared schemas before routes"
      reason: "Backend and frontend need the same contract."
      validation: "packages/shared build."
    - dependency: "Database migration before Postgres repository"
      reason: "Routes cannot persist skills without tables."
      validation: "migration test and repository roundtrip."
    - dependency: "Validation before publish"
      reason: "Agents must not consume unsafe or malformed skill bundles."
      validation: "publish route rejects failing validation report."
    - dependency: "Registry fallback before agent prompt change"
      reason: "Existing agents must keep working if dynamic registry is empty."
      validation: "Existing prompt tests pass with no DB skills."

  integration_risks:
    - risk: "User-created natural-language skill becomes prompt-injection or semantic supply-chain vector."
      severity: "high"
      mitigation: "Validation reports, provenance, active/published state, tool policy checks, audit, and no script execution by default."
    - risk: "Large skill bodies overload context."
      severity: "medium"
      mitigation: "Metadata-first resolution, size limits, support-file lazy loading, summary snippets."
    - risk: "Skill binding causes agents to over-trigger irrelevant skills."
      severity: "medium"
      mitigation: "Explicit binding scopes, trigger modes, relevance threshold, manual invocation support."
```

## 8. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve application/domain/infrastructure separation."
    - "Keep shared schemas in packages/shared and backend-specific persistence in apps/server."
    - "Prefer dependency injection through createRepositories/server composition."
    - "Do not introduce circular dependencies between agent runtime and HTTP routes."
  project_specific:
    - "Do not replace static skills/agents/* loading; extend it with a registry-backed path."
    - "Every persisted skill mutation must create a new revision or explicit audit event."
    - "Published skill revisions are immutable."
    - "Draft revisions are never injected into agents."
    - "Agents must record which skill revision ids were used in run metadata/events."
```

## 9. Coding Rules

```yaml
coding_rules:
  general:
    - "Read existing repository, route, migration, and shared schema patterns before editing."
    - "Use Zod schemas for all external inputs and persisted JSON fields."
    - "Keep API errors actionable and non-leaky."
    - "Do not hardcode absolute user paths except existing repository-root assumptions already present in config."
  backend:
    - "Add a numbered SQL migration and a matching repository test."
    - "Use transactions for publish operations that write revision, files, validation report, and binding changes together."
    - "Use content hashes to detect duplicate revisions."
    - "Reject path traversal, symlinks outside allowed skill roots, binary files, oversized files, and unsupported extensions."
    - "Do not execute user-created skill scripts in this spec."
  tests:
    - "Cover schema validation, repository persistence, route behavior, seed import, prompt injection, and audit events."
```

## 10. Contracts And Invariants

```yaml
contracts:
  api_contracts:
    - name: "GET /api/agent-skills"
      producer: "agentSkillRoutes"
      consumers:
        - "Skill catalog frontend"
      request_shape: "query: scope?, sourceType?, agentName?, status?, search?"
      response_shape: "{ skills: AgentSkillSummary[] }"
      compatibility: "can extend with optional fields only"

    - name: "GET /api/agent-skills/:skillId"
      producer: "agentSkillRoutes"
      consumers:
        - "Skill detail frontend"
      request_shape: "path skillId"
      response_shape: "{ skill, activeRevision, revisions, files, bindings, validationReports }"
      compatibility: "can extend with optional fields only"

    - name: "POST /api/agent-skills"
      producer: "agentSkillRoutes"
      consumers:
        - "Create skill frontend"
      request_shape: "CreateAgentSkillInput"
      response_shape: "{ skill, draftRevision, validationReport }"
      compatibility: "must validate and reject malformed bundles"

    - name: "POST /api/agent-skills/:skillId/revisions/:revisionId/publish"
      producer: "agentSkillRoutes"
      consumers:
        - "Publish skill frontend"
      request_shape: "{ expectedRevisionHash, bindingUpdates? }"
      response_shape: "{ skill, activeRevision, bindings }"
      compatibility: "must be atomic and reject stale revisions"

    - name: "POST /api/agent-skills/:skillId/validate"
      producer: "agentSkillRoutes"
      consumers:
        - "Skill editor frontend"
      request_shape: "{ revisionDraft }"
      response_shape: "{ validationReport }"
      compatibility: "does not publish or bind by itself"

    - name: "GET /api/agent-skills/runtime/agents/:agentName"
      producer: "agentSkillRoutes or internal service"
      consumers:
        - "Agent prompt builders"
      request_shape: "agentName + optional projectWorkspaceId/userStoryId/context"
      response_shape: "{ skills: RuntimeAgentSkill[] }"
      compatibility: "must include only active, validated, compatible revisions"

  domain_contracts:
    - name: "Published revision immutability"
      producer: "AgentSkillRegistryService"
      consumers:
        - "Audit trail"
        - "Agent runtime"
      invariant: "Once status is published, SKILL.md body and support files cannot mutate; changes create a new revision."

    - name: "Agent compatibility"
      producer: "AgentSkillValidationService"
      consumers:
        - "publish route"
        - "runtime resolver"
      invariant: "A skill is injectable only if validation status is passed and all active bindings target known agents."

    - name: "No script execution by default"
      producer: "AgentSkillValidationService"
      consumers:
        - "Agent runtime"
        - "Security policy"
      invariant: "Supporting scripts may be stored as resources but cannot be executed unless a future explicit policy enables them."

  data_contracts:
    - name: "agent_skills"
      producer: "migration 006"
      consumers:
        - "PostgresAgentSkillRepository"
      migration_required: true
      compatibility_notes: "Stores stable identity, source type, scope, status, active revision, timestamps, created_by."

    - name: "agent_skill_revisions"
      producer: "migration 006"
      consumers:
        - "PostgresAgentSkillRepository"
        - "AgentSkillValidationService"
      migration_required: true
      compatibility_notes: "Stores immutable revision body, parsed frontmatter, content hash, validation status."

    - name: "agent_skill_bindings"
      producer: "migration 006"
      consumers:
        - "Runtime skill resolver"
      migration_required: true
      compatibility_notes: "Maps skill revision or skill id to agent profile id with trigger mode and priority."
```

## 11. Proposed Database Shape

```yaml
database_plan:
  migration_file: "apps/server/src/infrastructure/database/migrations/006_agent_skill_registry.sql"
  tables:
    agent_skills:
      columns:
        - "id uuid primary key"
        - "slug text unique not null"
        - "display_name text not null"
        - "description text not null"
        - "scope text not null check in ('system','project','workspace')"
        - "source_type text not null check in ('filesystem_seed','database','imported_bundle')"
        - "source_path text null"
        - "status text not null check in ('draft','active','archived')"
        - "active_revision_id uuid null"
        - "created_by text null"
        - "created_at timestamptz not null"
        - "updated_at timestamptz not null"
    agent_skill_revisions:
      columns:
        - "id uuid primary key"
        - "skill_id uuid not null references agent_skills(id) on delete cascade"
        - "revision_number integer not null"
        - "status text not null check in ('draft','validated','published','rejected','archived')"
        - "skill_md text not null"
        - "frontmatter jsonb not null default '{}'::jsonb"
        - "content_hash text not null"
        - "validation_status text not null check in ('pending','passed','failed')"
        - "created_at timestamptz not null"
        - "published_at timestamptz null"
      constraints:
        - "unique(skill_id, revision_number)"
        - "unique(skill_id, content_hash)"
    agent_skill_files:
      columns:
        - "id uuid primary key"
        - "revision_id uuid not null references agent_skill_revisions(id) on delete cascade"
        - "relative_path text not null"
        - "media_type text not null"
        - "size_bytes integer not null check >= 0"
        - "content_text text null"
        - "content_sha256 text not null"
      constraints:
        - "unique(revision_id, relative_path)"
    agent_skill_bindings:
      columns:
        - "id uuid primary key"
        - "skill_id uuid not null references agent_skills(id) on delete cascade"
        - "agent_profile_id text not null"
        - "trigger_mode text not null check in ('automatic','manual','disabled')"
        - "priority integer not null default 100"
        - "enabled boolean not null default true"
        - "created_at timestamptz not null"
        - "updated_at timestamptz not null"
      indexes:
        - "agent_profile_id, enabled, priority"
    agent_skill_validation_reports:
      columns:
        - "id uuid primary key"
        - "revision_id uuid not null references agent_skill_revisions(id) on delete cascade"
        - "status text not null check in ('passed','failed')"
        - "checks jsonb not null default '[]'"
        - "issues jsonb not null default '[]'"
        - "created_at timestamptz not null"
    agent_skill_usage_events:
      columns:
        - "id uuid primary key"
        - "skill_id uuid not null references agent_skills(id) on delete cascade"
        - "revision_id uuid not null references agent_skill_revisions(id) on delete cascade"
        - "workflow_thread_id uuid null"
        - "agent_profile_id text not null"
        - "trigger_mode text not null"
        - "trigger_reason text null"
        - "created_at timestamptz not null"
```

## 12. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect existing skill loading and agent prompt surfaces"
    agent: "repo_explorer"
    action: "Read loadAgentSkill, all agent prompt builders, AgentProfileRegistry, repository contracts, migrations, and shared exports."
    expected_output: "Exact integration map and current static skill behavior."

  - step: 2
    name: "Define shared schemas"
    agent: "backend_specialist"
    action: "Create AgentSkill shared entity schemas for skill summary/detail/revision/file/binding/validation/input/output."
    expected_output: "Typed shared contracts exported from packages/shared."

  - step: 3
    name: "Add migration and repositories"
    agent: "backend_specialist"
    action: "Create migration 006, Postgres repository, file fallback repository, and repository interface methods."
    expected_output: "Persistent registry with roundtrip tests."

  - step: 4
    name: "Build validation and seeding services"
    agent: "backend_specialist"
    action: "Implement SKILL.md parser, frontmatter extraction, content hashing, source-path safety, support-file validation, and filesystem seed import."
    expected_output: "Validation reports and idempotent seed import."

  - step: 5
    name: "Expose APIs"
    agent: "backend_specialist"
    action: "Add agentSkillRoutes and mount them in server.ts with typed error handling."
    expected_output: "Catalog/detail/create/update/validate/publish/archive/bind endpoints."

  - step: 6
    name: "Integrate runtime skill resolution"
    agent: "backend_specialist"
    action: "Extend loadAgentSkill or add a registry-aware resolver that returns static skill content plus active dynamic skills for a target agent."
    expected_output: "Agents can consume active skill revisions without breaking existing static skill tests."

  - step: 7
    name: "Audit usage"
    agent: "backend_specialist"
    action: "Record skill usage events when a workflow node consumes dynamic skills."
    expected_output: "Traceable skill_id/revision_id in workflow event metadata or usage table."

  - step: 8
    name: "Validate"
    agent: "qa_specialist"
    action: "Run shared/backend tests, migration tests, prompt tests, and a manual route smoke with curl if server is available."
    expected_output: "Validation evidence with commands, cwd, exit codes, and route responses."
```

## 13. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm backend boundaries, persistence ownership, and no static skill regression."
    inputs:
      - "This SDD"
      - "Existing skill loader and agent prompt files"
    outputs:
      - "Architecture notes and any required contract amendments"

  - agent_name: "backend_specialist"
    responsibility: "Implement shared schemas, DB migration, repositories, services, routes, and runtime resolver."
    inputs:
      - "Affected backend files"
      - "Database plan"
      - "Research basis"
    outputs:
      - "Backend diff"
      - "Repository and route tests"

  - agent_name: "qa_specialist"
    responsibility: "Validate migrations, route contracts, dynamic skill injection, and security rejection paths."
    inputs:
      - "Diff"
      - "Acceptance criteria"
    outputs:
      - "Test report"
      - "Remaining risks"
```

## 14. Acceptance Criteria

```yaml
acceptance_criteria:
  functional:
    - "GET /api/agent-skills returns existing skills/agents/* skills as read-only filesystem_seed skills."
    - "POST /api/agent-skills creates a draft skill revision with validation report."
    - "Publish endpoint refuses invalid, unsafe, stale, or unvalidated revisions."
    - "Published skills can be bound to one or more known agent profiles."
    - "Agent runtime can resolve active skills for an agent and includes revision id/provenance."
  integration:
    - "Existing static skill behavior remains unchanged when registry is empty or unavailable."
    - "Postgres and file fallback repositories expose the same contract."
    - "Frontend shared types can consume route responses without local duplicate shapes."
  architectural:
    - "Published revisions are immutable."
    - "No user-created support script is executed by default."
    - "Database writes for publish/bind are atomic."
  quality:
    - "pnpm test passes."
    - "New schema, repository, validation, route, and prompt tests cover success and failure paths."
  observability:
    - "Every publish/bind/archive and every runtime use is auditable by skill_id and revision_id."
```

## 15. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm build"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Compile shared schemas, server, web consumers, and docs."
      success_condition: "exit code 0"
    - command: "pnpm test"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Run existing and new backend/shared regression tests."
      success_condition: "exit code 0 and all tests pass"
    - command: "pnpm --filter @u-build/server test || node --test apps/server/test/*agentSkill*.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      purpose: "Focused backend validation when full test is too slow."
      success_condition: "exit code 0"
  runtime_checks:
    - name: "Catalog route smoke"
      method: "curl"
      expected: "GET /api/agent-skills returns at least the existing project skills."
    - name: "Create and publish smoke"
      method: "curl or route test"
      expected: "Valid SKILL.md draft can be validated, published, and bound to Front Agent."
  integration_checks:
    - name: "Agent prompt consumes dynamic skill"
      surfaces:
        - "AgentSkillRegistryService"
        - "FrontAgentImpl or SpecAgentImpl"
      method: "unit/integration test"
      expected: "Prompt contains selected skill metadata/content and usage audit records revision id."
    - name: "Invalid skill rejected"
      surfaces:
        - "AgentSkillValidationService"
        - "publish route"
      method: "unit/route test"
      expected: "Malformed frontmatter, path traversal, oversized file, or disallowed tool binding is rejected."
  manual_checks:
    - "Inspect seeded skills and confirm display names/descriptions are useful for frontend catalog."
```

## 16. Agent Error-Mitigation Rules

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent route naming; inspect existing route conventions first."
    - "Do not assume migration number 006 if new migrations appeared; verify before editing."
    - "Do not claim Codex/Claude parity without matching SKILL.md bundle semantics."
  read_before_write:
    - "Read loadAgentSkill, createRepositories, runtimeConfig, migrations, and all existing skills/agents/*/SKILL.md before implementation."
    - "Search for consumers before changing shared schemas."
  failure_handling:
    - "If migration fails, inspect SQL error and schema_migrations state before retry."
    - "If prompt tests fail, preserve existing static skill content and add dynamic skills after it."
  state_consistency:
    - "If adding database fields, update shared schema, repository, route response, and tests together."
    - "If adding workflow event metadata, update event schema and consumers together."
  scope_control:
    - "Do not implement the frontend in this backend spec."
    - "Do not enable arbitrary script execution."
```

## 17. Recovery And Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary database connection issue"
    - "dev server route smoke unavailable"
    - "test cache flake"
  non_retryable_failures:
    - "schema migration conflict"
    - "unknown agent profile id"
    - "unsafe skill bundle"
    - "unsupported support file type"
  rollback_rules:
    - "Rollback only files introduced by this task if implementation must be abandoned."
    - "Do not revert user changes or prior committed work."
    - "If migration has already run locally, add a forward fix migration instead of deleting applied state."
  escalation_rules:
    - "Escalate if user wants script execution from user-created skills in the same pass."
    - "Escalate if marketplace/team sharing is required."
```

## 18. Observability Requirements

```yaml
observability:
  logs:
    - event: "agent_skill_validated"
      fields:
        - "skill_id"
        - "revision_id"
        - "status"
        - "issue_count"
        - "duration_ms"
    - event: "agent_skill_published"
      fields:
        - "skill_id"
        - "revision_id"
        - "created_by"
    - event: "agent_skill_used"
      fields:
        - "workflow_thread_id"
        - "agent_profile_id"
        - "skill_id"
        - "revision_id"
        - "trigger_mode"
  audit_trail:
    required: true
    must_capture:
      - "skill creation"
      - "revision creation"
      - "validation result"
      - "publish/archive"
      - "binding changes"
      - "runtime use by agent"
  user_visible_failures:
    - "Show validation issue with file/path/section."
    - "Show binding incompatibility with agent/tool reason."
    - "Show publish blocked due to stale revision hash."
```

## 19. Risks And Unknowns

```yaml
risks:
  - risk: "Skill instructions become a high-trust prompt injection path."
    severity: "high"
    mitigation: "Validation, provenance, explicit publish, no script execution, and audit."
  - risk: "Dynamic skill loading bloats every prompt."
    severity: "medium"
    mitigation: "Metadata-first resolution and relevance/binding filters."
  - risk: "Filesystem seed and DB records drift."
    severity: "medium"
    mitigation: "Read-only source metadata, content hashes, and idempotent import."
unknowns:
  - question: "Should skills be scoped only to the whole Horus project, or also to workspace folders/project workspaces?"
    resolution_strategy: "Implement schema with optional workspace/project scope fields, default to project-wide for first release."
  - question: "Should user-created skills support scripts later?"
    resolution_strategy: "Store support files but keep execution disabled until a dedicated security spec."
```

## 20. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Build the registry as an additive persistence layer. Seed existing filesystem skills as read-only
    records; create new DB-backed skills through APIs; inject only active, validated revisions into
    agent prompt builders. Keep scripts/resources as stored support files but do not execute scripts.
  alternatives_considered:
    - option: "Only manage filesystem skills"
      tradeoff: "Simpler but no reliable revisions, UI persistence, audit, or remote/server deployment story."
    - option: "Only store skills in database"
      tradeoff: "Breaks existing repo skill conventions and makes local development less transparent."
    - option: "Allow scripts immediately"
      tradeoff: "Closer to Codex/Claude power but too risky without a separate tool-permission sandbox."
  migration_notes:
    - "Verify next migration number before implementation."
    - "Add indexes for status, agent binding lookup, and slug uniqueness."
  backward_compatibility:
    required: true
    notes:
      - "Existing skills/agents/* files must keep working if database is empty."
      - "Existing tests around agent prompts must not regress."
```

## 21. Deliverables

```yaml
deliverables:
  code:
    - "Shared AgentSkill schemas"
    - "Database migration"
    - "Repositories"
    - "Validation and registry services"
    - "HTTP routes"
    - "Runtime resolver integration"
  tests:
    - "Schema tests"
    - "Migration/repository tests"
    - "Validation service tests"
    - "Route tests"
    - "Agent prompt/runtime resolver tests"
  docs:
    - "Short developer note on skill bundle shape and security rules, if repo documentation pattern exists."
  validation_evidence:
    - "pnpm test"
    - "Route smoke output"
    - "Example seeded skill catalog response"
```

## 22. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Existing static skill loader was read."
    - "Agent prompt builders were read."
    - "Database/repository patterns were read."
    - "Upstream dependencies and downstream consumers were mapped."
  implementation:
    - "Shared contracts added."
    - "Migration and repositories added."
    - "Validation service rejects unsafe/malformed bundles."
    - "APIs expose catalog/detail/create/validate/publish/archive/bind."
    - "Runtime resolver injects only active validated skills."
    - "Usage audit records skill_id and revision_id."
  validation:
    - "Relevant unit/integration tests pass."
    - "Full pnpm test passes or exact blocker is reported."
    - "Route smoke confirms catalog and create/publish behavior."
  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

## Minimal Output Contract For Executing Agents

```yaml
agent_result:
  status: "<completed | failed | blocked>"
  summary: "<short factual summary>"
  files_read:
    - "<path>"
  files_changed:
    - "<path>"
  commands_run:
    - command: "<command>"
      cwd: "<cwd>"
      exit_code: "<exit code>"
      result: "<short result>"
  validation:
    passed:
      - "<check>"
    failed:
      - "<check>"
  remaining_risks:
    - "<risk or empty>"
  next_recommended_action: "<action or none>"
```
