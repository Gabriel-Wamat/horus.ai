import { z } from "zod";
import type {
  ChatAgentContextBundle,
  HorusChatIntent,
  LlmSettings,
} from "@u-build/shared";
import {
  HorusChatIntentKindSchema,
  HorusChatIntentSchema,
  HorusChatModeSchema,
  HorusPreviewActionSchema,
} from "@u-build/shared";
import { createChatModel } from "../../infrastructure/llm/createChatModel.js";

export interface HorusOdinIntentRouterInput {
  readonly message: string;
  readonly context: ChatAgentContextBundle;
  readonly llmSettings?: LlmSettings;
}

export interface HorusIntentClassifier {
  classify(input: HorusOdinIntentRouterInput): Promise<HorusChatIntent>;
}

const LlmIntentSchema = z.object({
  kind: HorusChatIntentKindSchema,
  mode: HorusChatModeSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(1200),
  previewAction: HorusPreviewActionSchema.nullable(),
});

export const HORUS_CHAT_ROUTING_PROMPT = `
Voce e o Horus, o orquestrador conversacional e executivo do projeto.
Sua primeira responsabilidade e classificar a mensagem do usuario em um contrato
estruturado. Essa decisao protege o projeto contra execucoes indevidas,
vazamento de contexto entre chats, geracao de artefatos desnecessarios e
alteracoes sem autorizacao clara.

## Modos oficiais

### ASK / mode=chat
Use ASK quando a melhor resposta e conversar, explicar, analisar ou orientar
sem alterar estado. Exemplos:
- saudacoes, continuidade de conversa, alinhamento de expectativa e perguntas
  simples;
- perguntas sobre o projeto, codigo, arquitetura, user story, spec, preview,
  historico do chat ou decisoes anteriores;
- pedidos de leitura, verificacao, analise, diagnostico ou explicacao;
- perguntas sobre como executar uma mudanca, sem autorizar a mudanca;
- mensagens ambiguas em que o usuario nao autorizou claramente uma alteracao.

ASK pode consultar contexto somente leitura quando disponivel. ASK nao pode
alterar arquivos, rodar comandos, iniciar agentes, gerar specs, editar UI ou
acionar preview. Se uma resposta exigir acao, classifique como chat quando o
usuario estiver apenas perguntando, e como executor somente quando a acao for
imperativa e clara.

### ACTION / mode=executor
Use ACTION somente quando o usuario pede uma acao mutavel de forma clara.
Exemplos:
- alterar, implementar, corrigir, conectar, remover, criar ou refatorar codigo,
  UI, arquivos, schema, contrato ou comportamento;
- gerar, atualizar ou versionar uma spec;
- iniciar, parar, reiniciar ou recarregar o preview/projeto registrado;
- acionar agentes de front, QA, curadoria ou spec para executar uma tarefa.

ACTION sempre deve ser executada por capacidades controladas do Horus/Odin,
com contexto isolado de projeto, chat, user story e spec. ACTION nao deve
virar resposta conversacional fingindo que algo foi feito.

## Kind esperado

- answer_question: conversa, explicacao, leitura, verificacao, diagnostico,
  saudacao ou pergunta sem mutacao.
- code_change: alteracao explicita de codigo, UI, schema, contrato, arquivo ou
  comportamento do projeto.
- run_project: controle explicito do ciclo de preview/projeto registrado.
- generate_spec: pedido explicito para gerar, regenerar, revisar ou atualizar
  spec/SDD a partir de user stories.
- clarify: falta contexto essencial para classificar com seguranca.
- unsupported: pedido proibido, especialmente comando livre de terminal/shell.

## previewAction

Preencha previewAction somente quando kind=run_project:
- start: iniciar/subir/rodar/abrir preview/projeto.
- stop: parar/desligar/encerrar preview/projeto.
- reload: recarregar/reiniciar/refresh/atualizar preview/projeto.

## Bloqueios obrigatorios
- Nunca classifique comandos shell arbitrarios como run_project ou code_change.
  Exemplos: instalar pacotes, git, docker, curl, bash, python, node, pnpm, npm,
  apagar arquivos, subir deploy, executar SQL destrutivo ou rodar comando livre.
  Esses casos devem ser unsupported.
- O pedido "rode o projeto" pode acionar apenas o ciclo controlado do preview
  registrado, nunca um comando livre.
- Uma pergunta sobre como fazer algo nunca deve executar a alteracao.
- Uma saudacao nunca deve pedir mais contexto para decidir rota.
- Se houver duvida entre ASK e ACTION, escolha answer_question/chat.
- Se houver risco de afetar outro projeto, outra user story, outro chat ou
  contexto nao selecionado, escolha clarify ou unsupported com rationale claro.
`.trim();

export class LlmHorusIntentClassifier implements HorusIntentClassifier {
  async classify(input: HorusOdinIntentRouterInput): Promise<HorusChatIntent> {
    const model = createChatModel("horus", {
      temperature: 0,
      maxTokens: 900,
    }, input.llmSettings).withStructuredOutput(LlmIntentSchema);

    const result = LlmIntentSchema.parse(await model.invoke(buildIntentPrompt(input)));
    return HorusChatIntentSchema.parse({
      kind: result.kind,
      mode: result.mode,
      confidence: result.confidence,
      rationale: result.rationale,
      ...(result.previewAction ? { previewAction: result.previewAction } : {}),
    });
  }
}

export class HorusOdinIntentRouter {
  constructor(
    private readonly classifier: HorusIntentClassifier =
      new LlmHorusIntentClassifier()
  ) {}

  async classify(input: HorusOdinIntentRouterInput): Promise<HorusChatIntent> {
    const intent = await this.classifier.classify(input);
    return HorusChatIntentSchema.parse(intent);
  }
}

function buildIntentPrompt(input: HorusOdinIntentRouterInput): string {
  const { context } = input;
  const recentMessages = context.messages
    .slice(-8)
    .map((message) => `${message.role}: ${message.body}`)
    .join("\n");

  return `${HORUS_CHAT_ROUTING_PROMPT}

# Escopo isolado do chat
chatSessionId: ${context.session.id}
workspaceFolderId: ${context.session.workspaceFolderId}
userStoryId: ${context.session.userStoryId}
hasActiveSpec: ${context.activeSpec ? "true" : "false"}
activeUserStoryTitle: ${context.activeUserStory.title}

# Historico recente
${recentMessages || "sem mensagens anteriores"}

# Mensagem atual
${input.message}

Classifique a mensagem atual e retorne apenas o objeto estruturado do schema.
Use previewAction como null quando kind nao for run_project.`;
}
