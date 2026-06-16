---
format_version: "agentic_sdd.v1"
task_id: "feature-44-project-agent-manifest-context"
title: "Project Agent Manifest And Progressive Context"
created_at_utc: "2026-05-26T23:45:00Z"
author: "agent"
target_mode: "existing_repo"
priority: "p1"
risk_level: "high"
source_skill: "agentic-sdd-spec"
spec_version: "0.1.0"
status: "implemented"
depends_on:
  - "spec/features/21-isolated-code-memory-context-tools.md"
  - "spec/features/32-zup-style-project-construction-workspace.md"
  - "spec/features/35-project-code-intelligence-ast.md"
  - "spec/features/38-grounded-chat-code-intelligence.md"
---

# 44 - Project Agent Manifest And Progressive Context

## 1. Original User Request

```yaml
raw_user_request: |
  minha preocupação é no 4, 5, 6, 8, 9 e 10. destrinche como podemos corrigir o projeto com base o que foi listar. e crie uma spec para cada cenário que expressei preocupação
concern_mapped_from_previous_answer: "6. Memória/manifesto do projeto"
```

## 2. System Interpretation

```yaml
system_translation: |
  Criar um manifesto agentico por projeto, equivalente ao papel de arquivos como CLAUDE.md/AGENTS.md,
  mas estruturado e validado pelo Horus. O manifesto deve declarar stack, arquitetura, comandos permitidos,
  padrões visuais, rotas, riscos, decisões e restrições. Agentes devem carregar esse contexto progressivamente.

expected_user_visible_result: |
  O usuário tem um projeto com regras explícitas que Horus respeita. O chat e os agentes sabem quais comandos
  podem rodar, qual stack foi criada, onde fica o código e quais padrões de UI/arquitetura seguir.

expected_engineering_result: |
  O backend gera, persiste, atualiza e consome um Horus project manifest versionado. O manifesto não substitui
  leitura real de código; ele orienta busca e execução.
```

## 3. Current Project Fit

```yaml
verified_existing_surfaces:
  - "apps/server/src/infrastructure/project/ProjectWorkspaceService.ts"
  - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
  - "apps/server/src/infrastructure/preview/FileFrontendProjectRegistry.ts"
  - "packages/shared/src/entities/ProjectConstruction.ts"
  - "packages/shared/src/entities/Preview.ts"
  - "ID_VISUAL.md"

current_good_parts:
  - "Generated project workspace exists and is git-backed."
  - "Preview project already has commandCatalog and rootPath concepts."
  - "ID_VISUAL.md exists as a project-level design reference."

current_failures:
  - "There is no single machine-readable manifest for agents."
  - "Prompts must rediscover project conventions repeatedly."
  - "Command policy and architecture policy are split across services."
  - "Visual identity is not linked to generated project metadata."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Create HorusProjectManifest shared schema."
    - "Persist `horus.project.json` or `.horus/manifest.json` in generated project root."
    - "Expose manifest via backend service and API."
    - "Load manifest in Chat, Spec, Odin, Front, QA and Curator prompts through progressive disclosure."
    - "Track manifest version and last validated timestamp."
    - "Include command catalog, architecture map, design identity references, file conventions and safety rules."
  out_of_scope:
    - "Replacing actual code retrieval with manifest-only context."
    - "Allowing arbitrary user-provided prompt rules to override security."
    - "Automatically rewriting all existing projects without migration guard."
```

## 5. Manifest Contract

```yaml
HorusProjectManifest:
  required_fields:
    - "schemaVersion"
    - "projectId"
    - "projectName"
    - "rootPathPolicy"
    - "stack"
    - "entrypoints"
    - "commandCatalog"
    - "architecture"
    - "designSystem"
    - "agentRules"
    - "security"
    - "updatedAt"
  stack:
    frontend: "react | vue | svelte | angular | next | static | unknown"
    language: "typescript | javascript | mixed | unknown"
    packageManager: "pnpm | npm | yarn | bun | unknown"
  commandCatalog:
    rule: "Only ids in this catalog can be executed by agents."
    examples:
      - "dev"
      - "build"
      - "typecheck"
      - "test"
  agentRules:
    rule: "Guidance only; cannot grant permissions."
    sections:
      - "coding_style"
      - "ui_style"
      - "forbidden_patterns"
      - "testing_expectations"
  security:
    deny_paths:
      - ".env"
      - ".git"
      - "node_modules"
      - "dist"
    secret_patterns: "redaction rules shared with evidence sanitizer"
```

