import { useEffect, useState } from "react";
import type { AgentFileOperationTelemetry } from "@u-build/shared";
import { mergeByIdAndSequence } from "../../hooks/mergeEvents.js";
import { agentFlowApi } from "../agent-flow-map/utils/agentFlowApi.js";

export function useWorkflowFileOperations(
  workflowThreadId: string | null
): {
  readonly fileOperations: AgentFileOperationTelemetry[];
  readonly fileOperationsError: string | null;
} {
  const [fileOperations, setFileOperations] = useState<
    AgentFileOperationTelemetry[]
  >([]);
  const [fileOperationsError, setFileOperationsError] = useState<string | null>(
    null
  );

  useEffect(() => {
    setFileOperations([]);
    setFileOperationsError(null);
    if (!workflowThreadId) return undefined;

    let cancelled = false;
    let stream: { close: () => void } | null = null;

    void agentFlowApi
      .listFileOperations(workflowThreadId)
      .then((result) => {
        if (cancelled) return;
        setFileOperationsError(null);
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
      .catch((err) => {
        if (!cancelled) {
          setFileOperations([]);
          setFileOperationsError(
            err instanceof Error
              ? err.message
              : "Falha ao carregar operações de arquivo."
          );
        }
      });

    return () => {
      cancelled = true;
      stream?.close();
    };
  }, [workflowThreadId]);

  return { fileOperations, fileOperationsError };
}

function mergeOperations(
  base: AgentFileOperationTelemetry[],
  incoming: AgentFileOperationTelemetry[]
): AgentFileOperationTelemetry[] {
  return mergeByIdAndSequence(base, incoming, (operation) => operation.timestamp);
}
