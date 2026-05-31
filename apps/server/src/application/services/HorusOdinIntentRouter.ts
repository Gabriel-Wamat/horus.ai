import { z } from "zod";
import type {
  ChatAgentContextBundle,
  HorusChatIntent,
  HorusChatSuggestedAction,
  LlmSettings,
} from "@u-build/shared";
import {
  HorusChatIntentKindSchema,
  HorusChatIntentSchema,
  HorusChatSuggestedActionSchema,
  HorusChatModeSchema,
  HorusPreviewActionSchema,
} from "@u-build/shared";
import type { LlmModelProvider } from "../ports/LlmModelProviderPort.js";
import {
  containsPhrase,
  findPreferredProjectFileCandidate,
  hasAnyWord,
  hasBothWords,
  normalizeAgenticText,
  startsWithWords,
  trimAgenticToken,
  wordsOfAgenticText,
} from "./AgenticTextParsing.js";

export interface HorusOdinIntentRouterInput {
  readonly message: string;
  readonly context: ChatAgentContextBundle;
  readonly llmSettings?: LlmSettings;
}

export interface HorusIntentClassifier {
  classify(input: HorusOdinIntentRouterInput): Promise<HorusChatIntent>;
}

type ContextualFollowUpOption = HorusChatSuggestedAction;

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
- Pedidos cotidianos e imperativos de edicao como trocar texto, ajustar cor,
  remover card, renomear label, corrigir import, adicionar loading, mexer em
  responsividade, conectar botao ou alterar layout devem ser code_change quando
  nao forem perguntas.
- Uma saudacao nunca deve pedir mais contexto para decidir rota.
- Antes de escolher clarify, pergunte implicitamente "o que o usuario quis dizer
  dado o historico recente?". Mensagens curtas como "abra", "mostre", "faz",
  "pode", "sim" ou "isso" podem ser follow-ups validos quando a mensagem
  anterior do Horus ofereceu uma acao concreta ou citou um arquivo/preview/spec.
  Use o historico isolado e resumos de memoria presentes no prompt para resolver
  essa elipse sem inventar contexto externo.
- Se houver duvida entre ASK e ACTION, escolha answer_question/chat.
- Se houver risco de afetar outro projeto, outra user story, outro chat ou
  contexto nao selecionado, escolha clarify ou unsupported com rationale claro.
