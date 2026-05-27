import { useMemo, useState, type JSX } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WorkflowEvent, WorkflowState } from "@u-build/shared";
import "@xyflow/react/dist/style.css";
import "./styles/agent-flow-map.css";
import { AgentFlowCanvas } from "./components/AgentFlowCanvas.js";
import { FlowToolbar } from "./components/FlowToolbar.js";
import { RunFlowDrawer } from "./components/RunFlowDrawer.js";
import { useFlowGraph } from "./hooks/useFlowGraph.js";
import { useRunFlowData } from "./hooks/useRunFlowData.js";
import { useRunFlowEvents } from "./hooks/useRunFlowEvents.js";
import { useFlowSelection } from "./hooks/useFlowSelection.js";
import type { FlowDetailLevel, FlowEdgeVisibility } from "./types/flow.types.js";
import { createIdleHorusRunSnapshot } from "./utils/createIdleHorusRunSnapshot.js";

interface AgentFlowPageProps {
  workflowState: WorkflowState | null;
  events: WorkflowEvent[];
}

export function AgentFlowPage({ workflowState, events }: AgentFlowPageProps): JSX.Element {
  return (
    <QueryClientProvider client={agentFlowQueryClient}>
      <AgentFlowPageContent workflowState={workflowState} events={events} />
    </QueryClientProvider>
  );
}

const agentFlowQueryClient = new QueryClient();

function AgentFlowPageContent({ workflowState, events }: AgentFlowPageProps): JSX.Element {
  const [detailLevel, setDetailLevel] = useState<FlowDetailLevel>("micro");
  const [edgeVisibility, setEdgeVisibility] = useState<FlowEdgeVisibility>("simple");
  const [showAgentExecutions, setShowAgentExecutions] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const runData = useRunFlowData({ workflowState, events });
  const streamedEvents = useRunFlowEvents(runData.run);
  const run = useMemo(() => {
    if (!runData.run) return null;
    return { ...runData.run, events: streamedEvents };
  }, [runData.run, streamedEvents]);
  const displayRun = useMemo(() => run ?? createIdleHorusRunSnapshot(), [run]);
  const graph = useFlowGraph({
    run: displayRun,
    detailLevel,
    edgeVisibility,
    showAgentExecutions: detailLevel === "micro" && showAgentExecutions,
    replaySequence: null,
  });
  const selection = useFlowSelection(graph);
  const layoutKey = `${displayRun.threadId}:${detailLevel}:${edgeVisibility}:${showAgentExecutions ? "exec" : "workflow"}`;

  if (!graph) {
    return (
      <div className="agent-flow-map-root">
        <section className="agent-flow-empty">
          <h2>Mapa indisponível</h2>
          <p>Não foi possível montar a visualização operacional desta execução.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="agent-flow-map-root">
      <div className="agent-flow-page">
        <FlowToolbar
          run={run}
          runOptions={runData.runOptions}
          activeRunId={runData.activeRunId}
          detailLevel={detailLevel}
          edgeVisibility={edgeVisibility}
          showAgentExecutions={showAgentExecutions}
          onChangeRun={runData.setActiveRunId}
          onChangeDetailLevel={setDetailLevel}
          onChangeEdgeVisibility={setEdgeVisibility}
          onToggleAgentExecutions={() => setShowAgentExecutions((current) => !current)}
          onFocusActive={() => setFocusRequest((current) => current + 1)}
        />
        <section className={`agent-flow-workbench ${selection.selectedNode ? "is-inspector-open" : ""}`}>
          <div className="agent-flow-canvas-shell">
            <AgentFlowCanvas
              graph={graph}
              selectedNodeId={selection.selectedNodeId}
              layoutKey={layoutKey}
              onSelectNode={selection.setSelectedNodeId}
              focusRequest={focusRequest}
            />
          </div>
          {selection.selectedNode && (
            <RunFlowDrawer
              run={displayRun}
              node={selection.selectedNode}
              onClose={() => selection.setSelectedNodeId(null)}
            />
          )}
        </section>
      </div>
    </div>
  );
}
