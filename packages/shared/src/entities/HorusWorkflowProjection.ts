import type { AgentName, AgentProfile, AgentProfileId } from "./AgentResult.js";
import type {
  AgentFileOperationTelemetry,
  AgentFileOperationType,
  AgentRunActorKind,
  AgentRunLoopEventType,
  AgentRunPhase,
  HorusRunEventSnapshot,
  HorusWorkflowNodeId,
} from "./HorusRunFlow.js";
import { AgentFileOperationTelemetrySchema } from "./HorusRunFlow.js";
import type { WorkflowStatus } from "./WorkflowState.js";
import type { WorkflowEvent } from "../ports/IEventStream.js";

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

export interface WorkflowEventProjectionProfileFields {
  agentProfileId: AgentProfileId;
  agentProfile: AgentProfile;
}

export interface WorkflowEventProjectionOptions {
  resolveAgentProfile?: (
    agentName: AgentName
  ) => WorkflowEventProjectionProfileFields | undefined;
}

export function mapWorkflowEventToHorusRunEvent(
  event: WorkflowEvent,
  sequence: number,
  options: WorkflowEventProjectionOptions = {}
): HorusRunEventSnapshot {
  const agentName = "agentName" in event ? event.agentName : undefined;
  const profileAgentName = agentName ?? profileAgentForEvent(event);
  const profileFields = profileAgentName
    ? options.resolveAgentProfile?.(profileAgentName)
    : undefined;
  const nodeId = agentName
    ? HORUS_NODE_BY_AGENT[agentName]
    : resolveHorusWorkflowNodeFromEvent(event);
  const summary = summaryForWorkflowEvent(event);
  const loop = loopMetadataForWorkflowEvent(event);
  const userStoryId = "userStoryId" in event ? event.userStoryId : undefined;
  const retryCount = "retryCount" in event ? event.retryCount : undefined;
  const changeSetId = "changeSetId" in event ? event.changeSetId : undefined;
  const operationalSessionId =
    "operationalSessionId" in event ? event.operationalSessionId : undefined;
  const filePaths = "filePaths" in event ? event.filePaths : undefined;
  const commandIds = "commandIds" in event ? event.commandIds : undefined;
  const taskId = "taskId" in event ? event.taskId : undefined;
  const traceFields = traceFieldsForWorkflowEvent(event);
  const metadata = {
    ...(changeSetId ? { changeSetId } : {}),
    ...(operationalSessionId ? { operationalSessionId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(isToolWorkflowEvent(event) ? { toolName: event.toolName } : {}),
    ...(event.type === "context_receipt"
      ? {
          snapshotId: event.receipt.snapshotId,
          agentProfileId: event.receipt.agentProfileId,
          selectedFiles: event.receipt.selectedFiles.map((file) => file.path),
          retrievalChannels: event.receipt.retrievalChannels,
          confidence: event.receipt.confidence,
        }
      : {}),
    ...traceFields,
    ...(event.type === "command_output"
      ? {
          toolName: event.toolName,
          commandId: event.commandId,
          stream: event.stream,
          chunk: event.chunk,
          chunkSequence: event.chunkSequence,
        }
      : {}),
    ...(event.type === "command_approval_requested"
      ? {
          toolName: event.toolName,
          commandId: event.commandId,
          risk: event.risk,
          policyReason: event.policyReason,
          approvalReason: event.approvalReason,
        }
      : {}),
  };

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
    ...(profileFields ? profileFields : {}),
    ...(userStoryId ? { userStoryId } : {}),
    ...(retryCount !== undefined ? { attempt: retryCount } : {}),
    title: titleForWorkflowEvent(event),
    ...(summary ? { summary } : {}),
    ...(event.type === "validation_evidence" ? { evidence: event.evidence } : {}),
    ...(event.type === "context_receipt" ? { receipt: event.receipt } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...traceFields,
    ...(filePaths ? { filePaths } : {}),
    ...(event.type === "validation_evidence"
      ? {
          commandIds: event.evidence.commands.map((command) => command.commandId),
          validationGateId: event.evidence.id,
        }
      : {}),
    ...(commandIds?.length ? { commandIds } : {}),
    ...(taskId ? { taskId } : {}),
    ...(event.type === "command_output" ? { commandIds: [event.commandId] } : {}),
    ...(event.type === "command_approval_requested"
      ? { commandIds: [event.commandId] }
      : {}),
    ...(event.type === "command_output"
      ? {
          commandId: event.commandId,
          ...(event.taskId ? { taskId: event.taskId } : {}),
          stream: event.stream,
          chunk: event.chunk,
          chunkSequence: event.chunkSequence,
        }
      : {}),
    ...(event.type === "error" ? { errorMessage: event.message } : {}),
    timestamp: event.timestamp,
  };
}

function traceFieldsForWorkflowEvent(event: WorkflowEvent): {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string | null;
  toolCallId?: string | null;
  runId?: string | null;
  projectId?: string | null;
  agentId?: string | null;
  filePath?: string | null;
  diffId?: string | null;
} {
  if (
    event.type !== "tool_call_started" &&
    event.type !== "tool_call_finished" &&
    event.type !== "tool_call_blocked" &&
    event.type !== "command_output" &&
    event.type !== "command_approval_requested"
  ) {
    return {};
  }

  return {
    ...(event.traceId ? { traceId: event.traceId } : {}),
    ...(event.spanId ? { spanId: event.spanId } : {}),
    ...(event.parentSpanId !== undefined ? { parentSpanId: event.parentSpanId } : {}),
    ...(event.toolCallId !== undefined ? { toolCallId: event.toolCallId } : {}),
    ...(event.runId !== undefined ? { runId: event.runId } : {}),
    ...(event.projectId !== undefined ? { projectId: event.projectId } : {}),
    ...(event.agentId !== undefined ? { agentId: event.agentId } : {}),
    ...(event.filePath !== undefined ? { filePath: event.filePath } : {}),
    ...(event.diffId !== undefined ? { diffId: event.diffId } : {}),
  };
}

function isToolWorkflowEvent(
  event: WorkflowEvent
): event is Extract<
  WorkflowEvent,
  {
    type:
      | "tool_call_started"
      | "tool_call_finished"
      | "tool_call_blocked"
      | "command_approval_requested";
  }
> {
  return (
    event.type === "tool_call_started" ||
    event.type === "tool_call_finished" ||
    event.type === "tool_call_blocked" ||
    event.type === "command_approval_requested"
  );
}

export function mapWorkflowEventsToHorusRunEvents(
  events: WorkflowEvent[],
  options: WorkflowEventProjectionOptions = {}
): HorusRunEventSnapshot[] {
  return events.map((event, index) =>
    mapWorkflowEventToHorusRunEvent(event, index + 1, options)
  );
}

export function mapWorkflowEventToFileOperations(
  event: WorkflowEvent,
  workflowSequence: number,
  options: WorkflowEventProjectionOptions = {}
): AgentFileOperationTelemetry[] {
  const paths = "filePaths" in event ? event.filePaths : [];
  if (!paths?.length) return [];

  const runEvent = mapWorkflowEventToHorusRunEvent(event, workflowSequence, options);
  return paths.map((path, index) =>
    AgentFileOperationTelemetrySchema.parse({
      id: `${runEvent.id}:file:${index}:${encodeURIComponent(path)}`,
      threadId: event.threadId,
      sequence: workflowSequence,
      workflowSequence,
      operationalSequence: null,
      sourceEventId: runEvent.id,
      sourceOperationEventId: null,
      operationalSessionId: runEvent.metadata?.["operationalSessionId"] ?? null,
      runId: null,
      attemptId: null,
      userStoryId: runEvent.userStoryId ?? null,
      nodeId: runEvent.nodeId ?? null,
      agentName: runEvent.agentName ?? null,
      agentProfileId:
        runEvent.agentProfileId ??
        ("agentProfileId" in event ? event.agentProfileId : null),
      toolName: isToolWorkflowEvent(event) ? event.toolName : null,
      path,
      operationType: operationTypeForWorkflowEvent(event),
      status: fileOperationStatusForWorkflowEvent(event),
      changeType: changeTypeForWorkflowEvent(event),
      commandIds: runEvent.commandIds ?? [],
      errorMessage: runEvent.errorMessage ?? ("errorMessage" in event ? event.errorMessage : null),
      summary: runEvent.summary ?? null,
      timestamp: event.timestamp,
    })
  );
}

export function resolveHorusWorkflowNodeFromEvent(
  event: WorkflowEvent
): HorusWorkflowNodeId | undefined {
  if (event.type === "awaiting_approval") return "hitlCheckpoint";
  if (event.type === "validation_evidence") return "qaAgent";
  if (event.type === "context_receipt") return HORUS_NODE_BY_AGENT[event.receipt.agentName];
  if (event.type === "patch_proposed") return "frontAgent";
  if (event.type === "patch_applied") return "curatorAgent";
  if (
    event.type === "tool_call_started" ||
    event.type === "tool_call_finished" ||
    event.type === "tool_call_blocked" ||
    event.type === "command_output" ||
    event.type === "command_approval_requested"
  ) {
    return HORUS_NODE_BY_AGENT[event.agentName];
  }
  if (event.type === "awaiting_retry_approval") return "retryCheckpoint";
  if (event.type === "retry_started") return "odinAgent";
  if (event.type === "recovery_decision") {
    return event.decision.requiresHumanApproval ? "retryCheckpoint" : "odinAgent";
  }
  if (event.type === "fallback_executed") {
    if (event.status === "failed") return "fail";
    return "odinAgent";
  }
  if (event.type === "error") return "fail";
  if (event.type === "status_changed") {
    if (event.status === "completed") return "finalize";
    if (event.status === "cancelled" || event.status === "error") return "fail";
  }
  return undefined;
}

export function titleForWorkflowEvent(event: WorkflowEvent): string {
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
    case "context_receipt":
      return `Contexto usado por ${agentLabel(event.receipt.agentName)}`;
    case "tool_call_started":
      return `${toolLabel(event.toolName)} iniciado`;
    case "tool_call_finished":
      return `${toolLabel(event.toolName)} ${
        event.status === "succeeded" ? "concluído" : "falhou"
      }`;
    case "tool_call_blocked":
      return `${toolLabel(event.toolName)} bloqueado`;
    case "command_output":
      return `${event.commandId} ${event.stream}`;
    case "command_approval_requested":
      return `${event.commandId} aguarda aprovação`;
    case "awaiting_approval":
      return "Aguardando aprovação da spec";
    case "retry_started":
      return `Retry ${event.retryCount} iniciado`;
    case "awaiting_retry_approval":
      return "Aguardando aprovação de retry";
    case "recovery_decision":
      return "Decisão de recuperação registrada";
    case "fallback_executed":
      return "Fallback executado";
    case "status_changed":
      return `Status alterado para ${event.status}`;
    case "error":
      return "Erro na execução";
  }
}

export function summaryForWorkflowEvent(event: WorkflowEvent): string | undefined {
  if (event.type === "error") return event.message;
  if (event.type === "patch_proposed") {
    return `${event.filePaths.length} arquivo(s) no CodeChangeSet ${event.changeSetId.slice(0, 8)}.`;
  }
  if (event.type === "patch_applied") {
    return `${event.filePaths.length} arquivo(s) aplicado(s) do CodeChangeSet ${event.changeSetId.slice(0, 8)}.`;
  }
  if (event.type === "retry_started") return event.notes;
  if (event.type === "awaiting_retry_approval") return event.notes;
  if (event.type === "recovery_decision") {
    return event.decision.operatorMessage;
  }
  if (event.type === "fallback_executed") {
    return `${event.action}: ${event.message}`;
  }
  if (event.type === "validation_evidence") {
    const failedCommands = event.evidence.commands.filter(
      (command) => command.exitCode !== 0
    ).length;
    return `Status: ${event.evidence.status}; comandos: ${event.evidence.commands.length}; falhas: ${failedCommands}; preview: ${event.evidence.preview.status}`;
  }
  if (event.type === "context_receipt") {
    return `${event.receipt.selectedFiles.length} arquivo(s), ${event.receipt.retrievalChannels.length} canal(is), confiança ${Math.round(event.receipt.confidence * 100)}%.`;
  }
  if (event.type === "tool_call_started") {
    return event.summary ?? `${agentLabel(event.agentName)} iniciou ${event.toolName}.`;
  }
  if (event.type === "tool_call_finished") {
    if (event.summary) return event.summary;
    const files = event.filePaths?.length
      ? ` Arquivos: ${event.filePaths.join(", ")}.`
      : "";
    return `${event.toolName} ${event.status}.${files}`;
  }
  if (event.type === "tool_call_blocked") {
    return event.summary ?? event.errorMessage;
  }
  if (event.type === "command_output") {
    return event.chunk.trim() || `${event.stream} chunk ${event.chunkSequence}`;
  }
  if (event.type === "command_approval_requested") {
    return event.policyReason ?? event.approvalReason ?? "Command requires approval.";
  }
  if (event.type === "node_completed") return `Status: ${event.status}`;
  return undefined;
}

export function loopMetadataForWorkflowEvent(event: WorkflowEvent): {
  phase: AgentRunPhase;
  eventType: AgentRunLoopEventType;
  actorKind: AgentRunActorKind;
  actorName: string;
} {
  switch (event.type) {
    case "status_changed":
      return statusLoopMetadata(event.status);
    case "node_started":
      return {
        phase: phaseForAgent(event.agentName, "started"),
        eventType:
          event.agentName === "qa"
            ? "validation_started"
            : event.agentName === "curator"
              ? "review_started"
              : event.agentName === "front"
                ? "context_read"
                : "planning",
        actorKind: "agent",
        actorName: agentLabel(event.agentName),
      };
    case "node_completed":
      return {
        phase: phaseForAgent(event.agentName, "completed"),
        eventType:
          event.status === "error"
            ? "failed"
            : completedEventTypeForAgent(event.agentName),
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
    case "context_receipt":
      return {
        phase: "context_reading",
        eventType: "context_read",
        actorKind: "agent",
        actorName: agentLabel(event.receipt.agentName),
      };
    case "tool_call_started":
      return {
        phase: toolPhase(event.toolName),
        eventType: "tool_call_started",
        actorKind: "tool",
        actorName: toolLabel(event.toolName),
      };
    case "tool_call_finished":
      return {
        phase: event.status === "failed" ? "failed" : toolPhase(event.toolName),
        eventType: event.status === "failed" ? "failed" : "tool_call_finished",
        actorKind: "tool",
        actorName: toolLabel(event.toolName),
      };
    case "tool_call_blocked":
      return {
        phase: "failed",
        eventType: "tool_call_blocked",
        actorKind: "tool",
        actorName: toolLabel(event.toolName),
      };
    case "command_output":
      return {
        phase: "validating",
        eventType: "command_output",
        actorKind: "tool",
        actorName: toolLabel(event.toolName),
      };
    case "command_approval_requested":
      return {
        phase: "validating",
        eventType: "awaiting_approval",
        actorKind: "human",
        actorName: "Execution approval",
      };
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
    case "recovery_decision":
      return {
        phase: "retrying",
        eventType: "recovery_decision",
        actorKind: "system",
        actorName: "Recovery policy",
      };
    case "fallback_executed":
      return {
        phase: event.status === "failed" ? "failed" : "retrying",
        eventType: event.status === "failed" ? "failed" : "fallback_executed",
        actorKind: "system",
        actorName: "Recovery policy",
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

function profileAgentForEvent(event: WorkflowEvent): AgentName | undefined {
  if (event.type === "patch_proposed") return "front";
  if (event.type === "patch_applied") return "curator";
  if (event.type === "validation_evidence") return "qa";
  if (event.type === "context_receipt") return event.receipt.agentName;
  if (
    event.type === "tool_call_started" ||
    event.type === "tool_call_finished" ||
    event.type === "tool_call_blocked" ||
    event.type === "command_output" ||
    event.type === "command_approval_requested"
  ) {
    return event.agentName;
  }
  if (event.type === "retry_started") return "odin";
  return undefined;
}

function statusLoopMetadata(status: WorkflowStatus): {
  phase: AgentRunPhase;
  eventType: AgentRunLoopEventType;
  actorKind: AgentRunActorKind;
  actorName: string;
} {
  if (status === "running") {
    return {
      phase: "received",
      eventType: "received",
      actorKind: "system",
      actorName: "Horus",
    };
  }
  if (status === "completed") {
    return {
      phase: "completed",
      eventType: "completed",
      actorKind: "system",
      actorName: "Horus",
    };
  }
  if (status === "cancelled") {
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
}

function phaseForAgent(
  agentName: AgentName,
  moment: "started" | "completed"
): AgentRunPhase {
  if (agentName === "spec" || agentName === "odin") return "planning";
  if (agentName === "front") {
    return moment === "started" ? "context_reading" : "patching";
  }
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

function toolLabel(toolName: string): string {
  switch (toolName) {
    case "edit_file":
      return "Editar arquivo";
    case "write_file":
      return "Criar arquivo";
    case "save_file":
      return "Salvar arquivo";
    case "delete_file":
      return "Remover arquivo";
    case "propose_code_change_set":
      return "Registrar proposta";
    case "get_git_diff":
      return "Inspecionar diff";
    case "run_validation_command":
      return "Validar";
    case "run_command":
      return "Executar comando";
    default:
      return toolName;
  }
}

function toolPhase(toolName: string): AgentRunPhase {
  if (toolName === "run_validation_command") return "validating";
  if (toolName === "get_git_diff") return "reviewing";
  if (toolName === "propose_code_change_set") return "patching";
  return "patching";
}

function operationTypeForWorkflowEvent(event: WorkflowEvent): AgentFileOperationType {
  if (event.type === "patch_proposed") return "apply";
  if (event.type === "patch_applied") return "apply";
  if (event.type === "validation_evidence") return "validate";
  if (
    event.type !== "tool_call_started" &&
    event.type !== "tool_call_finished" &&
    event.type !== "tool_call_blocked"
  ) {
    return "unknown";
  }
  switch (event.toolName) {
    case "read_file":
    case "read_file_readonly":
      return "read";
    case "write_file":
      return "create";
    case "edit_file":
    case "replace_file_range":
    case "save_file":
      return "update";
    case "delete_file":
      return "delete";
    case "apply_code_change_set":
    case "propose_code_change_set":
      return "apply";
    case "run_command":
    case "run_validation_command":
      return "validate";
    case "get_git_diff":
      return "diff";
    default:
      return "unknown";
  }
}

function fileOperationStatusForWorkflowEvent(
  event: WorkflowEvent
): AgentFileOperationTelemetry["status"] {
  if (event.type === "patch_proposed") return "proposed";
  if (event.type === "patch_applied") return "applied";
  if (event.type === "validation_evidence") {
    return event.evidence.status === "failed" ? "failed" : "validated";
  }
  if (event.type === "tool_call_started") return "running";
  if (event.type === "tool_call_blocked") return "blocked";
  if (event.type === "tool_call_finished") {
    if (event.status === "failed") return "failed";
    if (event.toolName === "propose_code_change_set") return "proposed";
    if (event.toolName === "read_file" || event.toolName === "read_file_readonly") {
      return "read";
    }
    return "changed";
  }
  return "unknown";
}

function changeTypeForWorkflowEvent(
  event: WorkflowEvent
): AgentFileOperationTelemetry["changeType"] {
  if (event.type === "patch_proposed" || event.type === "patch_applied") {
    return "unknown";
  }
  if (
    event.type !== "tool_call_started" &&
    event.type !== "tool_call_finished" &&
    event.type !== "tool_call_blocked"
  ) {
    return null;
  }
  if (event.toolName === "write_file") return "create";
  if (
    event.toolName === "edit_file" ||
    event.toolName === "replace_file_range" ||
    event.toolName === "save_file"
  ) {
    return "update";
  }
  if (event.toolName === "delete_file") return "delete";
  return null;
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
