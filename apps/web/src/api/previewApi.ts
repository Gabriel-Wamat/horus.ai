import {
  PreviewActionResponseSchema,
  PreviewProjectsResponseSchema,
  PreviewSessionResponseSchema,
  PreviewTimelineResponseSchema,
  VisualInstructionDraftResponseSchema,
  type CreatePreviewSessionInput,
  type CreateVisualInstructionDraftInput,
  type FrontendProject,
  type PreviewDeviceName,
  type PreviewEvent,
  type PreviewSession,
  type PreviewActionResponse,
  type VisualInstructionDraftResponse,
} from "@u-build/shared";

const BASE = "/api/preview";

export class PreviewApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown
  ) {
    super(message);
    this.name = "PreviewApiError";
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
    throw new PreviewApiError(
      `${action} falhou (${res.status}): ${detail}`,
      res.status,
      body
    );
  }

  const body = await res.text().catch(() => "");
  const detail = body.trim() || res.statusText || "sem detalhe retornado";
  throw new PreviewApiError(
    `${action} falhou (${res.status}): ${detail}`,
    res.status,
    body
  );
}

interface PreviewApiContract<T> {
  parse(input: unknown): T;
}

async function readPreviewJson<T>(
  res: Response,
  action: string,
  contract: PreviewApiContract<T>
): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new PreviewApiError(
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
    throw new PreviewApiError(
      `${action} falhou: JSON inválido retornado pela API (${errorMessage(err)}).`,
      res.status,
      null
    );
  }

  try {
    return contract.parse(payload);
  } catch (err) {
    throw new PreviewApiError(
      `${action} falhou: payload fora do contrato esperado (${errorMessage(err)}).`,
      res.status,
      payload
    );
  }
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
    const body = await readPreviewJson(
      res,
      "Listar projetos de preview",
      PreviewProjectsResponseSchema
    );
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
    return readPreviewJson(res, "Criar sessão de preview", PreviewActionResponseSchema);
  },

  getSession: async (sessionId: string): Promise<PreviewSession> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}`, { cache: "no-store" });
    await requireOk(res, "Consultar sessão de preview");
    const body = await readPreviewJson(
      res,
      "Consultar sessão de preview",
      PreviewSessionResponseSchema
    );
    return body.session;
  },

  startSession: async (sessionId: string): Promise<PreviewActionResponse> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/start`, { method: "POST" });
    await requireOk(res, "Iniciar preview");
    return readPreviewJson(res, "Iniciar preview", PreviewActionResponseSchema);
  },

  stopSession: async (sessionId: string): Promise<PreviewActionResponse> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/stop`, { method: "POST" });
    await requireOk(res, "Parar preview");
    return readPreviewJson(res, "Parar preview", PreviewActionResponseSchema);
  },

  reloadSession: async (sessionId: string): Promise<PreviewActionResponse> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/reload`, { method: "POST" });
    await requireOk(res, "Recarregar preview");
    return readPreviewJson(res, "Recarregar preview", PreviewActionResponseSchema);
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
    return readPreviewJson(
      res,
      "Alterar dispositivo do preview",
      PreviewActionResponseSchema
    );
  },

  listTimeline: async (sessionId: string): Promise<PreviewEvent[]> => {
    const res = await fetch(`${BASE}/sessions/${sessionId}/timeline`, {
      cache: "no-store",
    });
    await requireOk(res, "Listar timeline do preview");
    const body = await readPreviewJson(
      res,
      "Listar timeline do preview",
      PreviewTimelineResponseSchema
    );
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
    return readPreviewJson(
      res,
      "Criar draft visual",
      VisualInstructionDraftResponseSchema
    );
  },
} as const;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
