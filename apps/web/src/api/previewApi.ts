import type {
  CreatePreviewSessionInput,
  CreateVisualInstructionDraftInput,
  FrontendProject,
  PreviewDeviceName,
  PreviewEvent,
  PreviewSession,
  VisualInstructionDraft,
} from "@u-build/shared";

const BASE = "/api/preview";

async function requireOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;

  const body = await res.text().catch(() => "");
  const detail = body.trim() || res.statusText || "sem detalhe retornado";
  throw new Error(`${action} falhou (${res.status}): ${detail}`);
}

export interface PreviewActionResponse {
  session: PreviewSession;
  event: PreviewEvent;
}

export interface VisualInstructionDraftResponse {
  draft: VisualInstructionDraft;
  event: PreviewEvent;
}

export const previewApi = {
  listProjects: async (
    input: { visibility?: "visible" | "all" | "archived" } = {}
  ): Promise<FrontendProject[]> => {
    const params = new URLSearchParams();
    if (input.visibility) params.set("visibility", input.visibility);
    const query = params.toString();
    const res = await fetch(`${BASE}/projects${query ? `?${query}` : ""}`, {
      cache: "no-store",
    });
    await requireOk(res, "Listar projetos de preview");
    const body = (await res.json()) as { projects: FrontendProject[] };
    return body.projects;
  },

  createSession: async (
    input: CreatePreviewSessionInput
  ): Promise<PreviewActionResponse> => {
    const res = await fetch(`${BASE}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await requireOk(res, "Criar sessão de preview");
    return res.json() as Promise<PreviewActionResponse>;
  },

  getSession: async (sessionId: string): Promise<PreviewSession> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}`, { cache: "no-store" });
    await requireOk(res, "Consultar sessão de preview");
    const body = (await res.json()) as { session: PreviewSession };
    return body.session;
  },

  startSession: async (sessionId: string): Promise<PreviewActionResponse> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/start`, { method: "POST" });
    await requireOk(res, "Iniciar preview");
    return res.json() as Promise<PreviewActionResponse>;
  },

  stopSession: async (sessionId: string): Promise<PreviewActionResponse> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/stop`, { method: "POST" });
    await requireOk(res, "Parar preview");
    return res.json() as Promise<PreviewActionResponse>;
  },

  reloadSession: async (sessionId: string): Promise<PreviewActionResponse> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/reload`, { method: "POST" });
    await requireOk(res, "Recarregar preview");
    return res.json() as Promise<PreviewActionResponse>;
  },

  setDevice: async (
    sessionId: string,
    device: PreviewDeviceName
  ): Promise<PreviewActionResponse> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/device`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device }),
    });
    await requireOk(res, "Alterar dispositivo do preview");
    return res.json() as Promise<PreviewActionResponse>;
  },

  listTimeline: async (sessionId: string): Promise<PreviewEvent[]> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/timeline`, {
      cache: "no-store",
    });
    await requireOk(res, "Listar timeline do preview");
    const body = (await res.json()) as { events: PreviewEvent[] };
    return body.events;
  },

  createInstructionDraft: async (
    input: CreateVisualInstructionDraftInput
  ): Promise<VisualInstructionDraftResponse> => {
    const res = await fetch(`${BASE}/instructions/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await requireOk(res, "Criar draft visual");
    return res.json() as Promise<VisualInstructionDraftResponse>;
  },
} as const;
