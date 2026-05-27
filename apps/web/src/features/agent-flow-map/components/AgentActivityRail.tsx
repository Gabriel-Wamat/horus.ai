import { Activity, AlertTriangle, CheckCircle2, CircleDashed, Clock3, Radio } from "lucide-react";
import type { JSX } from "react";
import type { HorusRunSnapshot } from "../types/api.types.js";
import type { AgentFlowNode, FlowNodeStatus } from "../types/flow.types.js";

interface AgentActivityRailProps {
  run: HorusRunSnapshot;
  nodes: AgentFlowNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function AgentActivityRail({
  run,
  nodes,
  selectedNodeId,
  onSelectNode,
}: AgentActivityRailProps): JSX.Element {
  const workflowNodes = nodes.filter((node) => node.type === "workflowNode");
  const recentEvents = run.events.slice(-5).reverse();

  return (
    <aside className="agent-flow-rail" aria-label="Atividade dos agentes">
      <div className="agent-flow-rail-head">
        <div>
          <p className="agent-flow-rail-kicker">Agentes</p>
          <h2>Atividade interna</h2>
        </div>
        <span className="agent-flow-rail-live">
          <Radio size={13} />
          {run.status}
        </span>
      </div>

      <div className="agent-flow-rail-list">
        {workflowNodes.map((node) => {
          const data = node.data;
          const nodeEvents = run.events.filter((event) => event.nodeId === data.nodeName);
          const nodeExecutions = run.agentExecutions.filter((execution) => execution.nodeId === data.nodeName);
          const latestEvent = nodeEvents.at(-1);
          const isSelected = selectedNodeId === node.id;

          return (
            <button
              key={node.id}
              type="button"
              className={`agent-flow-rail-card agent-flow-rail-card-${data.status} ${isSelected ? "is-selected" : ""}`}
              onClick={() => onSelectNode(node.id)}
            >
              <span className="agent-flow-rail-card-icon" aria-hidden="true">
                <StatusIcon status={data.status} />
              </span>
              <span className="agent-flow-rail-card-body">
                <span className="agent-flow-rail-card-title">
                  <strong>{data.label}</strong>
                  {data.isCurrent && <em>live</em>}
                </span>
                <span className="agent-flow-rail-card-summary">
                  {latestEvent?.summary ?? data.latestSummary ?? data.description}
                </span>
                <span className="agent-flow-rail-card-metrics">
                  <span>{nodeEvents.length} eventos</span>
                  <span>{nodeExecutions.length} execuções</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="agent-flow-rail-events">
        <p className="agent-flow-rail-kicker">Timeline recente</p>
        {recentEvents.length === 0 ? (
          <p className="agent-flow-muted">Aguardando eventos da run.</p>
        ) : (
          recentEvents.map((event) => (
            <article key={event.id} className="agent-flow-rail-event">
              <span>{event.sequence}</span>
              <div>
                <strong>{event.title}</strong>
                {event.summary && <p>{event.summary}</p>}
              </div>
            </article>
          ))
        )}
      </section>
    </aside>
  );
}

function StatusIcon({ status }: { status: FlowNodeStatus }): JSX.Element {
  if (status === "active") return <Activity size={15} />;
  if (status === "waiting") return <Clock3 size={15} />;
  if (status === "completed") return <CheckCircle2 size={15} />;
  if (status === "failed") return <AlertTriangle size={15} />;
  return <CircleDashed size={15} />;
}