`.trim();

export class LlmHorusIntentClassifier implements HorusIntentClassifier {
  constructor(private readonly modelProvider: LlmModelProvider) {}

  async classify(input: HorusOdinIntentRouterInput): Promise<HorusChatIntent> {
    const model = this.modelProvider.createStructuredModel({
      role: "horus",
      schema: LlmIntentSchema,
      defaults: {
        temperature: 0,
        maxTokens: 900,
      },
      ...(input.llmSettings ? { llmSettings: input.llmSettings } : {}),
    });

    const result = LlmIntentSchema.parse(
      await model.invoke(buildIntentPrompt(input))
    );
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
  constructor(private readonly classifier: HorusIntentClassifier) {}

  async classify(input: HorusOdinIntentRouterInput): Promise<HorusChatIntent> {
    const contextualFollowUp = classifyContextualFollowUp(input);
    if (contextualFollowUp) {
      return HorusChatIntentSchema.parse(contextualFollowUp);
    }

    const deterministicIntent = classifyDeterministicAction(input.message);
    if (deterministicIntent) {
      return HorusChatIntentSchema.parse(deterministicIntent);
    }

    return HorusChatIntentSchema.parse(await this.classifier.classify(input));
  }
}

export function resolveContextualFollowUpMessage(
  input: HorusOdinIntentRouterInput
): string {
  const normalized = normalizeMessage(input.message);
  if (!normalized || !matchesOpenFollowUp(normalized)) return input.message;
  const offeredFile = findLatestOfferedFile(input.context.messages);
  if (!offeredFile) return input.message;
  return `Abra o arquivo ${offeredFile} e mostre o trecho relevante atual para revisão.`;
}

export function buildContextualClarificationMessage(
  input: HorusOdinIntentRouterInput
): string | null {
  const normalized = normalizeMessage(input.message);
  if (!normalized || !matchesAmbiguousFollowUp(normalized)) return null;
  const options = findLatestFollowUpOptions(input.context.messages);
  if (options.length < 2) return null;
  return `Você quer que eu ${formatOptionList(options)}?`;
}

function classifyContextualFollowUp(
  input: HorusOdinIntentRouterInput
): HorusChatIntent | null {
  const normalized = normalizeMessage(input.message);
  if (!normalized) return null;
  const options = findLatestFollowUpOptions(input.context.messages);
  const offeredFile = options.find((option) => option.type === "open_file")?.filePath;
  if (matchesOpenFollowUp(normalized) && offeredFile) {
    return {
      kind: "answer_question",
      mode: "chat",
      confidence: 0.93,
      rationale: `Pedido curto resolvido pelo historico recente: abrir ${offeredFile} conforme oferta anterior do Horus.`,
    };
  }
  if (!matchesAmbiguousFollowUp(normalized)) return null;
  if (options.length > 1) {
    return {
      kind: "clarify",
      mode: "chat",
      confidence: 0.91,
      rationale:
        "Follow-up curto aponta para mais de uma opcao concreta oferecida pelo Horus; precisa escolher qual.",
    };
  }
  if (!offeredFile) return null;
  return {
    kind: "answer_question",
    mode: "chat",
    confidence: 0.93,
    rationale: `Pedido curto resolvido pelo historico recente: abrir ${offeredFile} conforme oferta anterior do Horus.`,
  };
}

function classifyDeterministicAction(message: string): HorusChatIntent | null {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;

  if (isQuestionLike(normalized)) return null;
  if (matchesUnsupportedCommand(normalized)) {
    return {
      kind: "unsupported",
      mode: "executor",
      confidence: 0.98,
      rationale: "Pedido mutável contém comando livre fora das capacidades controladas.",
    };
  }
  const previewAction = matchPreviewAction(normalized);
  if (previewAction) {
    return {
      kind: "run_project",
      mode: "executor",
      confidence: 0.96,
      rationale: "Pedido imperativo de controle do preview registrado.",
      previewAction,
    };
  }
  if (matchesSpecGeneration(normalized)) {
    return {
      kind: "generate_spec",
      mode: "executor",
      confidence: 0.96,
      rationale: "Pedido imperativo para gerar ou atualizar spec.",
    };
  }
  if (matchesCodeChangeRequest(normalized)) {
    return {
      kind: "code_change",
      mode: "executor",
      confidence: 0.94,
      rationale: "Pedido imperativo cotidiano de alteracao de codigo ou UI.",
    };
  }

  // Broad or ambiguous wording still goes to the classifier. Only common,
  // explicit edit requests are shortcut above, and code_change now runs through
  // the Horus chat agent loop instead of returning a canned workflow reply.
  return null;
}

const OPEN_FOLLOW_UP_MESSAGES = new Set([
  "abra",
  "abre",
  "abrir",
  "pode abrir",
  "sim abra",
  "sim, abra",
  "ok abra",
  "ok, abra",
  "mostre",
  "mostrar",
  "mostra",
]);

const AMBIGUOUS_FOLLOW_UP_MESSAGES = new Set([
  "sim",
  "s",
  "ok",
  "pode",
  "pode sim",
  "isso",
  "esse",
  "essa",
  "faz",
  "faca",
  "manda",
  "vai",
  "continua",
  "continue",
]);

const QUESTION_START_WORDS = new Set([
  "como",
  "qual",
  "quais",
  "quando",
  "onde",
  "porque",
  "explique",
  "liste",
  "mostre",
  "consegue",
  "pode",
  "poderia",
]);

const UNSUPPORTED_COMMAND_WORDS = new Set([
  "pnpm",
  "npm",
  "yarn",
  "bun",
  "git",
  "docker",
  "curl",
  "bash",
  "sh",
  "python",
  "node",
  "sql",
  "sudo",
]);

const PREVIEW_TARGET_WORDS = new Set(["preview", "projeto"]);
const PREVIEW_STOP_WORDS = new Set(["pare", "parar", "desligue", "encerre", "stop"]);
const PREVIEW_RELOAD_WORDS = new Set([
  "recarregue",
  "reinicie",
  "atualize",
  "refresh",
  "reload",
]);
const PREVIEW_START_WORDS = new Set([
  "rode",
  "rodar",
  "inicie",
  "iniciar",
  "suba",
  "subir",
  "abra",
  "abrir",
  "start",
]);

const SPEC_GENERATION_WORDS = new Set([
  "crie",
  "gere",
  "monte",
  "atualize",
  "refaca",
  "recrie",
]);
const SPEC_TARGET_WORDS = new Set(["spec", "sdd", "especificacao"]);

const CODE_EDIT_WORDS = new Set([
  "altere",
  "ajuste",
  "troque",
  "mude",
  "renomeie",
  "remova",
  "retire",
  "apague",
  "crie",
  "adicione",
  "inclua",
  "implemente",
  "corrija",
  "conserte",
  "refatore",
  "extraia",
  "simplifique",
  "organize",
  "conecte",
  "integre",
  "estilize",
  "deixe",
  "transforme",
  "substitua",
  "aumente",
  "diminua",
  "centralize",
  "alinhe",
  "mova",
]);

const CODE_TARGET_WORDS = new Set([
  "codigo",
  "ui",
  "tela",
  "layout",
  "componente",
  "botao",
  "texto",
  "titulo",
  "label",
  "input",
  "campo",
  "formulario",
  "form",
  "card",
  "modal",
  "menu",
  "navbar",
  "sidebar",
  "header",
  "footer",
  "css",
  "estilo",
  "cor",
  "tema",
  "espacamento",
  "margem",
  "padding",
  "fonte",
  "icone",
  "estado",
  "loading",
  "erro",
  "bug",
  "import",
  "react",
  "typescript",
  "tsx",
  "arquivo",
  "funcao",
  "hook",
  "rota",
  "validacao",
  "responsivo",
  "responsividade",
  "painel",
  "banner",
  "toast",
  "tooltip",
  "badge",
  "tabela",
  "lista",
  "filtro",
  "busca",
]);

function matchesOpenFollowUp(message: string): boolean {
  return OPEN_FOLLOW_UP_MESSAGES.has(message);
}

function matchesAmbiguousFollowUp(message: string): boolean {
  return AMBIGUOUS_FOLLOW_UP_MESSAGES.has(message);
}

function findLatestOfferedFile(
  messages: ChatAgentContextBundle["messages"]
): string | null {
  return findLatestFollowUpOptions(messages).find(
    (option) => option.type === "open_file"
  )?.filePath ?? null;
}

function findLatestFollowUpOptions(
  messages: ChatAgentContextBundle["messages"]
): ContextualFollowUpOption[] {
  if (!Array.isArray(messages)) return [];
  for (const message of [...messages].reverse()) {
    if (message.role !== "agent") continue;
    const metadata = message.metadata["horusChat"];
    const options = extractSuggestedActionsFromMetadata(metadata);
    for (const option of extractFollowUpOptionsFromText(message.body)) {
      addUniqueOption(options, option);
    }
    if (metadata && typeof metadata === "object") {
      const outcome = (metadata as { outcome?: unknown }).outcome;
      if (outcome && typeof outcome === "object") {
        const sources = (outcome as { evidenceSources?: unknown }).evidenceSources;
        if (Array.isArray(sources)) {
          for (const source of sources) {
            if (
              source &&
              typeof source === "object" &&
              typeof (source as { path?: unknown }).path === "string"
            ) {
              addUniqueOption(options, fileOption((source as { path: string }).path));
            }
          }
        }
      }
    }
    if (options.length > 0) return options;
  }
  return [];
}

function extractFollowUpOptionsFromText(text: string): ContextualFollowUpOption[] {
  const options: ContextualFollowUpOption[] = [];
  const file = extractOfferedFileFromText(text);
  if (file) addUniqueOption(options, fileOption(file));
  if (mentionsPreviewStart(text)) {
    addUniqueOption(options, {
      type: "start_preview",
      label: "iniciar o preview registrado",
    });
  }
  return options;
}

function extractOfferedFileFromText(text: string): string | null {
  return findPreferredProjectFileCandidate(text);
}

function fileOption(path: string): ContextualFollowUpOption {
  const filePath = normalizeProjectPath(path);
  return {
    type: "open_file",
    label: `abrir ${filePath}`,
    filePath,
  };
}

function extractSuggestedActionsFromMetadata(
  metadata: unknown
): ContextualFollowUpOption[] {
  if (!metadata || typeof metadata !== "object") return [];
  const suggestedActions = (metadata as { suggestedActions?: unknown })
    .suggestedActions;
  const direct = HorusChatSuggestedActionSchema.array().safeParse(
    suggestedActions
  );
  if (direct.success) return direct.data;

  const outcome = (metadata as { outcome?: unknown }).outcome;
  if (!outcome || typeof outcome !== "object") return [];
  const outcomeActions = HorusChatSuggestedActionSchema.array().safeParse(
    (outcome as { suggestedActions?: unknown }).suggestedActions
  );
  return outcomeActions.success ? outcomeActions.data : [];
}

function addUniqueOption(
  options: ContextualFollowUpOption[],
  option: ContextualFollowUpOption
): void {
  if (
    options.some(
      (item) =>
        item.type === option.type &&
        item.label === option.label &&
        item.filePath === option.filePath
    )
  ) {
    return;
  }
  options.push(option);
}

function formatOptionList(options: ContextualFollowUpOption[]): string {
  const labels = options.map((option) => option.label);
  if (labels.length === 2) return `${labels[0]} ou ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} ou ${labels.at(-1)}`;
}

function normalizeProjectPath(path: string): string {
  return trimAgenticToken(path);
}

function normalizeMessage(message: string): string {
  return normalizeAgenticText(message);
}

function isQuestionLike(message: string): boolean {
  const words = wordsOfAgenticText(message);
  if (words.length === 0) return false;
  return (
    QUESTION_START_WORDS.has(words[0] ?? "") ||
    startsWithWords(words, ["por", "que"]) ||
    startsWithWords(words, ["me", "explique"]) ||
    startsWithWords(words, ["voce", "consegue"])
  );
}

function matchesUnsupportedCommand(message: string): boolean {
  const words = wordsOfAgenticText(message);
  return (
    words.some((word) => UNSUPPORTED_COMMAND_WORDS.has(word)) ||
    containsPhrase(words, ["rm", "-rf"])
  );
}

function matchPreviewAction(
  message: string
): HorusChatIntent["previewAction"] | null {
  const words = wordsOfAgenticText(message);
  if (!hasAnyWord(words, PREVIEW_TARGET_WORDS)) return null;
  if (hasAnyWord(words, PREVIEW_STOP_WORDS)) {
    return "stop";
  }
  if (hasAnyWord(words, PREVIEW_RELOAD_WORDS)) {
    return "reload";
  }
  if (hasAnyWord(words, PREVIEW_START_WORDS)) {
    return "start";
  }
  return null;
}

function matchesSpecGeneration(message: string): boolean {
  const words = wordsOfAgenticText(message);
  return hasAnyWord(words, SPEC_GENERATION_WORDS) && hasAnyWord(words, SPEC_TARGET_WORDS);
}

function matchesCodeChangeRequest(message: string): boolean {
  const words = wordsOfAgenticText(message);
  if (!hasAnyWord(words, CODE_EDIT_WORDS)) return false;
  if (hasAnyWord(words, CODE_TARGET_WORDS)) return true;

  return (
    hasBothWords(words, "troque", "para") ||
    hasBothWords(words, "substitua", "por") ||
    hasBothWords(words, "renomeie", "para")
  );
}

function mentionsPreviewStart(text: string): boolean {
  const words = wordsOfAgenticText(text);
  if (!hasAnyWord(words, PREVIEW_START_WORDS)) return false;
  return (
    hasAnyWord(words, PREVIEW_TARGET_WORDS) ||
    containsPhrase(words, ["servidor", "de", "desenvolvimento"])
  );
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
