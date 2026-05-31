---
format_version: "agentic_sdd.v1"
task_id: "agent-operational-runtime-unification"
title: "Runtime Operacional Unico Para Agentes"
created_at_utc: "2026-05-30T23:59:39Z"
author: "agent"
target_mode: "existing_repo"
priority: "p0"
risk_level: "critical"
---

## 1. Original User Request

```yaml
raw_user_request: |
  use a skill de criar spec e planeje cada problema abaixo, logo em seguida comece a implementar, só vá para o próximo após concluir o atual:

  Plano único de execução para todos os agentes, não só QA. Front, QA, Curator e chat precisam passar pelo mesmo runtime de task, output, diff, kill, retry e trace.
  Permission engine por perfil de agente: QA pode rodar install/build/test/preview; Front pode editar; Curator deve ser mais read-only/validation. Isso precisa virar contrato, não convenção.
  Self-healing real: instalar dependência, rodar build/test, ler erro, corrigir, repetir com limite. Hoje já começou no QA, mas não cobre o ciclo inteiro.
  Console como timeline operacional, não painel de eventos crus: chat, arquivos, diff, terminal, validação e histórico precisam ser uma narrativa navegável.
  Edição robusta sem oldString frágil: o sistema ainda precisa migrar cada vez mais para patch estrutural/AST/preflight.
  Histórico escalável: com muitos projetos/runs, precisa busca, filtros, paginação, agrupamento por projeto/story/run e retenção compactada.
```

## 2. System Interpretation

```yaml
system_translation: |
  Transformar a execução dos agentes em uma camada operacional unica e auditavel. Todos os agentes que leem, editam, validam, rodam terminal ou respondem no chat devem produzir task ids, output streaming, diff ids, trace ids, retry metadata e capacidade de cancelamento pelo mesmo contrato. A implementacao deve ser incremental: cada problema fecha com teste/build antes do proximo iniciar.

expected_user_visible_result: |
  O usuario ve uma narrativa operacional confiavel: o que o agente pensou, qual arquivo tocou, qual diff gerou, qual comando rodou, qual erro apareceu, qual retry aconteceu e qual historico pertence a projeto/story/run, sem listas gigantescas ou paineis crus.

expected_engineering_result: |
  Backend e frontend deixam de depender de convencoes soltas por agente. Runtime, permissoes, self-healing, timeline, edicao estrutural e historico passam a ter contratos explicitos, testes focados e compatibilidade com o fluxo LangGraph existente.
```

## 3. Product And Technical Context

```yaml
business_context:
  user_problem: "Horus nao transmite confianca quando agentes editam, rodam comandos ou falham sem telemetria operacional completa e navegavel."
  target_user: "Operadores e desenvolvedores que usam Horus para gerar e corrigir software com agentes."
  expected_outcome: "Executar agentes com auditabilidade comparavel a um ambiente de desenvolvimento real."
  product_surface:
    - "Preview chat"
    - "Execution Console"
    - "Telemetry/history screens"
    - "LangGraph agent workflow"

technical_context:
  repository_root: "/Users/wamat/Desktop/horus.ai"
  relevant_stack:
    backend:
      - "TypeScript"
      - "LangGraph"
      - "AgentToolRuntime"
      - "ExecutionTaskRuntime"
      - "ProjectExecutionService"
    frontend:
      - "React/Vite"
      - "Execution Console UI"
    database:
      - "Repository ports and persisted workflow/event data"
    infrastructure:
      - "Generated project workspaces"
      - "Local shell command execution"
  known_entrypoints:
    - "apps/server/src/application/services/AgentToolRuntime.ts"
    - "apps/server/src/application/services/AgentProfileRegistry.ts"
    - "apps/server/src/infrastructure/tools/ExecutionTaskRuntime.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/frontAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/qaAgentNode.ts"
    - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    - "apps/server/src/infrastructure/agents/HorusChatToolAgent.ts"
  known_existing_patterns:
    - "Agent profiles already declare allowed and forbidden tool families."
    - "Front, QA and chat already use AgentToolRuntime for tool execution paths."
    - "Curator already owns deterministic preflight, but must carry the same operational trace context."
    - "MAX_RETRIES prevents infinite LangGraph loops."
```

## 4. Scope

```yaml
scope:
  in_scope:
    - "Implementar os seis problemas em ordem, validando cada um antes do proximo."
    - "Preservar o grafo LangGraph e os perfis de agente existentes."
    - "Adicionar contratos e testes sem redesenhar o produto inteiro de uma vez."
  out_of_scope:
    - "Substituir LangGraph."
    - "Criar um novo framework de agentes paralelo."
    - "Reescrever toda a UI de telemetria antes de fechar os contratos backend."
    - "Fazer parsing por regex para resolver contratos estruturais."
```

## 5. Affected Entities

