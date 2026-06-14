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
import { createLinkedAbortController, invokeChatModel } from "../llm/invokeChatModel.js";
import { resolveAgentModelConfig, type AgentModelConfig } from "../llm/providerConfig.js";
import type { FrontendFileOperationPlan } from "../code/buildFrontendCodeChangeSet.js";
import type { ProjectWorkspaceContextSnapshot } from "../project/ProjectExecutionService.js";
import { formatDesignContextForPrompt } from "../design/DesignContextService.js";
import { formatPromptContextForPrompt } from "../prompt/PromptContextAssembler.js";
import {
  CodeAwareFrontendOutputSchema,
  ProjectExecutionPlanLlmSchema,
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
- Operações delete devem omitir afterContent ou usar afterContent=null.
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
        (intent, index) => ({
          ...intent,
          id: intent.id ?? `front-structural-${index + 1}`,
        })
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

  const frontConfig = resolveAgentModelConfig("front", { temperature: 0.2, maxTokens: 16000 }, process.env, llmSettings);

  let html: string;
  try {
    if (frontConfig.provider === "openai") {
      html = await invokeOpenAiResponsesForFrontHtml(prompt, frontConfig, timeoutMs);
    } else {
      const model = createChatModel("front", { temperature: 0.2, maxTokens: 16000 }, llmSettings);
      const response = await withTimeout(
        invokeChatModel(model, prompt),
        timeoutMs,
        `FrontAgent timed out after ${timeoutMs / 1000}s while generating HTML.`
      );
      const content =
        typeof response.content === "string"
          ? response.content
          : response.content
              .map((c) => ("text" in c ? c.text : ""))
              .join("");
      html = content
        .replace(/^```html\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("FrontAgent timed out")) {
      return buildStandaloneHtmlFallback(userStory, spec);
    }
    throw err;
  }

  return { html };
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

async function invokeOpenAiResponsesForFrontHtml(
  prompt: string,
  config: AgentModelConfig,
  timeoutMs: number
): Promise<string> {
  const { controller, cleanup } = createLinkedAbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        input: prompt,
        max_output_tokens: config.maxTokens ?? 16000,
        text: { verbosity: "low" },
      }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(
        `OpenAI Responses API failed (${response.status}): ${extractOpenAiResponsesErrorMessage(body)}`
      );
    }

    const outputText = extractOpenAiResponsesOutputText(body);
    if (!outputText) {
      const bodySnippet = JSON.stringify(body)?.slice(0, 400) ?? "(null)";
      throw new Error(
        `OpenAI Responses API returned no output text for FrontAgent. Response body: ${bodySnippet}`
      );
    }

    console.log(`[FrontAgentImpl] OpenAI Responses API completed in ${Date.now() - startedAt}ms`);
    return outputText
      .replace(/^```html\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`FrontAgent timed out after ${timeoutMs / 1000}s while generating HTML.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    cleanup();
  }
}

function extractOpenAiResponsesOutputText(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;

  // Top-level output_text shorthand (some API versions)
  const topText = (body as { output_text?: unknown }).output_text;
  if (typeof topText === "string" && topText) return topText;

  const output = (body as { output?: unknown }).output;
  if (!Array.isArray(output)) return undefined;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const itemType = (item as { type?: unknown }).type;

    // Item is directly an output_text node: { type: "output_text", text: "..." }
    if (
      (itemType === "output_text" || itemType === "text") &&
      typeof (item as { text?: unknown }).text === "string"
    ) {
      const t = (item as { text: string }).text;
      if (t) return t;
    }

    // Item wraps content array: { type: "message", content: [...] }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partType = (part as { type?: unknown }).type;
      if (
        (partType === "output_text" || partType === "text") &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        const t = (part as { text: string }).text;
        if (t) return t;
      }
    }
  }
  return undefined;
}

function extractOpenAiResponsesErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "Unknown error";
  const error = (body as { error?: unknown }).error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown error";
}

function buildStandaloneHtmlFallback(
  userStory: UserStory,
  spec: Spec
): FrontendOutput {
  const componentCards = spec.components
    .map(
      (c) =>
        `<div class="card"><span class="badge">${c.type}</span><h2>${c.name}</h2><p>${c.description}</p></div>`
    )
    .join("\n    ");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${spec.summary}</title>
<style>
  :root{--bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#f1f5f9;--muted:#94a3b8;--accent:#6366f1}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column}
  header{background:var(--surface);border-bottom:1px solid var(--border);padding:1rem 2rem}
  header h1{font-size:1.25rem;font-weight:600}
  main{flex:1;padding:2rem;max-width:960px;margin:0 auto;width:100%}
  .summary{color:var(--muted);font-size:.875rem;margin-bottom:1.5rem}
  .grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:.5rem;padding:1.25rem}
  .card h2{font-size:1rem;font-weight:500;margin-bottom:.375rem}
  .card p{color:var(--muted);font-size:.875rem;line-height:1.5}
  .badge{display:inline-block;background:var(--accent);color:#fff;font-size:.7rem;padding:.1rem .45rem;border-radius:9999px;margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.04em}
</style>
</head>
<body>
<header><h1>${userStory.title}</h1></header>
<main>
  <p class="summary">${spec.summary}</p>
  <div class="grid">
    ${componentCards}
  </div>
</main>
</body>
</html>`;

  return { html };
}

function resolveFrontAgentTimeoutMs(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env["FRONT_AGENT_TIMEOUT_MS"]?.trim();
  if (!raw) return 120_000;
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
