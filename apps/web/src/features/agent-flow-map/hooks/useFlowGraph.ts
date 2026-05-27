import { useMemo } from "react";
import type { HorusRunSnapshot } from "../types/api.types.js";
import type { AgentFlowGraph, FlowDetailLevel, FlowEdgeVisibility } from "../types/flow.types.js";
import { buildHorusFlowGraph } from "../utils/buildHorusFlowGraph.js";

export function useFlowGraph(input: {
  run: HorusRunSnapshot | null;
  detailLevel: FlowDetailLevel;
  edgeVisibility: FlowEdgeVisibility;
  showAgentExecutions: boolean;
  replaySequence: number | null;
}): AgentFlowGraph | null {
  return useMemo(() => {
    if (!input.run) return null;
    return buildHorusFlowGraph({
      run: input.run,
      detailLevel: input.detailLevel,
      edgeVisibility: input.edgeVisibility,
      showAgentExecutions: input.showAgentExecutions,
      replaySequence: input.replaySequence,
    });
  }, [input.detailLevel, input.edgeVisibility, input.replaySequence, input.run, input.showAgentExecutions]);
}
