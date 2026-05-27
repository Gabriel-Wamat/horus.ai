import { useCallback, useEffect, useRef, type JSX } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import { WorkflowNode } from "./WorkflowNode.js";
import { AgentExecutionNode } from "./AgentExecutionNode.js";
import { FlowEdge } from "./FlowEdge.js";
import type { AgentFlowEdge, AgentFlowGraph, AgentFlowNode } from "../types/flow.types.js";

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode,
  agentExecutionNode: AgentExecutionNode,
};

const edgeTypes: EdgeTypes = {
  flowEdge: FlowEdge,
};

interface AgentFlowCanvasProps {
  graph: AgentFlowGraph;
  selectedNodeId: string | null;
  layoutKey: string;
  onSelectNode: (nodeId: string | null) => void;
  focusRequest: number;
}

export function AgentFlowCanvas(props: AgentFlowCanvasProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <AgentFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function AgentFlowCanvasInner({
  graph,
  selectedNodeId,
  layoutKey,
  onSelectNode,
  focusRequest,
}: AgentFlowCanvasProps): JSX.Element {
  const flow = useReactFlow<AgentFlowNode, AgentFlowEdge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentFlowNode>(graph.nodes);
  const previousLayoutKey = useRef(layoutKey);
  const isDraggingRef = useRef(false);
  const hasUserPositionedNodesRef = useRef(false);
  const pendingGraphNodesRef = useRef<AgentFlowNode[] | null>(null);

  useEffect(() => {
    setNodes((previous) => {
      const shouldResetLayout = previousLayoutKey.current !== layoutKey;
      previousLayoutKey.current = layoutKey;
      if (shouldResetLayout) {
        hasUserPositionedNodesRef.current = false;
      }
      if (isDraggingRef.current && !shouldResetLayout) {
        pendingGraphNodesRef.current = graph.nodes;
        return previous;
      }
      const previousPositions = new Map(previous.map((node) => [node.id, node.position]));
      return graph.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
        position: shouldResetLayout
          ? node.position
          : previousPositions.get(node.id) ?? node.position,
      }));
    });
  }, [graph.nodes, layoutKey, selectedNodeId, setNodes]);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setNodes((previous) =>
      previous.map((node) => ({ ...node, selected: node.id === selectedNodeId }))
    );
  }, [selectedNodeId, setNodes]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (hasUserPositionedNodesRef.current) return;
      flow.fitView({
        padding: 0.18,
        duration: 360,
        includeHiddenNodes: false,
      });
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [flow, layoutKey]);

  const handleNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
    hasUserPositionedNodesRef.current = true;
  }, []);

  const handleNodeDragStop = useCallback(() => {
    isDraggingRef.current = false;
    const pendingNodes = pendingGraphNodesRef.current;
    pendingGraphNodesRef.current = null;
    if (!pendingNodes) return;
    setNodes((previous) => {
      const previousPositions = new Map(previous.map((node) => [node.id, node.position]));
      return pendingNodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
        position: previousPositions.get(node.id) ?? node.position,
      }));
    });
  }, [selectedNodeId, setNodes]);

  const focusActiveNode = useCallback(() => {
    const targetId = graph.replayNodeId ?? graph.activeNodeId;
    if (!targetId) return;
    const target = nodes.find((node) => node.id === targetId) ?? graph.nodes.find((node) => node.id === targetId);
    if (!target) return;
    flow.setCenter(target.position.x + 105, target.position.y + 44, {
      zoom: target.id.startsWith("execution:") ? 1.12 : 0.92,
      duration: 420,
    });
  }, [flow, graph.activeNodeId, graph.nodes, graph.replayNodeId, nodes]);

  useEffect(() => {
    if (focusRequest === 0) return;
    window.setTimeout(focusActiveNode, 80);
  }, [focusActiveNode, focusRequest]);

  const handleViewportMoveStart = useCallback(() => {
    hasUserPositionedNodesRef.current = true;
  }, []);

  return (
    <div className="agent-flow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable
        nodesConnectable={false}
        snapToGrid={false}
        autoPanOnNodeDrag
        panOnScroll
        selectionOnDrag={false}
        defaultViewport={{ x: 42, y: 110, zoom: 0.58 }}
        minZoom={0.28}
        maxZoom={1.5}
        onNodesChange={onNodesChange}
        onMoveStart={handleViewportMoveStart}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(148, 163, 184, 0.32)" gap={24} size={1.3} />
      </ReactFlow>
    </div>
  );
}
