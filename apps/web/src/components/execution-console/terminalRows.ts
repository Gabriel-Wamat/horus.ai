import type { AgentFileOperationTelemetry } from "@u-build/shared";
import type { PreviewChatMessage } from "../PreviewConversationPanel.js";
import type { WorkflowProgressEvent } from "../../features/visual-preview/workflowProgress.js";
import type { TerminalRow } from "./useExecutionTaskOutputs.js";
import { legacyCommandIdsFromToolStep } from "./legacyToolSteps.js";

export function selectTerminalRows(
  events: readonly WorkflowProgressEvent[],
  operations: readonly AgentFileOperationTelemetry[],
  messages: readonly PreviewChatMessage[]
): TerminalRow[] {
  const rows = new Map<string, TerminalRow>();

  for (const event of events) {
    if (event.type === "command_approval_requested" && event.commandId && event.taskId) {
      const id = commandRowId(event.threadId, event.commandId, event.taskId);
      rows.set(id, {
        id,
        label: event.commandId,
        status: "aguardando aprovação",
        timestamp: event.timestamp ?? "",
        agent: event.agentName ?? "agente",
        tool: event.toolName ?? "terminal",
        output: event.policyReason ?? event.approvalReason ?? "",
        stream: "mixed",
        taskId: event.taskId,
        traceId: event.traceId ?? null,
        toolCallId: event.toolCallId ?? null,
        projectId: event.projectId ?? null,
        approvalRequired: true,
        risk: event.risk ?? "medium",
        policyReason: event.policyReason ?? event.approvalReason ?? null,
      });
      continue;
    }

    if (event.type === "command_output" && event.commandId) {
      const id = commandRowId(event.threadId, event.commandId, event.taskId);
      const existing = migrateFallbackCommandRow({
        rows,
        threadId: event.threadId,
        commandId: event.commandId,
        taskId: event.taskId,
        toolCallId: event.toolCallId ?? null,
      });
      rows.set(
        id,
        mergeTerminalOutput(
          existing ?? {
            id,
            label: event.commandId,
            status: "rodando",
            timestamp: event.timestamp ?? "",
            agent: event.agentName ?? "agente",
            tool: event.toolName ?? "terminal",
            output: "",
            stream: event.stream ?? "mixed",
            taskId: event.taskId ?? null,
            traceId: event.traceId ?? null,
            toolCallId: event.toolCallId ?? null,
            projectId: event.projectId ?? null,
            approvalRequired: false,
            risk: "low",
            policyReason: null,
          },
          {
            chunk: event.chunk ?? "",
            stream: event.stream ?? "stdout",
            timestamp: event.timestamp ?? "",
          }
        )
      );
      continue;
    }

    for (const commandId of event.commandIds ?? []) {
      const id = event.taskId
        ? commandRowId(event.threadId, commandId, event.taskId)
        : findCommandRowId({
            rows,
            threadId: event.threadId,
            commandId,
            toolCallId: event.toolCallId ?? null,
          });
      const existing = rows.get(id);
      rows.set(id, {
        id,
        label: commandId,
        status: commandEventStatusLabel(event),
        timestamp: event.timestamp ?? existing?.timestamp ?? "",
        agent: event.agentName ?? existing?.agent ?? "agente",
        tool: event.toolName ?? existing?.tool ?? "terminal",
        output: existing?.output ?? "",
        stream: existing?.stream ?? "mixed",
        taskId: event.taskId ?? existing?.taskId ?? null,
        traceId: event.traceId ?? existing?.traceId ?? null,
        toolCallId: event.toolCallId ?? existing?.toolCallId ?? null,
        projectId: event.projectId ?? existing?.projectId ?? null,
        approvalRequired: existing?.approvalRequired ?? false,
        risk: existing?.risk ?? "low",
        policyReason: existing?.policyReason ?? null,
      });
    }

    for (const command of event.evidence?.commands ?? []) {
      const id = `command:${event.threadId}:${command.taskId ?? command.commandId}`;
      const existing = rows.get(id);
      rows.set(id, {
        id,
        label: command.commandId,
        status: `exit ${command.exitCode}`,
        timestamp: event.timestamp ?? existing?.timestamp ?? "",
        agent: event.agentName ?? existing?.agent ?? "qa",
        tool: event.toolName ?? existing?.tool ?? "validação",
        output: existing?.output ?? "",
        stream: existing?.stream ?? "mixed",
        taskId: command.taskId ?? existing?.taskId ?? null,
        traceId: event.traceId ?? existing?.traceId ?? null,
        toolCallId: event.toolCallId ?? existing?.toolCallId ?? null,
        projectId: event.projectId ?? existing?.projectId ?? null,
        approvalRequired:
          command.approvalRequired ?? existing?.approvalRequired ?? false,
        risk: command.risk ?? existing?.risk ?? "low",
        policyReason: command.policyReason ?? existing?.policyReason ?? null,
      });
    }
  }

  for (const operation of operations) {
    for (const commandId of operation.commandIds) {
      rows.set(`operation:${operation.id}:${commandId}`, {
        id: `operation:${operation.id}:${commandId}`,
        label: commandId,
        status: operation.status,
        timestamp: operation.timestamp,
        agent: operation.agentName ?? "agente",
        tool: operation.toolName ?? "terminal",
        output: "",
        stream: "mixed",
        taskId: null,
        traceId: null,
        toolCallId: null,
        projectId: null,
        approvalRequired: false,
        risk: "low",
        policyReason: null,
      });
    }
  }

  for (const message of messages) {
    for (const step of message.toolSteps ?? []) {
      const commandIds = step.commandIds?.length
        ? step.commandIds
        : legacyCommandIdsFromToolStep(step.tool, step.title);
      for (const commandId of commandIds) {
        rows.set(`chat:${message.id}:${step.sequence ?? step.title}:${commandId}`, {
          id: `chat:${message.id}:${step.sequence ?? step.title}:${commandId}`,
          label: commandId,
          status: terminalStatusFromToolStep(step.phase, step.detail),
          timestamp: message.createdAt,
          agent: "chat",
          tool: step.tool,
          output: step.detail ?? "",
          stream: "mixed",
          taskId: step.taskId ?? null,
          traceId: null,
          toolCallId: null,
          projectId: null,
          approvalRequired: false,
          risk: "low",
          policyReason: null,
        });
      }
    }
    for (const command of message.codingEvidence?.validation?.commands ?? []) {
      rows.set(`coding:${message.id}:${command.command}`, {
        id: `coding:${message.id}:${command.command}`,
        label: command.command,
        status: command.exitCode === null ? command.status : `exit ${command.exitCode}`,
        timestamp: message.createdAt,
        agent: "agente",
        tool: "validação",
        output: "",
        stream: "mixed",
        taskId: null,
        traceId: null,
        toolCallId: null,
        projectId: null,
        approvalRequired: false,
        risk: "low",
        policyReason: null,
      });
    }
  }

  return [...rows.values()].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp)
  );
}

