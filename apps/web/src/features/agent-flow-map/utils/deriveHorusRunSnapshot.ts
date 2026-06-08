import type {
  AgentName,
  AgentResult,
  AgentRunPhase,
  WorkflowEvent,
  WorkflowState,
  WorkflowStatus,
} from "@u-build/shared";
import {
  HORUS_NODE_LABELS as NODE_LABELS,
  mapWorkflowEventToHorusRunEvent,
} from "@u-build/shared";
import type {
  HorusAgentExecutionSnapshot,
  HorusRunEventSnapshot,
  HorusRunSnapshot,
  HorusWorkflowNodeId,
  HorusWorkflowStepSnapshot,
} from "../types/api.types.js";
import { HORUS_NODE_BY_AGENT } from "./nodeMetadata.js";

export function deriveHorusRunSnapshot(
  state: WorkflowState | null,
  events: WorkflowEvent[]
): HorusRunSnapshot | null {
  if (!state) return null;

  const normalizedEvents = events.map((event, index) =>
    mapWorkflowEventToHorusRunEvent(event, index + 1)
  );
  const agentExecutions = deriveAgentExecutions(state);
  const currentStory = state.userStories[state.currentUSIndex] ?? null;
  const currentNode = resolveCurrentNode(state, normalizedEvents, agentExecutions);

  return {
    threadId: state.threadId,
    ...(state.workspaceFolderId ? { workspaceFolderId: state.workspaceFolderId } : {}),
    workflowMode: state.workflowMode,
    status: state.status,
    currentPhase: normalizedEvents.at(-1)?.phase ?? phaseFromStatus(state.status),
    currentNode,
    currentUserStoryId: currentStory?.id ?? null,
    currentUserStoryTitle: currentStory?.title ?? null,
    startedAt: state.startedAt,
    ...(state.completedAt ? { completedAt: state.completedAt } : {}),
    ...(state.errorMessage ? { errorMessage: state.errorMessage } : {}),
    userStories: state.userStories.map((story, index) => ({
      id: story.id,
      title: story.title,
      index,
      hasSpec: Boolean(state.specs[story.id]),
    })),
    steps: deriveSteps(state, agentExecutions, normalizedEvents),
    agentExecutions,
    events: normalizedEvents,
    evidenceSummaries: [],
    operationTimeline: [],
    runbookEntries: [],
    validationSummary: {
      finalStatus: state.status === "completed" ? "completed" : "completed_unverified",
      gates: state.validationGates ?? [],
      passedCount: (state.validationGates ?? []).filter((gate) => gate.status === "passed").length,
      failedCount: (state.validationGates ?? []).filter((gate) => gate.status === "failed").length,
      skippedCount: (state.validationGates ?? []).filter((gate) => gate.status === "skipped").length,
      blockedCount: (state.validationGates ?? []).filter((gate) => gate.status === "blocked").length,
      message: "Local snapshot derived without backend validation aggregation.",
    },
    sourceState: state,
  };
}

function phaseFromStatus(status: WorkflowStatus): AgentRunPhase {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "error") return "failed";
  return status === "running" ? "received" : "planning";
}

function deriveAgentExecutions(state: WorkflowState): HorusAgentExecutionSnapshot[] {
  const executions: HorusAgentExecutionSnapshot[] = [];
  let sequence = 1;
  for (const [userStoryId, results] of Object.entries(state.agentResults)) {
    for (const result of results) {
      const agentName = result.agentName as AgentName;
      const nodeId = HORUS_NODE_BY_AGENT[agentName];
      if (!nodeId) continue;
      executions.push({
        id: `${userStoryId}:${agentName}:${sequence}`,
        sequence,
        userStoryId,
        agentName,
        nodeId,
        status: result.status,
        ...("executionTimeMs" in result ? { executionTimeMs: result.executionTimeMs } : {}),
        completedAt: result.completedAt,
        summary: summarizeAgentResult(result),
        errorMessage: result.status === "error" ? result.errorMessage : null,
        outputPreview: "output" in result ? shrinkOutput(result.output) : null,
      });
      sequence += 1;
    }
  }
  return executions.sort((a, b) => {
    const left = a.completedAt ?? "";
    const right = b.completedAt ?? "";
    return left.localeCompare(right) || a.sequence - b.sequence;
  });
}

