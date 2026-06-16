# SDD: Multiprovider LLM Runtime

## 1. Metadata

```yaml
format_version: "agentic_sdd.v1"
task_id: "horus-multiprovider-llm-runtime"
title: "Multiprovider LLM Runtime"
created_at_utc: "2026-05-26T10:00:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "medium"
```

## 2. Original User Request

```yaml
raw_user_request: |
  ajuste o projeto para ser multiprovedor, seja openai, openrouter, groq(o provider). use a skill de spec para planejar essa tarefa antes de implementá-la

  use a skill creating-sdd-specs
```

## 3. System Interpretation

```yaml
system_translation: |
  Refactor Horus.AI's LLM infrastructure so all agent calls can run through OpenAI, OpenRouter, or Groq, selected by environment configuration. Planning must happen first through the creating-sdd-specs SDD format. Implementation must not hardcode one provider in individual agent files.

  In scope:
    - Backend LLM provider abstraction.
    - Environment-based provider/model/key resolution.
    - Refactor existing Spec, Front, QA, and Curator agent model construction.
    - Offline tests for provider resolution and failure behavior.
    - Documentation of environment variables.

  Out of scope:
    - Frontend provider selection UI.
    - Live calls to paid provider APIs unless explicitly requested later.
    - Changing LangGraph workflow semantics.
    - Changing prompts beyond what is required to preserve current behavior.
```

## 4. Business / Product Context

```yaml
business_context:
  user_problem: "The project is locked to a single direct provider implementation, making provider choice, cost control, and deployment portability weak."
  target_user: "Developers/operators running Horus.AI workflows."
  expected_outcome: "The same workflow can be run with OpenAI, OpenRouter, or Groq by changing environment variables."
  product_surface:
    - "Backend agent runtime"
    - "LLM configuration"
    - "Workflow execution"
```

## 5. Technical Context

```yaml
technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "Express"
      - "LangGraph"
      - "LangChain chat model wrappers"
      - "Zod"
    frontend:
      - "React"
      - "Vite"
      - "Tailwind CSS"
    database:
      - "None"
      - "JSON workflow storage under data/workflows"
    infra:
      - "pnpm workspace"
      - "Turbo"
  known_entrypoints:
    - "apps/server/src/main.ts"
    - "apps/server/src/infrastructure/http/server.ts"
    - "apps/web/src/main.tsx"
  known_existing_patterns:
    - "Backend uses infrastructure modules for adapters and agents."
    - "Agent files currently own prompt construction and model invocation."
    - "Shared contracts live in packages/shared and are exported through packages/shared/src/index.ts."
    - "Tests use built-in node:test against compiled dist output."
```

Agents must verify these paths before editing.

## 6. Scope

```yaml
scope:
  in_scope:
    - "Create a server-side LLM provider config layer."
    - "Create a server-side chat model factory."
    - "Support provider values: openai, openrouter, groq."
    - "Support global provider/model defaults and per-agent overrides."
    - "Refactor SpecAgentImpl, FrontAgentImpl, QaAgentImpl, and CuratorAgentImpl to use the factory."
    - "Add offline tests for provider config behavior."
    - "Add .env.example or equivalent environment documentation."
  out_of_scope:
    - "Provider picker in the React UI."
    - "New database persistence."
    - "Prompt redesign."
    - "LangGraph topology changes."
    - "Live provider smoke tests without explicit credentials and permission."
    - "Unrelated cleanup of previous correction work."
```

## 7. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/package.json"
      - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
      - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
      - "apps/server/src/infrastructure/llm/providerConfig.ts"
      - "apps/server/src/infrastructure/llm/createChatModel.ts"
    services:
      - "LLM provider resolution"
      - "Agent runtime model construction"
    database:
      migrations_required: false
      tables: []
  frontend:
    files: []
    components: []
    routes: []
  tests:
    unit:
      - "apps/server/test/providerConfig.test.mjs"
      - "apps/server/test/createChatModelConfig.test.mjs if factory logic is split for testing"
    integration: []
    e2e: []
```

## 8. Architecture Rules

```yaml
architecture_rules:
  principles:
    - "Follow existing repository patterns before introducing new abstractions."
    - "Preserve bounded context ownership."
    - "Keep application, domain, infrastructure, and presentation concerns separated."
    - "Prefer dependency injection or factories over direct construction of concrete services."
    - "Avoid god classes, god components, and state objects with unrelated responsibilities."
    - "Do not introduce circular dependencies."
    - "Do not duplicate provider resolution rules across agents."

  project_specific_rules:
    - "Agent files may keep prompt construction and response parsing."
    - "Agent files must not instantiate provider-specific chat models directly."
    - "Provider config belongs in apps/server/src/infrastructure/llm."
    - "Shared package should not depend on provider SDKs."
    - "Unit tests must avoid network calls and API keys."
