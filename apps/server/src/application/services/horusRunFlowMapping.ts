import type {
  AgentName,
  AgentResult,
  AgentProfile,
  AgentProfileId,
  HorusAgentExecutionSnapshot,
  HorusRunEventSnapshot,
  HorusWorkflowNodeId,
  WorkflowEvent,
  WorkflowState,
} from "@u-build/shared";
import {
  HORUS_NODE_BY_AGENT as SHARED_HORUS_NODE_BY_AGENT,
  HORUS_NODE_LABELS as SHARED_HORUS_NODE_LABELS,
  mapWorkflowEventToHorusRunEvent,
} from "@u-build/shared";
import { defaultAgentProfileRegistry } from "./AgentProfileRegistry.js";

export const HORUS_NODE_BY_AGENT = SHARED_HORUS_NODE_BY_AGENT;
export const HORUS_NODE_LABELS = SHARED_HORUS_NODE_LABELS;

export function mapWorkflowEvent(
  event: WorkflowEvent,
  sequence: number
): HorusRunEventSnapshot {
  return mapWorkflowEventToHorusRunEvent(event, sequence, {
    resolveAgentProfile: agentProfileFields,
  });
}

export function deriveAgentExecutions(
  state: WorkflowState
): HorusAgentExecutionSnapshot[] {
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
        ...agentProfileFields(agentName),
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

function agentProfileFields(agentName: AgentName): {
  agentProfileId: AgentProfileId;
  agentProfile: AgentProfile;
} {
  const profile = defaultAgentProfileRegistry.getProfileForAgent(agentName);
  return {
    agentProfileId: profile.id,
    agentProfile: profile,
  };
}

export function resolveCurrentNode(
  state: WorkflowState,
  events: HorusRunEventSnapshot[],
  executions: HorusAgentExecutionSnapshot[]
): HorusWorkflowNodeId | null {
  if (state.status === "completed") return "finalize";
  if (state.status === "error" || state.status === "cancelled") return "fail";
  const latestEventNode = [...events].reverse().find((event) => event.nodeId)?.nodeId;
  if (latestEventNode) return latestEventNode;
  const latestExecution = executions.at(-1);
  if (state.status === "awaiting_human") {
    return latestExecution?.nodeId === "curatorAgent"
      ? "retryCheckpoint"
      : "hitlCheckpoint";
  }
  if (latestExecution?.nodeId === "specAgent") return "hitlCheckpoint";
  if (latestExecution?.nodeId === "frontAgent" || latestExecution?.nodeId === "qaAgent") {
    return "curatorAgent";
  }
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
  return Object.fromEntries(
    entries.map(([key, value]) => [key, normalizePreviewValue(value)])
  );
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
