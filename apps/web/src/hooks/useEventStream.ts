import { parseWorkflowEvent, type WorkflowEvent } from "@u-build/shared";
import { useSseStream, type UseSseStreamResult } from "./useSseStream.js";

export function useEventStream(
  threadId: string | null
): UseSseStreamResult<WorkflowEvent> {
  return useSseStream<WorkflowEvent>({
    url: threadId ? `/api/events/${threadId}` : null,
    errorMessage: "SSE connection lost",
    logPrefix: "useEventStream",
    parseEvent: parseWorkflowEvent,
  });
}
