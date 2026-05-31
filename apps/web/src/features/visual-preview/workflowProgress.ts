import type { AgentRunbookEntry } from "@u-build/shared";
import type { PreviewWorkflowActivity } from "../../components/PreviewConversationPanel.js";

export const WORKFLOW_PROGRESS_EVENT_TYPES = [
  "status_changed",
  "node_started",
  "node_completed",
  "patch_proposed",
  "patch_applied",
  "validation_evidence",
  "tool_call_started",
  "tool_call_finished",
  "tool_call_blocked",
  "command_output",
  "command_approval_requested",
  "awaiting_approval",
  "retry_started",
  "awaiting_retry_approval",
  "recovery_decision",
  "fallback_executed",
  "error",
] as const;

export interface WorkflowProgressEvent {
  id: string;
  threadId: string;
  sequence: number;
  type: string;
  eventType?: string;
  phase?: string;
  actorName?: string;
  nodeId?: string;
  agentName?: string;
  toolName?: string;
  status?: string;
  attempt?: number;
  title?: string;
  summary?: string;
  errorMessage?: string;
  action?: string;
  message?: string;
  decision?: {
    retryable?: boolean;
    recoveryAction?: string;
    operatorMessage?: string;
  };
  timestamp?: string;
  filePaths?: string[];
  commandIds?: string[];
  commandId?: string;
  taskId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string | null;
  toolCallId?: string | null;
  runId?: string | null;
  projectId?: string | null;
  agentId?: string | null;
  filePath?: string | null;
  diffId?: string | null;
  stream?: "stdout" | "stderr";
  chunk?: string;
  chunkSequence?: number;
  approvalReason?: string | null;
  policyReason?: string | null;
  risk?: "low" | "medium" | "high";
  evidence?: {
    status: string;
    commands: Array<{
      commandId: string;
      taskId?: string | null;
      approvalRequired?: boolean;
      risk?: "low" | "medium" | "high";
      policyReason?: string | null;
      approved?: boolean;
      approvedBy?: string | null;
      approvalReason?: string | null;
      exitCode: number | null;
      stdoutPath?: string | null;
      stderrPath?: string | null;
      interactivePromptDetected?: boolean;
      interactivePromptText?: string | null;
    }>;
    preview: {
      status: string;
      message?: string;
      evidence?: {
        title?: string | null;
        bodySnippet?: string | null;
        screenshotPath?: string | null;
      };
    };
  };
  runbookEntry?: AgentRunbookEntry;
}

