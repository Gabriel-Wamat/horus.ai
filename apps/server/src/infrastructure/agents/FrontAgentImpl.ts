import {
  ProjectExecutionPlanSchema,
  type CodeContextBundle,
  type DesignContextBundle,
  type LlmSettings,
  type PromptContextBundle,
  type ProjectExecutionPlan,
  type Spec,
  type StructuralPatchIntent,
  type UserStory,
} from "@u-build/shared";
import type { CuratorFeedback } from "../langgraph/state.js";
import {
  appendRuntimeAgentSkills,
  loadAgentSkill,
} from "../agentSkills/loadAgentSkill.js";
import { createChatModel } from "../llm/createChatModel.js";
import { invokeChatModel } from "../llm/invokeChatModel.js";
import type { FrontendFileOperationPlan } from "../code/buildFrontendCodeChangeSet.js";
import type { ProjectWorkspaceContextSnapshot } from "../project/ProjectExecutionService.js";
import { formatDesignContextForPrompt } from "../design/DesignContextService.js";
import { formatPromptContextForPrompt } from "../prompt/PromptContextAssembler.js";
import {
  CodeAwareFrontendOutputSchema,
  ProjectExecutionPlanLlmSchema,
  normalizeFrontendStructuralPatchIntent,
  type CodeAwareFrontendOutput,
  type ProjectExecutionPlanLlm,
} from "./front/frontAgentOutputSchemas.js";
import {
  buildProjectManagerAppCss,
  buildProjectManagerAppTsx,
} from "./front/frontAgentFallbackTemplates.js";

export interface FrontendOutput {
  html: string;
  operations?: FrontendFileOperationPlan[];
  structuralPatchIntents?: StructuralPatchIntent[];
  inspectedFiles?: string[];
}

interface HtmlChatResponse {
  content:
    | string
    | Array<{
        text?: string;
      }>;
}

