import { useEffect, useState } from "react";
import type { AgentFileOperationTelemetry } from "@u-build/shared";
import { mergeByIdAndSequence } from "../../hooks/mergeEvents.js";
import { agentFlowApi } from "../agent-flow-map/utils/agentFlowApi.js";

export function useWorkflowFileOperations(
  workflowThreadId: string | null
): {
  readonly fileOperations: AgentFileOperationTelemetry[];
} {
  const [fileOperations, setFileOperations] = useState<
    AgentFileOperationTelemetry[]
  >([]);

  useEffect(() => {
    setFileOperations([]);
    if (!workflowThreadId) return undefined;

    let cancelled = false;
    let stream: { close: () => void } | null = null;

    void agentFlowApi
      .listFileOperations(workflowThreadId)
      .then((result) => {
        if (cancelled) return;
        setFileOperations(result.operations);
        const sinceSequence = Math.max(
          0,
          ...result.operations.map((operation) => operation.sequence)
        );
        stream = agentFlowApi.streamFileOperations(
          workflowThreadId,
          sinceSequence,
          (operation) => {
            setFileOperations((current) =>
              mergeOperations(current, [operation])
            );
          }
        );
      })
      .catch(() => {
        if (!cancelled) setFileOperations([]);
      });

    return () => {
      cancelled = true;
      stream?.close();
    };
  }, [workflowThreadId]);

  return { fileOperations };
}

function mergeOperations(
  base: AgentFileOperationTelemetry[],
  incoming: AgentFileOperationTelemetry[]
): AgentFileOperationTelemetry[] {
  return mergeByIdAndSequence(base, incoming, (operation) => operation.timestamp);
}
