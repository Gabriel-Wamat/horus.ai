import { Activity, GitBranch, GitCommitHorizontal, Layers, LocateFixed, Minus } from "lucide-react";
import type { JSX } from "react";
import type { HorusRunLocator, HorusRunSnapshot } from "../types/api.types.js";
import type { FlowDetailLevel, FlowEdgeVisibility } from "../types/flow.types.js";

interface FlowToolbarProps {
  run: HorusRunSnapshot | null;
  runOptions: HorusRunLocator[];
  activeRunId: string | null;
  detailLevel: FlowDetailLevel;
  edgeVisibility: FlowEdgeVisibility;
  showAgentExecutions: boolean;
  onChangeRun: (threadId: string) => void;
  onChangeDetailLevel: (level: FlowDetailLevel) => void;
  onChangeEdgeVisibility: (visibility: FlowEdgeVisibility) => void;
  onToggleAgentExecutions: () => void;
  onFocusActive: () => void;
}

export function FlowToolbar({
  run,
  runOptions,
  activeRunId,
  detailLevel,
  edgeVisibility,
  showAgentExecutions,
  onChangeRun,
  onChangeDetailLevel,
  onChangeEdgeVisibility,
  onToggleAgentExecutions,
  onFocusActive,
}: FlowToolbarProps): JSX.Element {
  return (
    <header className="agent-flow-toolbar">
      <div className="agent-flow-toolbar-title">
        <span className="agent-flow-toolbar-icon" aria-hidden="true">
          <Activity size={17} />
        </span>
        <div>
          <h2>Mapa operacional</h2>
          <p>{run ? `${run.threadId.slice(0, 8)} · ${run.status}` : "Sem run ativa"}</p>
        </div>
      </div>
      <div className="agent-flow-toolbar-controls">
        <label className="agent-flow-run-select">
          <span>Run</span>
          <select
            value={activeRunId ?? ""}
            onChange={(event) => onChangeRun(event.target.value)}
            disabled={runOptions.length === 0}
          >
            {runOptions.length === 0 ? (
              <option value="">Sem runs</option>
            ) : (
              runOptions.map((option) => (
                <option key={option.threadId} value={option.threadId}>
                  {option.title} · {option.threadId.slice(0, 8)}
                </option>
              ))
            )}
          </select>
        </label>
        <div className="agent-flow-segmented" aria-label="Detalhe do grafo">
          <button
            type="button"
            className={detailLevel === "macro" ? "active" : ""}
            aria-label="Visão macro"
            title="Visão macro"
            onClick={() => onChangeDetailLevel("macro")}
          >
            <Layers size={15} />
          </button>
          <button
            type="button"
            className={detailLevel === "micro" ? "active" : ""}
            aria-label="Visão micro"
            title="Visão micro"
            onClick={() => onChangeDetailLevel("micro")}
          >
            <GitBranch size={15} />
          </button>
        </div>
        <div className="agent-flow-segmented" aria-label="Densidade das arestas">
          <button
            type="button"
            className={edgeVisibility === "simple" ? "active" : ""}
            aria-label="Arestas simplificadas"
            title="Arestas simplificadas"
            onClick={() => onChangeEdgeVisibility("simple")}
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            className={edgeVisibility === "full" ? "active" : ""}
            aria-label="Arestas completas"
            title="Arestas completas"
            onClick={() => onChangeEdgeVisibility("full")}
          >
            <GitCommitHorizontal size={15} />
          </button>
        </div>
        <button
          type="button"
          className="agent-flow-tool-button"
          onClick={onToggleAgentExecutions}
          disabled={detailLevel !== "micro"}
          aria-pressed={showAgentExecutions}
        >
          <GitCommitHorizontal size={15} />
          Execuções
        </button>
        <button type="button" className="agent-flow-tool-button" onClick={onFocusActive}>
          <LocateFixed size={15} />
          Foco
        </button>
      </div>
    </header>
  );
}