function commandRowId(
  threadId: string,
  commandId: string,
  taskId: string | null | undefined
): string {
  return taskId
    ? `command:${threadId}:task:${taskId}`
    : fallbackCommandRowId(threadId, commandId);
}

function fallbackCommandRowId(threadId: string, commandId: string): string {
  return `command:${threadId}:command:${commandId}`;
}

function findCommandRowId(input: {
  rows: ReadonlyMap<string, TerminalRow>;
  threadId: string;
  commandId: string;
  toolCallId: string | null;
}): string {
  for (const [id, row] of input.rows.entries()) {
    if (!id.startsWith(`command:${input.threadId}:task:`)) continue;
    if (row.label !== input.commandId) continue;
    if (input.toolCallId && row.toolCallId !== input.toolCallId) continue;
    return id;
  }
  return fallbackCommandRowId(input.threadId, input.commandId);
}

function migrateFallbackCommandRow(input: {
  rows: Map<string, TerminalRow>;
  threadId: string;
  commandId: string;
  taskId: string | null | undefined;
  toolCallId: string | null;
}): TerminalRow | undefined {
  if (!input.taskId) {
    return input.rows.get(fallbackCommandRowId(input.threadId, input.commandId));
  }
  const taskRowId = commandRowId(input.threadId, input.commandId, input.taskId);
  const existingTaskRow = input.rows.get(taskRowId);
  if (existingTaskRow) return existingTaskRow;

  const fallbackId = fallbackCommandRowId(input.threadId, input.commandId);
  const fallback = input.rows.get(fallbackId);
  if (!fallback) return undefined;
  if (input.toolCallId && fallback.toolCallId !== input.toolCallId) return undefined;

  input.rows.delete(fallbackId);
  return {
    ...fallback,
    id: taskRowId,
    taskId: input.taskId,
  };
}

function mergeTerminalOutput(
  row: TerminalRow,
  next: {
    chunk: string;
    stream: "stdout" | "stderr";
    timestamp: string;
  }
): TerminalRow {
  const output = `${row.output}${next.chunk}`;
  const boundedOutput = output.length > 2400 ? output.slice(output.length - 2400) : output;
  return {
    ...row,
    status: "rodando",
    timestamp: next.timestamp || row.timestamp,
    output: boundedOutput,
    stream: row.stream === next.stream || row.output.length === 0 ? next.stream : "mixed",
  };
}

function commandEventStatusLabel(event: WorkflowProgressEvent): string {
  if (event.type === "tool_call_started") return "rodando";
  if (event.type === "tool_call_blocked") return "bloqueado";
  if (event.type === "tool_call_finished") {
    if (event.status === "failed") return "falhou";
    return "concluído";
  }
  return event.status ?? event.type;
}

function terminalStatusFromToolStep(
  phase: string,
  detail: string | null | undefined
): string {
  const text = detail?.trim() ?? "";
  if (!text.startsWith("exit ")) return phase;
  const colonIndex = text.indexOf(":");
  const lineIndex = text.indexOf("\n");
  const boundaryIndexes = [colonIndex, lineIndex].filter((index) => index > 0);
  const boundary = boundaryIndexes.length ? Math.min(...boundaryIndexes) : text.length;
  return text.slice(0, boundary).trim();
}