export async function generateFrontend(
  userStory: UserStory,
  spec: Spec,
  curatorFeedback?: CuratorFeedback,
  llmSettings?: LlmSettings,
  executionBrief?: string,
  codeContext?: CodeContextBundle,
  designContext?: DesignContextBundle,
  promptContext?: PromptContextBundle
): Promise<FrontendOutput> {
  const components = spec.components
    .map((c) => `- ${c.name} (${c.type}): ${c.description}`)
    .join("\n");
  const criteria = spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
  const dataModels =
    spec.dataModels.length > 0 ? spec.dataModels.join("\n") : "N/A";
  const apiContracts =
    spec.apiEndpoints.length > 0
      ? spec.apiEndpoints
          .map((endpoint) => {
            const requestSchema = endpoint.requestSchema
              ? JSON.stringify(endpoint.requestSchema)
              : "{}";
            const responseSchema = endpoint.responseSchema
              ? JSON.stringify(endpoint.responseSchema)
              : "{}";
            return `- ${endpoint.method} ${endpoint.path}: ${endpoint.description}\n  requestSchema: ${requestSchema}\n  responseSchema: ${responseSchema}`;
          })
          .join("\n")
      : "N/A";

  // Reflection: include curator feedback when retrying so the agent self-corrects
  const reflectionBlock =
    curatorFeedback && !curatorFeedback.passed
      ? `
# Feedback da Curadoria (tentativa anterior — CORRIJA estes problemas)
**Score anterior:** ${curatorFeedback.score}/100
**Avaliação:** ${curatorFeedback.notes}
**Itens faltando:**
${curatorFeedback.missingItems.map((m) => `- ${m}`).join("\n")}

Você DEVE corrigir todos os itens acima na nova implementação.
`
      : "";
  const executionBriefBlock = executionBrief
    ? `
# Pedido de alteração vindo do chat do Horus
${executionBrief}

Use este pedido como a intenção executora atual. Não gere uma nova spec; aplique a alteração mantendo a user story/spec ativa como fonte de contrato.
`
    : "";
  const visualContractBlock = buildVisualContractPromptBlock(spec);
  const designContextBlock = formatDesignContextForPrompt(designContext);
  const timeoutMs = resolveFrontAgentTimeoutMs();

  const skill = appendRuntimeAgentSkills(
    loadAgentSkill("front-design-frontend"),
    promptContext?.runtimeSkills ?? []
  );
  const promptContextBlock = formatPromptContextForPrompt(promptContext);

  if (codeContext) {
    const exactTextEdit = buildExactTextEditFrontendOutput(
      executionBrief,
      codeContext
    );
    if (exactTextEdit) return exactTextEdit;

    const filesBlock = codeContext.files
      .map(
        (file) => `## ${file.path}
\`\`\`
${file.content}
\`\`\``
      )
      .join("\n\n");

    const prompt = `Você é o Front Agent do Horus. Sua tarefa é alterar o frontend real do projeto, usando AST/StructuralPatchIntent sempre que a alteração puder ser limitada a símbolos, imports ou inserções em arquivos existentes.

# Skill obrigatória do agente
${skill}
${reflectionBlock}
${executionBriefBlock}
${visualContractBlock}

${promptContextBlock}

${designContextBlock}

# História de Usuário
**Título:** ${userStory.title}

# Especificação Técnica
**Resumo:** ${spec.summary}

**Abordagem Técnica:** ${spec.technicalApproach}

**Componentes/Seções:**
${components}

**Modelos de Dados:**
${dataModels}

**Contratos Futuros de API/Rotas:**
${apiContracts}

**Critérios de Aceite:**
${criteria}

# Arquivos de frontend inspecionados
${filesBlock}

# Regras de implementação
- Retorne operações para arquivos reais do projeto, preferencialmente arquivos já inspecionados.
- Prefira structuralPatchIntents para editar arquivos existentes sem reescrever o arquivo inteiro.
- Use structuralPatchIntents para:
  - kind="replace": substituir componente, função, hook, tipo ou constante existente por nome.
  - kind="delete": remover símbolo existente por nome.
  - kind="insert": inserir conteúdo em file_start, file_end, after_imports, before_symbol ou after_symbol.
  - kind="add_import" ou kind="remove_import": alterar imports.
  - kind="rename_local": renomear identificador local simples quando o alvo for inequívoco.
- Cada structuralPatchIntent deve ter id estável curto, targetPath real, rationale e os campos necessários para o kind.
- Para replace/delete/rename_local, informe targetSymbolName e targetSymbolKind quando souber. Use component para componentes React.
- Para replace/update_export, content deve conter apenas o novo trecho do símbolo alvo, não o arquivo inteiro.
- Retorne operations=[] quando structuralPatchIntents cobrir toda a alteração.
- Use operações completas apenas para criar arquivos novos, deletar arquivos obsoletos, ou quando a mudança for ampla demais para AST.
- Cada operação completa deve ter operation="write" para criar/atualizar arquivo ou operation="delete" para remover arquivo obsoleto.
- Operações write devem conter o conteúdo completo final do arquivo em afterContent.
- Operações delete devem usar afterContent=null.
- Preserve arquitetura, imports, componentes, estilos e padrões existentes.
- Não use CDNs externos, chamadas de rede inventadas, mock/fake adapters, Math.random, fixtures ou dados simulados em runtime.
- Não crie HTML standalone em generated/horus quando houver projeto real com package.json, src/main.tsx, src/App.tsx, rotas ou componentes existentes.
- Em projetos React/TypeScript/Vite, implemente componentes TSX, tipos, estilos e adapters reais; não substitua a aplicação por HTML estático.
- Qualquer arquivo novo em src/ deve ser importado por um arquivo já alcançável a partir do entrypoint do framework, como src/main.tsx, src/App.tsx ou sistema de rotas.
- Não crie variações paralelas para a mesma feature. Integre a feature no fluxo React existente.
- Use a stack detectada no projeto. Para React/Vite/TypeScript, use TypeScript/React/CSS conforme o scaffold existente.
- Se criar arquivo novo, mantenha dentro de src/ ou outro diretório já coerente com o projeto.
- Selecione e aplique o frontend pattern declarado na spec/visualContract. Se ausente, escolha um destes ids antes de editar: operational-dashboard, chat-preview-workbench, workflow-map, form-crud-tool, content-landing ou custom-product-surface.
- O summary deve citar "Pattern: <id>" e explicar em uma frase como a escolha guiou layout, componentes e estados.
- Siga component-policy: componentes/tokens existentes primeiro, bibliotecas já instaladas segundo, elementos nativos terceiro; não invente dependências.
- Trate o visualContract e o contexto visual como contrato obrigatório: preserve tokens, componentes, densidade, estados e antiPatterns salvo pedido explícito de redesign.
- Não use cores high-light, gradientes fortes ou frames extras se não existirem no contexto visual do projeto.
- previewHtml pode ser null. Use previewHtml apenas como descrição visual auxiliar, não como fonte da mudança.
- Exemplos obrigatórios de formato:
  - Alterar texto dentro de componente existente:
    {"summary":"Pattern: operational-dashboard. Ajusta copy do botão via AST.","previewHtml":null,"operations":[],"structuralPatchIntents":[{"id":"replace-app-copy","kind":"replace","targetPath":"src/App.tsx","targetSymbolName":"App","targetSymbolKind":"component","content":"export function App() {\\n  return <button>Início</button>;\\n}","rationale":"Substitui somente o componente App já inspecionado."}]}
  - Adicionar import em arquivo existente:
    {"summary":"Pattern: workflow-map. Adiciona icon sem reescrever arquivo.","previewHtml":null,"operations":[],"structuralPatchIntents":[{"id":"add-search-import","kind":"add_import","targetPath":"src/App.tsx","importSource":"lucide-react","namedImports":["Search"],"rationale":"Import necessário para o componente existente."}]}
  - Criar arquivo novo:
    {"summary":"Pattern: form-crud-tool. Cria componente novo e integra pelo entrypoint.","previewHtml":null,"structuralPatchIntents":[],"operations":[{"operation":"write","targetPath":"src/components/NewPanel.tsx","afterContent":"export function NewPanel() {\\n  return <section>Novo</section>;\\n}\\n","rationale":"Arquivo novo não tem símbolo AST pré-existente."}]}
- Se o pedido for "troque X por Y" em arquivo existente, escolha structuralPatchIntents primeiro. Só use operation write se não houver símbolo claro ou se a alteração realmente exigir reescrever o arquivo inteiro.
- Não inclua markdown. Retorne apenas o objeto estruturado do schema.`;

    const model = createChatModel("front", {
      temperature: 0.2,
      maxTokens: 8192,
    }, llmSettings).withStructuredOutput(CodeAwareFrontendOutputSchema);

    let result: CodeAwareFrontendOutput;
    try {
      result = CodeAwareFrontendOutputSchema.parse(
        await withTimeout(
          invokeChatModel(model, prompt),
          timeoutMs,
          `FrontAgent timed out after ${timeoutMs / 1000}s while generating project file operations.`
        )
      );
    } catch (err) {
      if (isCodeAwareFrontendTimeout(err, codeContext)) {
        return buildReactViteFallbackFrontendOutput({
          userStory,
          spec,
          codeContext,
          error: err,
        });
      }
      throw err;
    }
    return {
      html: result.previewHtml ?? result.summary,
      operations: result.operations.map((operation) =>
        operation.operation === "delete"
          ? {
              operation: "delete",
              targetPath: operation.targetPath,
              rationale: operation.rationale,
            }
          : {
              operation: "write",
              targetPath: operation.targetPath,
              afterContent: operation.afterContent,
              rationale: operation.rationale,
            }
      ),
      structuralPatchIntents: result.structuralPatchIntents.map(
        normalizeFrontendStructuralPatchIntent
      ),
      inspectedFiles: codeContext.inspectedFiles,
    };
  }

  const prompt = `Você é um desenvolvedor frontend expert. Gere uma página HTML completa e funcional com base na especificação técnica abaixo.

# Skill obrigatória do agente
${skill}
${reflectionBlock}
${executionBriefBlock}
${visualContractBlock}

${promptContextBlock}

${designContextBlock}

# História de Usuário
**Título:** ${userStory.title}

# Especificação Técnica
**Resumo:** ${spec.summary}

**Abordagem Técnica:** ${spec.technicalApproach}

**Componentes/Seções:**
${components}

**Modelos de Dados:**
${dataModels}

**Contratos Futuros de API/Rotas:**
${apiContracts}

**Critérios de Aceite:**
${criteria}

# Regras de Implementação
- Use apenas HTML, CSS e JavaScript vanilla (sem frameworks, sem CDNs externos)
- CSS e JS devem estar embutidos no HTML (dentro das tags <style> e <script>)
- Design responsivo usando CSS Flexbox e/ou Grid com media queries
- Use variáveis CSS (--cor-primaria, --cor-fundo, etc.) para o tema
- Se precisar de dados locais para estados visuais, use constantes nomeadas como fixtures de desenvolvimento somente dentro do HTML gerado, nunca em CodeChangeSet aplicado ao projeto real
- Se houver contratos futuros de API/Rotas, descreva a camada adaptadora esperada sem fingir chamadas externas reais
- Selecione e aplique o frontend pattern declarado na spec/visualContract. Se ausente, escolha um destes ids antes de escrever HTML: operational-dashboard, chat-preview-workbench, workflow-map, form-crud-tool, content-landing ou custom-product-surface.
- Inclua um comentario HTML curto ou texto interno tecnico apenas se necessario para tornar o pattern auditavel; nunca mostre o pattern como copy visivel ao usuario final.
- Siga component-policy: padrões existentes primeiro, bibliotecas já instaladas segundo, nativo terceiro; sem dependências externas.
- Respeite visualContract e contexto visual real: tokens, densidade, estados, responsividade, acessibilidade e antiPatterns são obrigatórios
- Use comentários técnicos curtos apenas em limites não óbvios, como data adapters, validações e transições de estado
- O código deve ser completo, funcional e abrível diretamente no browser
- Retorne APENAS o código HTML completo, começando com <!DOCTYPE html>
- Não inclua explicações, markdown code fences, ou qualquer texto fora do HTML`;

  const model = createChatModel("front", {
    temperature: 0.2,
    maxTokens: 8192,
  }, llmSettings);
  let response: HtmlChatResponse;
  try {
    response = (await withTimeout(
      invokeChatModel(model, prompt),
      timeoutMs,
      `FrontAgent timed out after ${timeoutMs / 1000}s while generating HTML.`
    )) as HtmlChatResponse;
  } catch (err) {
    return {
      html: buildStandaloneHtmlFallback({
        userStory,
        spec,
        reason:
          err instanceof Error
            ? err.message
            : "FrontAgent standalone HTML generation failed.",
      }),
    };
  }
  const content =
    typeof response.content === "string"
      ? response.content
      : response.content
          .map((c) => ("text" in c ? c.text : ""))
          .join("");

  const html = content
    .replace(/^```html\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  return {
    html:
      html.length > 0
        ? html
        : buildStandaloneHtmlFallback({
            userStory,
            spec,
            reason: "FrontAgent returned empty HTML content.",
          }),
  };
}

function buildStandaloneHtmlFallback(input: {
  userStory: UserStory;
  spec: Spec;
  reason: string;
}): string {
  const title = escapeHtml(input.userStory.title);
  const summary = escapeHtml(input.spec.summary);
  const criteriaItems = input.spec.acceptanceCriteria
    .map((criterion) => `<li>${escapeHtml(criterion)}</li>`)
    .join("");
  const apiItems = input.spec.apiEndpoints
    .map(
      (endpoint) =>
        `<li><code>${escapeHtml(endpoint.method)} ${escapeHtml(endpoint.path)}</code> - ${escapeHtml(endpoint.description)}</li>`
    )
    .join("");
  const colorPolicy = input.spec.visualContract?.colorPolicy;
  const backgroundColor = escapeHtml(colorPolicy?.background[0] ?? "#f6f8fb");
  const layerColor = escapeHtml(colorPolicy?.surface[0] ?? "#ffffff");
  const layerStrongColor = escapeHtml(
    colorPolicy?.surface[1] ?? colorPolicy?.surface[0] ?? "#eef3f8"
  );
  const textColor = escapeHtml(colorPolicy?.text[0] ?? "#102033");
  const mutedColor = escapeHtml(colorPolicy?.text[1] ?? "#607087");
  const accentColor = escapeHtml(colorPolicy?.accent[0] ?? "#2563EB");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: ${backgroundColor};
      --layer: ${layerColor};
      --layer-strong: ${layerStrongColor};
      --text: ${textColor};
      --muted: ${mutedColor};
      --accent: ${accentColor};
      --accent-strong: ${accentColor};
      --border: #d9e1ea;
      --danger: #7a4b4b;
      --success: #4d6f5c;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: start;
      gap: 8px;
      margin-bottom: 20px;
    }
    h1 { margin: 0; font-size: clamp(28px, 4vw, 40px); line-height: 1.05; }
    p { margin: 0; color: var(--muted); line-height: 1.55; }
    .layout {
      display: grid;
      grid-template-columns: 1fr minmax(280px, 340px);
      gap: 16px;
      align-items: start;
    }
    section {
      background: var(--layer);
      border-radius: 12px;
      padding: 18px;
    }
    h2 { margin: 0 0 14px; font-size: 18px; }
    label {
      display: grid;
      gap: 6px;
      margin-bottom: 12px;
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
    }
    .modal-shell {
      width: min(560px, calc(100vw - 32px));
      padding: 0;
      background: var(--layer);
      border-radius: 12px;
    }
    .modal-shell::backdrop { background: rgba(16, 32, 51, 0.28); }
    .modal-body { padding: 18px; }
    .modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
    }
    .secondary {
      color: var(--text);
      background: var(--layer-strong);
    }
    input, textarea, select {
      width: 100%;
      border-radius: 8px;
      padding: 10px 12px;
      font: inherit;
      color: var(--text);
      background: #fff;
    }
    textarea { resize: vertical; min-height: 88px; }
    button {
      border-radius: 8px;
      padding: 11px 14px;
      font-weight: 800;
      color: white;
      background: var(--accent);
      cursor: pointer;
    }
    button:disabled { cursor: not-allowed; opacity: 0.62; }
    button:hover { background: var(--accent-strong); }
    .error { color: var(--danger); min-height: 20px; font-size: 13px; font-weight: 700; }
    .status-banner {
      min-height: 38px;
      margin-bottom: 12px;
      padding: 9px 12px;
      border-radius: 8px;
      background: var(--layer-strong);
      color: var(--muted);
      font-weight: 700;
    }
    .status-banner.error { background: #fff7f6; color: var(--danger); }
    .status-banner.success { color: var(--success); }
    .toolbar {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .metric {
      border-radius: 10px;
      padding: 12px;
      background: var(--layer-strong);
    }
    .metric strong { display: block; font-size: 24px; }
    .tasks { display: grid; gap: 10px; }
    .task {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: start;
      border-radius: 10px;
      padding: 12px;
      background: #fff;
    }
    .empty-state {
      border-radius: 10px;
      padding: 20px;
      background: #fff;
      color: var(--muted);
      text-align: center;
    }
    .task.done { opacity: 0.7; }
    .task.overdue { background: #fff7f6; }
    .task-title { font-weight: 800; overflow-wrap: anywhere; }
    .task-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; color: var(--muted); font-size: 12px; }
    .pill {
      border-radius: 999px;
      padding: 3px 8px;
      background: var(--layer-strong);
    }
    .criteria {
      margin-top: 16px;
      padding-top: 16px;
    }
    .criteria ul { margin: 8px 0 0; padding-left: 18px; color: var(--muted); }
    @media (max-width: 820px) {
      header, .layout, .toolbar, .summary { display: grid; grid-template-columns: 1fr; }
      main { width: min(100vw - 20px, 1120px); padding: 20px 0; }
    }
    @media (max-width: 480px) {
      .modal-shell {
        width: 100vw;
        height: 100vh;
        max-width: none;
        max-height: none;
        border-radius: 0;
      }
      .modal-body { min-height: 100vh; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Tarefas pessoais</h1>
        <p>${summary}</p>
      </div>
      <button id="open-create" type="button">Nova tarefa</button>
    </header>
    <div class="layout">
      <section aria-labelledby="list-title">
        <h2 id="list-title">Lista principal</h2>
        <div id="status" class="status-banner" aria-live="polite">Pronto para registrar novas pendências.</div>
        <div class="summary" aria-label="Resumo das tarefas">
          <div class="metric"><span>Pendentes</span><strong id="pending-count">0</strong></div>
          <div class="metric"><span>Concluídas</span><strong id="done-count">0</strong></div>
          <div class="metric"><span>Vencidas</span><strong id="overdue-count">0</strong></div>
        </div>
        <div class="toolbar">
          <select id="status-filter" aria-label="Filtrar status"><option value="todas">Todas</option><option value="pending">Pendentes</option><option value="done">Concluídas</option></select>
          <select id="priority-filter" aria-label="Filtrar prioridade"><option value="todas">Todas prioridades</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select>
          <select id="sort-by" aria-label="Ordenar"><option value="due">Vencimento</option><option value="priority">Prioridade</option></select>
        </div>
        <div id="tasks" class="tasks" aria-live="polite"></div>
      </section>
      <section aria-labelledby="contract-title">
        <h2 id="contract-title">Contrato do protótipo</h2>
        <p>Artefato standalone com adapters em memória para demonstrar o fluxo futuro sem assumir backend real.</p>
        <div class="criteria">
          <strong>Critérios cobertos</strong>
          <ul>${criteriaItems}</ul>
        </div>
        <div class="criteria">
          <strong>APIs futuras</strong>
          <ul>${apiItems || "<li>Sem rotas futuras declaradas.</li>"}</ul>
        </div>
      </section>
    </div>
    <dialog id="task-dialog" class="modal-shell" aria-labelledby="form-title">
      <div class="modal-body">
        <div class="modal-head">
          <h2 id="form-title">Nova tarefa</h2>
          <button id="close-create" class="secondary" type="button">Fechar</button>
        </div>
        <form id="task-form" role="form" novalidate>
          <label for="title">Título <input id="title" name="title" maxlength="80" autocomplete="off" aria-required="true" /></label>
          <label for="description">Descrição <textarea id="description" name="description" maxlength="240"></textarea></label>
          <label for="dueAt">Vencimento <input id="dueAt" name="dueAt" type="datetime-local" /></label>
          <label for="category">Categoria <input id="category" name="category" list="categories" maxlength="32" /></label>
          <datalist id="categories"></datalist>
          <label for="priority">Prioridade <select id="priority" name="priority"><option value="baixa">Baixa</option><option value="media" selected>Média</option><option value="alta">Alta</option></select></label>
          <p id="error" class="error" role="alert" aria-live="polite"></p>
          <button id="submit-task" type="submit">Salvar tarefa</button>
        </form>
      </div>
    </dialog>
  </main>
  <script>
    const categories = [
      { id: "cat-work", name: "Trabalho", createdAt: new Date().toISOString() },
      { id: "cat-home", name: "Casa", createdAt: new Date().toISOString() }
    ];
    const tasks = [
      { id: "task-1", title: "Revisar agenda", description: "Separar prioridades do dia", dueAt: new Date(Date.now() + 3600000).toISOString(), categoryId: "cat-work", priority: "alta", status: "pending", createdAt: new Date().toISOString(), completedAt: null },
      { id: "task-2", title: "Comprar itens de casa", description: "", dueAt: "", categoryId: "cat-home", priority: "media", status: "pending", createdAt: new Date().toISOString(), completedAt: null }
    ];
    const categoryService = {
      async listCategories() { return categories; },
      async createCategory(payload) {
        const category = { id: "cat-" + Date.now(), name: payload.name, createdAt: new Date().toISOString() };
        categories.push(category);
        return category;
      }
    };
    const taskService = {
      async listTasks() { return tasks; },
      async createTask(payload) {
        const task = { id: "task-" + Date.now(), title: payload.title, description: payload.description || "", dueAt: payload.dueAt || "", categoryId: payload.categoryId || "", priority: payload.priority || "media", status: "pending", createdAt: new Date().toISOString(), completedAt: null };
        tasks.unshift(task);
        return task;
      }
    };
    const priorityRank = { alta: 3, media: 2, baixa: 1 };
    const dialog = document.querySelector("#task-dialog");
    const openButton = document.querySelector("#open-create");
    const closeButton = document.querySelector("#close-create");
    const form = document.querySelector("#task-form");
    const list = document.querySelector("#tasks");
    const error = document.querySelector("#error");
    const statusBanner = document.querySelector("#status");
    const submitButton = document.querySelector("#submit-task");
    let loading = false;

    function setStatus(message, kind) {
      statusBanner.textContent = message;
      statusBanner.className = "status-banner" + (kind ? " " + kind : "");
    }
    function formatDate(value) {
      if (!value) return "Sem vencimento";
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
    }
    function categoryName(categoryId) {
      return categories.find((category) => category.id === categoryId)?.name || "Sem categoria";
    }
    function isOverdue(task) {
      return task.status === "pending" && task.dueAt && new Date(task.dueAt).getTime() < Date.now();
    }
    function renderCategories() {
      document.querySelector("#categories").innerHTML = categories.map((category) => '<option value="' + category.name + '"></option>').join("");
    }
    function render() {
      const status = document.querySelector("#status-filter").value;
      const priority = document.querySelector("#priority-filter").value;
      const sortBy = document.querySelector("#sort-by").value;
      let visible = tasks.filter((task) => (status === "todas" || task.status === status) && (priority === "todas" || task.priority === priority));
      visible = visible.sort((a, b) => {
        if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
        if (sortBy === "priority") return priorityRank[b.priority] - priorityRank[a.priority];
        if (!a.dueAt && b.dueAt) return 1;
        if (a.dueAt && !b.dueAt) return -1;
        return new Date(a.dueAt || 8640000000000000).getTime() - new Date(b.dueAt || 8640000000000000).getTime();
      });
      document.querySelector("#pending-count").textContent = String(tasks.filter((task) => task.status === "pending").length);
      document.querySelector("#done-count").textContent = String(tasks.filter((task) => task.status === "done").length);
      document.querySelector("#overdue-count").textContent = String(tasks.filter(isOverdue).length);
      list.innerHTML = visible.length ? visible.map((task) => '<article class="task ' + (task.status === "done" ? "done " : "") + (isOverdue(task) ? "overdue" : "") + '"><input type="checkbox" data-id="' + task.id + '" ' + (task.status === "done" ? "checked" : "") + ' aria-label="Concluir tarefa ' + task.title + '" /><div><div class="task-title">' + task.title + '</div><p>' + (task.description || "Sem descrição") + '</p><div class="task-meta"><span class="pill">' + task.priority + '</span><span class="pill">' + categoryName(task.categoryId) + '</span><span class="pill">' + formatDate(task.dueAt) + '</span>' + (task.completedAt ? '<span class="pill">Concluída em ' + formatDate(task.completedAt) + '</span>' : '') + '</div></div><span class="pill">' + (task.status === "done" ? "concluída" : "pendente") + '</span></article>').join("") : '<div class="empty-state">Nenhuma tarefa encontrada.</div>';
    }
    function setLoading(nextLoading) {
      loading = nextLoading;
      submitButton.disabled = loading;
      submitButton.textContent = loading ? "Salvando..." : "Salvar tarefa";
    }
    function openDialog() {
      error.textContent = "";
      dialog.showModal();
      document.querySelector("#title").focus();
    }
    function closeDialog() {
      dialog.close();
    }
    async function resolveCategoryId(categoryNameValue) {
      const normalized = categoryNameValue.trim();
      if (!normalized) return "";
      const existing = categories.find((category) => category.name.toLowerCase() === normalized.toLowerCase());
      if (existing) return existing.id;
      const created = await categoryService.createCategory({ name: normalized });
      renderCategories();
      return created.id;
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (loading) return;
      const data = new FormData(form);
      const title = String(data.get("title") || "").trim();
      if (!title) {
        error.textContent = "Título é obrigatório";
        return;
      }
      error.textContent = "";
      setLoading(true);
      try {
        const categoryId = await resolveCategoryId(String(data.get("category") || ""));
        await taskService.createTask({ title, description: String(data.get("description") || "").trim(), dueAt: data.get("dueAt") ? new Date(String(data.get("dueAt"))).toISOString() : "", categoryId, priority: String(data.get("priority") || "media") });
        form.reset();
        closeDialog();
        setStatus("Tarefa criada com status pendente.", "success");
        render();
      } catch {
        error.textContent = "Não foi possível salvar. Tente novamente.";
        setStatus("Falha ao criar tarefa; o formulário permanece aberto.", "error");
      } finally {
        setLoading(false);
      }
    });
    openButton.addEventListener("click", openDialog);
    closeButton.addEventListener("click", closeDialog);
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll("button, input, textarea, select")].filter((element) => !element.disabled);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    list.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const task = tasks.find((item) => item.id === target.dataset.id);
      if (!task) return;
      task.status = target.checked ? "done" : "pending";
      task.completedAt = target.checked ? new Date().toISOString() : null;
      render();
    });
    document.querySelector("#status-filter").addEventListener("change", render);
    document.querySelector("#priority-filter").addEventListener("change", render);
    document.querySelector("#sort-by").addEventListener("change", render);
    renderCategories();
    render();
  </script>
</body>
</html>
<!-- Fallback acionado: ${escapeHtml(input.reason)} -->`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildExactTextEditFrontendOutput(
  executionBrief: string | undefined,
  codeContext: CodeContextBundle
): FrontendOutput | null {
  if (!executionBrief) return null;
  const quoted = [...executionBrief.matchAll(/"([^"]+)"/gu)].map(
    (match) => match[1]
  );
  if (quoted.length < 2) return null;
  const [oldText, newText] = quoted;
  if (!oldText || !newText || oldText === newText) return null;

  const matches: Array<{
    file: CodeContextBundle["files"][number];
    afterContent: string;
  }> = [];
  for (const file of codeContext.files) {
    const afterContent = replaceUniqueTextOccurrence(
      file.content,
      oldText,
      newText
    );
    if (afterContent) matches.push({ file, afterContent });
  }
  if (matches.length !== 1) return null;

  const match = matches[0]!;
  return {
    html: `Exact text edit: ${match.file.path}`,
    operations: [
      {
        operation: "write",
        targetPath: match.file.path,
        afterContent: match.afterContent,
        rationale:
          "Aplicar substituicao textual exata com ocorrencia unica em arquivo inspecionado.",
      },
    ],
    inspectedFiles: codeContext.inspectedFiles,
  };
}

function replaceUniqueTextOccurrence(
  content: string,
  oldText: string,
  newText: string
): string | null {
  const literalCount = countOccurrences(content, oldText);
  if (literalCount === 1) return content.replace(oldText, newText);
  if (literalCount > 1) return null;

  const whitespaceTolerantPattern = buildWhitespaceTolerantTextPattern(oldText);
  if (!whitespaceTolerantPattern) return null;

  const matches = [...content.matchAll(whitespaceTolerantPattern)];
  if (matches.length !== 1) return null;

  const match = matches[0];
  if (!match || match.index === undefined) return null;
  return (
    content.slice(0, match.index) +
    newText +
    content.slice(match.index + match[0].length)
  );
}

function buildWhitespaceTolerantTextPattern(text: string): RegExp | null {
  const tokens = text.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length < 2) return null;
  return new RegExp(tokens.map(escapeRegExp).join("\\s+"), "gu");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export async function generateProjectExecutionPlan(
  input: {
    userStory: UserStory;
    spec: Spec;
    workspaceContext: ProjectWorkspaceContextSnapshot;
    llmSettings?: LlmSettings;
    executionBrief?: string;
    designContext?: DesignContextBundle;
    promptContext?: PromptContextBundle;
  }
): Promise<ProjectExecutionPlan> {
  const components = input.spec.components
    .map((c) => `- ${c.name} (${c.type}): ${c.description}`)
    .join("\n");
  const criteria = input.spec.acceptanceCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");
  const filesBlock = input.workspaceContext.files
    .map(
      (file) => `## ${file.path}
\`\`\`
${file.content}
\`\`\``
    )
    .join("\n\n");
  const commandCatalog = input.workspaceContext.commandCatalog
    .map((command) => {
      const label = command.label ? ` (${command.label})` : "";
      return `- ${command.id}${label}: ${[command.executable, ...command.args].join(" ")} [cwd=${command.cwd}]`;
    })
    .join("\n");
  const executionBriefBlock = input.executionBrief
    ? `
# Pedido de alteração vindo do chat do Horus
${input.executionBrief}

Trate este pedido como a intenção executora atual. Se o pedido for uma alteração, edite o código existente com operações de arquivo.
`
    : "";
  const skill = appendRuntimeAgentSkills(
    loadAgentSkill("front-design-frontend"),
    input.promptContext?.runtimeSkills ?? []
  );
  const visualContractBlock = buildVisualContractPromptBlock(input.spec);
  const designContextBlock = formatDesignContextForPrompt(input.designContext);
  const promptContextBlock = formatPromptContextForPrompt(input.promptContext);
  const timeoutMs = resolveFrontAgentTimeoutMs();

  const prompt = `Você é o Front Agent do Horus em modo executor. Você tem capacidade real de criar, editar, atualizar e deletar arquivos dentro do workspace isolado do projeto.

# Skill obrigatória do agente
${skill}
${executionBriefBlock}
${visualContractBlock}

${promptContextBlock}

${designContextBlock}

# Contrato de saída obrigatório
Retorne somente o objeto estruturado do schema. Não use markdown.

Campos:
- summary: resumo do que será alterado.
- fileOperations: lista de operações reais de arquivo.
  - operation deve ser "write" para criar ou atualizar o conteúdo completo de um arquivo.
  - operation deve ser "delete" para remover arquivo obsoleto.
  - path deve ser relativo à raiz do projeto e precisa estar dentro de writeRoots.
  - content deve conter o conteúdo completo final do arquivo quando operation="write".
  - contentBase64 deve ser usado somente para binários; para texto, use content.
  - para delete, content e contentBase64 devem ser null.
- commandRequests: comandos opcionais do catálogo para executar durante a implementação.
- validationCommandIds: comandos do catálogo que devem validar a alteração.
- risks: riscos concretos ou lista vazia.

# Regras de segurança e arquitetura
- Nunca escreva fora dos writeRoots.
- Nunca edite .git, node_modules, dist, build ou arquivos de lock sem necessidade explícita da spec.
- Não use mock, fake adapter, fixture em runtime, Math.random, CDN externo ou chamada externa inventada.
- O código precisa ser alcançável pelo entrypoint existente do projeto.
- Para projectStack React/TypeScript/Vite, edite a aplicação real por meio de src/main.tsx, src/App.tsx, src/features, src/components, src/styles e tipos/adapters coesos.
- Para projectStack React/TypeScript/Vite, não gere HTML standalone, não escreva generated/horus como implementação e não substitua a aplicação por uma página isolada.
- Para outras stacks, siga o entrypoint/roteamento declarado pelo projeto e não invente outro framework.
- Para atualizar um arquivo, retorne o conteúdo completo final do arquivo.
- Delete somente arquivos que se tornaram obsoletos pela implementação.
- Use o commandCatalog. Não invente comandos e não escreva shell livre.
- Se não houver comando adequado, deixe commandRequests e validationCommandIds vazios; o quality gate fará a validação padrão.
- Preserve a identidade visual e os padrões de componentes/estilos existentes.
- Use visualContract e DesignContextBundle como restrições obrigatórias; não crie paleta, textura, densidade ou componentes paralelos quando o projeto já fornece padrões.
- Selecione e aplique o frontend pattern da spec/visualContract; se ausente, escolha explicitamente operational-dashboard, chat-preview-workbench, workflow-map, form-crud-tool, content-landing ou custom-product-surface.
- O campo summary do plano deve conter "Pattern: <id>" e a razão de component-policy usada.
- Reuse componentes/tokens existentes antes de criar novos; use bibliotecas apenas se já estiverem no package.json/imports do projeto.
- Prefira alterar poucos arquivos coesos em vez de criar uma segunda aplicação paralela.

# História de Usuário
Título: ${input.userStory.title}
Descrição:
${input.userStory.description}

# SPEC
Resumo: ${input.spec.summary}

Abordagem técnica:
${input.spec.technicalApproach}

Componentes:
${components || "N/A"}

Critérios de aceite:
${criteria || "N/A"}

# Workspace
Raiz: ${input.workspaceContext.root}
Stack do projeto: ${input.workspaceContext.projectStack}
writeRoots:
${input.workspaceContext.writeRoots.map((root) => `- ${root}`).join("\n")}

Árvore de arquivos:
${input.workspaceContext.tree.map((path) => `- ${path}`).join("\n") || "N/A"}

Command catalog:
${commandCatalog || "N/A"}

# Arquivos carregados
${filesBlock || "N/A"}

Gere o plano de execução para construir a feature no código real do workspace.`;

  const model = createChatModel(
    "front",
    {
      temperature: 0.2,
      maxTokens: 16000,
    },
    input.llmSettings
  ).withStructuredOutput(ProjectExecutionPlanLlmSchema);

  let lastRejectedPlan = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const repairBlock = lastRejectedPlan
      ? `

# Plano rejeitado na tentativa anterior
${lastRejectedPlan}

Corrija o plano. Para toda operação "write", entregue exatamente um payload: content com o arquivo completo final OU contentBase64 para binário. Não retorne ambos nulos. Para "delete", deixe content e contentBase64 nulos.
`
      : "";
    let raw: ProjectExecutionPlanLlm;
    try {
      raw = ProjectExecutionPlanLlmSchema.parse(
        await withTimeout(
          invokeChatModel(model, `${prompt}${repairBlock}`),
          timeoutMs,
          `FrontAgent timed out after ${timeoutMs / 1000}s while planning project execution.`
        )
      );
    } catch (err) {
      if (isProjectPlanTimeout(err, input.workspaceContext)) {
        return buildReactViteFallbackProjectPlan(input, err);
      }
      throw err;
    }
    const normalized = ProjectExecutionPlanSchema.parse(
      normalizeProjectExecutionPlan(raw)
    );
    const rejection = validateProjectExecutionPlanPayloads(normalized);
    if (!rejection) return normalized;
    lastRejectedPlan = `${rejection}\n${JSON.stringify(raw, null, 2)}`;
  }

  throw new Error(
    `Front Agent returned an invalid project execution plan after repair: ${lastRejectedPlan}`
  );
}

