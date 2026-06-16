---
format_version: "agentic_sdd.v1"
task_id: "feature-40-react-frontend-project-architecture"
title: "Generated Frontend Multi-Framework Architecture"
created_at_utc: "2026-05-26T23:20:29Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "high"
---

# 40 - Generated Frontend Multi-Framework Architecture

## 1. Original User Request

```yaml
raw_user_request: |
  crie uma spec extremamente rigorosa detalhando como resolve todos esses problemas, se precisar divida em 2 ou 3 specs para garantir que você conseguirá detalhar bem como resolver, integrar e modularizar a resolução de cada problema
```

## 2. System Interpretation

```yaml
system_translation: |
  Corrigir a arquitetura de frontend gerada pelos agentes. O FrontAgent não deve depender de HTML estático quando o projeto é marcado como TypeScript/React e também não deve ficar preso a um único framework. O sistema deve conseguir desenvolver nas principais linguagens e frameworks de frontend por meio de um contrato de stack explícito, extensível e sem hardcode: React, Vue, Svelte, Angular, Next.js, Nuxt, Astro, Remix, Vite vanilla, HTML/CSS/JavaScript, TypeScript e variações equivalentes suportadas pelo projeto.

expected_user_visible_result: |
  Projetos gerados aparecem no preview como aplicações reais, não como cards ou páginas HTML improvisadas. Alterações pedidas no chat modificam componentes reais de forma incremental.

expected_engineering_result: |
  O scaffold e o plano do FrontAgent passam a produzir aplicações frontend modulares conforme o `projectStack` selecionado. React/TypeScript/Vite é o primeiro alvo obrigatório, mas a arquitetura deve definir um mecanismo de stack adapters para suportar os principais frameworks de frontend com package scripts, entrypoints, componentes, estilos, tipos, adapters e validação próprios de cada stack.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "A construção atual pode gerar um HTML isolado sem estrutura de aplicação frontend sustentável."
  target_user: "Usuário final que quer abrir preview, pedir alterações e continuar evoluindo o projeto por chat/agentes."
  expected_outcome: "Aplicação gerada com arquitetura consistente, editável e validável."
  product_surface:
    - "Generated project workspace"
    - "Preview"
    - "Project file browser/editor"
    - "Chat-driven code changes"

technical_context:
  repository_root: "<REPOSITORY_ROOT>"
  relevant_stack:
    backend:
      - "ProjectWorkspaceService"
      - "ProjectExecutionService"
      - "FrontAgentImpl"
    frontend:
      - "React"
      - "TypeScript"
      - "Vue"
      - "Svelte"
      - "Angular"
      - "Next.js"
      - "Nuxt"
      - "Astro"
      - "Remix"
      - "Vite"
      - "HTML/CSS/JavaScript"
      - "Vite"
      - "CSS modules or scoped CSS by existing convention"
    database:
      - "Project construction repositories"
    infrastructure:
      - "Generated project workspaces"
      - "Preview runtime command catalog"
  known_entrypoints:
    - "apps/server/src/infrastructure/project/ProjectWorkspaceService.ts"
    - "apps/server/src/infrastructure/project/ProjectDefaultContractBuilder.ts"
    - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
    - "skills/agents/front-design-frontend/SKILL.md"
  known_existing_patterns:
    - "Project workspaces contain .horus-project.yaml command/write-root contract."
    - "FrontAgent can produce ProjectExecutionPlan file operations."
    - "ProjectExecutionService applies file operations inside writeRoots."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Replace new-project static HTML scaffold with a stack-aware frontend scaffold."
    - "Make TypeScript/React/Vite the first fully supported adapter."
    - "Define an extensible frontend stack adapter contract for React, Vue, Svelte, Angular, Next.js, Nuxt, Astro, Remix, Vite vanilla, HTML/CSS/JavaScript and TypeScript-based variants."
    - "Rewrite front-design-frontend skill to target the selected stack architecture instead of assuming standalone HTML."
    - "Update FrontAgent prompt/contracts to require component-level architecture, not standalone HTML."
    - "Require generated files to be imported from src/main.tsx or src/App.tsx."
    - "Add architecture gate for source layout, imports, buildability and forbidden runtime mocks."
    - "Ensure preview command runs the generated app for the selected framework."
  out_of_scope:
    - "Changing Horus main web app design."
    - "Adding backend APIs for generated projects unless a spec explicitly requires it."
    - "Adding external UI frameworks unless the project config permits them."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/infrastructure/project/ProjectWorkspaceService.ts"
      - "apps/server/src/infrastructure/project/ProjectDefaultContractBuilder.ts"
      - "apps/server/src/infrastructure/agents/FrontAgentImpl.ts"
      - "apps/server/src/infrastructure/code/FrontendChangeSetQualityGate.ts"
      - "skills/agents/front-design-frontend/SKILL.md"
    services:
      - "ProjectWorkspaceService"
      - "ProjectDefaultContractBuilder"
      - "FrontAgent"
      - "FrontendChangeSetQualityGate"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "generated-project/src/main.tsx"
      - "generated-project/src/App.tsx"
      - "generated-project/src/components/*"
      - "generated-project/src/features/*"
      - "generated-project/src/styles/*"
      - "generated-project/package.json"
    components:
      - "Generated app root"
      - "Generated feature components"
    routes:
      - "/"
  workflow:
    graph_nodes:
      - "frontAgent"
      - "curatorAgent"
    agents:
      - "FrontAgent"
      - "CuratorAgent"
  tests:
    unit:
      - "ProjectWorkspaceService scaffold tests"
      - "FrontendChangeSetQualityGate tests"
    integration:
      - "StartProjectConstruction generated React app build test"
    e2e:
      - "Preview opens generated React app"
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    Generated projects become real frontend applications for the selected stack. The FrontAgent must operate through stack-aware file operations and the preview/runtime layer must execute the generated app through project command catalog. React/TypeScript/Vite is the first required implementation, but the design must allow other mainstream frontend frameworks without rewriting the agent pipeline.

  depends_on:
    - name: "ProjectWorkspaceService"
      type: "backend_service"
      owner: "infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "createNewProject(input) returns ProjectWorkspace with rootPath/configPath"
      required_for: "Create the initial frontend scaffold for the selected stack."
      assumptions: []
      failure_modes:
        - "Generated project starts with wrong structure and agents patch around it."
      fallback_or_recovery: "Fail project creation if scaffold cannot be created."
      verification:
        - "Test generated package.json, index.html, src/main.tsx and src/App.tsx exist."

    - name: "ProjectDefaultContractBuilder"
      type: "backend_service"
      owner: "infrastructure/project"
      direction: "this_spec_consumes_dependency"
      contract_used: "detectCommandCatalog(projectRoot)"
      required_for: "Expose install/build/typecheck/dev commands to agents."
      assumptions: []
      failure_modes:
        - "Agents cannot validate or preview generated project for the selected framework."
      fallback_or_recovery: "Provide default command catalog per supported stack adapter."
      verification:
        - "Config contains dev/build/type-check command ids."

    - name: "FrontAgent ProjectExecutionPlan"
      type: "agent"
      owner: "infrastructure/agents"
      direction: "this_spec_consumes_dependency"
      contract_used: "fileOperations: write/delete with full file content"
      required_for: "Implement user stories as real source files."
      assumptions: []
      failure_modes:
        - "Agent creates parallel unmounted files or static HTML."
      fallback_or_recovery: "Quality gate rejects disconnected/unmounted files."
      verification:
        - "Test rejects src files not reachable from import graph."

  depended_on_by:
    - name: "PreviewRuntimeManager"
      type: "backend_service"
      owner: "infrastructure/preview"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "FrontendProject.commandCatalog + previewCommandId"
      compatibility_obligation: "must run generated project dev command consistently on macOS/Linux/Windows-compatible Node tooling"
      expected_consumer_behavior: "Preview starts generated frontend app and exposes URL."
      migration_or_notification_required: false
      verification:
        - "Runtime smoke starts project and returns preview URL."

    - name: "Project File Browser"
      type: "frontend_component"
      owner: "apps/web/features/project-files"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Generated source file tree"
      compatibility_obligation: "must keep files readable/editable with existing project file APIs"
      expected_consumer_behavior: "User can inspect and edit generated components."
      migration_or_notification_required: false
      verification:
        - "Project file browser lists src/App.tsx and feature files."

  bidirectional_integrations:
    - name: "FrontAgent and generated frontend stack architecture"
      participants:
        - "FrontAgent"
        - "FrontendChangeSetQualityGate"
        - "ProjectExecutionService"
      shared_contract: "ProjectExecutionPlan file operations over generated source tree for the selected stack"
      consistency_rule: "Every created component/page/module must be reachable from the selected stack entrypoint or route system, or rejected."
      verification:
        - "Quality gate test for reachable created component and rejected floating component."

  data_flow:
    inbound:
      - source: "Spec/UserStory"
        payload_or_state: "components, acceptanceCriteria, dataModels, apiEndpoints"
        validation: "Spec schema and generated prompt contract"
      - source: "WorkspaceContext"
        payload_or_state: "tree, loaded source files, commandCatalog, writeRoots"
        validation: "ProjectExecutionService bounded context"
    outbound:
      - target: "Generated frontend source"
        payload_or_state: "framework-specific source files, styles, type files and route files"
        compatibility: "must compile with package scripts"
      - target: "Preview"
        payload_or_state: "dev server URL"
        compatibility: "must serve the generated app route"

  sequencing_dependencies:
    - dependency: "Scaffold must exist before FrontAgent runs."
      reason: "Agent needs real architecture to modify."
      validation: "Project construction test reads scaffold before agent plan."
    - dependency: "Install dependencies or use dependency-free local dev flow."
      reason: "Build/dev commands must be executable in generated project."
      validation: "command catalog includes reliable commands and quality gate runs them."

  integration_risks:
    - risk: "Dependency installation can be slow or unavailable."
      severity: "high"
      mitigation: "Prefer generated scaffold using existing package manager only when configured; expose bootstrap command separately and fail visibly if dependencies unavailable."
    - risk: "Agent writes visually rich but architecturally poor single App.tsx."
      severity: "medium"
      mitigation: "Prompt and gate require feature/components/adapters split when complexity exceeds one cohesive component."
```

