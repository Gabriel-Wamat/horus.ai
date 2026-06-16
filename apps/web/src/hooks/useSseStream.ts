import { useEffect, useState } from "react";

export interface UseSseStreamResult<TEvent> {
  latestEvent: TEvent | null;
  events: TEvent[];
  isConnected: boolean;
  error: string | null;
}

export function useSseStream<TEvent>({
  url,
  errorMessage,
  logPrefix,
  eventTypes,
}: {
  url: string | null;
  errorMessage: string;
  logPrefix: string;
  eventTypes?: readonly string[];
}): UseSseStreamResult<TEvent> {
  const [latestEvent, setLatestEvent] = useState<TEvent | null>(null);
  const [events, setEvents] = useState<TEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setLatestEvent(null);
      setEvents([]);
      setIsConnected(false);
      setError(null);
      return;
    }

    setLatestEvent(null);
    setEvents([]);
    setError(null);

    const source = new EventSource(url);

    source.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    const parse = (event: MessageEvent<string>): void => {
      try {
        const parsed = JSON.parse(event.data) as TEvent;
        setError(null);
        setLatestEvent(parsed);
        setEvents((current) => [...current, parsed]);
      } catch (err) {
        setError(
          `${logPrefix} received an invalid SSE payload: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };

    if (eventTypes?.length) {
      for (const type of eventTypes) {
        source.addEventListener(type, parse as EventListener);
      }
    } else {
      source.onmessage = parse;
    }

    source.onerror = () => {
      setIsConnected(false);
      setError(errorMessage);
    };

    return () => {
      if (eventTypes?.length) {
        for (const type of eventTypes) {
          source.removeEventListener(type, parse as EventListener);
        }
      }
      source.close();
      setIsConnected(false);
    };
  }, [errorMessage, eventTypes, logPrefix, url]);

  return { latestEvent, events, isConnected, error };
}
