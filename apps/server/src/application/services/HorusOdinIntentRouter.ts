import type {
  ChatAgentContextBundle,
  HorusChatIntent,
  HorusChatMode,
} from "@u-build/shared";

export interface HorusOdinIntentRouterInput {
  readonly message: string;
  readonly context: ChatAgentContextBundle;
}

interface IntentPattern {
  readonly kind: HorusChatIntent["kind"];
  readonly mode: HorusChatMode;
  readonly confidence: number;
  readonly rationale: string;
  readonly test: (normalized: string) => boolean;
}

export const HORUS_CHAT_ROUTING_PROMPT = `
Voce e o Horus, o orquestrador conversacional e executivo do projeto.
Sua primeira responsabilidade e decidir se a mensagem do usuario deve ficar
em conversa segura ou virar uma acao mutavel. Essa decisao protege o projeto
contra execucoes indevidas, vazamento de contexto entre chats e geracao de
artefatos desnecessarios.

## Modos oficiais

### ASK / mode=chat
Use ASK quando a melhor resposta e conversar, explicar, analisar ou orientar
sem alterar estado. Exemplos:
- saudacoes, continuidade de conversa, alinhamento de expectativa e perguntas
  simples;
- perguntas sobre o projeto, codigo, arquitetura, user story, spec, preview,
  historico do chat ou decisoes anteriores;
- pedidos de leitura, verificacao, analise, diagnostico ou explicacao;
- perguntas iniciadas por "como", "o que", "por que", "qual", "quais",
  "onde", "quando", "explique", "analise", "verifique", "me diga",
  "liste" ou equivalentes;
- pedidos ambíguos em que o usuario nao autorizou claramente uma alteracao;
- mensagens curtas como "ola", "oi", "entendi", "continua?", "e agora?",
  quando elas dependem do historico da conversa.

ASK pode consultar contexto somente leitura quando disponivel. ASK nao pode
alterar arquivos, rodar comandos, iniciar agentes, gerar specs, editar UI ou
acionar preview. Se uma resposta exigir acao, explique a acao necessaria e
aguarde uma autorizacao imperativa clara.

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

## Bloqueios obrigatorios
- Nunca execute comandos shell arbitrarios enviados pelo usuario pelo chat.
  Exemplos bloqueados: "execute pnpm install", "rode docker", "use git",
  "curl ...", "bash ...", "python ...", "rm ...".
- O pedido "rode o projeto" pode acionar apenas o ciclo controlado do preview
  registrado, nunca um comando livre.
- Uma pergunta sobre como fazer algo nunca deve executar a alteracao.
- Uma saudacao nunca deve pedir mais contexto para decidir rota.
- Se houver duvida entre ASK e ACTION, escolha ASK.
- Se houver risco de afetar outro projeto, outra user story, outro chat ou
  contexto nao selecionado, bloqueie a acao e explique a falta de isolamento.
`.trim();

const SPEC_VERBS =
  String.raw`\b(gerar|gere|criar|crie|produzir|produza|montar|monte|escrever|escreva|atualizar|atualize|revisar|revise)\b`;
const SPEC_NOUNS = String.raw`\b(spec|sdd|especifica(?:c|ç)[aã]o)\b`;

const intentPatterns: IntentPattern[] = [
  {
    kind: "unsupported",
    mode: "executor",
    confidence: 0.9,
    rationale:
      "The message asks for arbitrary shell or terminal execution, which Horus must not run from chat.",
    test: (normalized) => hasArbitraryCommandRisk(normalized),
  },
  {
    kind: "generate_spec",
    mode: "executor",
    confidence: 0.86,
    rationale: "The message explicitly asks Horus to create or update a spec.",
    test: (normalized) =>
      new RegExp(`${SPEC_VERBS}[\\s\\S]{0,100}${SPEC_NOUNS}`).test(normalized) ||
      new RegExp(`${SPEC_NOUNS}[\\s\\S]{0,100}${SPEC_VERBS}`).test(normalized),
  },
  {
    kind: "run_project",
    mode: "executor",
    confidence: 0.8,
    rationale: "The message asks Horus to run or control project execution.",
    test: (normalized) =>
      !isQuestionLike(normalized) &&
      /\b(rode|rodar|inicie|iniciar|start|reload|recarregue|reinicie|reiniciar|pare|parar|suba|subir)\b/.test(
        normalized
      ) &&
      /\b(projeto|preview|app|aplicacao|aplica(?:c|ç)[aã]o|sess[aã]o)\b/.test(
        normalized
      ),
  },
  {
    kind: "code_change",
    mode: "executor",
    confidence: 0.76,
    rationale: "The message asks Horus to perform a code, UI, or project change.",
    test: (normalized) =>
      !isQuestionLike(normalized) &&
      /\b(altere|alterar|ajuste|ajustar|corrija|corrigir|mude|mudar|implemente|implementar|remova|remover|adicione|adicionar|conecte|conectar|refatore|refatorar)\b/.test(
        normalized
      ),
  },
  {
    kind: "answer_question",
    mode: "chat",
    confidence: 0.82,
    rationale:
      "The message is conversational, a greeting, or a read-only ask.",
    test: (normalized) => isConversationalAsk(normalized),
  },
];

export class HorusOdinIntentRouter {
  classify(input: HorusOdinIntentRouterInput): HorusChatIntent {
    const normalized = normalize(input.message);

    for (const pattern of intentPatterns) {
      if (pattern.test(normalized)) {
        return {
          kind: pattern.kind,
          mode: pattern.mode,
          confidence: pattern.confidence,
          rationale: pattern.rationale,
        };
      }
    }

    return {
      kind: "answer_question",
      mode: "chat",
      confidence: 0.58,
      rationale:
        "The message is ambiguous, so Horus keeps it in chat mode instead of executing.",
    };
  }
}

function normalize(message: string): string {
  return message.trim().toLowerCase();
}

function isQuestionLike(normalized: string): boolean {
  return /\?$|\b(como|o que|por que|porque|explique|explica|mostre|qual|quais|onde|quando|verifique|verifica|analise|analisa|me diga|diga|liste|lista)\b/.test(
    normalized
  );
}

function isConversationalAsk(normalized: string): boolean {
  return (
    isGreeting(normalized) ||
    isQuestionLike(normalized) ||
    /\b(status|contexto|resumo|historico|histórico|duvida|dúvida|ajuda)\b/.test(
      normalized
    )
  );
}

function isGreeting(normalized: string): boolean {
  return /^(oi|ola|olá|opa|bom dia|boa tarde|boa noite|e ai|e aí|hello|hi)\s*[!.?]*$/.test(
    normalized
  );
}

function hasArbitraryCommandRisk(normalized: string): boolean {
  return /\b(shell|terminal|comando|bash|zsh|sh|sudo|rm\s+-rf|curl|wget|git|docker|npm|pnpm|node|python|uvicorn)\b/.test(
    normalized
  );
}
