import type {
  ChatMessage,
  ChatSession,
  CreateChatSessionInput,
  HorusChatStreamEvent,
  HorusChatTurnInput,
  HorusChatTurnResponse,
} from "@u-build/shared";

const BASE = "/api";

async function requireOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;

  const body = await res.text().catch(() => "");
  const detail = body.trim() || res.statusText || "sem detalhe retornado";
  throw new Error(`${action} falhou (${res.status}): ${detail}`);
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
    const body = (await res.json()) as { sessions: ChatSession[] };
    return body.sessions;
  },

  createSession: async (input: CreateChatSessionInput): Promise<ChatSession> => {
    const res = await fetch(`${BASE}/chat/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await requireOk(res, "Criar sessão de chat");
    const body = (await res.json()) as { session: ChatSession };
    return body.session;
  },

  listMessages: async (chatSessionId: string): Promise<ChatMessage[]> => {
    const res = await fetch(`${BASE}/chat/sessions/${chatSessionId}/messages`, {
      cache: "no-store",
    });
    await requireOk(res, "Listar mensagens do chat");
    const body = (await res.json()) as { messages: ChatMessage[] };
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
    return res.json() as Promise<HorusChatTurnResponse>;
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
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length);
      if (!data) return;
      onEvent(JSON.parse(data) as HorusChatStreamEvent);
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
