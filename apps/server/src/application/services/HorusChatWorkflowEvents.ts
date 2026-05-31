import type { HorusChatToolStep, WorkflowEvent } from "@u-build/shared";
import { AgentToolNameSchema } from "@u-build/shared";

export interface HorusChatWorkflowEventContext {
  readonly threadId: string;
  readonly projectId?: string | undefined;
  readonly userStoryId?: string | undefined;
  readonly sequence: number;
  readonly timestamp: string;
}

export function chatToolStepToWorkflowEvents(
  step: HorusChatToolStep,
  context: HorusChatWorkflowEventContext
): WorkflowEvent[] {
  const parsedToolName = AgentToolNameSchema.safeParse(step.tool);
  if (!parsedToolName.success) return [];

  const common = {
    threadId: context.threadId,
    agentName: "odin" as const,
    agentProfileId: "horus_chat_executor" as const,
    toolName: parsedToolName.data,
    traceId: context.threadId,
    spanId: `chat-step-${context.sequence}`,
    parentSpanId: null,
    toolCallId: `chat-step-${context.sequence}`,
    runId: context.threadId,
    ...(context.projectId ? { projectId: context.projectId } : {}),
    agentId: "horus_chat_executor",
    ...(step.filePaths[0] ? { filePath: step.filePaths[0] } : {}),
    ...(context.userStoryId ? { userStoryId: context.userStoryId } : {}),
    timestamp: context.timestamp,
  };

  if (step.phase === "started" && step.detail && step.commandIds.length > 0) {
    return step.commandIds.map((commandId) => ({
      type: "command_output",
      ...common,
      commandId,
      ...(step.taskId ? { taskId: step.taskId } : {}),
      stream: "stdout",
      chunk: step.detail ?? "",
      chunkSequence: context.sequence,
    }));
  }

  if (step.phase === "started") {
    return [
      {
        type: "tool_call_started",
        ...common,
        summary: step.title,
        filePaths: step.filePaths,
        commandIds: step.commandIds,
        ...(step.taskId ? { taskId: step.taskId } : {}),
      },
    ];
  }

  return [
    {
      type: "tool_call_finished",
      ...common,
      status: step.phase === "failed" ? "failed" : "succeeded",
      summary: step.title,
      filePaths: step.filePaths,
      commandIds: step.commandIds,
      ...(step.taskId ? { taskId: step.taskId } : {}),
      ...(step.phase === "failed" && step.detail
        ? { errorMessage: step.detail }
        : {}),
    },
  ];
}
