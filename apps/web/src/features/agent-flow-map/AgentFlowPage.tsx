import { useMemo, useState, type JSX } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WorkflowEvent, WorkflowState } from "@u-build/shared";
import "@xyflow/react/dist/style.css";
import "./styles/agent-flow-map.css";
import { AgentFlowCanvas } from "./components/AgentFlowCanvas.js";
import { FlowToolbar } from "./components/FlowToolbar.js";
import { RunFlowDrawer } from "./components/RunFlowDrawer.js";
import { RunTelemetryPanel } from "./components/RunTelemetryPanel.js";
import { useFlowGraph } from "./hooks/useFlowGraph.js";
import { useRunFlowData } from "./hooks/useRunFlowData.js";
import { useRunFlowEvents } from "./hooks/useRunFlowEvents.js";
import { useFlowSelection } from "./hooks/useFlowSelection.js";
import type {
  HorusRunEventSnapshot,
  HorusRunSnapshot,
  HorusWorkflowNodeId,
} from "./types/api.types.js";
import type { FlowDetailLevel, FlowEdgeVisibility } from "./types/flow.types.js";

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
  const runLoadError = errorMessage(runData.error);
  const run = useMemo(() => {
    if (!runData.run) return null;
    return applyLiveEvents(runData.run, streamedEvents.events);
  }, [runData.run, streamedEvents.events]);
  const graph = useFlowGraph({
    run,
    detailLevel,
    edgeVisibility,
    showAgentExecutions: detailLevel === "micro" && showAgentExecutions,
    replaySequence: null,
  });
  const selection = useFlowSelection(graph);
  const layoutKey = run
    ? `${run.threadId}:${detailLevel}:${edgeVisibility}:${showAgentExecutions ? "exec" : "workflow"}`
    : `empty:${detailLevel}:${edgeVisibility}:${showAgentExecutions ? "exec" : "workflow"}`;

  if (!run) {
    return (
      <div className="agent-flow-map-root">
        <div className="agent-flow-page">
          <FlowToolbar
            run={null}
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
          <AgentFlowAlert message={runLoadError} />
          <section className="agent-flow-empty">
            <h2>Nenhuma execução ativa</h2>
            <p>O mapa aparece quando uma run real existir no runtime do Horus.</p>
          </section>
        </div>
      </div>
    );
  }

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
        <AgentFlowAlert message={runLoadError ?? streamedEvents.error} />
        <section className={`agent-flow-workbench ${selection.selectedNode ? "is-inspector-open" : ""}`}>
          <div className="agent-flow-main-stack">
            <div className="agent-flow-canvas-shell">
              <AgentFlowCanvas
                graph={graph}
                selectedNodeId={selection.selectedNodeId}
                layoutKey={layoutKey}
                onSelectNode={selection.setSelectedNodeId}
                focusRequest={focusRequest}
              />
            </div>
            <RunTelemetryPanel run={run} />
          </div>
          {selection.selectedNode && (
            <RunFlowDrawer
              run={run}
              node={selection.selectedNode}
              onClose={() => selection.setSelectedNodeId(null)}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function AgentFlowAlert({ message }: { message: string | null }): JSX.Element | null {
  if (!message) return null;
  return (
    <p className="agent-flow-alert" role="alert">
      {message}
    </p>
  );
}

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  return String(error);
}

function applyLiveEvents(
  run: HorusRunSnapshot,
  events: HorusRunEventSnapshot[]
): HorusRunSnapshot {
  const normalizedEvents = events.map(normalizeRunEvent);
  let status = run.status;
  let currentNode = run.currentNode;
  let currentPhase = run.currentPhase;

  for (const event of normalizedEvents) {
    if (event.type === "status_changed") {
      const nextStatus = statusFromRunEvent(event);
      if (nextStatus) status = nextStatus;
    }
    if (event.type !== "status_changed") {
      currentPhase = event.phase ?? currentPhase;
    }
    const nodeId = nodeFromLiveEvent(event);
    if (nodeId) currentNode = nodeId;
    if (event.type === "awaiting_approval" || event.type === "awaiting_retry_approval") {
      status = "awaiting_human";
    }
    if (event.type === "error") {
      status = "error";
    }
  }
  if (status === "completed") {
    currentNode = "finalize";
    currentPhase = "completed";
  }
  if (status === "error" || status === "cancelled") {
    currentNode = "fail";
    currentPhase = status === "cancelled" ? "cancelled" : "failed";
  }
  const latestHumanGate = [...normalizedEvents]
    .reverse()
    .find((event) => event.type === "awaiting_approval" || event.type === "awaiting_retry_approval");
  if (status === "awaiting_human" && latestHumanGate) {
    currentNode = nodeFromLiveEvent(latestHumanGate) ?? currentNode;
    currentPhase = latestHumanGate.phase ?? currentPhase;
  }

  return {
    ...run,
    status,
    currentNode,
    currentPhase,
    events: normalizedEvents,
  };
}

function statusFromRunEvent(
  event: HorusRunEventSnapshot
): HorusRunSnapshot["status"] | null {
  if (event.type !== "status_changed") return null;
  if (event.nodeId === "finalize" || event.eventType === "completed" || event.phase === "completed") {
    return "completed";
  }
  if (event.nodeId === "fail" || event.eventType === "failed" || event.phase === "failed") {
    return "error";
  }
  if (event.eventType === "cancelled" || event.phase === "cancelled") {
    return "cancelled";
  }
  if (event.eventType === "received" || event.phase === "received") {
    return "running";
  }
  return null;
}

function normalizeRunEvent(event: HorusRunEventSnapshot): HorusRunEventSnapshot {
  const nodeId = event.nodeId ?? nodeFromLiveEvent(event) ?? undefined;
  const shouldInfer = event.type !== "status_changed" && event.phase === "received";
  const actorName = event.actorName === "Horus" && shouldInfer
    ? actorNameFromLiveEvent(event)
    : event.actorName;
  return {
    ...event,
    ...(nodeId ? { nodeId } : {}),
    ...(shouldInfer
      ? {
          phase: phaseFromLiveEvent(event),
          eventType: eventTypeFromLiveEvent(event),
          actorKind: actorKindFromLiveEvent(event),
          actorName,
        }
      : {}),
  };
}

function nodeFromLiveEvent(
  event: HorusRunEventSnapshot
): HorusWorkflowNodeId | null {
  if (event.nodeId) return event.nodeId;
  if (event.type === "awaiting_approval") return "hitlCheckpoint";
  if (event.type === "awaiting_retry_approval") return "retryCheckpoint";
  if (event.type === "validation_evidence") return "qaAgent";
  if (event.type === "patch_proposed") return "frontAgent";
  if (event.type === "patch_applied") return "curatorAgent";
  if (
    event.type === "tool_call_started" ||
    event.type === "tool_call_finished" ||
    event.type === "tool_call_blocked"
  ) {
    return event.nodeId ?? "frontAgent";
  }
  if (event.type === "error") return "fail";
  return null;
}

function phaseFromLiveEvent(event: HorusRunEventSnapshot): HorusRunEventSnapshot["phase"] {
  if (event.type === "patch_proposed") return "patching";
  if (event.type === "patch_applied") return "applying";
  if (event.type === "validation_evidence") return "validating";
  if (
    event.type === "tool_call_started" ||
    event.type === "tool_call_finished"
  ) {
    return event.phase;
  }
  if (event.type === "tool_call_blocked") return "failed";
  if (event.type === "retry_started" || event.type === "awaiting_retry_approval") return "retrying";
  if (event.type === "awaiting_approval") return "planning";
  if (event.type === "error") return "failed";
  if (event.type === "node_started" || event.type === "node_completed") {
    return phaseFromNode(event.nodeId, event.agentName);
  }
  return event.phase;
}

function eventTypeFromLiveEvent(
  event: HorusRunEventSnapshot
): HorusRunEventSnapshot["eventType"] {
  if (event.type === "patch_proposed") return "patch_proposed";
  if (event.type === "patch_applied") return "patch_applied";
  if (event.type === "validation_evidence") {
    return event.evidence?.status === "failed" ? "validation_failed" : "validation_passed";
  }
  if (event.type === "retry_started") return "retry_started";
  if (event.type === "tool_call_started") return "tool_call_started";
  if (event.type === "tool_call_finished") {
    return event.eventType === "failed" ? "failed" : "tool_call_finished";
  }
  if (event.type === "tool_call_blocked") return "tool_call_blocked";
  if (event.type === "awaiting_approval" || event.type === "awaiting_retry_approval") {
    return "awaiting_approval";
  }
  if (event.type === "error") return "failed";
  if (event.type === "node_started") {
    if (event.agentName === "qa" || event.nodeId === "qaAgent") return "validation_started";
    if (event.agentName === "curator" || event.nodeId === "curatorAgent") return "review_started";
    if (event.agentName === "front" || event.nodeId === "frontAgent") return "context_read";
    return "planning";
  }
  if (event.type === "node_completed") {
    if (event.agentName === "front" || event.nodeId === "frontAgent") return "patch_proposed";
    if (event.agentName === "qa" || event.nodeId === "qaAgent") return "validation_passed";
    if (event.agentName === "curator" || event.nodeId === "curatorAgent") return "review_passed";
    return "planning";
  }
  return event.eventType;
}

function actorKindFromLiveEvent(
  event: HorusRunEventSnapshot
): HorusRunEventSnapshot["actorKind"] {
  if (event.type === "patch_applied" || event.type === "validation_evidence") return "tool";
  if (
    event.type === "tool_call_started" ||
    event.type === "tool_call_finished" ||
    event.type === "tool_call_blocked"
  ) {
    return "tool";
  }
  if (event.type === "awaiting_approval" || event.type === "awaiting_retry_approval") return "human";
  if (event.type === "error") return "system";
  return "agent";
}

function actorNameFromLiveEvent(event: HorusRunEventSnapshot): string {
  if (event.type === "patch_applied") return "CodeChangeSetApplier";
  if (event.type === "validation_evidence") return "Runtime validation";
  if (
    event.type === "tool_call_started" ||
    event.type === "tool_call_finished" ||
    event.type === "tool_call_blocked"
  ) {
    return event.actorName ?? "Agent tool";
  }
  if (event.type === "awaiting_approval") return "Human review";
  if (event.type === "awaiting_retry_approval") return "Retry approval";
  if (event.type === "retry_started") return "Odin";
  if (event.type === "error") return "Horus";
  return agentLabel(event.nodeId, event.agentName);
}

function phaseFromNode(
  nodeId: HorusWorkflowNodeId | undefined,
  agentName: string | undefined
): HorusRunEventSnapshot["phase"] {
  if (agentName === "qa" || nodeId === "qaAgent") return "validating";
  if (agentName === "curator" || nodeId === "curatorAgent") return "reviewing";
  if (agentName === "front" || nodeId === "frontAgent") return "patching";
  return "planning";
}

function agentLabel(nodeId: HorusWorkflowNodeId | undefined, agentName: string | undefined): string {
  if (agentName === "spec" || nodeId === "specAgent") return "Spec Agent";
  if (agentName === "odin" || nodeId === "odinAgent") return "Odin";
  if (agentName === "front" || nodeId === "frontAgent") return "Front Agent";
  if (agentName === "qa" || nodeId === "qaAgent") return "QA Agent";
  if (agentName === "curator" || nodeId === "curatorAgent") return "Curator";
  return "Horus";
}
