import { z } from "zod";
import {
  AgentDebugTraceEntrySchema,
  AgentFileOperationTelemetrySchema,
  HorusRunEventSnapshotSchema,
  HorusRunLocatorSchema,
  HorusRunSnapshotSchema,
} from "@u-build/shared";
import type {
  AgentFileOperationTelemetry,
  HorusRunEventSnapshot,
  HorusRunLocator,
  HorusRunSnapshot,
} from "../types/api.types.js";

const HorusRunLocatorListSchema = z.array(HorusRunLocatorSchema);
const HorusRunEventSnapshotListSchema = z.array(HorusRunEventSnapshotSchema);
const AgentFileOperationResponseSchema = z.object({
  threadId: z.string().uuid(),
  operations: z.array(AgentFileOperationTelemetrySchema),
});
const AgentDebugTraceResponseSchema = z.object({
  entries: z.array(AgentDebugTraceEntrySchema),
  filter: z.record(z.string(), z.unknown()),
  generatedAt: z.string().datetime(),
});

interface ApiContract<T> {
  parse(input: unknown): T;
}

async function apiRequest<T>(
  path: string,
  contract: ApiContract<T>,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await readApiErrorDetail(response));
  }
  return parseApiContract(path, contract, await readJsonResponse(response, path));
}

export const agentFlowApi = {
  listRuns: (options: {
    projectId?: string | null;
    limit?: number;
    offset?: number;
    query?: string;
  } = {}) =>
    apiRequest(buildRunsPath(options), HorusRunLocatorListSchema),
  async listRunsWithProjectFallback(options: {
    projectId?: string | null;
    limit?: number;
    offset?: number;
    query?: string;
  } = {}) {
    const scoped = await apiRequest(
      buildRunsPath(options),
      HorusRunLocatorListSchema
    );
    if (!options.projectId || scoped.length > 0) return scoped;
    const fallbackOptions = {
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
      ...(options.offset !== undefined ? { offset: options.offset } : {}),
      ...(options.query ? { query: options.query } : {}),
    };
    return apiRequest(buildRunsPath(fallbackOptions), HorusRunLocatorListSchema);
  },
  getRun: (threadId: string) =>
    apiRequest(`/api/agent-runs/${threadId}`, HorusRunSnapshotSchema),
  listEvents: (threadId: string) =>
    apiRequest(
      `/api/agent-runs/${threadId}/events`,
      HorusRunEventSnapshotListSchema
    ),
  listFileOperations: (threadId: string) =>
    apiRequest(
      `/api/agent-runs/${threadId}/file-operations`,
      AgentFileOperationResponseSchema
    ),
  streamRunEvents(
    threadId: string,
    sinceSequence: number,
    onEvent: (event: HorusRunEventSnapshot) => void,
    options: StreamOptions = {}
  ) {
    const params = new URLSearchParams();
    params.set("since_sequence", String(sinceSequence));
    const source = new EventSource(
      `/api/agent-runs/${threadId}/events/stream?${params.toString()}`
    );
    const parse = (event: MessageEvent<string>) => {
      const parsed = parseRunEventPayload(event.data);
      if (parsed.kind === "event") {
        options.onError?.(null);
        onEvent(parsed.event);
        return;
      }
      if (parsed.kind === "error") options.onError?.(parsed.message);
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
      "command_output",
      "error",
    ];
    for (const type of eventTypes) {
      source.addEventListener(type, parse as EventListener);
    }
    source.onerror = () => {
      options.onError?.("Agent run event stream disconnected.");
    };
    return {
      close() {
        for (const type of eventTypes) {
          source.removeEventListener(type, parse as EventListener);
        }
        source.close();
      },
    };
  },
  streamFileOperations(
    threadId: string,
    sinceSequence: number,
    onOperation: (operation: AgentFileOperationTelemetry) => void,
    options: StreamOptions = {}
  ) {
    const params = new URLSearchParams();
    params.set("since_sequence", String(sinceSequence));
    const source = new EventSource(
      `/api/agent-runs/${threadId}/file-operations/stream?${params.toString()}`
    );
    const parse = (event: MessageEvent<string>) => {
      const parsed = parseFileOperationPayload(event.data);
      if (parsed.kind === "event") {
        options.onError?.(null);
        onOperation(parsed.operation);
        return;
      }
      if (parsed.kind === "error") options.onError?.(parsed.message);
    };
    source.addEventListener("file_operation", parse as EventListener);
    source.onerror = () => {
      options.onError?.("Agent file-operation stream disconnected.");
    };
    return {
      close() {
        source.removeEventListener("file_operation", parse as EventListener);
        source.close();
      },
    };
  },
  listAgentDebugTraces: (filter: {
    projectId?: string | null;
    workflowThreadId?: string | null;
    userStoryId?: string | null;
    agentName?: string | null;
    limit?: number;
  } = {}) => {
    const params = new URLSearchParams();
    if (filter.projectId) params.set("project_id", filter.projectId);
    if (filter.workflowThreadId)
      params.set("thread_id", filter.workflowThreadId);
    if (filter.userStoryId) params.set("user_story_id", filter.userStoryId);
    if (filter.agentName) params.set("agent_name", filter.agentName);
    if (filter.limit !== undefined) params.set("limit", String(filter.limit));
    const qs = params.toString();
    return apiRequest(
      `/api/agent-debug-traces${qs ? `?${qs}` : ""}`,
      AgentDebugTraceResponseSchema
    );
  },
};

