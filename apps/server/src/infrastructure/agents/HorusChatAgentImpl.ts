import type {
  ChatAgentContextBundle,
  CodeContextBundle,
  FrontendProject,
  LlmSettings,
} from "@u-build/shared";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createChatModel } from "../llm/createChatModel.js";
import {
  buildChatModelInvokeOptions,
  invokeChatModel,
} from "../llm/invokeChatModel.js";

export interface HorusChatAnswerInput {
  message: string;
  context: ChatAgentContextBundle;
  project?: FrontendProject;
  codeContext?: CodeContextBundle;
  llmSettings?: LlmSettings;
  signal?: AbortSignal;
}

export interface HorusChatResponder {
  answer(input: HorusChatAnswerInput): Promise<string>;
  streamAnswer?(input: HorusChatAnswerInput): AsyncIterable<string>;
}

export class HorusChatAgentImpl implements HorusChatResponder {
  async answer(input: HorusChatAnswerInput): Promise<string> {
    const model = createChatModel("horus", {
      temperature: 0.2,
      maxTokens: input.codeContext?.excerpts.length ? 1400 : 700,
    }, input.llmSettings);
    const response = await invokeChatModel(model, [
      new SystemMessage(buildHorusSystemPrompt(input)),
      new HumanMessage(buildHorusUserPrompt(input)),
    ], input.signal);
    const text = extractText(response.content).trim();
    if (!text) {
      throw new Error("Horus LLM returned an empty response.");
    }
    return text;
  }

  async *streamAnswer(input: HorusChatAnswerInput): AsyncIterable<string> {
    const model = createChatModel("horus", {
      temperature: 0.2,
      maxTokens: input.codeContext?.excerpts.length ? 1400 : 700,
    }, input.llmSettings);
    const messages = [
      new SystemMessage(buildHorusSystemPrompt(input)),
      new HumanMessage(buildHorusUserPrompt(input)),
    ];
    const stream = await model.stream(
      messages,
      buildChatModelInvokeOptions(input.signal)
    );
    for await (const chunk of stream) {
      const text = extractText(chunk.content);
      if (text) yield text;
    }
  }
}

function buildHorusSystemPrompt(input: HorusChatAnswerInput): string {
  const { context, project, codeContext } = input;
  const chatHistory = context.messages
    .map((message) => `${message.role}: ${message.compactBody ?? message.body}`)
    .join("\n");
  const inspectedFiles =
    codeContext && codeContext.inspectedFiles.length > 0
      ? codeContext.inspectedFiles.join(", ")
      : "nenhum arquivo inspecionado";
  const retrievalNotes =
    codeContext && codeContext.retrievalNotes.length > 0
      ? codeContext.retrievalNotes.join(" | ")
      : "sem notas";
  const codeExcerpts = formatCodeExcerpts(codeContext);

  return `# Identidade
Voce e Horus, o agente conversacional e executivo do projeto. Voce e a entrada
do usuario na tela de preview: conversa de forma natural, entende o contexto
isolado do chat e, quando o usuario pede uma acao mutavel com clareza, o sistema
pode acionar fluxos controlados de execucao.

Voce nao e o Spec Agent, Front Agent, QA Agent ou Curator Agent isoladamente.
Voce coordena essas capacidades como produto: conversa, consulta contexto,
prepara decisoes e encaminha execucoes controladas quando o roteador classifica
a mensagem como acao. Nesta chamada voce esta redigindo uma resposta; nao afirme
que arquivos foram alterados se o outcome recebido pelo chat nao indicar isso.

# Capacidades controladas
Horus pode operar em dois caminhos de produto, sem expor jargao interno ao
usuario:
- resposta conversacional: explicar, analisar, consultar contexto e orientar;
- execucao controlada: quando a mensagem do usuario for imperativa e clara, o
  backend pode iniciar preview, gerar spec ou acionar alteracao de codigo no
  projeto selecionado.

Nao chame isso de "ASK" ou "ACTION" para o usuario. Fale em portugues natural:
"posso editar quando voce pedir a mudanca", "posso acionar os agentes", "posso
validar e mostrar o diff".

# Contrato da resposta conversacional
Nesta resposta:
- responda ao usuario;
- use apenas contexto fornecido abaixo ou contexto explicitamente consultado;
- nao declare que alterou codigo, arquivos, specs, preview, schema ou agentes;
- nao diga que "vai executar" como se uma acao ja estivesse agendada nesta
  resposta;
- se o usuario perguntar se voce consegue editar arquivos, responda que sim:
  quando ele fizer um pedido imperativo claro, Horus pode acionar edicao
  controlada do projeto selecionado, com diffs e validacao;
- se a mensagem pedir uma acao mas chegou nesta resposta conversacional,
  explique a acao que Horus pode acionar sem se declarar incapaz;
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
- Se o usuario perguntar "o que voce pode fazer?", responda com capacidades
  reais em termos de produto: conversar sobre o projeto, consultar codigo do
  projeto selecionado, iniciar/recarregar/parar preview registrado, gerar specs,
  acionar agentes de implementacao React/TypeScript, aplicar diffs com validacao
  quando houver uma mudanca segura, e reportar o resultado.

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
files_consulted_for_answer: ${inspectedFiles}
retrieval_status: ${codeContext?.retrievalStatus ?? "sem consulta"}
retrieval_notes: ${retrievalNotes}
context_messages_in_prompt: ${context.messages.length}

${codeExcerpts}

# Historico recente do chat isolado
${chatHistory || "sem mensagens anteriores"}
`;
}

function formatCodeExcerpts(codeContext: CodeContextBundle | undefined): string {
  if (!codeContext) return "# Codigo consultado para esta resposta\nnenhum";
  if (codeContext.retrievalStatus === "no_match" || codeContext.excerpts.length === 0) {
    return `# Codigo consultado para esta resposta
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
  return `# Codigo consultado para esta resposta
Use estes trechos como fonte primaria. Ao responder sobre codigo, cite arquivo e linhas.
Nao invente codigo que nao esteja nos trechos.

${blocks}

${formatStructuralContext(codeContext)}`;
}

function formatStructuralContext(codeContext: CodeContextBundle): string {
  const context = codeContext.structuralContext;
  if (!context) return "# Contexto estrutural AST\nindisponivel";
  const symbols = context.symbols
    .slice(0, 16)
    .map(
      (symbol) =>
        `- ${symbol.path}:${symbol.startLine}-${symbol.endLine} ${symbol.kind} ${symbol.name}`
    )
    .join("\n");
  const diagnostics = context.diagnostics
    .slice(0, 8)
    .map(
      (diagnostic) =>
        `- ${diagnostic.severity} ${diagnostic.path}${diagnostic.startLine ? `:${diagnostic.startLine}` : ""} ${diagnostic.code}: ${diagnostic.message}`
    )
    .join("\n");
  return `# Contexto estrutural AST
status=${context.status}; parsed=${context.parsedDocumentCount}; symbols=${context.symbolCount}; diagnostics=${context.diagnosticCount}

## Simbolos relevantes
${symbols || "nenhum"}

## Diagnosticos estruturais
${diagnostics || "nenhum"}`;
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
