import { z } from "zod";
import {
  ProjectExecutionPlanSchema,
  type CodeContextBundle,
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
  codeContext?: CodeContextBundle
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
- previewHtml pode ser null. Use previewHtml apenas como descrição visual auxiliar, não como fonte da mudança.
- Não inclua markdown. Retorne apenas o objeto estruturado do schema.`;

    const model = createChatModel("front", {
      temperature: 0.2,
      maxTokens: 8192,
    }, llmSettings).withStructuredOutput(CodeAwareFrontendOutputSchema);

    const result = CodeAwareFrontendOutputSchema.parse(await model.invoke(prompt));
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
- Use comentários técnicos curtos apenas em limites não óbvios, como data adapters, validações e transições de estado
- O código deve ser completo, funcional e abrível diretamente no browser
- Retorne APENAS o código HTML completo, começando com <!DOCTYPE html>
- Não inclua explicações, markdown code fences, ou qualquer texto fora do HTML`;

  const model = createChatModel("front", {
    temperature: 0.2,
    maxTokens: 8192,
  }, llmSettings);
  const response = await model.invoke(prompt);
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

  const prompt = `Você é o Front Agent do Horus em modo executor. Você tem capacidade real de criar, editar, atualizar e deletar arquivos dentro do workspace isolado do projeto.

# Skill obrigatória do agente
${skill}
${executionBriefBlock}
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
    const raw = ProjectExecutionPlanLlmSchema.parse(
      await model.invoke(`${prompt}${repairBlock}`)
    );
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
