import {
  ChatMessagesResponseSchema,
  ChatSessionResponseSchema,
  ChatSessionsResponseSchema,
  HorusChatStreamEventSchema,
  HorusChatTurnResponseSchema,
  type ChatMessage,
  type ChatSession,
  type CreateChatSessionInput,
  type HorusChatStreamEvent,
  type HorusChatTurnInput,
  type HorusChatTurnResponse,
} from "@u-build/shared";

const BASE = "/api";

export class HorusChatApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown
  ) {
    super(message);
    this.name = "HorusChatApiError";
  }
}

async function requireOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await res.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;
    const detail = body?.message ?? body?.error ?? res.statusText;
    throw new HorusChatApiError(
      `${action} falhou (${res.status}): ${detail}`,
      res.status,
      body
    );
  }

  const body = await res.text().catch(() => "");
  const detail = body.trim() || res.statusText || "sem detalhe retornado";
  throw new HorusChatApiError(
    `${action} falhou (${res.status}): ${detail}`,
    res.status,
    body
  );
}

interface HorusChatApiContract<T> {
  parse(input: unknown): T;
}

async function readHorusChatJson<T>(
  res: Response,
  action: string,
  contract: HorusChatApiContract<T>
): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new HorusChatApiError(
      `${action} falhou: contrato inválido da API, esperado application/json e recebido ${
        contentType || "content-type ausente"
      }.`,
      res.status,
      null
    );
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (err) {
    throw new HorusChatApiError(
      `${action} falhou: JSON inválido retornado pela API (${errorMessage(err)}).`,
      res.status,
      null
    );
  }

  try {
    return contract.parse(payload);
  } catch (err) {
    throw new HorusChatApiError(
      `${action} falhou: payload fora do contrato esperado (${errorMessage(err)}).`,
      res.status,
      payload
    );
  }
}

function parseHorusChatStreamEvent(data: string): HorusChatStreamEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch (err) {
    throw new HorusChatApiError(
      `Enviar mensagem para Horus falhou: evento SSE com JSON inválido (${errorMessage(
        err
      )}).`,
      200,
      data
    );
  }

  try {
    return HorusChatStreamEventSchema.parse(payload);
  } catch (err) {
    throw new HorusChatApiError(
      `Enviar mensagem para Horus falhou: evento SSE fora do contrato esperado (${errorMessage(
        err
      )}).`,
      200,
      payload
    );
  }
}

export const horusChatApi = {
  listSessions: async (filter: {
    workspaceFolderId: string;
    userStoryId: string;
  }): Promise<ChatSession[]> => {
    const params = new URLSearchParams({
      workspaceFolderId: filter.workspaceFolderId,
      userStoryId: filter.userStoryId,
    });
    const res = await fetch(`${BASE}/chat/sessions?${params.toString()}`, {
      cache: "no-store",
    });
    await requireOk(res, "Listar sessões de chat");
    const body = await readHorusChatJson(
      res,
      "Listar sessões de chat",
      ChatSessionsResponseSchema
    );
    return body.sessions;
  },

  createSession: async (input: CreateChatSessionInput): Promise<ChatSession> => {
    const res = await fetch(`${BASE}/chat/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await requireOk(res, "Criar sessão de chat");
    const body = await readHorusChatJson(
      res,
      "Criar sessão de chat",
      ChatSessionResponseSchema
    );
    return body.session;
  },

  listMessages: async (
    chatSessionId: string,
    filter?: { afterSequence?: number }
  ): Promise<ChatMessage[]> => {
    const params = new URLSearchParams();
    if (filter?.afterSequence !== undefined) {
      params.set("after_sequence", String(filter.afterSequence));
    }
    const query = params.size > 0 ? `?${params.toString()}` : "";
    const res = await fetch(`${BASE}/chat/sessions/${chatSessionId}/messages${query}`, {
      cache: "no-store",
    });
    await requireOk(res, "Listar mensagens do chat");
    const body = await readHorusChatJson(
      res,
      "Listar mensagens do chat",
      ChatMessagesResponseSchema
    );
    return body.messages;
  },

  submitTurn: async (
    input: HorusChatTurnInput
  ): Promise<HorusChatTurnResponse> => {
    const res = await fetch(`${BASE}/horus/chat/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await requireOk(res, "Enviar mensagem para Horus");
    return readHorusChatJson(
      res,
      "Enviar mensagem para Horus",
      HorusChatTurnResponseSchema
    );
  },

  submitTurnStream: async (
    input: HorusChatTurnInput,
    onEvent: (event: HorusChatStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    };
    const res = await fetch(`${BASE}/horus/chat/turn/stream`, {
      ...init,
    });
    await requireOk(res, "Enviar mensagem para Horus");
    if (!res.body) {
      throw new Error("Enviar mensagem para Horus falhou: stream indisponível.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const parseFrame = (frame: string): void => {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
        .join("\n");
      if (!data) return;
      onEvent(parseHorusChatStreamEvent(data));
    };

    const flush = (chunk: string): void => {
      buffer += chunk;
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        parseFrame(frame);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      flush(decoder.decode(value, { stream: true }));
    }
    flush(decoder.decode());
    if (buffer.trim()) {
      parseFrame(buffer);
      buffer = "";
    }
  },
} as const;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