## 7. Architecture Rules

```yaml
architecture_rules:
  universal:
    - "Prefer cohesive components over large monolithic App.tsx."
    - "Keep data/adapters separate from presentation components."
    - "Use typed contracts for data models."
    - "Avoid runtime mocks in production path."
    - "Preserve generated project boundaries and writeRoots."
  project_specific:
    - "For projectStack=typescript-react, do not generate standalone HTML as implementation."
    - "For framework stacks, standalone HTML is allowed only as shell/template when that stack requires it."
    - "Every user-facing feature must be reachable from the selected stack entrypoint or route system."
    - "Do not hardcode frontend framework behavior inside the FrontAgent; use a stack adapter/contract resolved from projectStack."
    - "Action buttons must follow the Horus ID visual button standard: icon + visible name."
    - "Styles must preserve Horus dark technical visual identity unless the user story explicitly defines another brand."
```

## 8. Generated Project Target Structure

The first required implementation target is `typescript-react` with Vite. The architecture must also support a stack adapter registry so future or configured projects can target mainstream frontend stacks without changing the orchestration pipeline.

```yaml
frontend_stack_adapter_contract:
  id: "typescript-react | react-vite | next | vue-vite | nuxt | svelte | sveltekit | angular | astro | remix | vanilla-vite | html-css-js"
  displayName: "Human-readable stack name"
  languages:
    - "typescript"
    - "javascript"
    - "html"
    - "css"
  entrypoints:
    - "framework-specific app entrypoint"
  allowedSourceExtensions:
    - ".ts"
    - ".tsx"
    - ".js"
    - ".jsx"
    - ".vue"
    - ".svelte"
    - ".html"
    - ".css"
  scaffoldFiles:
    - "package.json"
    - "framework config files"
    - "source entrypoints"
  commandProfiles:
    dev: "command id for local preview"
    build: "command id for production build"
    typecheck: "command id when stack supports it"
    test: "command id when stack supports it"
  reachabilityRules:
    - "How to prove components/pages are mounted by the app"
  stylingConventions:
    - "CSS, CSS modules, global tokens, framework style blocks or equivalent"
```

