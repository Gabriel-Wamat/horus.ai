import type { AgentFileOperationTelemetry } from "@u-build/shared";
import type { WorkflowProgressEvent } from "../../features/visual-preview/workflowProgress.js";
import type { OperationalTraceRow, OperationalTraceStep } from "./types.js";
import {
  operationStatusLabel,
  operationTypeLabel,
  shortId,
} from "./labels.js";
import { eventDetail } from "./workflowEventText.js";

export function selectOperationalTraceRows(
  events: readonly WorkflowProgressEvent[],
  operations: readonly AgentFileOperationTelemetry[]
): OperationalTraceRow[] {
  const rows = new Map<string, OperationalTraceRow>();

  for (const event of events) {
    if (!isTraceableWorkflowEvent(event)) continue;
    const key = traceRowKey(event);
    const row = rows.get(key) ?? newTraceRow(key, event);
    appendEventTraceSteps(row, event);
    row.timestamp = maxTimestamp(row.timestamp, event.timestamp ?? "");
    row.tone = strongestTone(row.tone, toneForTraceEvent(event));
    rows.set(key, row);
  }

  for (const operation of operations) {
    const key =
      operation.sourceEventId ??
      operation.operationalSessionId ??
      `${operation.threadId}:file:${operation.path}`;
    const row = rows.get(key) ?? newOperationTraceRow(key, operation);
    row.steps.push({
      id: `${operation.id}:file`,
      label: operationTypeLabel(operation.operationType),
      value: operation.path,
      detail: operationStatusLabel(operation.status),
      tone: operation.status === "failed" || operation.status === "blocked"
        ? "failed"
        : operation.status === "running"
          ? "running"
          : "success",
    });
    for (const commandId of operation.commandIds) {
      row.steps.push({
        id: `${operation.id}:command:${commandId}`,
        label: "comando",
        value: commandId,
        detail: "associado ao arquivo",
        tone: "muted",
      });
    }
    row.timestamp = maxTimestamp(row.timestamp, operation.timestamp);
    rows.set(key, row);
  }

  return [...rows.values()]
    .map((row) => ({ ...row, steps: compactTraceSteps(row.steps).slice(0, 6) }))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 5);
}

function isTraceableWorkflowEvent(event: WorkflowProgressEvent): boolean {
  return (
    event.type === "tool_call_started" ||
    event.type === "tool_call_finished" ||
    event.type === "tool_call_blocked" ||
    event.type === "command_output" ||
    event.type === "validation_evidence"
  );
}

function traceRowKey(event: WorkflowProgressEvent): string {
  const toolCallId = event.toolCallId ?? event.spanId;
  if (toolCallId) return `${event.threadId}:tool:${toolCallId}`;
  if (event.traceId) return `${event.threadId}:trace:${event.traceId}`;
  if (event.commandId) return `${event.threadId}:command:${event.commandId}`;
  if (event.evidence?.commands[0]?.taskId) {
    return `${event.threadId}:task:${event.evidence.commands[0].taskId}`;
  }
  return `${event.threadId}:event:${event.id}`;
}

function newTraceRow(key: string, event: WorkflowProgressEvent): OperationalTraceRow {
  const agent = event.agentName ?? event.agentId ?? "agente";
  const tool = event.toolName ?? event.commandId ?? event.title ?? "operação";
  return {
    id: key,
    title: `${agent} · ${tool}`,
    detail: traceDetail(event),
    timestamp: event.timestamp ?? "",
    tone: toneForTraceEvent(event),
    agent,
    traceId: event.traceId ?? null,
    toolCallId: event.toolCallId ?? event.spanId ?? null,
    steps: [],
  };
}

function newOperationTraceRow(
  key: string,
  operation: AgentFileOperationTelemetry
): OperationalTraceRow {
  const agent = operation.agentName ?? operation.agentProfileId ?? "agente";
  return {
    id: key,
    title: `${agent} · ${operation.toolName ?? operationTypeLabel(operation.operationType)}`,
    detail: operation.summary ?? "Arquivo tocado pelo agente.",
    timestamp: operation.timestamp,
    tone:
      operation.status === "failed" || operation.status === "blocked"
        ? "failed"
        : operation.status === "running"
          ? "running"
          : "success",
    agent,
    traceId: null,
    toolCallId: null,
    steps: [],
  };
}

