import type {
  AgentFileOperationTelemetry,
  HorusChatToolFileOperation,
} from "@u-build/shared";
import type { PreviewChatMessage } from "../PreviewConversationPanel.js";
import type { ConsoleFileRow } from "./types.js";
import {
  legacyPathFromToolStep,
  operationTypeFromToolName,
  statusFromToolStepPhase,
} from "./legacyToolSteps.js";

export function selectLatestFileOperations(
  operations: readonly AgentFileOperationTelemetry[],
  messages: readonly PreviewChatMessage[]
): ConsoleFileRow[] {
  const byPath = new Map<string, ConsoleFileRow>();
  for (const operation of operations) {
    byPath.set(operation.path, workflowFileRow(operation));
  }
  for (const operation of chatFileRows(messages)) {
    byPath.set(operation.path, operation);
  }
  return [...byPath.values()]
    .sort((left, right) => {
      const byTime = right.timestamp.localeCompare(left.timestamp);
      if (byTime !== 0) return byTime;
      return right.sequence - left.sequence;
    })
    .slice(0, 8);
}

export function hasDiffEvidence(operation: ConsoleFileRow): boolean {
  return (
    Boolean(operation.diffPreview) ||
    Boolean(operation.additions) ||
    Boolean(operation.deletions)
  );
}

function workflowFileRow(operation: AgentFileOperationTelemetry): ConsoleFileRow {
  return {
    id: operation.id,
    path: operation.path,
    operationType: operation.operationType,
    status: operation.status,
    source: operation.toolName ?? operation.agentName ?? "workflow",
    sequence: operation.sequence,
    timestamp: operation.timestamp,
    additions: operation.additions,
    deletions: operation.deletions,
    diffPreview: operation.diffPreview,
  };
}

function chatFileRows(messages: readonly PreviewChatMessage[]): ConsoleFileRow[] {
  const rows: ConsoleFileRow[] = [];
  for (const message of messages) {
    for (const step of message.toolSteps ?? []) {
      const operations = step.fileOperations ?? [];
      if (operations.length > 0) {
        operations.forEach((operation, index) => {
          rows.push(chatFileRow(message, step.tool, operation, index));
        });
        continue;
      }
      const legacyPath = legacyPathFromToolStep(step.tool, step.title);
      if (legacyPath) {
        rows.push({
          id: `chat-file:${message.id}:${legacyPath}`,
          path: legacyPath,
          operationType: operationTypeFromToolName(step.tool),
          status: statusFromToolStepPhase(step.phase),
          source: step.tool,
          sequence: message.sequence ?? 0,
          timestamp: message.createdAt,
          additions: null,
          deletions: null,
          diffPreview: "",
        });
      }
    }
    for (const path of message.codingEvidence?.changedFiles ?? []) {
      rows.push({
        id: `coding-file:${message.id}:${path}`,
        path,
        operationType: "update",
        status: "changed",
        source: "chat_agent",
        sequence: message.sequence ?? 0,
        timestamp: message.createdAt,
        additions: message.codingEvidence?.diffStats?.addedLines ?? null,
        deletions: message.codingEvidence?.diffStats?.removedLines ?? null,
        diffPreview: "",
      });
    }
  }
  return rows;
}

function chatFileRow(
  message: PreviewChatMessage,
  toolName: string,
  operation: HorusChatToolFileOperation,
  index: number
): ConsoleFileRow {
  return {
    id: `chat-file:${message.id}:${operation.path}:${index}`,
    path: operation.path,
    operationType: operation.operationType,
    status: operation.status,
    source: toolName,
    sequence: message.sequence ?? 0,
    timestamp: message.createdAt,
    additions: operation.additions,
    deletions: operation.deletions,
    diffPreview: operation.diffPreview,
  };
}