Minimum support order:

1. `typescript-react` / `react-vite`: mandatory in this spec.
2. `html-css-js` / `vanilla-vite`: supported as explicit stack, not as accidental fallback.
3. `vue-vite`, `svelte`, `angular`, `next`, `nuxt`, `astro`, `remix`: adapter-ready contracts with validation rules before declaring full support.

```text
generated-project/
├── package.json
├── index.html
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   │   └── tokens.css
│   ├── components/
│   │   └── ui/
│   ├── features/
│   │   └── <feature-name>/
│   │       ├── components/
│   │       ├── data/
│   │       ├── types.ts
│   │       └── index.ts
│   └── lib/
│       └── formatting.ts
└── docs/user-stories/
```

Rules:

- Small apps may keep one feature folder, but not unrelated files at root.
- `src/features/<feature>/data` may contain adapters and seed data only when explicitly labeled as local development data, not as fake production integration.
- If `apiEndpoints` exist, generate typed boundary functions and visible loading/error/empty states.
- Do not invent backend availability.

## 9. Execution Plan

```yaml
execution_plan:
  phase_1_scaffold:
    - "Replace static src/index.html scaffold with stack-aware frontend structure."
    - "Implement the first adapter for typescript-react/react-vite."
    - "Create adapter interfaces for future Vue, Svelte, Angular, Next.js, Nuxt, Astro, Remix, vanilla Vite and HTML/CSS/JS stacks."
    - "Add package scripts: dev, build, type-check, test when feasible."
    - "Generate .horus-project.yaml with relevant command ids."

  phase_2_front_agent_contract:
    - "Update FrontAgent prompt to branch by projectStack."
    - "For typescript-react, require ProjectExecutionPlan over TSX/CSS/type files."
    - "For other stacks, require ProjectExecutionPlan over the adapter's allowed source files and route/component conventions."
    - "Remove fallback path that treats standalone generated HTML as sufficient for project construction."
    - "Keep generated/horus HTML only for artifact preview workflows without a selected project root."

  phase_3_skill_update:
    - "Rewrite front-design-frontend skill from static HTML default to project-aware stack architecture."
    - "Keep static HTML guidance only as fallback artifact mode."
    - "Add explicit component/state/accessibility/button standards."

  phase_4_architecture_quality_gate:
    - "Extend FrontendChangeSetQualityGate to reject replacing framework projects with standalone HTML unless the selected stack is explicitly html-css-js."
    - "Make reachability checks adapter-aware instead of React-only."
    - "Require package scripts to pass or be represented in validation."
    - "Check import graph reachability, forbidden runtime tokens, and basic TS parseability."

  phase_5_tests_and_preview:
    - "Add scaffold test for generated React files."
    - "Add FrontAgent plan test with feature folder and reachable imports."
    - "Add generated project build/type-check smoke where dependencies are available."
```

