import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  useReactFlow,
} from "@xyflow/react";
import { useCallback, useMemo, useRef, useState, type JSX, type PointerEvent } from "react";
import type { AgentFlowEdge } from "../types/flow.types.js";
import { cn } from "../utils/cn.js";

type EdgePoint = { x: number; y: number };
type ManualEdgeMode = "orthogonal" | "free";

export function FlowEdge(props: EdgeProps<AgentFlowEdge>): JSX.Element {
  const flow = useReactFlow();
  const [manualPoint, setManualPoint] = useState<EdgePoint | null>(null);
  const [manualMode, setManualMode] = useState<ManualEdgeMode>("orthogonal");
  const dragRef = useRef<{
    pointerX: number;
    pointerY: number;
    point: EdgePoint;
  } | null>(null);
  const [defaultPath, defaultLabelX, defaultLabelY] =
    props.data?.route === "loop"
      ? getLoopPath(props)
      : getOrthogonalPath(props);
  const controlPoint = manualPoint ?? { x: defaultLabelX, y: defaultLabelY };
  const path = manualPoint
    ? getManualPath(props, manualPoint, manualMode)
    : defaultPath;

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        point: controlPoint,
      };
      const zoom = flow.getZoom();
      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        setManualPoint({
          x: drag.point.x + (moveEvent.clientX - drag.pointerX) / zoom,
          y: drag.point.y + (moveEvent.clientY - drag.pointerY) / zoom,
        });
        setManualMode(moveEvent.shiftKey ? "free" : "orthogonal");
      };
      const handlePointerUp = () => {
        dragRef.current = null;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [controlPoint, flow]
  );

  const edgeClassName = useMemo(
    () =>
      cn(
        "agent-flow-edge",
        manualPoint && "agent-flow-edge-manual",
        manualPoint && `agent-flow-edge-manual-${manualMode}`,
        `agent-flow-edge-${props.data?.route ?? "primary"}`,
        `agent-flow-edge-${props.data?.status ?? "pending"}`
      ),
    [manualPoint, props.data?.route, props.data?.status]
  );

  return (
    <>
      <path className="agent-flow-edge-shadow" d={path} />
      <path className="agent-flow-edge-hit" d={path} />
      <BaseEdge
        id={props.id}
        path={path}
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
        className={edgeClassName}
      />
      <EdgeLabelRenderer>
        <div
          className="agent-flow-edge-tools"
          style={{
            transform: `translate(-50%, -50%) translate(${controlPoint.x}px, ${controlPoint.y}px)`,
          }}
        >
          <button
            type="button"
            className="agent-flow-edge-control"
            aria-label="Arrastar aresta"
            title="Arraste para editar em 90 graus. Segure Shift para curva livre. Duplo clique reseta."
            onPointerDown={handlePointerDown}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setManualPoint(null);
              setManualMode("orthogonal");
            }}
          />
          {props.data?.label && (
            <span className="agent-flow-edge-label">
              {props.data.label}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function getManualPath(
  props: EdgeProps<AgentFlowEdge>,
  point: EdgePoint,
  mode: ManualEdgeMode
): string {
  const sourceX = props.sourceX;
  const sourceY = props.sourceY;
  const targetX = props.targetX;
  const targetY = props.targetY;
  if (mode === "free") {
    return `M ${sourceX},${sourceY} Q ${point.x},${point.y} ${targetX},${targetY}`;
  }
  return [
    `M ${sourceX},${sourceY}`,
    `L ${point.x},${sourceY}`,
    `L ${point.x},${point.y}`,
    `L ${targetX},${point.y}`,
    `L ${targetX},${targetY}`,
  ].join(" ");
}

function getOrthogonalPath(props: EdgeProps<AgentFlowEdge>): [string, number, number] {
  const route = props.data?.route ?? "primary";
  const sourceX = props.sourceX;
  const sourceY = props.sourceY;
  const targetX = props.targetX;
  const targetY = props.targetY;
  if (Math.abs(sourceY - targetY) < 14 || Math.abs(sourceX - targetX) < 14) {
    return [
      `M ${sourceX},${sourceY} L ${targetX},${targetY}`,
      (sourceX + targetX) / 2,
      (sourceY + targetY) / 2,
    ];
  }
  const controlX = (sourceX + targetX) / 2;
  const controlY = (sourceY + targetY) / 2;
  const firstTurnX =
    route === "failure" ? sourceX + Math.sign(targetX - sourceX || 1) * 74 : controlX;
  return [
    [
      `M ${sourceX},${sourceY}`,
      `L ${firstTurnX},${sourceY}`,
      `L ${firstTurnX},${targetY}`,
      `L ${targetX},${targetY}`,
    ].join(" "),
    firstTurnX,
    controlY,
  ];
}

function getLoopPath(props: EdgeProps<AgentFlowEdge>): [string, number, number] {
  const sourceX = props.sourceX;
  const sourceY = props.sourceY;
  const targetX = props.targetX;
  const targetY = props.targetY;
  if (sourceY > targetY) {
    const laneX = loopLaneX(props.id, sourceX, targetX);
    const sourceTurnY = sourceY - 56;
    const targetTurnY = targetY + 56;
    const path = [
      `M ${sourceX},${sourceY}`,
      `L ${sourceX},${sourceTurnY}`,
      `L ${laneX},${sourceTurnY}`,
      `L ${laneX},${targetTurnY}`,
      `L ${targetX},${targetTurnY}`,
      `L ${targetX},${targetY}`,
    ].join(" ");
    return [path, laneX, (sourceTurnY + targetTurnY) / 2];
  }
  const horizontalDistance = Math.abs(sourceX - targetX);
  const depth = Math.max(150, Math.min(300, horizontalDistance * 0.18));
  const controlY = Math.max(sourceY, targetY) + depth;
  const path = [
    `M ${sourceX},${sourceY}`,
    `L ${sourceX},${controlY}`,
    `L ${targetX},${controlY}`,
    `L ${targetX},${targetY}`,
  ].join(" ");
  return [path, (sourceX + targetX) / 2, controlY - 12];
}

function loopLaneX(edgeId: string, sourceX: number, targetX: number): number {
  if (edgeId === "curator-spec" || edgeId === "macro-curator-spec") {
    return Math.min(sourceX, targetX) - 220;
  }
  return Math.max(sourceX, targetX) + Math.max(180, Math.abs(sourceX - targetX) * 0.24);
}