function isProjectPlanTimeout(
  err: unknown,
  workspaceContext: ProjectWorkspaceContextSnapshot
): boolean {
  return (
    err instanceof Error &&
    err.message.includes("FrontAgent timed out") &&
    /react|vite|typescript/i.test(workspaceContext.projectStack)
  );
}

function isCodeAwareFrontendTimeout(
  err: unknown,
  codeContext: CodeContextBundle
): boolean {
  const frontend = codeContext.manifest?.stack.frontend;
  const language = codeContext.manifest?.stack.language;
  const hasReactEntrypoint = codeContext.files.some((file) =>
    ["src/App.tsx", "src/main.tsx"].includes(file.path)
  );
  return (
    err instanceof Error &&
    err.message.includes("FrontAgent timed out") &&
    ((frontend === "react" && language === "typescript") || hasReactEntrypoint)
  );
}

function buildReactViteFallbackFrontendOutput(input: {
  userStory: UserStory;
  spec: Spec;
  codeContext: CodeContextBundle;
  error: unknown;
}): FrontendOutput {
  const reason =
    input.error instanceof Error
      ? input.error.message
      : "FrontAgent file operation generation timeout.";
  return {
    html: `Pattern: operational-dashboard. Fallback do FrontAgent acionado porque o plano LLM expirou: ${reason}`,
    operations: [
      {
        targetPath: "src/App.tsx",
        rationale:
          "Construir a interface solicitada no entrypoint React real quando a geracao estruturada expira.",
        afterContent: buildProjectManagerAppTsx(input),
      },
      {
        targetPath: "src/styles/app.css",
        rationale:
          "Padronizar layout, navegacao, dashboard, tarefas e calendario com identidade visual escura e cinza.",
        afterContent: buildProjectManagerAppCss(),
      },
    ],
    inspectedFiles: input.codeContext.inspectedFiles,
  };
}

