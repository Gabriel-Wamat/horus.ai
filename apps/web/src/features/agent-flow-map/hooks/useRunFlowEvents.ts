import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { HorusRunEventSnapshot, HorusRunSnapshot } from "../types/api.types.js";
import { agentFlowApi } from "../utils/agentFlowApi.js";
import { mergeByIdAndSequence } from "../../../hooks/mergeEvents.js";

const STREAM_STATUSES = new Set(["running", "awaiting_human"]);

export function useRunFlowEvents(run: HorusRunSnapshot | null): HorusRunEventSnapshot[] {
  const [streamedEvents, setStreamedEvents] = useState<HorusRunEventSnapshot[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    setStreamedEvents([]);
  }, [run?.threadId]);

  useEffect(() => {
    if (!run || !STREAM_STATUSES.has(run.status)) return;
    const sinceSequence = Math.max(0, ...run.events.map((event) => event.sequence));
    const stream = agentFlowApi.streamRunEvents(run.threadId, sinceSequence, (event) => {
      setStreamedEvents((current) => mergeEvents(current, [event]));
      void queryClient.invalidateQueries({
        queryKey: ["agent-flow-run", run.threadId],
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: ["agent-flow-runs"] });
    });
    return () => stream.close();
  }, [queryClient, run]);

  return useMemo(
    () => mergeEvents(run?.events ?? [], streamedEvents),
    [run?.events, streamedEvents]
  );
}

function mergeEvents(
  base: HorusRunEventSnapshot[],
  incoming: HorusRunEventSnapshot[]
): HorusRunEventSnapshot[] {
  return mergeByIdAndSequence(base, incoming, (event) => event.timestamp);
}
