import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { HorusRunEventSnapshot, HorusRunSnapshot } from "../types/api.types.js";
import { agentFlowApi } from "../utils/agentFlowApi.js";
import { mergeByIdAndSequence } from "../../../hooks/mergeEvents.js";

const STREAM_STATUSES = new Set(["running", "awaiting_human"]);

export interface UseRunFlowEventsResult {
  events: HorusRunEventSnapshot[];
  error: string | null;
}

export function useRunFlowEvents(run: HorusRunSnapshot | null): UseRunFlowEventsResult {
  const [streamedEvents, setStreamedEvents] = useState<HorusRunEventSnapshot[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setStreamedEvents([]);
    setStreamError(null);
  }, [run?.threadId]);

  useEffect(() => {
    if (!run || !STREAM_STATUSES.has(run.status)) return;
    const sinceSequence = Math.max(0, ...run.events.map((event) => event.sequence));
    const stream = agentFlowApi.streamRunEvents(
      run.threadId,
      sinceSequence,
      (event) => {
        setStreamError(null);
        setStreamedEvents((current) => mergeEvents(current, [event]));
        void queryClient.invalidateQueries({
          queryKey: ["agent-flow-run", run.threadId],
          exact: true,
        });
        void queryClient.invalidateQueries({ queryKey: ["agent-flow-runs"] });
      },
      { onError: setStreamError }
    );
    return () => stream.close();
  }, [queryClient, run]);

  const events = useMemo(
    () => mergeEvents(run?.events ?? [], streamedEvents),
    [run?.events, streamedEvents]
  );

  return useMemo(
    () => ({ events, error: streamError }),
    [events, streamError]
  );
}

function mergeEvents(
  base: HorusRunEventSnapshot[],
  incoming: HorusRunEventSnapshot[]
): HorusRunEventSnapshot[] {
  return mergeByIdAndSequence(base, incoming, (event) => event.timestamp);
}
