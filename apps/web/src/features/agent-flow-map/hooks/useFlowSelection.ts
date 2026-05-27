import { useEffect, useState } from "react";
import type { AgentFlowGraph } from "../types/flow.types.js";

export function useFlowSelection(graph: AgentFlowGraph | null) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (!graph) {
      setSelectedNodeId(null);
      return;
    }
    setSelectedNodeId((current) => {
      if (current && graph.nodes.some((node) => node.id === current)) return current;
      return null;
    });
  }, [graph]);

  const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  return {
    selectedNodeId,
    selectedNode,
    setSelectedNodeId,
  };
}
