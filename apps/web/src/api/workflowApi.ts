import { z } from "zod";
import {
  SpecSchema,
  UserStorySchema,
  WorkspaceFolderSchema,
  type UserStory,
  type Spec,
  type HumanFeedback,
  type WorkflowState,
  type LlmProviderCapability,
  type LlmSettingsDraft,
  type LlmSettingsProfile,
  type LlmSettingsReference,
  type WorkspaceFolder,
  type ProjectConstructionRun,
  type ProjectWorkspace,
  type FrontendProject,
  type PreviewSession,
} from "@u-build/shared";

const BASE = "/api";

export interface WorkspaceStoryArtifactsResponse {
  userStories: UserStory[];
  specsByStoryId: Record<string, Spec>;
}

export class WorkflowApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown
  ) {
    super(message);
    this.name = "WorkflowApiError";
  }
}

const WorkspaceArtifactRevisionSchema = z.object({
  activeRevision: z.number().int().positive(),
  revisions: z.array(
    z.object({
      revision: z.number().int().positive(),
      file: z.string().trim().min(1),
      createdAt: z.string().datetime(),
    })
  ),
});

const WorkspaceSpecArtifactSchema = z.object({
  specId: z.string().trim().min(1),
  spec: SpecSchema.optional(),
  revision: WorkspaceArtifactRevisionSchema,
});

const WorkspaceUserStoryArtifactSchema = z.object({
  story: UserStorySchema,
  revision: WorkspaceArtifactRevisionSchema,
  specs: z.array(WorkspaceSpecArtifactSchema),
});

const WorkspaceFoldersResponseSchema = z.object({
  folders: z.array(WorkspaceFolderSchema),
});

const WorkspaceFolderResponseSchema = z.object({
  folder: WorkspaceFolderSchema,
});

const WorkspaceUserStoriesResponseSchema = z.object({
  userStories: z.array(UserStorySchema),
  artifacts: z.array(WorkspaceUserStoryArtifactSchema).optional(),
});

const WorkspaceUserStoryResponseSchema = z.object({
  userStory: UserStorySchema,
});

const WorkspaceSpecResponseSchema = z.object({
  spec: SpecSchema,
});

async function requireOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await res.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;
    const detail = body?.message ?? body?.error ?? res.statusText;
    throw new WorkflowApiError(
      `${action} falhou (${res.status}): ${detail}`,
      res.status,
      body
    );
  }

  const body = await res.text().catch(() => "");
  const detail = body.trim() || res.statusText || "sem detalhe retornado";
  throw new WorkflowApiError(
    `${action} falhou (${res.status}): ${detail}`,
    res.status,
    body
  );
}

interface WorkflowApiContract<T> {
  parse(input: unknown): T;
}

async function readWorkflowJson<T>(
  res: Response,
  action: string,
  contract: WorkflowApiContract<T>
): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new WorkflowApiError(
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
    throw new WorkflowApiError(
      `${action} falhou: JSON inválido retornado pela API (${errorMessage(err)}).`,
      res.status,
      null
    );
  }

  try {
    return contract.parse(payload);
  } catch (err) {
    throw new WorkflowApiError(
      `${action} falhou: payload fora do contrato esperado (${errorMessage(err)}).`,
      res.status,
      payload
    );
  }
}

export interface StartWorkflowResponse {
  threadId: string;
}

export interface StartProjectConstructionResponse {
  projectWorkspace: ProjectWorkspace;
  constructionRun: ProjectConstructionRun;
  frontendProject: FrontendProject | null;
  previewSession: PreviewSession | null;
  reusedProjectWorkspace?: boolean;
}