```

## 9. Coding Rules

```yaml
coding_rules:
  general:
    - "Read relevant files before editing."
    - "Prefer small, cohesive functions."
    - "Keep public API compatibility unless explicitly required."
    - "Use typed data structures instead of unstructured dictionaries when possible."
    - "Handle errors explicitly with actionable messages."
    - "Avoid silent fallbacks unless logged and intentional."

  backend:
    - "Validate provider names and required keys before model construction."
    - "Do not log secret values."
    - "Keep provider defaults centralized."
    - "Preserve existing structured output parsing behavior."
    - "Do not bypass existing agent function contracts."

  frontend:
    - "No frontend work is required for this SDD."

  tests:
    - "Add tests proportional to risk."
    - "Cover success, failure, and edge cases."
    - "Do not mark work complete without running relevant validation."
```

## 10. Constraints

```yaml
technical_constraints:
  - "OpenAI, OpenRouter, and Groq must be selectable without code edits."
  - "Provider selection must work per agent role."
  - "Structured output must remain available for Spec, QA, and Curator agents."
  - "No unit test may require real provider credentials."
  - "The current workflow graph must keep the same public behavior."

operational_constraints:
  - "Do not run destructive commands."
  - "Do not overwrite user changes."
  - "Do not assume dependencies are installed without checking."
  - "Do not claim success without command output or runtime evidence."
  - "Network dependency installation may require approval if sandbox blocks it."
```

## 11. Data / Contract Requirements

```yaml
contracts:
  api_contracts: []

  domain_contracts:
    - name: "LlmProvider"
      invariant: "Provider must be one of openai, openrouter, groq."
    - name: "AgentRole"
      invariant: "Role must be one of spec, front, qa, curator."
    - name: "Provider credential"
      invariant: "Selected provider must have its matching API key configured."
    - name: "Model resolution"
      invariant: "Each role must resolve to an explicit model string."

  ui_contracts: []
```

## 12. Execution Plan

```yaml
execution_plan:
  - step: 1
    name: "Inspect current implementation"
    agent: "repo_explorer"
    action: "Read existing agent files, package dependencies, and tests."
    expected_output: "Implementation map confirming direct ChatAnthropic usage and current test pattern."

  - step: 2
    name: "Add provider config"
    agent: "backend"
    action: "Create providerConfig.ts with provider parsing, role-specific env resolution, key lookup, base URL defaults, and clear errors."
    expected_output: "Pure config module with no network or provider SDK side effects."

  - step: 3
    name: "Add LangChain-backed chat model factory"
    agent: "backend"
    action: "Create createChatModel.ts that selects the proper LangChain chat wrapper for openai, openrouter, or groq."
    expected_output: "Single local factory using ready LangChain integrations while keeping agents provider-agnostic."

  - step: 4
    name: "Refactor agents"
    agent: "backend"
    action: "Replace direct ChatAnthropic construction in Spec, Front, QA, and Curator agents with createChatModel(role, defaults)."
    expected_output: "Agents preserve their current exported functions and prompts."

  - step: 5
    name: "Update dependencies and docs"
    agent: "backend"
    action: "Add required LangChain provider packages, remove @langchain/anthropic if unused, and document env vars in .env.example."
    expected_output: "Dependencies and docs match provider runtime."

  - step: 6
    name: "Add tests"
    agent: "qa"
    action: "Add offline tests for provider parsing, overrides, key validation, and base URLs."
    expected_output: "node:test coverage with no live API calls."

  - step: 7
    name: "Validate"
    agent: "qa"
    action: "Run pnpm type-check, pnpm test, and pnpm build."
    expected_output: "Validation evidence with commands, cwd, exit codes, and result."
