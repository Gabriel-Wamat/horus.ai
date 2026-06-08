export const HORUS_CHAT_RESPONSE_STYLE_PROMPT = `# Estilo de conversa do Horus
Responda como um agente de engenharia dentro do produto, no nível textual de um
coding agent maduro:
- comece pelo ponto principal: feito, encontrei, não consegui, preciso de um dado
  ou o estado atual da execução;
- escreva em português brasileiro natural, direto e específico;
- para mudanças de código, use uma resposta curta com o que mudou, validação e
  arquivos tocados, somente quando esses itens existirem de fato;
- para diagnóstico, explique causa provável, evidência usada e próxima ação
  objetiva;
- para falha, diga o que ficou preservado, o que não aconteceu e qual é o próximo
  passo concreto;
- evite jargão interno como schema, profile, tool_call, trace bruto, JSON cru,
  reducers ou IDs técnicos, exceto quando o usuário pedir detalhes internos;
- não termine com convite genérico do tipo "se quiser..." ou "posso ajudar com
  mais alguma coisa"; quando houver próximo passo útil, ofereça uma ação específica;
- use markdown leve: parágrafos curtos e bullets apenas quando melhorarem a leitura;
- respeite limites explícitos de formato do usuário; se pedir exatamente N bullets,
  frases ou passos, entregue esse número e corte o restante;
- faça no máximo uma pergunta de esclarecimento quando estiver bloqueado;
- nunca invente arquivos alterados, comandos rodados, resultados de validação ou
  estados do preview.`;

export function polishHorusChatAssistantText(text: string): string {
  return stripGenericTrailingInvite(text).trim();
}

export async function* streamPolishedHorusChatText(
  chunks: AsyncIterable<string>
): AsyncIterable<string> {
  const polisher = createHorusChatTextStreamPolisher();
  for await (const chunk of chunks) {
    const next = polisher.push(chunk);
    if (next) yield next;
  }
  const tail = polisher.finish();
  if (tail) yield tail;
}

export function createHorusChatTextStreamPolisher(): {
  push(chunk: string): string;
  finish(): string;
} {
  let tail = "";
  let emitted = false;

  return {
    push(chunk: string): string {
      tail += chunk;
      if (tail.length <= STREAM_POLISH_TAIL_LENGTH) return "";

      const emitLength = tail.length - STREAM_POLISH_TAIL_LENGTH;
      const next = tail.slice(0, emitLength);
      tail = tail.slice(emitLength);
      if (next) emitted = true;
      return next;
    },
    finish(): string {
      const next = stripGenericTrailingInvite(tail);
      tail = "";
      return emitted ? next : next.trimStart();
    },
  };
}

function stripGenericTrailingInvite(text: string): string {
  let end = text.length;
  while (end > 0 && isTrailingWhitespace(text[end - 1] ?? "")) {
    end -= 1;
  }
  let polished = text.slice(0, end);
  for (const ending of GENERIC_TRAILING_INVITES) {
    if (polished.endsWith(ending)) {
      polished = polished.slice(0, polished.length - ending.length).trimEnd();
    }
  }
  return polished;
}

const GENERIC_TRAILING_INVITES = [
  "Se quiser, posso ajudar com mais alguma coisa.",
  "Se quiser, posso te ajudar com mais alguma coisa.",
  "Se quiser, posso ajudar no próximo passo.",
  "Posso ajudar com mais alguma coisa?",
  "Como posso ajudar?",
] as const;

const STREAM_POLISH_TAIL_LENGTH =
  Math.max(...GENERIC_TRAILING_INVITES.map((ending) => ending.length)) + 16;

function isTrailingWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\t" || char === "\r";
}
