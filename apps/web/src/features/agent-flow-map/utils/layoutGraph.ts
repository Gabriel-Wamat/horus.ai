import type { AgentFlowGraph } from "../types/flow.types.js";

export function layoutGraph(graph: AgentFlowGraph): AgentFlowGraph {
  const minX = Math.min(...graph.nodes.map((node) => node.position.x), 0);
  const minY = Math.min(...graph.nodes.map((node) => node.position.y), 0);

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: {
        x: Math.round(node.position.x - minX),
        y: Math.round(node.position.y - minY),
      },
    })),
  };
}