```yaml
affected_entities:
  backend:
    files:
      - "apps/server/src/application/services/AgentToolRuntime.ts"
      - "apps/server/src/application/services/AgentProfileRegistry.ts"
      - "apps/server/src/infrastructure/tools/ExecutionTaskRuntime.ts"
      - "apps/server/src/infrastructure/project/ProjectExecutionService.ts"
      - "apps/server/src/infrastructure/code/CodeChangeSetPreflightService.ts"
      - "apps/server/src/infrastructure/langgraph/nodes/curatorAgentNode.ts"
    services:
      - "AgentToolRuntime"
      - "AgentToolLoop"
      - "ExecutionTaskRuntime"
      - "ProjectExecutionService"
      - "CodeChangeSetPreflightService"
    database:
      migrations_required: false
      tables: []
  frontend:
    files:
      - "apps/web/src/App.tsx"
      - "apps/web/src/styles/app.css"
    components:
      - "Preview chat"
      - "Execution Console"
      - "Telemetry/history surfaces"
    routes:
      - "?mode=preview"
      - "?mode=telemetry"
  workflow:
    graph_nodes:
      - "frontAgent"
      - "qaAgent"
      - "curatorAgent"
    agents:
      - "Front"
      - "QA"
      - "Curator"
      - "Chat executor"
  tests:
    unit:
      - "apps/server/test/curatorAgentNodePreflight.test.mjs"
      - "apps/server/test/codeChangeSetPreflightService.test.mjs"
      - "apps/server/test/agentProfileRegistry.test.mjs"
    integration:
      - "apps/server/test/projectExecutionDependencyRepair.test.mjs"
    e2e: []
```

## 6. Integration Context Map

```yaml
integration_context:
  summary: |
    A camada operacional conecta LangGraph, chat, tools, comandos de terminal, diffs e UI. O contrato central e: todo trabalho agentico precisa ser observavel como task/trace/run, com perfil de permissao e evidencia consumivel pela console.

  depends_on:
    - name: "AgentToolRuntime"
      type: "backend_service"
      owner: "apps/server/application/services"
      direction: "this_spec_consumes_dependency"
      contract_used: "execute({ agentProfileId, toolName, input })"
      required_for: "Unificar tool calls, trace, output e permissao por perfil."
      assumptions: []
      failure_modes:
        - "Um agente executa fora do contrato e a console nao mostra o que aconteceu."
      fallback_or_recovery: "Bloquear entrega quando a evidencia deterministica estiver ausente."
      verification:
        - "Teste de Curator preflight recebendo trace operacional."

    - name: "ExecutionTaskRuntime"
      type: "backend_service"
      owner: "apps/server/infrastructure/tools"
      direction: "this_spec_consumes_dependency"
      contract_used: "run(commandSpec) -> taskId/stdout/stderr/status"
      required_for: "Output, kill, retry e terminal visivel."
      assumptions: []
      failure_modes:
        - "Comandos rodam mas nao podem ser correlacionados com agente/run/diff."
      fallback_or_recovery: "Propagar trace context em todos os command runs."
      verification:
        - "Build servidor e testes de preflight/runtime."

  depended_on_by:
    - name: "Execution Console"
      type: "frontend_component"
      owner: "apps/web"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "Eventos e snapshots com taskId, traceId, agentId, filePath, diffId e output."
      compatibility_obligation: "may extend without breaking current consumers"
      expected_consumer_behavior: "Renderizar narrativa operacional agrupada por run/projeto/story."
      migration_or_notification_required: false
      verification:
        - "Browser smoke quando a UI for alterada."

    - name: "Odin retry routing"
      type: "agent"
      owner: "apps/server/infrastructure/langgraph"
      direction: "consumer_depends_on_this_spec"
      contract_exposed: "CuratorFeedback + runtimeValidation"
      compatibility_obligation: "must preserve"
      expected_consumer_behavior: "Reexecutar com limite ou bloquear para humano."
      migration_or_notification_required: false
      verification:
        - "curatorAgentNodePreflight tests."

  bidirectional_integrations:
    - name: "Agent execution to console"
      participants:
        - "Backend runtime"
        - "Web console"
      shared_contract: "WorkflowEvent, RuntimeValidationEvidence, command output events"
      consistency_rule: "Toda execucao de comando relevante deve carregar agentId, runId, projectId e taskId."
      verification:
        - "Focused unit tests before UI changes."

  data_flow:
    inbound:
      - source: "User chat or LangGraph workflow"
        payload_or_state: "UserStory, CodeChangeSet, tool call, command plan"
        validation: "Shared schemas, agent profile policy and command catalog"
    outbound:
      - target: "Console/history"
        payload_or_state: "Operational timeline events and compact run history"
        compatibility: "Append-only extensions where possible"
```

## 7. Sequenced Execution Plan

