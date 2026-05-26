import type {
  UserStory,
  HumanFeedback,
  WorkflowState,
  LlmSettings,
} from "@u-build/shared";

const BASE = "/api";

async function requireOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;

  const body = await res.text().catch(() => "");
  const detail = body.trim() || res.statusText || "sem detalhe retornado";
  throw new Error(`${action} falhou (${res.status}): ${detail}`);
}

export interface StartWorkflowResponse {
  threadId: string;
}

export const workflowApi = {
  start: async (
    userStories: UserStory[],
    llmSettings?: LlmSettings
  ): Promise<StartWorkflowResponse> => {
    const res = await fetch(`${BASE}/workflow/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userStories,
        ...(llmSettings ? { llmSettings } : {}),
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
} as const;
