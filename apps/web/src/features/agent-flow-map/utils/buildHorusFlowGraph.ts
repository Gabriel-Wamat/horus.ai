import { MarkerType } from "@xyflow/react";
import type { HorusAgentExecutionSnapshot, HorusRunSnapshot, HorusWorkflowNodeId } from "../types/api.types.js";
import type {
  AgentFlowEdge,
  AgentFlowEdgeData,
  AgentFlowGraph,
  AgentFlowNode,
  FlowEdgeVisibility,
  FlowDetailLevel,
  FlowNodeStatus,
} from "../types/flow.types.js";
import { layoutGraph } from "./layoutGraph.js";
import { mapSnapshotStatus } from "./mapRunStatus.js";
import {
  MACRO_WORKFLOW_EDGE_DEFINITIONS,
  MACRO_WORKFLOW_NODE_DEFINITIONS,
  MICRO_WORKFLOW_EDGE_DEFINITIONS,
  MICRO_WORKFLOW_NODE_DEFINITIONS,
} from "./nodeMetadata.js";

export function buildHorusFlowGraph(input: {
  run: HorusRunSnapshot;
  detailLevel: FlowDetailLevel;
  edgeVisibility: FlowEdgeVisibility;
  showAgentExecutions: boolean;
  replaySequence: number | null;
}): AgentFlowGraph {
  const isLiveRun = input.run.status === "running" || input.run.status === "awaiting_human";
  const definitions = input.detailLevel === "macro" ? MACRO_WORKFLOW_NODE_DEFINITIONS : MICRO_WORKFLOW_NODE_DEFINITIONS;
  const edgeDefinitions = input.detailLevel === "macro" ? MACRO_WORKFLOW_EDGE_DEFINITIONS : MICRO_WORKFLOW_EDGE_DEFINITIONS;
  const activeNodeId = input.run.currentNode;
  const replayNodeId = input.replaySequence == null
    ? null
    : input.run.events.find((event) => event.sequence === input.replaySequence)?.nodeId ?? null;

  const nodes: AgentFlowNode[] = definitions.map((definition) => {
    const step = input.run.steps.find((candidate) => candidate.nodeId === definition.id);
    const executions = nodeExecutions(input.run.agentExecutions, definition.id, input.detailLevel);
    const events = input.run.events.filter((event) => event.nodeId === definition.id);
    const errorMessage = step?.error_message ?? executions.find((execution) => execution.errorMessage)?.errorMessage ?? null;
    const isObserved = Boolean(step || executions.length || events.length);
    const status = resolveWorkflowStatus(definition.id, input.run, activeNodeId, replayNodeId, isObserved, errorMessage);
    const isCurrent = isLiveRun && definition.id === activeNodeId;

    return {
      id: definition.id,
      type: "workflowNode",
      position: definition.position,
      data: {
        kind: definition.kind,
        nodeName: definition.id,
        label: definition.label,
        shortLabel: definition.shortLabel,
        description: definition.description,
        stage: definition.stage,
        status,
        latestSummary: events.at(-1)?.summary ?? executions.at(-1)?.summary ?? null,
        errorMessage,
        latencyMs: step?.latency_ms ?? executions.at(-1)?.executionTimeMs ?? null,
        eventCount: events.length,
        stepCount: step ? 1 : 0,
        assignmentCount: executions.length,
        isCurrent,
        isObserved,
        isReplayFocus: definition.id === replayNodeId,
        canExpand: executions.length > 0,
      },
    };
  });

  if (input.detailLevel === "micro" && input.showAgentExecutions) {
    nodes.push(...buildExecutionNodes(input.run));
  }

  const visibleEdgeDefinitions = input.edgeVisibility === "simple"
    ? edgeDefinitions.filter((definition) => shouldShowSimplifiedEdge(definition.id))
    : edgeDefinitions;

  const edges: AgentFlowEdge[] = visibleEdgeDefinitions.map((definition) => {
    const sourceNode = nodes.find((node) => node.id === definition.source);
    const targetNode = nodes.find((node) => node.id === definition.target);
    const active = isLiveRun && (sourceNode?.data.status === "active" || targetNode?.data.status === "active");
    const handles = resolveWorkflowEdgeHandles(definition.route ?? "primary");
    return {
      id: definition.id,
      source: definition.source,
      target: definition.target,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      type: "flowEdge",
      animated: active,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: {
        status: active ? "active" : "pending",
        route: definition.route ?? "primary",
        ...(definition.label ? { label: definition.label } : {}),
      },
    };
  });

  if (input.detailLevel === "micro" && input.showAgentExecutions) {
    edges.push(...buildExecutionEdges(input.run));
  }

  if (input.run.status === "error" && activeNodeId && activeNodeId !== "fail") {
    edges.push({
      id: `error-${activeNodeId}`,
      source: activeNodeId,
      target: "fail",
      sourceHandle: "bottom",
      targetHandle: "top",
      type: "flowEdge",
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { status: "failed", route: "failure", label: "error" },
    });
  }

  return layoutGraph({ nodes, edges, activeNodeId, replayNodeId });
}

