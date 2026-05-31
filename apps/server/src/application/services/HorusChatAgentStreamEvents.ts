import type {
  HorusChatToolFileOperation,
  HorusChatToolStep,
} from "@u-build/shared";

export type HorusChatAgentStreamEvent =
  | { type: "text"; text: string }
  | {
      type: "tool_started";
      tool: string;
      title: string;
      detail?: string;
      filePaths?: string[];
      commandIds?: string[];
      taskId?: string | null;
      fileOperations?: HorusChatToolFileOperation[];
    }
  | {
      type: "tool_succeeded";
      tool: string;
      title: string;
      detail?: string;
      filePaths?: string[];
      commandIds?: string[];
      taskId?: string | null;
      fileOperations?: HorusChatToolFileOperation[];
    }
  | {
      type: "tool_failed";
      tool: string;
      title: string;
      detail: string;
      filePaths?: string[];
      commandIds?: string[];
      taskId?: string | null;
      fileOperations?: HorusChatToolFileOperation[];
    };

export type HorusChatResponderStreamEvent = HorusChatAgentStreamEvent | string;

export type HorusChatAgentToolStreamEvent = Extract<
  HorusChatAgentStreamEvent,
  { tool: string; title: string }
>;

export function chunkText(text: string, size = 24): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

export function streamEventToToolStep(
  event: HorusChatAgentToolStreamEvent
): HorusChatToolStep {
  return {
    tool: event.tool,
    title: event.title,
    phase:
      event.type === "tool_started"
        ? "started"
        : event.type === "tool_succeeded"
        ? "succeeded"
        : "failed",
    ...("detail" in event && event.detail ? { detail: event.detail } : {}),
    filePaths: event.filePaths ?? [],
    commandIds: event.commandIds ?? [],
    taskId: event.taskId ?? null,
    fileOperations: event.fileOperations ?? [],
  };
}

export function mergeToolStep(
  steps: HorusChatToolStep[],
  step: HorusChatToolStep
): HorusChatToolStep[] {
  if (step.phase === "started") {
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const candidate = steps[index];
      if (
        candidate &&
        candidate.title === step.title &&
        candidate.tool === step.tool &&
        candidate.phase === "started"
      ) {
        const next = steps.slice();
        next[index] = {
          ...candidate,
          ...(step.detail
            ? {
                detail: appendToolStepDetail(candidate.detail, step.detail),
              }
            : {}),
          ...(step.sequence ? { sequence: step.sequence } : {}),
          filePaths: mergeUnique(candidate.filePaths, step.filePaths),
          commandIds: mergeUnique(candidate.commandIds, step.commandIds),
          taskId: step.taskId ?? candidate.taskId ?? null,
          fileOperations: mergeFileOperations(
            candidate.fileOperations,
            step.fileOperations
          ),
        };
        return next;
      }
    }
    return [...steps, step];
  }
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const candidate = steps[index];
    if (
      candidate &&
      candidate.title === step.title &&
      candidate.tool === step.tool &&
      candidate.phase === "started"
    ) {
      const next = steps.slice();
      next[index] = {
        ...candidate,
        phase: step.phase,
        ...(step.detail ? { detail: step.detail } : {}),
        filePaths: mergeUnique(candidate.filePaths, step.filePaths),
        commandIds: mergeUnique(candidate.commandIds, step.commandIds),
        taskId: step.taskId ?? candidate.taskId ?? null,
        fileOperations: mergeFileOperations(
          candidate.fileOperations,
          step.fileOperations
        ),
      };
      return next;
    }
  }
  return [...steps, step];
}

function appendToolStepDetail(
  current: string | undefined,
  chunk: string,
  maxLength = 2400
): string {
  const next = `${current ?? ""}${chunk}`;
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

function mergeUnique(
  left: readonly string[] = [],
  right: readonly string[] = []
): string[] {
  return [...new Set([...left, ...right])];
}

function mergeFileOperations(
  left: readonly HorusChatToolFileOperation[] = [],
  right: readonly HorusChatToolFileOperation[] = []
): HorusChatToolFileOperation[] {
  const byPath = new Map<string, HorusChatToolFileOperation>();
  for (const operation of left) byPath.set(operation.path, operation);
  for (const operation of right) byPath.set(operation.path, operation);
  return [...byPath.values()];
}