## 6. Integration Context Map

```yaml
integration_context:
  depends_on:
    - name: "ProjectWorkspaceService"
      type: "backend_service"
      contract_used: "create physical project workspace"
      required_for: "Create initial manifest when project is bootstrapped."
      failure_modes:
        - "Project exists without manifest."
      fallback_or_recovery: "Generate manifest lazily from project registry and package files."
      verification:
        - "Test project construction writes manifest."
    - name: "ReadOnlyCodeContextService"
      type: "backend_service"
      contract_used: "buildContext"
      required_for: "Use manifest to prioritize context selection without bypassing source reads."
      failure_modes:
        - "Manifest points to stale files."
      fallback_or_recovery: "Mark manifest stale and fall back to filesystem scan."
      verification:
        - "Test stale manifest does not break code context."

  depended_on_by:
    - name: "Agent prompts"
      type: "agent"
      contract_exposed: "ProjectManifestContext"
      compatibility_obligation: "Security rules are non-overridable."
      expected_consumer_behavior: "Use manifest as orientation, then read real files before claims."
    - name: "Project file screen"
      type: "frontend_component"
      contract_exposed: "Manifest metadata endpoint"
      compatibility_obligation: "Optional rendering only."
      expected_consumer_behavior: "Display project stack/commands when useful."
```

## 7. Execution Plan

```yaml
execution_plan:
  - step: "Add shared HorusProjectManifest schema."
    files:
      - "packages/shared/src/entities/ProjectConstruction.ts"
      - "packages/shared/src/entities/Preview.ts"
  - step: "Implement ProjectManifestService."
    files:
      - "apps/server/src/infrastructure/project/ProjectManifestService.ts"
  - step: "Write manifest during project workspace creation and registry seed."
    files:
      - "apps/server/src/infrastructure/project/ProjectWorkspaceService.ts"
      - "apps/server/src/infrastructure/preview/FileFrontendProjectRegistry.ts"
  - step: "Load manifest into code context and agent dependencies."
    files:
      - "apps/server/src/application/services/ReadOnlyCodeContextService.ts"
      - "apps/server/src/infrastructure/langgraph/dependencies.ts"
      - "apps/server/src/infrastructure/agents/*.ts"
  - step: "Add API endpoint for manifest inspection."
    files:
      - "apps/server/src/infrastructure/http/routes/projectFileRoutes.ts"
```

## 8. Acceptance Checklist

```yaml
acceptance_checklist:
  - "New projects get a valid manifest."
  - "Existing projects without manifest still work through lazy fallback."
  - "Manifest can prioritize context but cannot authorize forbidden tools."
  - "Agents cite real code evidence for code claims, not manifest alone."
  - "Command ids in manifest match preview/project execution command policy."
  - "Tests cover create, read, stale fallback and security denial."

validation_commands:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "node --test apps/server/test/*project* apps/server/test/*manifest*"
  - "pnpm test"
```

## 9. Implementation Log

```yaml
implemented_at_utc: "2026-05-26T00:00:00Z"
implementation_summary:
  - "Added shared HorusProjectManifest schema with stack, entrypoints, command catalog, architecture, design rules, agent rules and non-overridable security rules."
  - "Added ProjectManifestService for build, read, write and lazy ensure flows."
  - "Persisted horus.project.json during new and existing project workspace registration."
  - "Added lazy manifest fallback through ProjectFileBrowserService for older projects."
  - "Exposed GET /api/project-files/projects/:projectId/manifest through the project file router."
  - "Attached manifest metadata to CodeContextBundle while preventing the manifest from becoming code excerpt evidence."
  - "Added focused tests for workspace creation, manifest route inspection and code-context manifest loading."
validation_record:
  - "pnpm --filter @u-build/shared build"
  - "pnpm --filter @u-build/server build"
  - "pnpm --filter @u-build/web type-check"
  - "node --test apps/server/test/projectFileRoutes.test.mjs apps/server/test/projectConstructionWorkspace.test.mjs apps/server/test/readOnlyCodeContextService.test.mjs"
  - "pnpm test"
```