```

## 13. Agent Assignment Plan

```yaml
agent_assignments:
  - agent_name: "architect"
    responsibility: "Confirm provider abstraction boundaries and environment contract."
    inputs:
      - "This SDD"
      - "apps/server/src/infrastructure/agents/*"
      - "apps/server/package.json"
    outputs:
      - "Architecture decision notes"

  - agent_name: "backend_specialist"
    responsibility: "Implement provider config, factory, dependency updates, and agent refactor."
    inputs:
      - "Affected backend files"
      - "Environment contract"
    outputs:
      - "Backend diff"
      - "Provider config tests"

  - agent_name: "qa_specialist"
    responsibility: "Validate config behavior, build, and test suite."
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
    - "Server can resolve LLM_PROVIDER=openai with OPENAI_API_KEY and LLM_MODEL."
    - "Server can resolve LLM_PROVIDER=openrouter with OPENROUTER_API_KEY and LLM_MODEL."
    - "Server can resolve LLM_PROVIDER=groq with GROQ_API_KEY and LLM_MODEL."
    - "Agent-specific provider/model overrides work."
    - "Spec, Front, QA, and Curator agents preserve their public function signatures."

  architectural:
    - "No agent file imports @langchain/anthropic, @langchain/openai, @langchain/openrouter, @langchain/groq, or provider-specific SDKs directly."
    - "Provider resolution is centralized in infrastructure/llm."
    - "Shared package has no provider SDK dependency."
    - "No LangGraph workflow topology changes are introduced."

  quality:
    - "Offline provider config tests pass."
    - "pnpm type-check passes."
    - "pnpm test passes."
    - "pnpm build passes."

  observability:
    - "Missing API key errors name the missing variable and selected provider."
    - "Unsupported provider errors list valid provider names."
    - "No secret values are logged."
```

## 15. Validation Protocol

```yaml
validation_protocol:
  required_commands:
    - command: "pnpm type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate TypeScript contracts across workspace."
      success_condition: "Exit code 0."

    - command: "pnpm test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Run offline regression tests, including provider config tests."
      success_condition: "Exit code 0 and all tests pass."

    - command: "pnpm build"
      cwd: "/Users/wamat/Desktop/horus.ai"
      purpose: "Validate production build output."
      success_condition: "Exit code 0."

  runtime_checks:
    - name: "OpenAI config resolution"
      method: "test"
      expected: "openai resolves baseURL, model, and key from env object without network call."
    - name: "OpenRouter config resolution"
      method: "test"
      expected: "openrouter resolves baseURL, model, and key from env object without network call."
    - name: "Groq config resolution"
      method: "test"
      expected: "groq resolves baseURL, model, and key from env object without network call."

  manual_checks:
    - "Optional: run one workflow with a real provider key only after user approves credentials/runtime test."
```

## 16. Error-Mitigation Rules for Agents

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent provider SDK APIs; inspect installed docs/types or package usage."
    - "Do not invent model IDs as defaults unless explicitly accepted."
    - "Never claim a command was run unless it was actually executed."

  read_before_write:
    - "Before editing a file, read the surrounding implementation."
    - "Before creating a new abstraction, search for an existing pattern."
    - "Before removing @langchain/anthropic, verify no imports remain."

  failure_handling:
    - "If dependency install fails due to sandbox/network, rerun with approval as required."
    - "If typecheck fails due to LangChain constructor options, inspect installed package types."
    - "If unable to validate live provider behavior due to missing credentials, report that explicitly."

  state_consistency:
    - "Do not update only one agent; all four LLM-backed agents must use the new factory."
    - "If env contracts change, update .env.example and tests."

  scope_control:
    - "Do not modify workflow graph routing."
    - "Do not refactor prompts except to preserve current behavior."
    - "Do not add frontend UI for provider selection."
```

## 17. Recovery / Retry Strategy

```yaml
recovery_strategy:
  retryable_failures:
    - "temporary dependency registry/network failure"
    - "type mismatch caused by incorrect constructor option name"
    - "test assertion mismatch in provider config"

  non_retryable_failures:
    - "missing required provider API key for live runtime"
    - "unsupported provider requested"
    - "model missing for selected provider"

  rollback_rules:
    - "Do not rollback user changes."
    - "Rollback only changes introduced by this task."
    - "If rollback is unsafe, stop and report the state."

  escalation_rules:
    - "Ask user whether Anthropic should remain if they require backward compatibility."
    - "Ask user before live API smoke tests that consume provider credits."
    - "Escalate if dependency installation requires network approval."
```

## 18. Observability Requirements

```yaml
observability:
  logs:
    - event: "llm_config_error"
      fields:
        - "provider"
        - "agent_role"
        - "missing_env_var"
        - "error_type"
    - event: "llm_model_selected"
      fields:
        - "provider"
        - "agent_role"
        - "model"
        - "base_url"

  audit_trail:
    required: true
    must_capture:
      - "files read"
      - "files changed"
      - "commands executed"
      - "test results"
      - "provider config decisions"

  user_visible_failures:
    - "Workflow failure should expose actionable provider config errors through existing error event path."
```

## 19. Risks and Unknowns

