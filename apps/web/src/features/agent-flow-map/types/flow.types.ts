import type { Edge, Node } from "@xyflow/react";

export type FlowStage =
  | "context"
  | "exploration"
  | "spec"
  | "supervision"
  | "execution"
  | "verification"
  | "curation"
  | "terminal";

export type FlowNodeKind = "workflow" | "assignment" | "decision" | "approval" | "terminal";
export type FlowNodeStatus = "pending" | "active" | "completed" | "waiting" | "failed" | "skipped";
export type FlowDetailLevel = "macro" | "micro";
export type FlowEdgeVisibility = "simple" | "full";

export type AgentFlowNodeData = {
  kind: FlowNodeKind;
  nodeName: string;
  label: string;
  shortLabel: string;
  description: string;
  stage: FlowStage;
  status: FlowNodeStatus;
  latestSummary?: string | null;
  errorMessage?: string | null;
  latencyMs?: number | null;
  eventCount: number;
  stepCount: number;
  assignmentCount: number;
  isCurrent: boolean;
  isObserved: boolean;
  isReplayFocus: boolean;
  canExpand: boolean;
};

export type AgentExecutionFlowNodeData = {
  kind: "agentExecution";
  executionId: string;
  nodeName: string;
  label: string;
  shortLabel: string;
  description: string;
  stage: "execution";
  status: FlowNodeStatus;
  agentName: string;
  userStoryId: string;
  sequence: number;
  eventCount: number;
  executionTimeMs?: number | null;
  latestSummary?: string | null;
  errorMessage?: string | null;
  isCurrent: boolean;
  isObserved: boolean;
  isReplayFocus: boolean;
};

export type AgentFlowEdgeData = {
  status: FlowNodeStatus;
  route: "primary" | "loop" | "failure" | "conditional" | "agentExecution";
  label?: string;
};

export type AgentFlowNode = Node<AgentFlowNodeData | AgentExecutionFlowNodeData, "workflowNode" | "agentExecutionNode">;
export type AgentFlowEdge = Edge<AgentFlowEdgeData, "flowEdge">;

export type AgentFlowGraph = {
  nodes: AgentFlowNode[];
  edges: AgentFlowEdge[];
  activeNodeId: string | null;
  replayNodeId: string | null;
};
