import type {
  AgentProfile,
  AgentSkillDetail,
  AgentSkillListQuery,
  AgentSkillSummary,
  AgentSkillValidationReport,
  CreateAgentSkillInput,
  PublishAgentSkillInput,
  UpdateAgentSkillBindingsInput,
  ValidateAgentSkillInput,
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

export interface CreateAgentSkillResponse {
  skill: AgentSkillSummary;
  draftRevision: AgentSkillDetail["revisions"][number];
  files: AgentSkillDetail["files"];
  validationReport: AgentSkillValidationReport;
  bindings: AgentSkillDetail["bindings"];
}

export interface ValidateAgentSkillResponse {
  validationReport: AgentSkillValidationReport;
  contentHash: string;
}

export interface PublishAgentSkillResponse {
  skill: AgentSkillSummary;
  activeRevision: AgentSkillDetail["revisions"][number];
  bindings: AgentSkillDetail["bindings"];
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
    const body = (await response.json()) as { skills: AgentSkillSummary[] };
    return body.skills;
  },

  listAgentProfiles: async (): Promise<AgentProfile[]> => {
    const response = await fetch(`${BASE}/agent-profiles`, { cache: "no-store" });
    await requireOk(response, "Listar agentes");
    const body = (await response.json()) as { profiles: AgentProfile[] };
    return body.profiles;
  },

  getSkill: async (skillId: string): Promise<AgentSkillDetail> => {
    const response = await fetch(`${BASE}/${skillId}`, { cache: "no-store" });
    await requireOk(response, "Carregar skill");
    return response.json() as Promise<AgentSkillDetail>;
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
    return response.json() as Promise<ValidateAgentSkillResponse>;
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
    return response.json() as Promise<CreateAgentSkillResponse>;
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
    return response.json() as Promise<PublishAgentSkillResponse>;
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
    return response.json() as Promise<{ bindings: AgentSkillDetail["bindings"] }>;
  },

  archiveSkill: async (skillId: string): Promise<{ skill: AgentSkillSummary }> => {
    const response = await fetch(`${BASE}/${skillId}/archive`, {
      method: "POST",
    });
    await requireOk(response, "Arquivar skill");
    return response.json() as Promise<{ skill: AgentSkillSummary }>;
  },
} as const;
