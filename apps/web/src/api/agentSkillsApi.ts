import {
  AgentSkillDetailSchema,
  AgentProfilesResponseSchema,
  AgentSkillBindingsResponseSchema,
  AgentSkillSummaryResponseSchema,
  AgentSkillsListResponseSchema,
  CreateAgentSkillResponseSchema,
  PublishAgentSkillResponseSchema,
  ValidateAgentSkillResponseSchema,
  type AgentProfile,
  type AgentSkillDetail,
  type AgentSkillListQuery,
  type AgentSkillSummary,
  type CreateAgentSkillResponse,
  type CreateAgentSkillInput,
  type PublishAgentSkillResponse,
  type PublishAgentSkillInput,
  type UpdateAgentSkillBindingsInput,
  type ValidateAgentSkillResponse,
  type ValidateAgentSkillInput,
} from "@u-build/shared";

export type {
  CreateAgentSkillResponse,
  PublishAgentSkillResponse,
  ValidateAgentSkillResponse,
} from "@u-build/shared";

const BASE = "/api/agent-skills";

export class AgentSkillsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown
  ) {
    super(message);
    this.name = "AgentSkillsApiError";
  }
}

async function requireOk(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => null) as
      | { message?: string; error?: string; issues?: unknown }
      | null;
    const detail = body?.message ?? body?.error ?? response.statusText;
    throw new AgentSkillsApiError(
      `${action} falhou (${response.status}): ${detail}`,
      response.status,
      body
    );
  }
  const body = await response.text().catch(() => "");
  throw new AgentSkillsApiError(
    `${action} falhou (${response.status}): ${body.trim() || response.statusText}`,
    response.status,
    body
  );
}

interface AgentSkillsApiContract<T> {
  parse(input: unknown): T;
}

async function readAgentSkillsJson<T>(
  response: Response,
  action: string,
  contract: AgentSkillsApiContract<T>
): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AgentSkillsApiError(
      `${action} falhou: contrato inválido da API, esperado application/json e recebido ${
        contentType || "content-type ausente"
      }.`,
      response.status,
      null
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new AgentSkillsApiError(
      `${action} falhou: JSON inválido retornado pela API (${errorMessage(err)}).`,
      response.status,
      null
    );
  }

  try {
    return contract.parse(payload);
  } catch (err) {
    throw new AgentSkillsApiError(
      `${action} falhou: payload fora do contrato esperado (${errorMessage(err)}).`,
      response.status,
      payload
    );
  }
}

function appendOptionalParam(
  params: URLSearchParams,
  name: string,
  value: string | null | undefined
): void {
  if (!value) return;
  params.set(name, value);
}

export const agentSkillsApi = {
  listSkills: async (
    filter: AgentSkillListQuery = {}
  ): Promise<AgentSkillSummary[]> => {
    const params = new URLSearchParams();
    appendOptionalParam(params, "status", filter.status);
    appendOptionalParam(params, "sourceType", filter.sourceType);
    appendOptionalParam(params, "agentProfileId", filter.agentProfileId);
    appendOptionalParam(params, "search", filter.search);
    const query = params.toString();
    const response = await fetch(`${BASE}${query ? `?${query}` : ""}`, {
      cache: "no-store",
    });
    await requireOk(response, "Listar skills");
    const body = await readAgentSkillsJson(
      response,
      "Listar skills",
      AgentSkillsListResponseSchema
    );
    return body.skills;
  },

  listAgentProfiles: async (): Promise<AgentProfile[]> => {
    const response = await fetch(`${BASE}/agent-profiles`, { cache: "no-store" });
    await requireOk(response, "Listar agentes");
    const body = await readAgentSkillsJson(
      response,
      "Listar agentes",
      AgentProfilesResponseSchema
    );
    return body.profiles;
  },

  getSkill: async (skillId: string): Promise<AgentSkillDetail> => {
    const response = await fetch(`${BASE}/${skillId}`, { cache: "no-store" });
    await requireOk(response, "Carregar skill");
    return readAgentSkillsJson(response, "Carregar skill", AgentSkillDetailSchema);
  },

  validateDraft: async (
    input: ValidateAgentSkillInput
  ): Promise<ValidateAgentSkillResponse> => {
    const response = await fetch(`${BASE}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await requireOk(response, "Validar skill");
    return readAgentSkillsJson(
      response,
      "Validar skill",
      ValidateAgentSkillResponseSchema
    );
  },

  createSkill: async (
    input: CreateAgentSkillInput
  ): Promise<CreateAgentSkillResponse> => {
    const response = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await requireOk(response, "Criar skill");
    return readAgentSkillsJson(response, "Criar skill", CreateAgentSkillResponseSchema);
  },

  publishRevision: async (
    skillId: string,
    revisionId: string,
    input: PublishAgentSkillInput
  ): Promise<PublishAgentSkillResponse> => {
    const response = await fetch(
      `${BASE}/${skillId}/revisions/${revisionId}/publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );
    await requireOk(response, "Publicar skill");
    return readAgentSkillsJson(
      response,
      "Publicar skill",
      PublishAgentSkillResponseSchema
    );
  },

  updateBindings: async (
    skillId: string,
    input: UpdateAgentSkillBindingsInput
  ): Promise<{ bindings: AgentSkillDetail["bindings"] }> => {
    const response = await fetch(`${BASE}/${skillId}/bindings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await requireOk(response, "Atualizar agentes");
    return readAgentSkillsJson(
      response,
      "Atualizar agentes",
      AgentSkillBindingsResponseSchema
    );
  },

  archiveSkill: async (skillId: string): Promise<{ skill: AgentSkillSummary }> => {
    const response = await fetch(`${BASE}/${skillId}/archive`, {
      method: "POST",
    });
    await requireOk(response, "Arquivar skill");
    return readAgentSkillsJson(
      response,
      "Arquivar skill",
      AgentSkillSummaryResponseSchema
    );
  },
} as const;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
