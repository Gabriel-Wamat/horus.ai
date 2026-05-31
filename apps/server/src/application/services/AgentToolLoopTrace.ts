import type {
  AgentProfileId,
  AgentToolName,
  CodeChangeSet,
} from "@u-build/shared";
import { randomUUID } from "node:crypto";

export interface AgentToolLoopTraceInput {
  threadId: string;
  projectId: string;
  agentProfileId: AgentProfileId;
  codeChangeSet: Pick<CodeChangeSet, "id" | "runId">;
}

export interface ToolTraceContext {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  toolCallId: string;
  runId: string | null;
  projectId: string;
  agentId: string;
  filePath: string | null;
  diffId: string | null;
}

export function buildToolTraceContext(
  input: AgentToolLoopTraceInput,
  filePaths: readonly string[]
): ToolTraceContext {
  const toolCallId = randomUUID();
  return {
    traceId: input.threadId,
    spanId: toolCallId,
    parentSpanId: null,
    toolCallId,
    runId: input.codeChangeSet.runId ?? input.threadId,
    projectId: input.projectId,
    agentId: input.agentProfileId,
    filePath: filePaths.length === 1 ? filePaths[0] ?? null : null,
    diffId: input.codeChangeSet.id,
  };
}

export function attachToolTraceContext(
  toolName: AgentToolName,
  payload: Record<string, unknown>,
  trace: ToolTraceContext
): Record<string, unknown> {
  if (toolName !== "run_command" && toolName !== "run_validation_command") {
    return payload;
  }

  return {
    ...payload,
    traceId: typeof payload["traceId"] === "string" ? payload["traceId"] : trace.traceId,
    spanId: typeof payload["spanId"] === "string" ? payload["spanId"] : trace.spanId,
    parentSpanId:
      typeof payload["parentSpanId"] === "string"
        ? payload["parentSpanId"]
        : trace.parentSpanId,
    toolCallId:
      typeof payload["toolCallId"] === "string"
        ? payload["toolCallId"]
        : trace.toolCallId,
    ...(typeof payload["runId"] === "string"
      ? { runId: payload["runId"] }
      : trace.runId
        ? { runId: trace.runId }
        : {}),
    projectId:
      typeof payload["projectId"] === "string" ? payload["projectId"] : trace.projectId,
    agentId: typeof payload["agentId"] === "string" ? payload["agentId"] : trace.agentId,
    filePath:
      typeof payload["filePath"] === "string" ? payload["filePath"] : trace.filePath,
    diffId: typeof payload["diffId"] === "string" ? payload["diffId"] : trace.diffId,
  };
}