```yaml
risks:
  - risk: "Structured output behavior may vary across providers/models."
    severity: "medium"
    mitigation: "Keep parsing retries and fallback errors; test config offline and optionally smoke test each provider manually."
  - risk: "Some provider/model combinations may not support the same JSON/schema behavior expected by withStructuredOutput."
    severity: "medium"
    mitigation: "Document recommended models and report provider-specific failures clearly."
  - risk: "Removing Anthropic may break existing local envs."
    severity: "low"
    mitigation: "Confirm whether Anthropic should stay as a legacy provider before removing dependency."

unknowns:
  - question: "Should Anthropic remain supported as a fourth legacy provider?"
    resolution_strategy: "Ask user or implement only requested providers and remove Anthropic if unused."
  - question: "What exact default model IDs should be used for OpenAI, OpenRouter, and Groq?"
    resolution_strategy: "Prefer requiring LLM_MODEL explicitly instead of hardcoding defaults."
  - question: "Should stronger defaults be used for QA/Curator than Spec/Front?"
    resolution_strategy: "Support per-agent overrides; default all roles to global config initially."
```

## 20. Implementation Notes

```yaml
implementation_notes:
  preferred_approach: |
    Use ready LangChain JS integrations behind a single local factory:
      - OpenAI -> ChatOpenAI from @langchain/openai
      - OpenRouter -> ChatOpenRouter from @langchain/openrouter
      - Groq -> ChatGroq from @langchain/groq

    This avoids forcing every provider through ChatOpenAI while keeping Horus.AI provider-agnostic outside the factory. The factory is the only place allowed to import provider packages. Agents call createChatModel(role, defaults) and keep their current prompt/output responsibilities.

    LangChain JS also documents initChatModel as a universal initializer. It can be reconsidered after dependency installation, but the first implementation should prefer explicit provider wrappers because they are easier to type, test, and reason about in this existing workspace.

  alternatives_considered:
    - option: "Use ChatOpenAI for OpenAI, OpenRouter, and Groq through custom base URLs."
      tradeoff: "Simpler dependency graph, but hides provider-specific LangChain support and may miss wrapper-specific behavior."
    - option: "Use LangChain universal initChatModel."
      tradeoff: "Attractive generic API, but adds another dependency surface and may be harder to validate against the currently installed workspace."
    - option: "Keep direct provider construction inside each agent."
      tradeoff: "Repeats config logic and recreates the current hardcoding problem."
    - option: "Write a raw HTTP adapter with fetch."
      tradeoff: "Avoids provider packages, but discards LangChain BaseChatModel compatibility and structured output integration."
    - option: "Add provider selection to frontend."
      tradeoff: "Not requested and increases scope/security concerns around provider keys."

  migration_notes:
    - "Add @langchain/openai."
    - "Add @langchain/openrouter."
    - "Add @langchain/groq."
    - "Remove @langchain/anthropic only if no legacy Anthropic support is retained."
    - "Add .env.example with all required and optional variables."

  backward_compatibility:
    required: true
    notes:
      - "Existing agent exported functions must remain compatible."
      - "Existing workflow API and frontend behavior must remain unchanged."
      - "Existing tests must continue passing."
```

## 21. Deliverables

```yaml
deliverables:
  code:
    - "apps/server/src/infrastructure/llm/providerConfig.ts"
    - "apps/server/src/infrastructure/llm/createChatModel.ts"
    - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/package.json"
  tests:
    - "apps/server/test/providerConfig.test.mjs"
    - "apps/server/test/createChatModel.test.mjs if provider package constructors can be validated without network calls"
  docs:
    - ".env.example"
    - "spec/features/07-multi-provider-llm.md"
  validation_evidence:
    - "pnpm type-check output"
    - "pnpm test output"
    - "pnpm build output"
```

## 22. Completion Checklist

```yaml
completion_checklist:
  repository_understood:
    - "Relevant files were read."
    - "Existing patterns were identified."

  implementation:
    - "Changes are scoped to this SDD."
    - "Architecture rules were followed."
    - "No unrelated refactor was introduced."
    - "All four LLM-backed agents use the factory."

  validation:
    - "Provider config tests were run."
    - "Build/typecheck/test were run."
    - "Live runtime behavior was checked only if credentials were available and approved."

  reporting:
    - "Files changed are listed."
    - "Commands run are listed."
    - "Known remaining risks are disclosed."
```

## Minimal Output Contract For Implementing Agent

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

## Implementation Log

