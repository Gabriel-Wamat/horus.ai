import type {
  HorusRunEventSnapshot,
  HorusRunLocator,
  HorusRunSnapshot,
} from "../types/api.types.js";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const agentFlowApi = {
  listRuns: () => apiRequest<HorusRunLocator[]>("/api/agent-runs"),
  getRun: (threadId: string) =>
    apiRequest<HorusRunSnapshot>(`/api/agent-runs/${threadId}`),
  listEvents: (threadId: string) =>
    apiRequest<HorusRunEventSnapshot[]>(`/api/agent-runs/${threadId}/events`),
  streamRunEvents(
    threadId: string,
    sinceSequence: number,
    onEvent: (event: HorusRunEventSnapshot) => void
  ) {
    const params = new URLSearchParams();
    params.set("since_sequence", String(sinceSequence));
    const source = new EventSource(
      `/api/agent-runs/${threadId}/events/stream?${params.toString()}`
    );
    const parse = (event: MessageEvent<string>) => {
      onEvent(JSON.parse(event.data) as HorusRunEventSnapshot);
    };
    const eventTypes = [
      "node_started",
      "node_completed",
      "patch_proposed",
      "patch_applied",
      "validation_evidence",
      "awaiting_approval",
      "retry_started",
      "awaiting_retry_approval",
      "status_changed",
      "tool_call_started",
      "tool_call_finished",
      "tool_call_blocked",
      "error",
    ];
    for (const type of eventTypes) {
      source.addEventListener(type, parse as EventListener);
    }
    return {
      close() {
        for (const type of eventTypes) {
          source.removeEventListener(type, parse as EventListener);
        }
        source.close();
      },
    };
  },
};
