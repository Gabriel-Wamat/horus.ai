import type { UserStory, HumanFeedback, WorkflowState } from "@u-build/shared";

const BASE = "/api";

export interface StartWorkflowResponse {
  threadId: string;
}

export const workflowApi = {
  start: async (userStories: UserStory[]): Promise<StartWorkflowResponse> => {
    const res = await fetch(`${BASE}/workflow/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userStories }),
    });
    if (!res.ok) throw new Error(`Start failed: ${res.statusText}`);
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
    if (!res.ok) throw new Error(`Resume failed: ${res.statusText}`);
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
    if (!res.ok) throw new Error(`Retry decision failed: ${res.statusText}`);
  },

  getStatus: async (threadId: string): Promise<WorkflowState | null> => {
    const res = await fetch(`${BASE}/workflow/status/${threadId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Status failed: ${res.statusText}`);
    return res.json() as Promise<WorkflowState>;
  },
} as const;