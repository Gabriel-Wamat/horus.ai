import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentFileOperationTelemetry,
  HorusRunSnapshot,
} from "../types/api.types.js";
import { agentFlowApi } from "../utils/agentFlowApi.js";
import { mergeByIdAndSequence } from "../../../hooks/mergeEvents.js";

const STREAM_STATUSES = new Set(["running", "awaiting_human"]);

export function useRunFileOperations(run: HorusRunSnapshot | null): {
  operations: AgentFileOperationTelemetry[];
  isLoading: boolean;
  error: Error | null;
} {
  const [streamedOperations, setStreamedOperations] = useState<
    AgentFileOperationTelemetry[]
  >([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    setStreamedOperations([]);
  }, [run?.threadId]);

  const operationsQuery = useQuery({
    queryKey: ["agent-flow-file-operations", run?.threadId],
    queryFn: () => agentFlowApi.listFileOperations(run!.threadId),
    enabled: Boolean(run?.threadId),
    refetchInterval: run?.status && STREAM_STATUSES.has(run.status) ? 2500 : 8000,
  });

  useEffect(() => {
    if (!run || !STREAM_STATUSES.has(run.status)) return;
    const base = operationsQuery.data?.operations ?? [];
    const sinceSequence = Math.max(0, ...base.map((operation) => operation.sequence));
    const stream = agentFlowApi.streamFileOperations(
      run.threadId,
      sinceSequence,
      (operation) => {
        setStreamedOperations((current) => mergeOperations(current, [operation]));
        void queryClient.invalidateQueries({
          queryKey: ["agent-flow-file-operations", run.threadId],
          exact: true,
        });
      }
    );
    return () => stream.close();
  }, [operationsQuery.data?.operations, queryClient, run]);

  const operations = useMemo(
    () => mergeOperations(operationsQuery.data?.operations ?? [], streamedOperations),
    [operationsQuery.data?.operations, streamedOperations]
  );

  return {
    operations,
    isLoading: operationsQuery.isLoading,
    error: operationsQuery.error,
  };
}

function mergeOperations(
  base: AgentFileOperationTelemetry[],
  incoming: AgentFileOperationTelemetry[]
): AgentFileOperationTelemetry[] {
  return mergeByIdAndSequence(base, incoming, (operation) => operation.timestamp);
}
