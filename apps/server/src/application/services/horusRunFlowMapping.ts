import type {
  AgentName,
  AgentResult,
  AgentRunActorKind,
  AgentRunLoopEventType,
  AgentRunPhase,
  AgentProfile,
  AgentProfileId,
  HorusAgentExecutionSnapshot,
  HorusRunEventSnapshot,
  HorusWorkflowNodeId,
  WorkflowEvent,
  WorkflowState,
} from "@u-build/shared";
import { defaultAgentProfileRegistry } from "./AgentProfileRegistry.js";

export const HORUS_NODE_BY_AGENT: Record<AgentName, HorusWorkflowNodeId> = {
  spec: "specAgent",
  odin: "odinAgent",
  front: "frontAgent",
  qa: "qaAgent",
  curator: "curatorAgent",
};

export const HORUS_NODE_LABELS: Record<HorusWorkflowNodeId, string> = {
  specAgent: "Spec Agent",
  hitlCheckpoint: "Human review",
  odinAgent: "Odin router",
  frontAgent: "Front Agent",
  qaAgent: "QA Agent",
  curatorAgent: "Curator Agent",
  retryCheckpoint: "Retry approval",
  finalize: "Finalizado",
  fail: "Falha",
};

export function mapWorkflowEvent(
  event: WorkflowEvent,
  sequence: number
): HorusRunEventSnapshot {
  const agentName = "agentName" in event ? event.agentName : undefined;
  const profileAgentName = agentName ?? profileAgentForEvent(event);
  const nodeId = agentName ? HORUS_NODE_BY_AGENT[agentName] : nodeFromEventType(event);
  const summary = summaryForEvent(event);
  const loop = loopMetadataForEvent(event);
  return {
    id: `${event.threadId}:${sequence}:${event.type}`,
    threadId: event.threadId,
    sequence,
    type: event.type,
    phase: loop.phase,
    eventType: loop.eventType,
    actorKind: loop.actorKind,
    actorName: loop.actorName,
    ...(nodeId ? { nodeId } : {}),
    ...(agentName ? { agentName } : {}),
    ...(profileAgentName ? agentProfileFields(profileAgentName) : {}),
    ...("userStoryId" in event ? { userStoryId: event.userStoryId } : {}),
    ...("retryCount" in event ? { attempt: event.retryCount } : {}),
    title: titleForEvent(event),
    ...(summary ? { summary } : {}),
    ...(event.type === "validation_evidence" ? { evidence: event.evidence } : {}),
    ...("changeSetId" in event
      ? { metadata: { changeSetId: event.changeSetId } }
      : {}),
    ...("filePaths" in event ? { filePaths: event.filePaths } : {}),
    ...(event.type === "validation_evidence"
      ? {
          commandIds: event.evidence.commands.map((command) => command.commandId),
          validationGateId: event.evidence.id,
        }
      : {}),
    ...(event.type === "error" ? { errorMessage: event.message } : {}),
    timestamp: event.timestamp,
  };
}