export async function listWorkflowProgressEvents(
  threadId: string
): Promise<WorkflowProgressEvent[]> {
  const response = await fetch(`/api/agent-runs/${threadId}/events`, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  return response.json() as Promise<WorkflowProgressEvent[]>;
}

export function isTerminalWorkflowEvent(event: WorkflowProgressEvent): boolean {
  if (event.type === "error") return true;
  return (
    event.type === "status_changed" &&
    (event.status === "completed" ||
      event.status === "completed_unverified" ||
      event.status === "failed_validation" ||
      event.status === "blocked" ||
      event.status === "cancelled" ||
      event.status === "error")
  );
}

export function selectWorkflowReplayEvents(
  events: WorkflowProgressEvent[]
): WorkflowProgressEvent[] {
  const started = events.find(
    (event) => event.type === "status_changed" && event.status === "running"
  );
  const milestones = events.filter((event) => {
    if (event.type === "node_completed") return true;
    if (event.type === "patch_proposed") return true;
    if (event.type === "validation_evidence") return true;
    if (event.type === "patch_applied") return true;
    if (event.type === "error") return true;
    return isTerminalWorkflowEvent(event);
  });
  return [...(started ? [started] : []), ...milestones].slice(-5);
}

export function parseWorkflowProgressEventPayload(
  data: string
): WorkflowProgressEvent | null {
  if (!data || data === "undefined") return null;
  try {
    const parsed = JSON.parse(data) as Partial<WorkflowProgressEvent>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.id !== "string" ||
      typeof parsed.threadId !== "string" ||
      typeof parsed.sequence !== "number" ||
      typeof parsed.type !== "string"
    ) {
      return null;
    }
    return parsed as WorkflowProgressEvent;
  } catch (err) {
    console.warn(
      "[VisualPreviewConsole] Ignoring invalid workflow progress event:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

export function workflowActivityFromEvent(
  event: WorkflowProgressEvent
): PreviewWorkflowActivity | null {
  if (event.runbookEntry) {
    return workflowActivityFromRunbookEntry(event.runbookEntry);
  }
  const updatedAt = event.timestamp ?? new Date().toISOString();
  switch (event.type) {
    case "node_completed":
      return nodeCompletedActivity(event, updatedAt);
    case "patch_proposed":
      return {
        phase: "validating",
        label: "Validando",
        detail: "Patch preparado; checks reais em andamento antes da revisão.",
        active: true,
        updatedAt,
      };
    case "validation_evidence":
      return validationEvidenceActivity(event, updatedAt);
    case "patch_applied":
      return {
        phase: "applying",
        label: "Aplicando",
        detail: "Patch aprovado; aplicando no projeto.",
        active: true,
        updatedAt,
      };
    case "tool_call_started":
      return {
        phase: "validating",
        label: event.title ?? "Tool iniciada",
        detail: event.summary ?? "Agente executando uma ferramenta governada.",
        active: true,
        updatedAt,
      };
    case "tool_call_finished":
      return {
        phase: event.status === "failed" ? "failed" : "validating",
        label: event.status === "failed" ? "Tool falhou" : "Tool concluída",
        detail:
          event.summary ??
          (event.status === "failed"
            ? "A ferramenta falhou antes de concluir a entrega."
            : "Ferramenta concluída com evidência persistida."),
        active: event.status !== "failed",
        updatedAt,
      };
    case "tool_call_blocked":
      return {
        phase: "failed",
        label: "Tool bloqueada",
        detail:
          event.errorMessage ??
          event.summary ??
          "A ferramenta foi bloqueada pela política do agente.",
        active: false,
        updatedAt,
      };
    case "command_output":
      return {
        phase: "validating",
        label: `${event.commandId ?? "comando"} ${event.stream ?? "log"}`,
        detail:
          event.chunk?.trim() ??
          "Saída de terminal recebida em tempo real.",
        active: true,
        updatedAt,
      };
    case "command_approval_requested":
      return {
        phase: "validating",
        label: "Aprovação necessária",
        detail:
          event.policyReason ??
          event.approvalReason ??
          "Um comando sensível precisa de aprovação antes de executar.",
        active: true,
        updatedAt,
      };
    case "retry_started":
      return {
        phase: "retrying",
        label: "Corrigindo",
        detail: "A revisão pediu ajuste; nova tentativa em andamento.",
        active: true,
        updatedAt,
      };
    case "recovery_decision":
      return {
        phase: "retrying",
        label: event.decision?.retryable
          ? "Recuperação automática"
          : "Decisão necessária",
        detail:
          event.decision?.operatorMessage ??
          event.summary ??
          "O Horus classificou a falha e escolheu uma política de recuperação.",
        active: Boolean(event.decision?.retryable),
        updatedAt,
      };
    case "fallback_executed":
      return {
        phase: event.status === "failed" ? "failed" : "retrying",
        label: event.status === "failed" ? "Fallback falhou" : "Fallback executado",
        detail: event.message ?? event.summary ?? "Fallback registrado pelo runtime.",
        active: event.status !== "failed",
        updatedAt,
      };
    case "status_changed":
      return statusChangedActivity(event, updatedAt);
    case "error":
      return {
        phase: "failed",
        label: "Falha bloqueada",
        detail:
          event.errorMessage ??
          event.summary ??
          "A entrega foi interrompida para não aplicar um resultado quebrado.",
        active: false,
        updatedAt,
      };
    default:
      return null;
  }
}

export function workflowActivityFromRunbookEntry(
  entry: AgentRunbookEntry
): PreviewWorkflowActivity {
  const active =
    entry.status === "running" || entry.status === "waiting_for_decision";
  return {
    phase: phaseFromRunbookEntry(entry),
    label: entry.title,
    detail:
      entry.errorMessage ??
      entry.summary ??
      entry.target ??
      runbookStatusText(entry.status),
    active,
    updatedAt: entry.updatedAt,
  };
}

function nodeCompletedActivity(
  event: WorkflowProgressEvent,
  updatedAt: string
): PreviewWorkflowActivity {
  if (event.status === "error") {
    return {
      phase: "failed",
      label: "Etapa falhou",
      detail: event.summary ?? "Um agente falhou antes da entrega.",
      active: false,
      updatedAt,
    };
  }
  const label =
    event.agentName === "front"
      ? "Front pronto"
      : event.agentName === "qa"
        ? "QA pronto"
        : event.agentName === "curator"
          ? "Curadoria pronta"
          : event.agentName === "odin"
            ? "Roteamento pronto"
            : "Etapa concluída";
  return {
    phase: event.agentName === "curator" ? "reviewing" : "validating",
    label,
    detail: event.summary ?? "Aguardando o próximo evento persistido.",
    active: true,
    updatedAt,
  };
}

function validationEvidenceActivity(
  event: WorkflowProgressEvent,
  updatedAt: string
): PreviewWorkflowActivity {
  const isVisualGate =
    event.evidence?.preview.evidence?.title === "Visual gate" ||
    /visual/i.test(event.evidence?.preview.message ?? "");
  if (isVisualGate) {
    const failed = event.evidence?.status !== "passed";
    return {
      phase: failed ? "retrying" : "reviewing",
      label: failed ? "Visual reprovado" : "Visual OK",
      detail: failed
        ? "A validação visual pediu ajuste antes da aplicação."
        : "A validação visual passou.",
      active: !failed,
      updatedAt,
    };
  }
  const failedCommands =
    event.evidence?.commands.filter((command) => command.exitCode !== 0)
      .length ?? 0;
  const failed =
    event.evidence?.status === "failed" ||
    event.evidence?.preview.status === "failed" ||
    failedCommands > 0;
  return failed
    ? {
        phase: "retrying",
        label: "Ajustando",
        detail: "A validação encontrou erro; o fluxo vai corrigir antes de aplicar.",
        active: true,
        updatedAt,
      }
    : {
        phase: "reviewing",
        label: "Revisando",
        detail: "Validação passou; conferindo antes de aplicar.",
        active: true,
        updatedAt,
      };
}

function statusChangedActivity(
  event: WorkflowProgressEvent,
  updatedAt: string
): PreviewWorkflowActivity | null {
  if (event.status === "completed" || event.status === "completed_unverified") {
    return {
      phase: "completed",
      label: "Concluído",
      detail: "A corrida terminou e a preview pode ser conferida.",
      active: false,
      updatedAt,
    };
  }
  if (
    event.status === "cancelled" ||
    event.status === "error" ||
    event.status === "failed_validation" ||
    event.status === "blocked"
  ) {
    return {
      phase: "failed",
      label:
        event.status === "cancelled"
          ? "Cancelado"
          : event.status === "failed_validation"
            ? "Validação falhou"
            : event.status === "blocked"
              ? "Bloqueado"
              : "Interrompido",
      detail:
        event.summary ??
        event.errorMessage ??
        "A corrida parou sem nova entrega aplicada.",
      active: false,
      updatedAt,
    };
  }
  return null;
}

function phaseFromRunbookEntry(
  entry: AgentRunbookEntry
): PreviewWorkflowActivity["phase"] {
  if (entry.status === "failed" || entry.status === "blocked") return "failed";
  if (entry.status === "waiting_for_decision") return "retrying";
  if (entry.action === "read_file") return "validating";
  if (entry.action === "change_file" || entry.action === "propose_change") {
    return "applying";
  }
  if (entry.action === "run_command" || entry.action === "validate") {
    return "validating";
  }
  if (entry.action === "inspect_diff" || entry.action === "decision") {
    return "reviewing";
  }
  if (entry.action === "retry") return "retrying";
  if (entry.action === "completed" && entry.status === "succeeded") {
    return "completed";
  }
  return "validating";
}

function runbookStatusText(status: AgentRunbookEntry["status"]): string {
  if (status === "running") return "Ação em andamento.";
  if (status === "succeeded") return "Ação concluída.";
  if (status === "failed") return "Ação falhou.";
  if (status === "blocked") return "Ação bloqueada.";
  if (status === "waiting_for_decision") return "Aguardando decisão.";
  return "Ação pendente.";
}
