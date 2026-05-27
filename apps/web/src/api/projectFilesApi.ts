import type {
  ProjectFileContentResponse,
  ProjectFileListProjectsResponse,
  ProjectFileTreeResponse,
  SaveProjectFileRequest,
  SaveProjectFileResponse,
} from "@u-build/shared";

const BASE = "/api";

export class ProjectFilesApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
    public readonly details: unknown
  ) {
    super(message);
    this.name = "ProjectFilesApiError";
  }
}

async function requireOk(response: Response, action: string): Promise<void> {
  if (response.ok) return;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => null) as
      | { message?: string; error?: string }
      | null;
    const detail = body?.message ?? body?.error ?? response.statusText;
    throw new ProjectFilesApiError(
      `${action} falhou (${response.status}): ${detail}`,
      response.status,
      body?.error ?? null,
      body
    );
  }

  const body = await response.text().catch(() => "");
  const detail = body.trim() || response.statusText || "sem detalhe retornado";
  throw new ProjectFilesApiError(
    `${action} falhou (${response.status}): ${detail}`,
    response.status,
    null,
    body
  );
}

function appendOptionalParam(
  params: URLSearchParams,
  name: string,
  value: string | number | null | undefined
): void {
  if (value === null || value === undefined || value === "") return;
  params.set(name, String(value));
}

export const projectFilesApi = {
  listProjects: async (): Promise<ProjectFileListProjectsResponse> => {
    const response = await fetch(`${BASE}/project-files/projects`, {
      cache: "no-store",
    });
    await requireOk(response, "Listar projetos");
    return response.json() as Promise<ProjectFileListProjectsResponse>;
  },

  getTree: async (
    projectId: string,
    options: { runId?: string | null; limit?: number; depth?: number } = {}
  ): Promise<ProjectFileTreeResponse> => {
    const params = new URLSearchParams();
    appendOptionalParam(params, "runId", options.runId);
    appendOptionalParam(params, "limit", options.limit);
    appendOptionalParam(params, "depth", options.depth);
    const query = params.toString();
    const response = await fetch(
      `${BASE}/project-files/projects/${projectId}/tree${query ? `?${query}` : ""}`,
      { cache: "no-store" }
    );
    await requireOk(response, "Carregar árvore de arquivos");
    return response.json() as Promise<ProjectFileTreeResponse>;
  },

  getFile: async (
    projectId: string,
    options: { path: string; runId?: string | null; maxBytes?: number }
  ): Promise<ProjectFileContentResponse> => {
    const params = new URLSearchParams();
    params.set("path", options.path);
    appendOptionalParam(params, "runId", options.runId);
    appendOptionalParam(params, "maxBytes", options.maxBytes);
    const response = await fetch(
      `${BASE}/project-files/projects/${projectId}/file?${params.toString()}`,
      { cache: "no-store" }
    );
    await requireOk(response, "Ler arquivo");
    return response.json() as Promise<ProjectFileContentResponse>;
  },

  saveFile: async (
    projectId: string,
    input: SaveProjectFileRequest
  ): Promise<SaveProjectFileResponse> => {
    const response = await fetch(
      `${BASE}/project-files/projects/${projectId}/file`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );
    await requireOk(response, "Salvar arquivo");
    return response.json() as Promise<SaveProjectFileResponse>;
  },
} as const;