export const workflowApi = {
  start: async (
    userStories: UserStory[],
    workspaceFolderId: string,
    workflowMode: "standard" | "spec_generation" = "standard",
    llmSettingsRef?: LlmSettingsReference,
    frontendProjectId?: string
  ): Promise<StartWorkflowResponse> => {
    const res = await fetch(`${BASE}/workflow/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceFolderId,
        userStories,
        workflowMode,
        ...(llmSettingsRef ? { llmSettingsRef } : {}),
        ...(frontendProjectId ? { frontendProjectId } : {}),
      }),
    });
    await requireOk(res, "Iniciar workflow");
    return res.json() as Promise<StartWorkflowResponse>;
  },

  resume: async (
    threadId: string,
    userStoryId: string,
    feedback: HumanFeedback
  ): Promise<void> => {
    const res = await fetch(`${BASE}/workflow/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, userStoryId, feedback }),
    });
    await requireOk(res, "Retomar workflow");
  },

  retryDecision: async (
    threadId: string,
    userStoryId: string,
    continueRetry: boolean
  ): Promise<void> => {
    const res = await fetch(`${BASE}/workflow/retry-decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, userStoryId, continueRetry }),
    });
    await requireOk(res, "Enviar decisão de retry");
  },

  getStatus: async (threadId: string): Promise<WorkflowState | null> => {
    const res = await fetch(`${BASE}/workflow/status/${threadId}`);
    if (res.status === 404) return null;
    await requireOk(res, "Consultar status");
    return res.json() as Promise<WorkflowState>;
  },

  listWorkspaceFolders: async (): Promise<WorkspaceFolder[]> => {
    const res = await fetch(`${BASE}/workspace/folders`, { cache: "no-store" });
    await requireOk(res, "Listar pastas do workspace");
    const body = await readWorkflowJson(
      res,
      "Listar pastas do workspace",
      WorkspaceFoldersResponseSchema
    );
    return body.folders;
  },

  createWorkspaceFolder: async (name: string): Promise<WorkspaceFolder> => {
    const res = await fetch(`${BASE}/workspace/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await requireOk(res, "Criar pasta do workspace");
    const body = await readWorkflowJson(
      res,
      "Criar pasta do workspace",
      WorkspaceFolderResponseSchema
    );
    return body.folder;
  },

  listWorkspaceUserStories: async (folderId: string): Promise<UserStory[]> => {
    const res = await fetch(`${BASE}/workspace/folders/${folderId}/user-stories`, {
      cache: "no-store",
    });
    await requireOk(res, "Listar user stories do workspace");
    const body = await readWorkflowJson(
      res,
      "Listar user stories do workspace",
      WorkspaceUserStoriesResponseSchema
    );
    return body.userStories;
  },

  listWorkspaceStoryArtifacts: async (
    folderId: string
  ): Promise<WorkspaceStoryArtifactsResponse> => {
    const res = await fetch(`${BASE}/workspace/folders/${folderId}/user-stories`, {
      cache: "no-store",
    });
    await requireOk(res, "Listar artefatos do workspace");
    const body = await readWorkflowJson(
      res,
      "Listar artefatos do workspace",
      WorkspaceUserStoriesResponseSchema
    );
    const specsByStoryId: Record<string, Spec> = {};
    for (const artifact of body.artifacts ?? []) {
      const specs = Array.isArray(artifact.specs) ? artifact.specs : [];
      const activeSpec = specs.find((item) => item.spec)?.spec;
      if (activeSpec) specsByStoryId[artifact.story.id] = activeSpec;
    }
    return { userStories: body.userStories, specsByStoryId };
  },

  updateWorkspaceUserStory: async (
    folderId: string,
    userStory: UserStory
  ): Promise<UserStory> => {
    const res = await fetch(
      `${BASE}/workspace/folders/${folderId}/user-stories/${userStory.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userStory),
      }
    );
    await requireOk(res, "Atualizar user story do workspace");
    const body = await readWorkflowJson(
      res,
      "Atualizar user story do workspace",
      WorkspaceUserStoryResponseSchema
    );
    return body.userStory;
  },

  deleteWorkspaceUserStory: async (
    folderId: string,
    storyId: string
  ): Promise<void> => {
    const res = await fetch(
      `${BASE}/workspace/folders/${folderId}/user-stories/${storyId}`,
      { method: "DELETE" }
    );
    await requireOk(res, "Excluir user story do workspace");
  },

  updateWorkspaceSpec: async (
    folderId: string,
    storyId: string,
    spec: Spec
  ): Promise<Spec> => {
    const res = await fetch(
      `${BASE}/workspace/folders/${folderId}/user-stories/${storyId}/specs/${spec.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
      }
    );
    await requireOk(res, "Atualizar spec do workspace");
    const body = await readWorkflowJson(
      res,
      "Atualizar spec do workspace",
      WorkspaceSpecResponseSchema
    );
    return body.spec;
  },

  startProjectConstruction: async (input: {
    workspaceFolderId: string;
    projectName?: string;
    userStoryIds: string[];
    specIds: string[];
    llmSettingsRef?: LlmSettingsReference;
  }): Promise<StartProjectConstructionResponse> => {
    const res = await fetch(`${BASE}/project-construction/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await requireOk(res, "Iniciar construção do projeto");
    return res.json() as Promise<StartProjectConstructionResponse>;
  },

  listLlmProviders: async (): Promise<{ providers: LlmProviderCapability[] }> => {
    const res = await fetch(`${BASE}/llm/providers`, { cache: "no-store" });
    await requireOk(res, "Listar providers LLM");
    return res.json() as Promise<{ providers: LlmProviderCapability[] }>;
  },

  getLlmSettings: async (): Promise<LlmSettingsProfile | null> => {
    const res = await fetch(`${BASE}/llm/settings`, { cache: "no-store" });
    await requireOk(res, "Consultar provider LLM");
    const body = (await res.json()) as { profile: LlmSettingsProfile | null };
    return body.profile;
  },

  saveLlmSettings: async (
    settings: LlmSettingsDraft & {
      validationStatus?: "untested" | "valid" | "invalid";
      validationMessage?: string;
      validatedAt?: string;
    }
  ): Promise<LlmSettingsProfile> => {
    const res = await fetch(`${BASE}/llm/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    await requireOk(res, "Salvar provider LLM");
    const body = (await res.json()) as { profile: LlmSettingsProfile };
    return body.profile;
  },

  testLlmSettings: async (
    settings: LlmSettingsDraft
  ): Promise<{ ok: boolean; message: string; testedAt: string }> => {
    const res = await fetch(`${BASE}/llm/settings/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    await requireOk(res, "Testar provider LLM");
    return res.json() as Promise<{ ok: boolean; message: string; testedAt: string }>;
  },

  deleteLlmSettings: async (profileId: string): Promise<void> => {
    const res = await fetch(`${BASE}/llm/settings/${profileId}`, {
      method: "DELETE",
    });
    await requireOk(res, "Remover provider LLM");
  },
} as const;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