interface StreamOptions {
  onError?: (message: string | null) => void;
}

export interface AgentDebugTraceEntryView {
  id: string;
  projectId: string | null;
  workflowThreadId: string | null;
  userStoryId: string | null;
  agentName: string | null;
  agentProfileId: string | null;
  turn: number;
  contextSnapshotHash: string | null;
  contextSummary: {
    stack: string | null;
    runtimeHintCount: number;
    editableRootCount: number;
    protectedPathCount: number;
    requiredValidationKinds: string[];
  };
  hypothesis: string | null;
  action: string;
  outcome: "success" | "failure" | "skipped" | "blocked" | "pending";
  durationMs: number;
  notes: string[];
  filesRead: string[];
  filesWritten: string[];
  createdAt: string;
}

export interface AgentDebugTraceResponse {
  entries: AgentDebugTraceEntryView[];
  filter: Record<string, unknown>;
  generatedAt: string;
}

function buildRunsPath(options: {
  projectId?: string | null;
  limit?: number;
  offset?: number;
  query?: string;
}): string {
  const params = new URLSearchParams();
  if (options.projectId) params.set("project_id", options.projectId);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  if (options.query) params.set("q", options.query);
  const query = params.toString();
  return `/api/agent-runs${query ? `?${query}` : ""}`;
}

async function readApiErrorDetail(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;
    const detail = body?.message ?? body?.error ?? response.statusText;
    return `Request failed with status ${response.status}: ${detail}`;
  }
  const body = await response.text().catch(() => "");
  const detail = body.trim() || response.statusText || "sem detalhe retornado";
  return `Request failed with status ${response.status}: ${detail}`;
}

async function readJsonResponse(response: Response, path: string): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Invalid API response contract for ${path}: expected application/json, got ${
        contentType || "missing content-type"
      }.`
    );
  }
  try {
    return await response.json();
  } catch (err) {
    throw new Error(
      `Invalid API response JSON for ${path}: ${errorMessage(err)}`
    );
  }
}

function parseApiContract<T>(
  path: string,
  contract: ApiContract<T>,
  payload: unknown
): T {
  try {
    return contract.parse(payload);
  } catch (err) {
    throw new Error(
      `Invalid API response payload for ${path}: ${errorMessage(err)}`
    );
  }
}

type ParseRunEventResult =
  | { kind: "event"; event: HorusRunEventSnapshot }
  | { kind: "ignore" }
  | { kind: "error"; message: string };

type ParseFileOperationResult =
  | { kind: "event"; operation: AgentFileOperationTelemetry }
  | { kind: "ignore" }
  | { kind: "error"; message: string };

function parseRunEventPayload(data: string): ParseRunEventResult {
  if (!data || data === "undefined") return { kind: "ignore" };
  try {
    const parsed = JSON.parse(data) as Partial<HorusRunEventSnapshot>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.id !== "string" ||
      typeof parsed.threadId !== "string" ||
      typeof parsed.sequence !== "number" ||
      typeof parsed.type !== "string"
    ) {
      return { kind: "error", message: "Invalid agent run event payload contract." };
    }
    return { kind: "event", event: parsed as HorusRunEventSnapshot };
  } catch (err) {
    return {
      kind: "error",
      message: `Invalid agent run event JSON: ${errorMessage(err)}`,
    };
  }
}

function parseFileOperationPayload(data: string): ParseFileOperationResult {
  if (!data || data === "undefined") return { kind: "ignore" };
  try {
    const parsed = JSON.parse(data) as Partial<AgentFileOperationTelemetry>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.id !== "string" ||
      typeof parsed.threadId !== "string" ||
      typeof parsed.sequence !== "number" ||
      typeof parsed.path !== "string" ||
      typeof parsed.operationType !== "string" ||
      typeof parsed.status !== "string"
    ) {
      return { kind: "error", message: "Invalid agent file-operation payload contract." };
    }
    return { kind: "event", operation: parsed as AgentFileOperationTelemetry };
  } catch (err) {
    return {
      kind: "error",
      message: `Invalid agent file-operation JSON: ${errorMessage(err)}`,
    };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
