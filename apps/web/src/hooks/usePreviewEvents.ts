import { PreviewEventSchema, type PreviewEvent } from "@u-build/shared";
import { useSseStream, type UseSseStreamResult } from "./useSseStream.js";

export function usePreviewEvents(
  sessionId: string | null
): UseSseStreamResult<PreviewEvent> {
  return useSseStream<PreviewEvent>({
    url: sessionId ? `/api/preview/events/${sessionId}` : null,
    errorMessage: "Preview event stream offline",
    logPrefix: "usePreviewEvents",
    parseEvent: (payload) => PreviewEventSchema.parse(payload),
  });
}