function profileAgentForEvent(event: WorkflowEvent): AgentName | undefined {
  if (event.type === "patch_proposed") return "front";
  if (event.type === "patch_applied") return "curator";
  if (event.type === "validation_evidence") return "qa";
  if (event.type === "retry_started") return "odin";
  return undefined;
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

function nodeFromEventType(event: WorkflowEvent): HorusWorkflowNodeId | undefined {
  if (event.type === "awaiting_approval") return "hitlCheckpoint";
  if (event.type === "validation_evidence") return "qaAgent";
  if (event.type === "patch_proposed") return "frontAgent";
  if (event.type === "patch_applied") return "curatorAgent";
  if (event.type === "awaiting_retry_approval") return "retryCheckpoint";
  if (event.type === "retry_started") return "odinAgent";
  if (event.type === "error") return "fail";
  if (event.type === "status_changed") {
    if (event.status === "completed") return "finalize";
    if (event.status === "cancelled" || event.status === "error") return "fail";
  }
  return undefined;
}

function titleForEvent(event: WorkflowEvent): string {
  switch (event.type) {
    case "node_started":
      return `${agentLabel(event.agentName)} iniciou`;
    case "node_completed":
      return `${agentLabel(event.agentName)} concluiu`;
    case "patch_proposed":
      return "Patch proposto";
    case "patch_applied":
      return "Patch aplicado";
    case "validation_evidence":
      return "Evidência de validação registrada";
    case "awaiting_approval":
      return "Aguardando aprovação da spec";
    case "retry_started":
      return `Retry ${event.retryCount} iniciado`;
    case "awaiting_retry_approval":
      return "Aguardando aprovação de retry";
    case "status_changed":
      return `Status alterado para ${event.status}`;
    case "error":
      return "Erro na execução";
  }
}

function summaryForEvent(event: WorkflowEvent): string | undefined {
  if (event.type === "error") return event.message;
  if (event.type === "patch_proposed") {
    return `${event.filePaths.length} arquivo(s) no CodeChangeSet ${event.changeSetId.slice(0, 8)}.`;
  }
  if (event.type === "patch_applied") {
    return `${event.filePaths.length} arquivo(s) aplicado(s) do CodeChangeSet ${event.changeSetId.slice(0, 8)}.`;
  }
  if (event.type === "retry_started") return event.notes;
  if (event.type === "awaiting_retry_approval") return event.notes;
  if (event.type === "validation_evidence") {
    const failedCommands = event.evidence.commands.filter(
      (command) => command.exitCode !== 0
    ).length;
    return `Status: ${event.evidence.status}; comandos: ${event.evidence.commands.length}; falhas: ${failedCommands}; preview: ${event.evidence.preview.status}`;
  }
  if (event.type === "node_completed") return `Status: ${event.status}`;
  return undefined;
}

function loopMetadataForEvent(event: WorkflowEvent): {
  phase: AgentRunPhase;
  eventType: AgentRunLoopEventType;
  actorKind: AgentRunActorKind;
  actorName: string;
} {
  switch (event.type) {
    case "status_changed":
      if (event.status === "running") {
        return {
          phase: "received",
          eventType: "received",
          actorKind: "system",
          actorName: "Horus",
        };
      }
      if (event.status === "completed") {
        return {
          phase: "completed",
          eventType: "completed",
          actorKind: "system",
          actorName: "Horus",
        };
      }
      if (event.status === "cancelled") {
        return {
          phase: "cancelled",
          eventType: "cancelled",
          actorKind: "system",
          actorName: "Horus",
        };
      }
      return {
        phase: "failed",
        eventType: "failed",
        actorKind: "system",
        actorName: "Horus",
      };
    case "node_started":
      return {
        phase: phaseForAgent(event.agentName, "started"),
        eventType: event.agentName === "qa" ? "validation_started" : event.agentName === "curator" ? "review_started" : event.agentName === "front" ? "context_read" : "planning",
        actorKind: "agent",
        actorName: agentLabel(event.agentName),
      };
    case "node_completed":
      return {
        phase: phaseForAgent(event.agentName, "completed"),
        eventType: event.status === "error" ? "failed" : completedEventTypeForAgent(event.agentName),
        actorKind: "agent",
        actorName: agentLabel(event.agentName),
      };
    case "patch_proposed":
      return {
        phase: "patching",
        eventType: "patch_proposed",
        actorKind: "agent",
        actorName: "Front Agent",
      };
    case "patch_applied":
      return {
        phase: "applying",
        eventType: "patch_applied",
        actorKind: "tool",
        actorName: "CodeChangeSetApplier",
      };
    case "validation_evidence": {
      const hasFailure =
        event.evidence.status === "failed" ||
        event.evidence.commands.some((command) => command.exitCode !== 0) ||
        event.evidence.preview.status === "failed";
      return {
        phase: "validating",
        eventType: hasFailure ? "validation_failed" : "validation_passed",
        actorKind: "tool",
        actorName: "Runtime validation",
      };
    }
    case "awaiting_approval":
      return {
        phase: "planning",
        eventType: "awaiting_approval",
        actorKind: "human",
        actorName: "Human review",
      };
    case "retry_started":
      return {
        phase: "retrying",
        eventType: "retry_started",
        actorKind: "agent",
        actorName: "Odin",
      };
    case "awaiting_retry_approval":
      return {
        phase: "retrying",
        eventType: "awaiting_approval",
        actorKind: "human",
        actorName: "Retry approval",
      };
    case "error":
      return {
        phase: "failed",
        eventType: "failed",
        actorKind: "system",
        actorName: "Horus",
      };
  }
}

function phaseForAgent(
  agentName: AgentName,
  moment: "started" | "completed"
): AgentRunPhase {
  if (agentName === "spec" || agentName === "odin") return "planning";
  if (agentName === "front") return moment === "started" ? "context_reading" : "patching";
  if (agentName === "qa") return "validating";
  if (agentName === "curator") return "reviewing";
  return "understanding";
}

function completedEventTypeForAgent(agentName: AgentName): AgentRunLoopEventType {
  if (agentName === "front") return "patch_proposed";
  if (agentName === "qa") return "validation_passed";
  if (agentName === "curator") return "review_passed";
  if (agentName === "spec" || agentName === "odin") return "planning";
  return "completed";
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
