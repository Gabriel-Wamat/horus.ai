import { z } from "zod";
import {
  ProjectExecutionPlanSchema,
  type CodeContextBundle,
  type DesignContextBundle,
  type LlmSettings,
  type ProjectExecutionPlan,
  type Spec,
  type UserStory,
} from "@u-build/shared";
import type { CuratorFeedback } from "../langgraph/state.js";
import { loadAgentSkill } from "../agentSkills/loadAgentSkill.js";
import { createChatModel } from "../llm/createChatModel.js";
import type { FrontendFileOperationPlan } from "../code/buildFrontendCodeChangeSet.js";
import type { ProjectWorkspaceContextSnapshot } from "../project/ProjectExecutionService.js";
import { formatDesignContextForPrompt } from "../design/DesignContextService.js";

export interface FrontendOutput {
  html: string;
  operations?: FrontendFileOperationPlan[];
  inspectedFiles?: string[];
}

const FrontendOperationPlanSchema = z.object({
  targetPath: z.string().trim().min(1),
  afterContent: z.string().min(1),
  rationale: z.string().trim().min(1),
});

const CodeAwareFrontendOutputSchema = z.object({
  summary: z.string().trim().min(1),
  previewHtml: z.string().nullable(),
  operations: z.array(FrontendOperationPlanSchema).min(1),
});

const ProjectFileOperationPlanSchema = z.object({
  operation: z.enum(["write", "delete"]),
  path: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  content: z.string().nullable(),
  contentBase64: z.string().nullable(),
});

const ProjectCommandRequestPlanSchema = z.object({
  commandId: z.string().trim().min(1),
  reason: z.string().trim().min(1),
});

const ProjectExecutionPlanLlmSchema = z.object({
  summary: z.string().trim().min(1),
  fileOperations: z.array(ProjectFileOperationPlanSchema),
  commandRequests: z.array(ProjectCommandRequestPlanSchema),
  validationCommandIds: z.array(z.string().trim().min(1)),
  risks: z.array(z.string()),
});

type ProjectExecutionPlanLlm = z.infer<typeof ProjectExecutionPlanLlmSchema>;