```yaml
execution_plan:
  - order: 1
    problem: "Plano unico de execucao para todos os agentes"
    intent: "Front, QA, Curator e chat devem carregar o mesmo contexto operacional de task/output/diff/trace."
    implementation:
      - "Confirmar caminhos existentes de Front, QA e chat por AgentToolRuntime."
      - "Trazer Curator preflight para o mesmo trace context usado pelo ExecutionTaskRuntime."
      - "Propagar agentId=curator_agent, runId, projectId, filePath e diffId nos command runs do preflight."
    done_when:
      - "Curator preflight recebe trace operacional no contrato."
      - "Terminal preflight executa com trace e task runtime."
      - "Testes focados e build do servidor passam."

  - order: 2
    problem: "Permission engine por perfil de agente"
    intent: "Permissoes viram contrato testado, nao convencao em prompt."
    implementation:
      - "Auditar AgentProfileRegistry contra as capacidades desejadas."
      - "Adicionar testes de matriz por perfil e ferramenta."
      - "Garantir que Curator nao tenha mutacao nem run_command amplo."
    done_when:
      - "Teste falha se QA/Front/Curator/chat receberem ferramenta fora do perfil."

  - order: 3
    problem: "Self-healing real"
    intent: "Instalar dependencia, rodar build/test, ler erro, corrigir e repetir com limite em todos os ciclos adequados."
    implementation:
      - "Generalizar reparo de dependencia hoje limitado ao QA."
      - "Definir max retries por agente e por run."
      - "Garantir que falha final vira bloqueio com evidencia."
    done_when:
      - "Teste cobre falha de dependencia, install, retry e revalidacao."

  - order: 4
    problem: "Console como timeline operacional"
    intent: "Trocar painel cru por narrativa navegavel de chat, arquivo, diff, terminal, validacao e historico."
    implementation:
      - "Projetar agrupamento por run/story/agent/task."
      - "Renderizar eventos em blocos resumidos com expandir para detalhes."
      - "Evitar listas gigantes e JSON bruto por padrao."
    done_when:
      - "Browser smoke mostra timeline clara no modo preview."

  - order: 5
    problem: "Edicao robusta sem oldString fragil"
    intent: "Migrar edits para AST/patch estrutural/preflight sempre que possivel."
    implementation:
      - "Auditar pontos que ainda dependem de oldString/newString."
      - "Promover patch estrutural para caminho preferencial."
      - "Manter fallback explicito, testado e reportado."
    done_when:
      - "Fluxos principais nao dependem de oldString para edicoes de codigo."

  - order: 6
    problem: "Historico escalavel"
    intent: "Suportar muitos projetos/runs com busca, filtros, paginação, agrupamento e retencao compactada."
    implementation:
      - "Definir query API/snapshot para projeto/story/run."
      - "Adicionar paginacao e filtros no frontend."
      - "Compactar detalhes antigos mantendo evidencias essenciais."
    done_when:
      - "Historico continua usavel com muitos runs e nao carrega tudo de uma vez."
```

## 8. Architecture And Coding Rules

```yaml
architecture_rules:
  - "Nao criar framework paralelo de runtime."
  - "Preferir contratos existentes: AgentToolRuntime, AgentProfileRegistry, ExecutionTaskRuntime, ProjectExecutionService."
  - "Manter LangGraph e MAX_RETRIES."
  - "Alterar uma etapa por vez e validar antes de seguir."
  - "Evitar regex para parsing, routing ou normalizacao; usar contratos estruturados e helpers deterministas."
  - "UI deve ser operacional, densa e navegavel, sem paineis enormes sem hierarquia."
```

## 9. Validation Plan

```yaml
validation_plan:
  step_1_runtime_unification:
    commands:
      - "pnpm --filter @u-build/server build"
      - "node --test apps/server/test/curatorAgentNodePreflight.test.mjs"
      - "node --test apps/server/test/codeChangeSetPreflightService.test.mjs"
    acceptance:
      - "Curator preflight passa trace operacional."
      - "RuntimeEvidence continua compativel."
      - "Nenhum contrato existente quebra."
  later_steps:
    commands:
      - "pnpm --filter @u-build/shared build"
      - "pnpm --filter @u-build/server build"
      - "pnpm --filter @u-build/web type-check"
      - "Browser smoke em http://localhost:5173/?mode=preview quando UI mudar."
```

## 10. OpenClaude CLI Baseline Closure

```yaml
openclaude_cli_baseline:
  source_compared:
    - "openclaude/src/tools/BashTool/BashTool.tsx"
    - "openclaude/src/tasks/LocalShellTask/LocalShellTask.tsx"
  closed_now:
    - "run_command aceita command como bash real, alem de executable/args."
    - "Pipelines e encadeamentos passam pelo mesmo ExecutionTaskRuntime."
    - "Background, kill, retry, output path, tail e streaming continuam unificados."
    - "Policy avalia shell por perfil de agente antes de spawnar."
    - "Front continua impedido de install; QA e executor podem usar comandos de validacao/setup conforme contrato."
    - "Comandos destrutivos sao rejeitados antes de spawn."
  remaining_after_this_iteration:
    - "Aprovacao humana interativa ainda precisa virar UI propria quando policy retorna approvalRequired."
    - "Sandbox de sistema operacional ainda e o sandbox atual do processo, nao microVM."
```

## 11. Agent Output Contract

```yaml
output_contract:
  after_each_problem:
    - "Arquivos alterados."
    - "O que foi fechado."
    - "Comandos de validacao executados."
    - "Problemas restantes antes do proximo item."
  stop_rule: "Nao iniciar o proximo problema enquanto o atual estiver sem teste/build ou com contrato incompleto."
```
