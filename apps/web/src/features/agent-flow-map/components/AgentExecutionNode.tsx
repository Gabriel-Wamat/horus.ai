import { Bot, Clock3, FileCheck2 } from "lucide-react";
import type { JSX } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentExecutionFlowNodeData, AgentFlowNode } from "../types/flow.types.js";
import { cn } from "../utils/cn.js";

export function AgentExecutionNode({ data, selected }: NodeProps<AgentFlowNode>): JSX.Element {
  const nodeData = data as AgentExecutionFlowNodeData;
  return (
    <article
      className={cn(
        "agent-flow-execution-node",
        `agent-flow-execution-${nodeData.status}`,
        selected && "is-selected"
      )}
    >
      <Handle id="left" className="agent-flow-handle" type="target" position={Position.Left} />
      <Handle id="top" className="agent-flow-handle" type="target" position={Position.Top} />
      <div className="agent-flow-execution-head">
        <span className="agent-flow-execution-icon" aria-hidden="true">
          <Bot size={16} />
        </span>
        <div>
          <p className="agent-flow-node-title">{nodeData.label}</p>
          <p className="agent-flow-node-subtitle">{nodeData.shortLabel}</p>
        </div>
      </div>
      <p className="agent-flow-node-description">{nodeData.description}</p>
      <div className="agent-flow-node-metrics">
        <span>
          <FileCheck2 size={12} />
          {nodeData.eventCount}
        </span>
        <span>
          <Clock3 size={12} />
          {nodeData.executionTimeMs != null ? `${nodeData.executionTimeMs}ms` : "n/a"}
        </span>
      </div>
      {nodeData.errorMessage && <p className="agent-flow-node-error">{nodeData.errorMessage}</p>}
      <Handle id="right" className="agent-flow-handle" type="source" position={Position.Right} />
    </article>
  );
}
