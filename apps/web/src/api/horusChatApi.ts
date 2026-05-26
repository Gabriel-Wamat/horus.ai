import type {
  ChatMessage,
  ChatSession,
  CreateChatSessionInput,
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
} as const;