function buildReactViteFallbackProjectPlan(
  input: {
    userStory: UserStory;
    spec: Spec;
    workspaceContext: ProjectWorkspaceContextSnapshot;
  },
  err: unknown
): ProjectExecutionPlan {
  const validationCommandIds = input.workspaceContext.commandCatalog
    .map((command) => command.id)
    .filter((id) => id.includes("type-check") || id.includes("build"));
  const reason =
    err instanceof Error ? err.message : "FrontAgent planning timeout.";

  return ProjectExecutionPlanSchema.parse({
    summary:
      "Pattern: operational-dashboard. Fallback do FrontAgent aplicado apos timeout do plano LLM; gera uma SPA React/Vite coesa com dashboard, tarefas e calendario usando tokens locais.",
    fileOperations: [
      {
        operation: "write",
        path: "src/App.tsx",
        reason:
          "Construir a interface solicitada no entrypoint React real quando o planejamento estruturado expira.",
        content: buildProjectManagerAppTsx(input),
      },
      {
        operation: "write",
        path: "src/styles/app.css",
        reason:
          "Padronizar layout, navegacao, dashboard, tarefas e calendario com identidade visual escura e cinza.",
        content: buildProjectManagerAppCss(),
      },
    ],
    commandRequests: [],
    validationCommandIds,
    risks: [
      `Plano LLM original expirou: ${reason}`,
      "Fallback cobre a experiencia visual e interativa local, mas nao integra APIs externas ausentes no workspace.",
    ],
  });
}

