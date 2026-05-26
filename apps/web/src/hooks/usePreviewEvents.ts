import { useEffect, useState } from "react";
import type { PreviewEvent } from "@u-build/shared";

interface UsePreviewEventsResult {
  latestEvent: PreviewEvent | null;
  events: PreviewEvent[];
  isConnected: boolean;
  error: string | null;
}

export function usePreviewEvents(
  sessionId: string | null
): UsePreviewEventsResult {
  const [latestEvent, setLatestEvent] = useState<PreviewEvent | null>(null);
  const [events, setEvents] = useState<PreviewEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLatestEvent(null);
      setEvents([]);
      setIsConnected(false);
      setError(null);
      return;
    }

    setLatestEvent(null);
    setEvents([]);

    const source = new EventSource(`/api/preview/events/${sessionId}`);

    source.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    source.onmessage = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as PreviewEvent;
        setLatestEvent(parsed);
        setEvents((current) => [...current, parsed]);
      } catch {
        console.error("[usePreviewEvents] Failed to parse event:", event.data);
      }
    };

    source.onerror = () => {
      setIsConnected(false);
      setError("Preview event stream offline");
    };

    return () => {
      source.close();
      setIsConnected(false);
    };
  }, [sessionId]);

  return { latestEvent, events, isConnected, error };
}
