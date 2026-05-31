import type { WorkflowProgressEvent } from "../../features/visual-preview/workflowProgress.js";
import type { ValidationChainRow, ValidationChainStep } from "./types.js";
import { eventTitle } from "./workflowEventText.js";
import { isRepairCommandId } from "./commandTerms.js";

export function selectValidationChains(
  events: readonly WorkflowProgressEvent[]
): ValidationChainRow[] {
  const rows: ValidationChainRow[] = [];
  for (const event of events) {
    const commands = event.evidence?.commands ?? [];
    if (commands.length === 0) continue;
    const seenCommandIds = new Map<string, number>();
    const steps = commands.map((command, index) => {
      const previousCount = seenCommandIds.get(command.commandId) ?? 0;
      seenCommandIds.set(command.commandId, previousCount + 1);
      const repeated = previousCount > 0;
      const kind = validationStepKind({
        commandId: command.commandId,
        exitCode: command.exitCode,
        repeated,
      });
      return {
        id: `${event.id}:${command.taskId ?? command.commandId}:${index}`,
        commandId: command.commandId,
        taskId: command.taskId ?? null,
        label: validationStepLabel(kind),
        status: command.exitCode === null ? "sem exit" : `exit ${command.exitCode}`,
        tone: validationStepTone(kind, command.exitCode),
      };
    });
    rows.push({
      id: `validation:${event.id}`,
      title: eventTitle(event),
      status: validationChainStatus(event.evidence?.status, steps),
      tone: validationChainTone(event.evidence?.status, steps),
      timestamp: event.timestamp ?? "",
      agent: event.agentName ?? "qa",
      traceId: event.traceId ?? null,
      steps,
    });
  }
  return rows
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 4);
}

type ValidationStepKind = "failed" | "repair" | "retry" | "validated" | "pending";

function validationStepKind(input: {
  commandId: string;
  exitCode: number | null;
  repeated: boolean;
}): ValidationStepKind {
  if (input.exitCode === null) return "pending";
  if (input.exitCode !== 0) return "failed";
  if (isRepairCommandId(input.commandId)) return "repair";
  if (input.repeated) return "retry";
  return "validated";
}

function validationStepLabel(kind: ValidationStepKind): string {
  if (kind === "failed") return "falhou";
  if (kind === "repair") return "reparo";
  if (kind === "retry") return "retry";
  if (kind === "validated") return "validou";
  return "rodando";
}

function validationStepTone(
  kind: ValidationStepKind,
  exitCode: number | null
): "running" | "failed" | "success" | "muted" {
  if (kind === "pending") return "running";
  if (exitCode !== 0) return "failed";
  if (kind === "repair" || kind === "retry" || kind === "validated") {
    return "success";
  }
  return "muted";
}

function validationChainStatus(
  status: string | undefined,
  steps: readonly ValidationChainStep[]
): string {
  if (status === "running") return "rodando";
  if (status === "skipped") return "ignorado";
  if (status === "failed") return "falhou";
  if (status === "passed") {
    const recovered = steps.some((step) => step.tone === "failed") &&
      steps.some((step) => step.label === "retry" || step.label === "reparo");
    return recovered ? "validado com retry" : "validado";
  }
  return status ?? "desconhecido";
}

function validationChainTone(
  status: string | undefined,
  steps: readonly ValidationChainStep[]
): "running" | "failed" | "success" | "muted" {
  if (status === "running") return "running";
  if (status === "failed") return "failed";
  if (status === "passed") return "success";
  if (steps.some((step) => step.tone === "failed")) return "failed";
  return "muted";
}