- 2026-05-26: SDD created using `creating-sdd-specs`; implementation not started.
- 2026-05-26: Checked current LangChain JS docs and local dependencies. Revised preferred approach to use ready provider wrappers `ChatOpenAI`, `ChatOpenRouter`, and `ChatGroq` behind a local factory instead of forcing all providers through `ChatOpenAI` or writing a raw HTTP adapter.
- 2026-05-26: Installed required LangChain provider dependencies for the server: `@langchain/openai`, `@langchain/openrouter`, `@langchain/groq`, and aligned `@langchain/core`.
- 2026-05-26: Removed unused `@langchain/anthropic` dependency and confirmed no `ChatAnthropic` or `@langchain/anthropic` references remain outside generated build output.
- 2026-05-26: Added `apps/server/src/infrastructure/llm/providerConfig.ts` for provider parsing, API key validation, base URL defaults, and global/per-agent environment resolution.
- 2026-05-26: Added `apps/server/src/infrastructure/llm/createChatModel.ts` as the only provider-specific LangChain construction point.
- 2026-05-26: Refactored Spec, Front, QA, and Curator agents to call `createChatModel(role, defaults)` and preserve existing prompt/output responsibilities.
- 2026-05-26: Added `.env.example` with required global provider/model settings, provider keys, optional base URLs, per-agent overrides, and per-agent tuning.
- 2026-05-26: Added offline provider config tests in `apps/server/test/providerConfig.test.mjs`.
- 2026-05-26: Validation passed:
  - `pnpm type-check` from `/Users/wamat/Desktop/horus.ai`: exit 0.
  - `pnpm test` from `/Users/wamat/Desktop/horus.ai`: exit 0; build completed and 17 tests passed.

## Implementation Result

```yaml
agent_result:
  status: "completed"
  summary: "Horus.AI backend now resolves OpenAI, OpenRouter, or Groq through a centralized LangChain-backed factory, with global and per-agent environment configuration."
  files_read:
    - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/package.json"
    - "spec/features/07-multi-provider-llm.md"
  files_changed:
    - "apps/server/package.json"
    - "pnpm-lock.yaml"
    - ".env.example"
    - "apps/server/src/infrastructure/llm/providerConfig.ts"
    - "apps/server/src/infrastructure/llm/createChatModel.ts"
    - "apps/server/src/infrastructure/agents/SpecAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/QaAgentImpl.ts"
    - "apps/server/src/infrastructure/agents/CuratorAgentImpl.ts"
    - "apps/server/test/providerConfig.test.mjs"
    - "spec/features/07-multi-provider-llm.md"
    - "spec/CHANGELOG.md"
  commands_run:
    - command: "pnpm add @langchain/openai @langchain/openrouter @langchain/groq --filter @u-build/server --store-dir /Users/wamat/Library/pnpm/store/v3"
      cwd: "/Users/wamat/Desktop/horus.ai"
      exit_code: 0
      result: "Provider packages installed."
    - command: "pnpm add @langchain/core@^1.1.48 --filter @u-build/server --store-dir /Users/wamat/Library/pnpm/store/v3"
      cwd: "/Users/wamat/Desktop/horus.ai"
      exit_code: 0
      result: "LangChain core aligned with provider package peer dependencies."
    - command: "pnpm remove @langchain/anthropic --filter @u-build/server --store-dir /Users/wamat/Library/pnpm/store/v3"
      cwd: "/Users/wamat/Desktop/horus.ai"
      exit_code: 0
      result: "Unused Anthropic package removed."
    - command: "pnpm type-check"
      cwd: "/Users/wamat/Desktop/horus.ai"
      exit_code: 0
      result: "TypeScript contracts passed across workspace."
    - command: "pnpm test"
      cwd: "/Users/wamat/Desktop/horus.ai"
      exit_code: 0
      result: "Build completed and 17 offline tests passed."
    - command: "rg \"ChatAnthropic|@langchain/anthropic\" apps/server packages apps -g '!dist'"
      cwd: "/Users/wamat/Desktop/horus.ai"
      exit_code: 1
      result: "No remaining source references found."
  validation:
    passed:
      - "Provider config supports openai, openrouter, and groq."
      - "Global defaults and per-agent overrides are covered by tests."
      - "Missing provider-specific API keys raise explicit config errors."
      - "All four LLM-backed agents use the centralized factory."
      - "pnpm type-check passed."
      - "pnpm test passed, including pnpm build."
    failed: []
  remaining_risks:
    - "No live provider smoke test was run because credentials/runtime spend were out of scope."
    - "Structured output support can still vary by selected provider and model."
  next_recommended_action: "Run one approved live workflow per provider after credentials are configured."
```
