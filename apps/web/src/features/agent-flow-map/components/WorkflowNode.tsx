import { GitBranch, ShieldCheck, Sparkles, Target, Terminal, UserCheck } from "lucide-react";
import type { JSX } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentFlowNode, AgentFlowNodeData } from "../types/flow.types.js";
import { cn } from "../utils/cn.js";

export function WorkflowNode({ data, selected }: NodeProps<AgentFlowNode>): JSX.Element {
  const nodeData = data as AgentFlowNodeData;
  const Icon = iconForNode(nodeData.kind, nodeData.stage);

  return (
    <article
      className={cn(
        "agent-flow-node",
        `agent-flow-node-${nodeData.status}`,
        `agent-flow-stage-${nodeData.stage}`,
        selected && "is-selected",
        nodeData.isCurrent && "is-current",
        nodeData.isReplayFocus && "is-replay-focus"
      )}
    >
      <Handle id="left" className="agent-flow-handle" type="target" position={Position.Left} />
      <Handle id="top" className="agent-flow-handle" type="target" position={Position.Top} />
      <Handle id="bottom" className="agent-flow-handle" type="target" position={Position.Bottom} />
      <div className="agent-flow-node-head">
        <span className="agent-flow-node-icon" aria-hidden="true">
          <Icon size={17} />
        </span>
        <div>
          <p className="agent-flow-node-title">{nodeData.label}</p>
          <p className="agent-flow-node-subtitle">{nodeData.shortLabel}</p>
        </div>
        {nodeData.isCurrent && <span className="agent-flow-live-pill">live</span>}
      </div>
      <p className="agent-flow-node-description">{nodeData.description}</p>
      <div className="agent-flow-node-metrics">
        <span>{nodeData.stage}</span>
        <span>{nodeData.eventCount} sinais</span>
        <span>{nodeData.assignmentCount} exec.</span>
      </div>
      {nodeData.latestSummary && (
        <p className="agent-flow-node-summary">{nodeData.latestSummary}</p>
      )}
      {nodeData.errorMessage && (
        <p className="agent-flow-node-error">{nodeData.errorMessage}</p>
      )}
      <Handle id="right" className="agent-flow-handle" type="source" position={Position.Right} />
      <Handle id="top" className="agent-flow-handle" type="source" position={Position.Top} />
      <Handle id="bottom" className="agent-flow-handle" type="source" position={Position.Bottom} />
    </article>
  );
}

function iconForNode(kind: AgentFlowNodeData["kind"], stage: AgentFlowNodeData["stage"]) {
  if (kind === "approval") return UserCheck;
  if (kind === "decision") return GitBranch;
  if (kind === "terminal") return Terminal;
  if (stage === "curation") return ShieldCheck;
  if (stage === "supervision") return Target;
  return Sparkles;
}