function appendEventTraceSteps(
  row: OperationalTraceRow,
  event: WorkflowProgressEvent
): void {
  if (
    event.type === "tool_call_started" ||
    event.type === "tool_call_finished" ||
    event.type === "tool_call_blocked"
  ) {
    row.steps.push({
      id: `${event.id}:tool`,
      label: "ferramenta",
      value: event.toolName ?? "tool",
      detail: toolTraceStatus(event),
      tone: toneForTraceEvent(event),
    });
    for (const path of event.filePaths ?? []) {
      row.steps.push({
        id: `${event.id}:file:${path}`,
        label: "arquivo",
        value: path,
        detail: event.type === "tool_call_started" ? "alvo" : "tocado",
        tone: event.type === "tool_call_blocked" ? "failed" : "muted",
      });
    }
    for (const commandId of event.commandIds ?? []) {
      row.steps.push({
        id: `${event.id}:command:${commandId}`,
        label: "comando",
        value: commandId,
        detail: toolTraceStatus(event),
        tone: toneForTraceEvent(event),
      });
    }
    return;
  }

  if (event.type === "command_output" && event.commandId) {
    row.steps.push({
      id: `${event.id}:command:${event.chunkSequence ?? 0}`,
      label: "terminal",
      value: event.commandId,
      detail: event.taskId ? `task ${shortId(event.taskId)}` : event.stream ?? "saida",
      tone: event.stream === "stderr" ? "failed" : "running",
    });
    return;
  }

  for (const command of event.evidence?.commands ?? []) {
    row.steps.push({
      id: `${event.id}:validation:${command.taskId ?? command.commandId}`,
      label: "validação",
      value: command.commandId,
      detail: command.exitCode === null ? "sem exit" : `exit ${command.exitCode}`,
      tone: command.exitCode === 0 ? "success" : "failed",
    });
  }
}

function traceDetail(event: WorkflowProgressEvent): string {
  if (event.type === "command_output") {
    return event.taskId ? `task ${shortId(event.taskId)}` : "saída de terminal";
  }
  if (event.type === "validation_evidence") {
    return `validação ${event.evidence?.status ?? "registrada"}`;
  }
  return event.summary ?? event.title ?? eventDetail(event);
}

function toolTraceStatus(event: WorkflowProgressEvent): string {
  if (event.type === "tool_call_started") return "iniciou";
  if (event.type === "tool_call_blocked") return "bloqueada";
  return event.status === "failed" ? "falhou" : "concluiu";
}

function toneForTraceEvent(
  event: WorkflowProgressEvent
): "running" | "failed" | "success" | "muted" {
  if (event.type === "tool_call_started" || event.type === "command_output") {
    return "running";
  }
  if (event.type === "tool_call_blocked" || event.status === "failed") {
    return "failed";
  }
  if (event.type === "validation_evidence") {
    return event.evidence?.status === "passed" ? "success" : "failed";
  }
  if (event.type === "tool_call_finished") return "success";
  return "muted";
}

function strongestTone(
  left: "running" | "failed" | "success" | "muted",
  right: "running" | "failed" | "success" | "muted"
): "running" | "failed" | "success" | "muted" {
  const score = { failed: 4, running: 3, success: 2, muted: 1 };
  return score[right] > score[left] ? right : left;
}

function maxTimestamp(left: string, right: string): string {
  return right.localeCompare(left) > 0 ? right : left;
}

function compactTraceSteps(
  steps: readonly OperationalTraceStep[]
): OperationalTraceStep[] {
  const seen = new Set<string>();
  const compact: OperationalTraceStep[] = [];
  for (const step of steps) {
    const key = `${step.label}:${step.value}:${step.detail}:${step.tone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    compact.push(step);
  }
  return compact;
}
