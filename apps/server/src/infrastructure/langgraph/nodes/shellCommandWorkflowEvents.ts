import type {
  AgentName,
  AgentProfileId,
  AgentToolName,
  ShellCommandResult,
  WorkflowEvent,
} from "@u-build/shared";

export function buildShellCommandCompletionWorkflowEvent(input: {
  result: ShellCommandResult;
  threadId: string;
  agentName: AgentName;
  agentProfileId: AgentProfileId;
  toolName: AgentToolName;
  userStoryId?: string | undefined;
}): WorkflowEvent {
  if (input.result.status === "awaiting_approval" && input.result.taskId) {
    return {
      type: "command_approval_requested",
      threadId: input.threadId,
      agentName: input.agentName,
      agentProfileId: input.agentProfileId,
      toolName: input.toolName,
      commandId: input.result.commandId,
      taskId: input.result.taskId,
      ...(input.result.traceId ? { traceId: input.result.traceId } : {}),
      ...(input.result.spanId ? { spanId: input.result.spanId } : {}),
      ...(input.result.parentSpanId
        ? { parentSpanId: input.result.parentSpanId }
        : {}),
      ...(input.result.toolCallId ? { toolCallId: input.result.toolCallId } : {}),
      ...(input.result.runId ? { runId: input.result.runId } : {}),
      ...(input.result.projectId ? { projectId: input.result.projectId } : {}),
      ...(input.result.agentId ? { agentId: input.result.agentId } : {}),
      ...(input.result.filePath ? { filePath: input.result.filePath } : {}),
      ...(input.result.diffId ? { diffId: input.result.diffId } : {}),
      ...(input.userStoryId ? { userStoryId: input.userStoryId } : {}),
      approvalReason: input.result.approvalReason,
      policyReason: input.result.policyReason,
      risk: input.result.risk,
      timestamp: input.result.startedAt,
    };
  }
  const failed = input.result.status !== "completed";
  return {
    type: "tool_call_finished",
    threadId: input.threadId,
    agentName: input.agentName,
    agentProfileId: input.agentProfileId,
    toolName: input.toolName,
    status: failed ? "failed" : "succeeded",
    ...(input.result.traceId ? { traceId: input.result.traceId } : {}),
    ...(input.result.spanId ? { spanId: input.result.spanId } : {}),
    ...(input.result.parentSpanId
      ? { parentSpanId: input.result.parentSpanId }
      : {}),
    ...(input.result.toolCallId ? { toolCallId: input.result.toolCallId } : {}),
    ...(input.result.runId ? { runId: input.result.runId } : {}),
    ...(input.result.projectId ? { projectId: input.result.projectId } : {}),
    ...(input.result.agentId ? { agentId: input.result.agentId } : {}),
    ...(input.result.filePath ? { filePath: input.result.filePath } : {}),
    ...(input.result.diffId ? { diffId: input.result.diffId } : {}),
    ...(input.userStoryId ? { userStoryId: input.userStoryId } : {}),
    durationMs: input.result.durationMs,
    summary: shellCommandCompletionSummary(input.result),
    commandIds: [input.result.commandId],
    ...(input.result.taskId ? { taskId: input.result.taskId } : {}),
    ...(failed
      ? {
          errorMessage:
            input.result.errorMessage ??
            (input.result.stderrTail ||
              input.result.stdoutTail ||
              "Command task failed.")
        }
      : {}),
    timestamp: input.result.finishedAt ?? new Date().toISOString(),
  };
}

function shellCommandCompletionSummary(result: ShellCommandResult): string {
  if (result.status === "completed") {
    return `Command ${result.commandId} completed.`;
  }
  if (result.status === "timed_out") {
    return `Command ${result.commandId} timed out.`;
  }
  if (result.status === "aborted") {
    return `Command ${result.commandId} was stopped.`;
  }
  if (result.status === "rejected") {
    return `Command ${result.commandId} was rejected.`;
  }
  return `Command ${result.commandId} failed.`;
}
