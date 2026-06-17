import { useEffect, useRef, useState } from "react";

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
  parseEvent,
  eventTypes,
}: {
  url: string | null;
  errorMessage: string;
  logPrefix: string;
  parseEvent: (payload: unknown) => TEvent;
  eventTypes?: readonly string[];
}): UseSseStreamResult<TEvent> {
  const [latestEvent, setLatestEvent] = useState<TEvent | null>(null);
  const [events, setEvents] = useState<TEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parseEventRef = useRef(parseEvent);
  const errorMessageRef = useRef(errorMessage);
  const logPrefixRef = useRef(logPrefix);
  const eventTypesKey = eventTypes?.join("\u0000") ?? "";

  useEffect(() => {
    parseEventRef.current = parseEvent;
    errorMessageRef.current = errorMessage;
    logPrefixRef.current = logPrefix;
  }, [errorMessage, logPrefix, parseEvent]);

  useEffect(() => {
    if (!url) {
      setLatestEvent((current) => (current === null ? current : null));
      setEvents((current) => (current.length === 0 ? current : []));
      setIsConnected(false);
      setError((current) => (current === null ? current : null));
      return;
    }

    setLatestEvent(null);
    setEvents([]);
    setError(null);

    const source = new EventSource(url);
    const activeEventTypes = eventTypesKey.length > 0
      ? eventTypesKey.split("\u0000")
      : [];

    source.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    const parse = (event: MessageEvent<string>): void => {
      try {
        const parsed = parseEventRef.current(JSON.parse(event.data));
        setError(null);
        setLatestEvent(parsed);
        setEvents((current) => [...current, parsed]);
      } catch (err) {
        setError(
          `${logPrefixRef.current} received an invalid SSE payload: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };

    if (activeEventTypes.length) {
      for (const type of activeEventTypes) {
        source.addEventListener(type, parse as EventListener);
      }
    } else {
      source.onmessage = parse;
    }

    source.onerror = () => {
      setIsConnected(false);
      setError(errorMessageRef.current);
    };

    return () => {
      if (activeEventTypes.length) {
        for (const type of activeEventTypes) {
          source.removeEventListener(type, parse as EventListener);
        }
      }
      source.close();
      setIsConnected(false);
    };
  }, [eventTypesKey, url]);

  return { latestEvent, events, isConnected, error };
}