function deriveSteps(
  state: WorkflowState,
  executions: HorusAgentExecutionSnapshot[],
  events: HorusRunEventSnapshot[]
): HorusWorkflowStepSnapshot[] {
  const observed = new Map<HorusWorkflowNodeId, HorusWorkflowStepSnapshot>();
  for (const execution of executions) {
    observed.set(execution.nodeId, {
      id: `step:${execution.nodeId}`,
      nodeId: execution.nodeId,
      label: NODE_LABELS[execution.nodeId],
      status: execution.status,
      userStoryId: execution.userStoryId,
      latency_ms: execution.executionTimeMs ?? null,
      error_message: execution.errorMessage ?? null,
      created_at: execution.completedAt ?? state.startedAt,
    });
  }

  for (const event of events) {
    if (!event.nodeId || observed.has(event.nodeId)) continue;
    observed.set(event.nodeId, {
      id: `event-step:${event.sequence}:${event.nodeId}`,
      nodeId: event.nodeId,
      label: NODE_LABELS[event.nodeId],
      status: event.type === "error" ? "error" : state.status,
      userStoryId: event.userStoryId ?? null,
      created_at: event.timestamp,
    });
  }

  if (state.status === "completed") {
    observed.set("finalize", {
      id: "step:finalize",
      nodeId: "finalize",
      label: NODE_LABELS.finalize,
      status: "completed",
      created_at: state.completedAt ?? new Date().toISOString(),
    });
  }

  if (state.status === "error" || state.status === "cancelled") {
    observed.set("fail", {
      id: "step:fail",
      nodeId: "fail",
      label: NODE_LABELS.fail,
      status: state.status,
      ...(state.errorMessage ? { error_message: state.errorMessage } : {}),
      created_at: state.completedAt ?? new Date().toISOString(),
    });
  }

  return [...observed.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function resolveCurrentNode(
  state: WorkflowState,
  events: HorusRunEventSnapshot[],
  executions: HorusAgentExecutionSnapshot[]
): HorusWorkflowNodeId | null {
  if (state.status === "idle") return null;
  if (state.status === "completed") return "finalize";
  if (state.status === "error" || state.status === "cancelled") return "fail";
  const latestEventNode = [...events].reverse().find((event) => event.nodeId)?.nodeId;
  if (latestEventNode) return latestEventNode;
  const latestExecution = executions.at(-1);
  if (state.status === "awaiting_human") return latestExecution?.nodeId === "curatorAgent" ? "retryCheckpoint" : "hitlCheckpoint";
  if (latestExecution?.nodeId === "specAgent") return "hitlCheckpoint";
  if (latestExecution?.nodeId === "frontAgent" || latestExecution?.nodeId === "qaAgent") return "curatorAgent";
  return latestExecution?.nodeId ?? "specAgent";
}

function summarizeAgentResult(result: AgentResult): string {
  if (result.status === "error") return result.errorMessage;
  if (result.status === "skipped") return result.reason;
  if (result.agentName === "odin" && Array.isArray(result.output["routing"])) {
    return `Roteamento: ${(result.output["routing"] as string[]).join(", ")}`;
  }
  if (result.agentName === "spec") return `Spec gerada: ${String(result.output["specId"] ?? "")}`;
  if (result.agentName === "front") return "HTML/interface gerada para a história.";
  if (result.agentName === "qa") return "Casos de teste e validações gerados.";
  if (result.agentName === "curator") {
    const visualGate = result.output["visualGate"];
    if (visualGate && typeof visualGate === "object") {
      const record = visualGate as Record<string, unknown>;
      return `Visual: ${String(record["status"] ?? "n/a")} · Score: ${String(record["score"] ?? "n/a")}`;
    }
    return `Score: ${String(result.output["score"] ?? "n/a")}`;
  }
  return "Execução registrada.";
}

function shrinkOutput(output: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(output).slice(0, 6);
  return Object.fromEntries(entries.map(([key, value]) => [key, normalizePreviewValue(value)]));
}

function normalizePreviewValue(value: unknown): unknown {
  if (typeof value === "string") return value.length > 180 ? `${value.slice(0, 180)}...` : value;
  if (Array.isArray(value)) return { count: value.length };
  if (value && typeof value === "object") return { type: "object" };
  return value;
}

function agentLabel(agentName: AgentName): string {
  const labels: Record<AgentName, string> = {
    spec: "Spec Agent",
    odin: "Odin",
    front: "Front Agent",
    qa: "QA Agent",
    curator: "Curator",
  };
  return labels[agentName];
}