function resolveFrontAgentTimeoutMs(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env["FRONT_AGENT_TIMEOUT_MS"]?.trim();
  if (!raw) return 60_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("FRONT_AGENT_TIMEOUT_MS must be a positive finite number.");
  }
  return parsed;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function normalizeProjectExecutionPlan(
  plan: ProjectExecutionPlanLlm
): ProjectExecutionPlan {
  return {
    summary: plan.summary,
    fileOperations: plan.fileOperations.map((operation) => ({
      operation: operation.operation,
      path: operation.path,
      reason: operation.reason,
      ...(operation.content !== null ? { content: operation.content } : {}),
      ...(operation.contentBase64 !== null && operation.contentBase64.length > 0
        ? { contentBase64: operation.contentBase64 }
        : {}),
    })),
    commandRequests: plan.commandRequests,
    validationCommandIds: plan.validationCommandIds,
    risks: plan.risks,
  };
}

function validateProjectExecutionPlanPayloads(
  plan: ProjectExecutionPlan
): string | null {
  for (const operation of plan.fileOperations) {
    const hasText = operation.content != null;
    const hasBase64 =
      operation.contentBase64 != null && operation.contentBase64.length > 0;
    if (operation.operation === "write" && hasText === hasBase64) {
      return `Invalid write operation for ${operation.path}: expected exactly one content payload.`;
    }
    if (operation.operation === "delete" && (hasText || hasBase64)) {
      return `Invalid delete operation for ${operation.path}: delete must not include content.`;
    }
  }
  return null;
}

function countOccurrences(content: string, search: string): number {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = content.indexOf(search, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + search.length;
  }
}

function buildVisualContractPromptBlock(spec: Spec): string {
  if (!spec.visualContract) {
    return [
      "# VisualContract da SPEC",
      "A SPEC nao possui visualContract persistido. Preserve a identidade local comprovada pelo contexto visual e evite estilos genericos.",
    ].join("\n");
  }

  return [
    "# VisualContract da SPEC",
    JSON.stringify(spec.visualContract, null, 2),
  ].join("\n");
}
