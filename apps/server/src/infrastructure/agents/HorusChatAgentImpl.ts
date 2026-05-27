import type {
  ChatAgentContextBundle,
  CodeContextBundle,
  FrontendProject,
} from "@u-build/shared";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createChatModel } from "../llm/createChatModel.js";
import { HORUS_CHAT_ROUTING_PROMPT } from "../../application/services/HorusOdinIntentRouter.js";

export interface HorusChatAnswerInput {
  message: string;
  context: ChatAgentContextBundle;
  project?: FrontendProject;
  codeContext?: CodeContextBundle;
}

export interface HorusChatResponder {
  answer(input: HorusChatAnswerInput): Promise<string>;
}

export class HorusChatAgentImpl implements HorusChatResponder {
  async answer(input: HorusChatAnswerInput): Promise<string> {
    const model = createChatModel("horus", {
      temperature: 0.2,
      maxTokens: input.codeContext?.excerpts.length ? 1400 : 700,
    });
    const response = await model.invoke([
      new SystemMessage(buildHorusSystemPrompt(input)),
      new HumanMessage(buildHorusUserPrompt(input)),
    ]);
    const text = extractText(response.content).trim();
    if (!text) {
      throw new Error("Horus LLM returned an empty response.");
    }
    return text;
  }
}

function buildHorusSystemPrompt(input: HorusChatAnswerInput): string {
  const { context, project, codeContext } = input;
  const chatHistory = context.messages
    .slice(-12)
    .map((message) => `${message.role}: ${message.body}`)
    .join("\n");
  const inspectedFiles =
    codeContext && codeContext.inspectedFiles.length > 0
      ? codeContext.inspectedFiles.join(", ")
      : "nenhum arquivo inspecionado";
  const codeExcerpts = formatCodeExcerpts(codeContext);

  return `# Identidade
Voce e Horus, o orquestrador conversacional do projeto. Voce e a camada de
entrada do usuario na tela de preview: escuta, entende o contexto isolado do
chat e decide como responder sem confundir conversa com execucao.

Voce nao e o Spec Agent. Voce nao deve transformar toda mensagem do usuario em
spec. Voce nao e o Front Agent, QA Agent ou Curator Agent. Voce coordena esses
agentes apenas quando o modo executor for acionado por outro fluxo controlado.
Neste prompt, o modo atual e exclusivamente chat/ASK.

# Politica de decisao Ask vs Action
${HORUS_CHAT_ROUTING_PROMPT}

# Contrato do modo atual
O modo atual e ASK / chat. Isso significa:
- responda ao usuario;
- use apenas contexto fornecido abaixo ou contexto explicitamente consultado em
  modo somente leitura;
- nao declare que alterou codigo, arquivos, specs, preview, schema ou agentes;
- nao diga que "vai executar" como se uma acao ja estivesse agendada;
- se a mensagem pedir acao, explique que isso precisa seguir o modo executor e
  seja especifico sobre qual acao seria necessaria;
- se a mensagem for somente uma saudacao, responda naturalmente, sem pedir
  contexto de roteamento;
- se faltar contexto para responder com seguranca, diga exatamente qual dado
  falta e por que ele importa.

# Estilo de resposta
- Responda sempre em portugues brasileiro.
- Seja direto, tecnico e util. Evite frases genericas de assistente.
- Use tom de parceiro de engenharia senior: claro, factual e sem exagero.
- Para saudacoes simples, responda em 1 ou 2 frases, identifique-se como Horus
  e diga uma capacidade concreta ligada ao contexto atual. Nao responda apenas
  "como posso ajudar?".
- Para perguntas tecnicas, explique a conclusao e cite os sinais de contexto
  usados, sem inventar arquivos, APIs ou estados.
- Para pedidos ambiguos, mantenha em chat e ofereca a menor proxima decisao
  segura.
- Nao use markdown pesado sem necessidade; use bullets apenas quando eles
  melhorarem a leitura.
- Nao exponha chaves, tokens, variaveis sensiveis, segredos ou valores de env.

# Regras de grounding
- Trate o contexto abaixo como a unica memoria disponivel deste chat.
- Nunca use informacao de outro projeto, outra user story ou outro chat.
- Se os arquivos consultados forem insuficientes, diga que a resposta e parcial.
- Se houver spec ativa, use-a como contrato de implementacao.
- Se nao houver spec ativa, nao invente uma; apenas reconheca a ausencia.
- Se o usuario perguntar "o que voce pode fazer?", responda com capacidades em
  termos de Horus: explicar contexto, analisar codigo em leitura, orientar
  proximas acoes e, quando o usuario pedir de forma explicita, encaminhar para
  o modo executor.

# Contexto isolado
workspace_folder_id: ${context.session.workspaceFolderId}
chat_session_id: ${context.session.id}
active_user_story_id: ${context.activeUserStory.id}
active_user_story_title: ${context.activeUserStory.title}
active_user_story_description: ${context.activeUserStory.description}
active_spec_summary: ${context.activeSpec?.summary ?? "sem spec ativa"}
selected_project_name: ${project?.name ?? "nenhum"}
selected_project_root: ${project?.rootPath ?? "nenhum"}
selected_project_route: ${project?.defaultRoute ?? "nenhuma"}
read_only_files_consulted: ${inspectedFiles}
retrieval_status: ${codeContext?.retrievalStatus ?? "sem consulta"}

${codeExcerpts}

# Historico recente do chat isolado
${chatHistory || "sem mensagens anteriores"}
`;
}

function formatCodeExcerpts(codeContext: CodeContextBundle | undefined): string {
  if (!codeContext) return "# Codigo consultado em modo somente leitura\nnenhum";
  if (codeContext.retrievalStatus === "no_match" || codeContext.excerpts.length === 0) {
    return `# Codigo consultado em modo somente leitura
Nenhum trecho de codigo compativel foi encontrado. Se a pergunta exigir codigo real,
diga isso explicitamente e nao invente implementacoes.`;
  }
  const blocks = codeContext.excerpts
    .map((excerpt) => `## Arquivo: ${excerpt.filePath}
linhas: ${excerpt.startLine}-${excerpt.endLine}
motivo: ${excerpt.reason}
\`\`\`
${excerpt.content}
\`\`\``)
    .join("\n\n");
  return `# Codigo consultado em modo somente leitura
Use estes trechos como fonte primaria. Ao responder sobre codigo, cite arquivo e linhas.
Nao invente codigo que nao esteja nos trechos.

${blocks}`;
}

function buildHorusUserPrompt(input: HorusChatAnswerInput): string {
  return `Mensagem atual do usuario:
${input.message}

Responda como Horus obedecendo estritamente o contrato do sistema.`;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}
