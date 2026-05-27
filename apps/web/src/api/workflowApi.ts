import type {
  UserStory,
  Spec,
  HumanFeedback,
  WorkflowState,
  LlmSettings,
  WorkspaceFolder,
  ProjectConstructionRun,
  ProjectWorkspace,
  FrontendProject,
} from "@u-build/shared";

const BASE = "/api";

export interface WorkspaceStoryArtifactsResponse {
  userStories: UserStory[];
  specsByStoryId: Record<string, Spec>;
}

async function requireOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;

  const body = await res.text().catch(() => "");
  const detail = body.trim() || res.statusText || "sem detalhe retornado";
  throw new Error(`${action} falhou (${res.status}): ${detail}`);
}

export interface StartWorkflowResponse {
  threadId: string;
}

export interface StartProjectConstructionResponse {
  projectWorkspace: ProjectWorkspace;
  constructionRun: ProjectConstructionRun;
  frontendProject: FrontendProject | null;
  reusedProjectWorkspace?: boolean;
}

export const workflowApi = {
  start: async (
    userStories: UserStory[],
    workspaceFolderId: string,
    workflowMode: "standard" | "spec_generation" = "standard",
    llmSettings?: LlmSettings,
    frontendProjectId?: string
  ): Promise<StartWorkflowResponse> => {
    const res = await fetch(`${BASE}/workflow/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceFolderId,
        userStories,
        workflowMode,
        ...(llmSettings ? { llmSettings } : {}),
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
    const body = (await res.json()) as { folders: WorkspaceFolder[] };
    return body.folders;
  },

  createWorkspaceFolder: async (name: string): Promise<WorkspaceFolder> => {
    const res = await fetch(`${BASE}/workspace/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await requireOk(res, "Criar pasta do workspace");
    const body = (await res.json()) as { folder: WorkspaceFolder };
    return body.folder;
  },

  listWorkspaceUserStories: async (folderId: string): Promise<UserStory[]> => {
    const res = await fetch(`${BASE}/workspace/folders/${folderId}/user-stories`, {
      cache: "no-store",
    });
    await requireOk(res, "Listar user stories do workspace");
    const body = (await res.json()) as { userStories: UserStory[] };
    return body.userStories;
  },

  listWorkspaceStoryArtifacts: async (
    folderId: string
  ): Promise<WorkspaceStoryArtifactsResponse> => {
    const res = await fetch(`${BASE}/workspace/folders/${folderId}/user-stories`, {
      cache: "no-store",
    });
    await requireOk(res, "Listar artefatos do workspace");
    const body = (await res.json()) as {
      userStories: UserStory[];
      artifacts?: Array<{
        story: UserStory;
        specs: Array<{ spec?: Spec }>;
      }>;
    };
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
    const body = (await res.json()) as { userStory: UserStory };
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
    const body = (await res.json()) as { spec: Spec };
    return body.spec;
  },

  startProjectConstruction: async (input: {
    workspaceFolderId: string;
    projectName?: string;
    userStoryIds: string[];
    specIds: string[];
  }): Promise<StartProjectConstructionResponse> => {
    const res = await fetch(`${BASE}/project-construction/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await requireOk(res, "Iniciar construção do projeto");
    return res.json() as Promise<StartProjectConstructionResponse>;
  },
} as const;
