import { useState, useEffect } from "react";
import type { WorkflowEvent } from "@u-build/shared";

interface UseEventStreamResult {
  latestEvent: WorkflowEvent | null;
  isConnected: boolean;
  error: string | null;
}

export function useEventStream(
  threadId: string | null
): UseEventStreamResult {
  const [latestEvent, setLatestEvent] = useState<WorkflowEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!threadId) return;

    const source = new EventSource(`/api/events/${threadId}`);

    source.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    source.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as WorkflowEvent;
        setLatestEvent(event);
      } catch {
        console.error("[useEventStream] Failed to parse event:", e.data);
      }
    };

    source.onerror = () => {
      setIsConnected(false);
      setError("SSE connection lost");
    };

    return () => {
      source.close();
      setIsConnected(false);
    };
  }, [threadId]);

  return { latestEvent, isConnected, error };
}