function shouldShowSimplifiedEdge(edgeId: string): boolean {
  const normalized = edgeId.startsWith("macro-") ? edgeId.slice("macro-".length) : edgeId;
  return new Set([
    "spec-hitl",
    "hitl-odin",
    "odin-front",
    "odin-qa",
    "front-curator",
    "qa-curator",
    "curator-odin",
    "odin-finalize",
    "curator-fail",
    "curator-retry",
  ]).has(normalized);
}

function resolveWorkflowStatus(
  nodeId: HorusWorkflowNodeId,
  run: HorusRunSnapshot,
  activeNodeId: HorusWorkflowNodeId | null,
  replayNodeId: HorusWorkflowNodeId | null,
  isObserved: boolean,
  errorMessage?: string | null
): FlowNodeStatus {
  if (nodeId === replayNodeId) return "active";
  if (nodeId === activeNodeId) {
    if (run.status === "awaiting_human") return "waiting";
    if (run.status === "running") return "active";
  }
  if (errorMessage) return "failed";
  if (nodeId === "finalize" && run.status === "completed") return "completed";
  if (nodeId === "fail" && (run.status === "error" || run.status === "cancelled")) return "failed";
  if (isObserved) return "completed";
  return "pending";
}

function buildExecutionNodes(run: HorusRunSnapshot): AgentFlowNode[] {
  const lanes = new Map<string, number>();
  return run.agentExecutions.map((execution) => {
    const laneIndex = lanes.get(execution.nodeId) ?? 0;
    lanes.set(execution.nodeId, laneIndex + 1);
    const parentPosition = MICRO_WORKFLOW_NODE_DEFINITIONS.find(
      (definition) => definition.id === execution.nodeId
    )?.position ?? { x: 600, y: 170 };
    return {
      id: `execution:${execution.id}`,
      type: "agentExecutionNode",
      position: {
        x: parentPosition.x - 8 + laneIndex * 230,
        y: 720 + (laneIndex % 2) * 132,
      },
    data: {
      kind: "agentExecution",
      executionId: execution.id,
      nodeName: execution.nodeId,
      label: agentLabel(execution.agentName),
      shortLabel: `#${execution.sequence}`,
      description: execution.summary ?? "Execução registrada no workflow.",
      stage: "execution",
      status: mapSnapshotStatus(execution.status),
      agentName: execution.agentName,
      userStoryId: execution.userStoryId,
      sequence: execution.sequence,
      eventCount: run.events.filter((event) => event.agentName === execution.agentName && event.userStoryId === execution.userStoryId).length,
      executionTimeMs: execution.executionTimeMs ?? null,
      latestSummary: execution.summary ?? null,
      errorMessage: execution.errorMessage ?? null,
      isCurrent: false,
      isObserved: true,
      isReplayFocus: false,
    },
    };
  });
}

function buildExecutionEdges(run: HorusRunSnapshot): AgentFlowEdge[] {
  return run.agentExecutions.map((execution) => ({
    id: `execution-edge:${execution.id}`,
    source: execution.nodeId,
    target: `execution:${execution.id}`,
    sourceHandle: "bottom",
    targetHandle: "top",
    type: "flowEdge",
    markerEnd: { type: MarkerType.ArrowClosed },
    data: {
      status: mapSnapshotStatus(execution.status),
      route: "agentExecution",
      label: `#${execution.sequence}`,
    },
  }));
}

function resolveWorkflowEdgeHandles(route: AgentFlowEdgeData["route"]): {
  sourceHandle: string;
  targetHandle: string;
} {
  if (route === "loop") return { sourceHandle: "top", targetHandle: "bottom" };
  if (route === "failure") return { sourceHandle: "bottom", targetHandle: "top" };
  if (route === "conditional") return { sourceHandle: "bottom", targetHandle: "top" };
  return { sourceHandle: "bottom", targetHandle: "top" };
}

function nodeExecutions(
  executions: HorusAgentExecutionSnapshot[],
  nodeId: HorusWorkflowNodeId,
  _detailLevel: FlowDetailLevel
): HorusAgentExecutionSnapshot[] {
  return executions.filter((execution) => execution.nodeId === nodeId);
}

function agentLabel(agentName: string): string {
  const labels: Record<string, string> = {
    spec: "Spec Agent",
    odin: "Odin",
    front: "Front Agent",
    qa: "QA Agent",
    curator: "Curator",
  };
  return labels[agentName] ?? agentName;
}