## 10. Validation Protocol

```yaml
validation_protocol:
  static_checks:
    - command: "pnpm --filter @u-build/server type-check"
      cwd: "<REPOSITORY_ROOT>"
      required: true
    - command: "pnpm --filter @u-build/web type-check"
      cwd: "<REPOSITORY_ROOT>"
      required: true

  tests:
    - command: "node --test apps/server/test/projectConstructionWorkspace.test.mjs apps/server/test/frontendChangeSetQualityGate.test.mjs apps/server/test/frontAgentNodeCodeContext.test.mjs"
      cwd: "<REPOSITORY_ROOT>"
      required: true

  runtime_checks:
    - command: "Start generated project preview through registered preview command"
      cwd: "generated project workspace"
      expected: "Preview renders React app, not fallback scaffold card."

  manual_checks:
    - "Open generated project in preview and inspect visible feature."
    - "Use Project File Browser to confirm code is modular and editable."
```

## 11. Acceptance Criteria

- New generated projects for `typescript-react` include React/Vite/TypeScript structure.
- The project construction layer has an explicit frontend stack adapter contract.
- The system can support the main frontend languages/frameworks through adapters: React, Vue, Svelte, Angular, Next.js, Nuxt, Astro, Remix, Vite vanilla, HTML/CSS/JavaScript and TypeScript variants.
- Unsupported stacks fail with a clear validation error instead of falling back silently to standalone HTML.
- FrontAgent no longer treats standalone HTML as a successful implementation when project root exists.
- Generated features are reachable through the selected stack entrypoint or route system.
- Generated code includes typed data contracts when data models exist.
- Future API contracts are represented as typed adapters and UI states, not fake live calls.
- Quality gate rejects unmounted source files and static replacement of React app.
- Preview renders generated project through command catalog.

## 12. Agent Error Mitigation

```yaml
agent_error_mitigation:
  anti_hallucination:
    - "Do not invent package dependencies unless package.json is updated and install/build path is valid."
    - "Do not claim framework build passed unless the selected stack's build command ran."
    - "Do not mark a framework as supported until scaffold, command catalog, reachability and validation are implemented."
  anti_overengineering:
    - "Do not create excessive folders for trivial one-screen apps."
    - "Use feature folders only where they clarify ownership."
  anti_regression:
    - "Keep static artifact fallback for non-project workflows."
    - "Do not break preview command registration."
  anti_false_validation:
    - "Browser preview and build checks are separate; report both explicitly."
```

## 13. Final Output Contract

```yaml
final_report:
  status: "completed | partially_completed | blocked"
  generated_project_shape:
    - "entrypoints"
    - "feature folders"
    - "scripts"
  validation:
    commands_run:
      - "command, cwd, exit code"
  visual_verification:
    - "preview URL"
    - "what was inspected"
```