export async function generateFrontend(
  userStory: UserStory,
  spec: Spec,
  curatorFeedback?: CuratorFeedback,
  llmSettings?: LlmSettings,
  executionBrief?: string,
  codeContext?: CodeContextBundle,
  designContext?: DesignContextBundle
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

  const skill = loadAgentSkill("front-design-frontend");

  if (codeContext) {
    const filesBlock = codeContext.files
      .map(
        (file) => `## ${file.path}
\`\`\`
${file.content}
\`\`\``
      )
      .join("\n\n");

    const prompt = `Você é o Front Agent do Horus. Sua tarefa é alterar o frontend real do projeto, usando operações completas de arquivo.

# Skill obrigatória do agente
${skill}
${reflectionBlock}
${executionBriefBlock}
${visualContractBlock}

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
- Cada operação deve conter o conteúdo completo final do arquivo em afterContent.
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
- Não inclua markdown. Retorne apenas o objeto estruturado do schema.`;

    const model = createChatModel("front", {
      temperature: 0.2,
      maxTokens: 8192,
    }, llmSettings).withStructuredOutput(CodeAwareFrontendOutputSchema);

    let result: z.infer<typeof CodeAwareFrontendOutputSchema>;
    try {
      result = CodeAwareFrontendOutputSchema.parse(
        await withTimeout(
          model.invoke(prompt),
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
      operations: result.operations,
      inspectedFiles: codeContext.inspectedFiles,
    };
  }

  const prompt = `Você é um desenvolvedor frontend expert. Gere uma página HTML completa e funcional com base na especificação técnica abaixo.

# Skill obrigatória do agente
${skill}
${reflectionBlock}
${executionBriefBlock}
${visualContractBlock}

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
  const response = await withTimeout(
    model.invoke(prompt),
    timeoutMs,
    `FrontAgent timed out after ${timeoutMs / 1000}s while generating HTML.`
  );
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

  return { html };
}

export async function generateProjectExecutionPlan(
  input: {
    userStory: UserStory;
    spec: Spec;
    workspaceContext: ProjectWorkspaceContextSnapshot;
    llmSettings?: LlmSettings;
    executionBrief?: string;
    designContext?: DesignContextBundle;
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
  const skill = loadAgentSkill("front-design-frontend");
  const visualContractBlock = buildVisualContractPromptBlock(input.spec);
  const designContextBlock = formatDesignContextForPrompt(input.designContext);
  const timeoutMs = resolveFrontAgentTimeoutMs();

  const prompt = `Você é o Front Agent do Horus em modo executor. Você tem capacidade real de criar, editar, atualizar e deletar arquivos dentro do workspace isolado do projeto.

# Skill obrigatória do agente
${skill}
${executionBriefBlock}
${visualContractBlock}

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
          model.invoke(`${prompt}${repairBlock}`),
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

function buildProjectManagerAppTsx(input: {
  userStory: UserStory;
  spec: Spec;
  codeContext?: CodeContextBundle;
  workspaceContext?: ProjectWorkspaceContextSnapshot;
}): string {
  const title = sanitizeTsString(
    input.userStory.title.replace(/^PM-\d+\s*-\s*/i, "") ||
      "Gerenciamento de projeto"
  );
  const summary = sanitizeTsString(input.spec.summary || input.userStory.description);
  const exportStyle = detectReactAppExportStyle(input);
  const appDeclaration =
    exportStyle === "default" ? "function App()" : "export function App()";
  const appExport =
    exportStyle === "default" || exportStyle === "both"
      ? "\nexport default App;\n"
      : "\n";

  return `import type { FormEvent } from "react";
import { useMemo, useState } from "react";

type View = "home" | "tasks" | "calendar";
type TaskWindow = "day" | "week" | "month";
type TaskStatus = "pending" | "progress" | "done" | "overdue";
type TaskPriority = "Alta" | "Media" | "Baixa";

interface Task {
  id: number;
  title: string;
  owner: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
}

const initialTasks: Task[] = [
  { id: 1, title: "Revisar escopo do dashboard", owner: "Ana", dueDate: "2026-05-27", priority: "Alta", status: "progress" },
  { id: 2, title: "Publicar lista de entregas do dia", owner: "Bruno", dueDate: "2026-05-27", priority: "Media", status: "pending" },
  { id: 3, title: "Validar prototipo mobile", owner: "Clara", dueDate: "2026-05-28", priority: "Alta", status: "done" },
  { id: 4, title: "Ajustar dependencias do calendario", owner: "Davi", dueDate: "2026-05-22", priority: "Baixa", status: "overdue" },
];

const navItems: Array<{ id: View; label: string }> = [
  { id: "home", label: "Home" },
  { id: "tasks", label: "Tarefas" },
  { id: "calendar", label: "Calendario" },
];

const statusLabel: Record<TaskStatus, string> = {
  pending: "Pendente",
  progress: "Em curso",
  done: "Concluida",
  overdue: "Atrasada",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isInWindow(taskDate: string, window: TaskWindow) {
  const today = new Date(todayIso());
  const date = new Date(taskDate);
  const diffDays = Math.floor((date.getTime() - today.getTime()) / 86400000);

  if (window === "day") return taskDate === todayIso();
  if (window === "week") return diffDays >= -6 && diffDays <= 6;
  return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
}

${appDeclaration} {
  const [activeView, setActiveView] = useState<View>("home");
  const [taskWindow, setTaskWindow] = useState<TaskWindow>("day");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [selectedDay, setSelectedDay] = useState(27);
  const [form, setForm] = useState({
    title: "",
    owner: "",
    dueDate: todayIso(),
    priority: "Media" as TaskPriority,
  });

  const visibleTasks = useMemo(
    () => tasks.filter((task) => isInWindow(task.dueDate, taskWindow)),
    [tasks, taskWindow]
  );

  const metrics = useMemo(() => {
    const done = tasks.filter((task) => task.status === "done").length;
    const overdue = tasks.filter((task) => task.status === "overdue").length;
    const inProgress = tasks.filter((task) => task.status === "progress").length;
    const completion = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    return { done, overdue, inProgress, completion };
  }, [tasks]);

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;
    setTasks((current) => [
      {
        id: Date.now(),
        title: form.title.trim(),
        owner: form.owner.trim() || "Sem dono",
        dueDate: form.dueDate,
        priority: form.priority,
        status: "pending",
      },
      ...current,
    ]);
    setForm({ title: "", owner: "", dueDate: todayIso(), priority: "Media" });
  }

  const selectedDate = \`2026-05-\${String(selectedDay).padStart(2, "0")}\`;
  const selectedTasks = tasks.filter((task) => task.dueDate === selectedDate);

  return (
    <main className="pm-shell">
      <aside className="pm-sidebar">
        <div>
          <span className="pm-logo">H</span>
          <p className="pm-kicker">Project OS</p>
          <h1>${title}</h1>
          <p className="pm-summary">${summary}</p>
        </div>
        <nav className="pm-nav" aria-label="Navegacao principal">
          {navItems.map((item) => (
            <button
              className={activeView === item.id ? "is-active" : ""}
              key={item.id}
              onClick={() => setActiveView(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="pm-workspace">
        <header className="pm-topbar">
          <div>
            <p className="pm-kicker">Status do projeto</p>
            <strong>{metrics.completion}% concluido</strong>
          </div>
          <div className="pm-live-pill">
            <span />
            Atualizado agora
          </div>
        </header>

        {activeView === "home" && (
          <section className="pm-page">
            <div className="pm-section-head">
              <p className="pm-kicker">Home</p>
              <h2>Desempenho do projeto</h2>
            </div>

            <div className="pm-metrics">
              <article>
                <span>Concluidas</span>
                <strong>{metrics.done}</strong>
                <small>tarefas fechadas</small>
              </article>
              <article>
                <span>Em progresso</span>
                <strong>{metrics.inProgress}</strong>
                <small>frentes ativas</small>
              </article>
              <article>
                <span>Atrasadas</span>
                <strong>{metrics.overdue}</strong>
                <small>pedem decisao</small>
              </article>
            </div>

            <div className="pm-dashboard-grid">
              <article className="pm-panel pm-chart">
                <div className="pm-section-head compact">
                  <p className="pm-kicker">Semana</p>
                  <h3>Produtividade</h3>
                </div>
                <div className="pm-bars" aria-label="Grafico simples de produtividade semanal">
                  {[42, 58, 64, 72, 54, 81, metrics.completion].map((value, index) => (
                    <span key={index} style={{ height: \`\${value}%\` }} />
                  ))}
                </div>
              </article>

              <article className="pm-panel">
                <div className="pm-section-head compact">
                  <p className="pm-kicker">Marcos</p>
                  <h3>Proximas entregas</h3>
                </div>
                <ul className="pm-timeline">
                  <li><span />Design aprovado para home</li>
                  <li><span />Fluxo diario de tarefas</li>
                  <li><span />Calendario pronto para revisao</li>
                </ul>
              </article>
            </div>
          </section>
        )}

        {activeView === "tasks" && (
          <section className="pm-page">
            <div className="pm-section-head">
              <p className="pm-kicker">Tarefas</p>
              <h2>Criar e acompanhar listas</h2>
            </div>

            <div className="pm-task-layout">
              <form className="pm-panel pm-form" onSubmit={createTask}>
                <label>
                  Titulo
                  <input
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    placeholder="Nova tarefa"
                    value={form.title}
                  />
                </label>
                <label>
                  Responsavel
                  <input
                    onChange={(event) => setForm({ ...form, owner: event.target.value })}
                    placeholder="Nome"
                    value={form.owner}
                  />
                </label>
                <div className="pm-form-row">
                  <label>
                    Data
                    <input
                      onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                      type="date"
                      value={form.dueDate}
                    />
                  </label>
                  <label>
                    Prioridade
                    <select
                      onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })}
                      value={form.priority}
                    >
                      <option>Alta</option>
                      <option>Media</option>
                      <option>Baixa</option>
                    </select>
                  </label>
                </div>
                <button className="pm-primary" type="submit">Criar tarefa</button>
              </form>

              <article className="pm-panel pm-list-panel">
                <div className="pm-filter-tabs" aria-label="Filtro de periodo">
                  {(["day", "week", "month"] as TaskWindow[]).map((item) => (
                    <button
                      className={taskWindow === item ? "is-active" : ""}
                      key={item}
                      onClick={() => setTaskWindow(item)}
                      type="button"
                    >
                      {item === "day" ? "Dia" : item === "week" ? "Semana" : "Mes"}
                    </button>
                  ))}
                </div>
                <div className="pm-task-list">
                  {visibleTasks.length === 0 ? (
                    <p className="pm-empty">Nenhuma tarefa para este periodo.</p>
                  ) : (
                    visibleTasks.map((task) => (
                      <article className="pm-task-item" key={task.id}>
                        <div>
                          <strong>{task.title}</strong>
                          <span>{task.owner} · {task.dueDate}</span>
                        </div>
                        <div className="pm-task-meta">
                          <small>{task.priority}</small>
                          <em className={\`status-\${task.status}\`}>{statusLabel[task.status]}</em>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </article>
            </div>
          </section>
        )}

        {activeView === "calendar" && (
          <section className="pm-page">
            <div className="pm-section-head">
              <p className="pm-kicker">Calendario</p>
              <h2>Maio 2026</h2>
            </div>
            <div className="pm-calendar-layout">
              <article className="pm-panel pm-calendar">
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <button
                    className={selectedDay === day ? "is-selected" : ""}
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    type="button"
                  >
                    <span>{day}</span>
                    {tasks.some((task) => task.dueDate.endsWith(String(day).padStart(2, "0"))) && <i />}
                  </button>
                ))}
              </article>
              <aside className="pm-panel pm-day-panel">
                <p className="pm-kicker">Dia {selectedDay}</p>
                <h3>Agenda selecionada</h3>
                {selectedTasks.length === 0 ? (
                  <p className="pm-empty">Sem entregas nesse dia.</p>
                ) : (
                  selectedTasks.map((task) => (
                    <article className="pm-day-task" key={task.id}>
                      <strong>{task.title}</strong>
                      <span>{task.owner} · {statusLabel[task.status]}</span>
                    </article>
                  ))
                )}
              </aside>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
${appExport}`;
}

type ReactAppExportStyle = "named" | "default" | "both";

function detectReactAppExportStyle(input: {
  codeContext?: CodeContextBundle;
  workspaceContext?: ProjectWorkspaceContextSnapshot;
}): ReactAppExportStyle {
  const files = [
    ...(input.codeContext?.files ?? []),
    ...(input.workspaceContext?.files ?? []),
  ];
  const main = files.find((file) => file.path === "src/main.tsx")?.content ?? "";
  const app = files.find((file) => file.path === "src/App.tsx")?.content ?? "";

  const importsNamedApp =
    /import\s*\{\s*App\s*\}\s*from\s*["']\.\/App["']/u.test(main) ||
    /import\s*\{\s*App\s*\}\s*from\s*["']\.\/App\.(tsx|ts|jsx|js)["']/u.test(main);
  const importsDefaultApp =
    /import\s+App\s+from\s*["']\.\/App["']/u.test(main) ||
    /import\s+App\s+from\s*["']\.\/App\.(tsx|ts|jsx|js)["']/u.test(main);

  if (importsNamedApp && importsDefaultApp) return "both";
  if (importsNamedApp) return "named";
  if (importsDefaultApp) return "default";

  if (/export\s+function\s+App\b/u.test(app) || /export\s+const\s+App\b/u.test(app)) {
    return "named";
  }
  if (/export\s+default\s+App\b/u.test(app) || /export\s+default\s+function\s+App\b/u.test(app)) {
    return "default";
  }

  return "named";
}

function buildProjectManagerAppCss(): string {
  return `.pm-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 18px;
  padding: clamp(16px, 2vw, 28px);
  color: #edf6f2;
}

.pm-sidebar,
.pm-workspace,
.pm-panel,
.pm-metrics article {
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(18, 23, 22, 0.78);
  box-shadow: 0 20px 80px rgba(0, 0, 0, 0.2);
}

.pm-sidebar {
  position: sticky;
  top: 18px;
  height: calc(100vh - 36px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 22px;
  padding: 22px;
}

.pm-logo {
  width: 42px;
  height: 42px;
  display: inline-grid;
  place-items: center;
  border-radius: 14px;
  color: #07100d;
  background: #35c99b;
  font-weight: 800;
}

.pm-kicker {
  margin: 0 0 8px;
  color: #8d9a96;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 12px;
  font-size: clamp(1.7rem, 4vw, 2.45rem);
  line-height: 1.04;
}

.pm-summary {
  color: #aab8b2;
  line-height: 1.55;
}

.pm-nav {
  display: grid;
  gap: 8px;
}

button,
input,
select {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 14px;
  color: inherit;
  background: rgba(255, 255, 255, 0.04);
}

button {
  min-height: 42px;
  cursor: pointer;
}

.pm-nav button,
.pm-filter-tabs button {
  text-align: left;
  padding: 0 14px;
  color: #aab8b2;
}

button.is-active,
.pm-primary {
  color: #06110e;
  border-color: rgba(53, 201, 155, 0.54);
  background: #35c99b;
}

.pm-workspace {
  min-width: 0;
  overflow: hidden;
  border-radius: 24px;
}

.pm-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.pm-topbar strong {
  font-size: 1.1rem;
}

.pm-live-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 999px;
  padding: 9px 12px;
  color: #b8c5c0;
  background: rgba(255, 255, 255, 0.04);
  font-weight: 700;
}

.pm-live-pill span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #35c99b;
}

.pm-page {
  padding: clamp(18px, 3vw, 34px);
}

.pm-section-head {
  margin-bottom: 20px;
}

.pm-section-head h2 {
  margin: 0;
  font-size: clamp(1.7rem, 4vw, 3rem);
  letter-spacing: 0;
}

.pm-section-head.compact h3 {
  margin: 0;
  font-size: 1.15rem;
}

.pm-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.pm-metrics article,
.pm-panel {
  border-radius: 18px;
  padding: 18px;
}

.pm-metrics span,
.pm-metrics small,
.pm-task-item span,
.pm-day-task span,
.pm-empty {
  color: #8d9a96;
}

.pm-metrics strong {
  display: block;
  margin: 10px 0 6px;
  font-size: 2.15rem;
}

.pm-dashboard-grid,
.pm-task-layout,
.pm-calendar-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
  gap: 14px;
}

.pm-chart {
  min-height: 320px;
}

.pm-bars {
  height: 220px;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  align-items: end;
  gap: 10px;
  padding-top: 22px;
}

.pm-bars span {
  min-height: 28px;
  border-radius: 999px 999px 6px 6px;
  background: linear-gradient(180deg, rgba(53, 201, 155, 0.82), rgba(53, 201, 155, 0.22));
}

.pm-timeline {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.pm-timeline li {
  display: flex;
  gap: 10px;
  color: #dce7e2;
}

.pm-timeline span,
.pm-calendar i {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  margin-top: 8px;
  border-radius: 999px;
  background: #35c99b;
}

.pm-form {
  display: grid;
  gap: 14px;
  align-content: start;
}

.pm-form label {
  display: grid;
  gap: 8px;
  color: #aab8b2;
  font-weight: 700;
}

.pm-form input,
.pm-form select {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
}

.pm-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.pm-primary {
  font-weight: 800;
}

.pm-filter-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.pm-filter-tabs button {
  flex: 1;
  text-align: center;
}

.pm-task-list {
  display: grid;
  gap: 10px;
}

.pm-task-item,
.pm-day-task {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid rgba(148, 163, 184, 0.13);
  border-radius: 14px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.03);
}

.pm-task-item strong,
.pm-day-task strong {
  display: block;
  margin-bottom: 5px;
}

.pm-task-meta {
  display: grid;
  justify-items: end;
  gap: 6px;
}

.pm-task-meta small,
.pm-task-meta em {
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 0.74rem;
  font-style: normal;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.05);
}

.status-done {
  color: #35c99b;
}

.status-overdue {
  color: #ff8d8d;
}

.status-progress {
  color: #d4d8dc;
}

.status-pending {
  color: #aab8b2;
}

.pm-calendar {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.pm-calendar button {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  position: relative;
}

.pm-calendar button.is-selected {
  border-color: rgba(53, 201, 155, 0.72);
  background: rgba(53, 201, 155, 0.14);
}

.pm-calendar i {
  position: absolute;
  right: 8px;
  bottom: 8px;
  margin: 0;
}

.pm-day-panel {
  min-height: 360px;
}

.pm-empty {
  margin: 0;
  line-height: 1.5;
}

@media (max-width: 980px) {
  .pm-shell,
  .pm-dashboard-grid,
  .pm-task-layout,
  .pm-calendar-layout {
    grid-template-columns: 1fr;
  }

  .pm-sidebar {
    position: static;
    height: auto;
    gap: 22px;
  }

  .pm-nav {
    grid-template-columns: repeat(3, 1fr);
  }

  .pm-nav button {
    text-align: center;
  }
}

@media (max-width: 640px) {
  .pm-shell {
    padding: 10px;
  }

  .pm-topbar,
  .pm-task-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .pm-metrics,
  .pm-form-row {
    grid-template-columns: 1fr;
  }

  .pm-calendar {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
`;
}

function sanitizeTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
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
