import { Braces, FileJson, RadioTower } from "lucide-react";
import { useMemo, useState, type JSX } from "react";
import type {
  AgentResult,
  HorusAgentExecutionSnapshot,
  HorusRunEventSnapshot,
  HorusRunSnapshot,
} from "@u-build/shared";

type TelemetryKind = "input" | "event" | "agent_output" | "terminal";

interface TelemetryPickerItem {
  readonly id: string;
  readonly kind: TelemetryKind;
  readonly title: string;
  readonly subtitle: string;
  readonly timestamp: string;
  readonly phase: string;
  readonly actor: string;
  readonly files: readonly string[];
  readonly payload: unknown;
}

interface LiveFileRow {
  readonly path: string;
  readonly status: string;
  readonly actor: string;
  readonly title: string;
  readonly timestamp: string;
}

export function RunTelemetryPanel({ run }: { run: HorusRunSnapshot }): JSX.Element {
  const items = useMemo(() => buildTelemetryItems(run), [run]);
  const liveFiles = useMemo(() => buildLiveFileRows(run.events), [run.events]);
  const [selectedItemId, setSelectedItemId] = useState<string>(() => items[0]?.id ?? "");
  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;

  return (
    <section className="agent-flow-telemetry-panel" aria-label="Telemetria da execução">
      <div className="agent-flow-telemetry-head">
        <div>
          <p className="agent-flow-rail-kicker">Telemetria</p>
          <h2>Logs e JSON por etapa</h2>
        </div>
        <div className="agent-flow-telemetry-stats" aria-label="Resumo da telemetria">
          <span>
            <RadioTower size={13} /> {items.length} eventos
          </span>
          <span>
            <FileJson size={13} /> {liveFiles.length} arquivos
          </span>
        </div>
      </div>

      <div className="agent-flow-telemetry-grid">
        <div className="agent-flow-telemetry-picker" aria-label="Selecionar etapa">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === selectedItem?.id ? "is-active" : ""}
              onClick={() => setSelectedItemId(item.id)}
            >
              <span>{kindLabel(item.kind)}</span>
              <strong>{item.title}</strong>
              <em>{item.subtitle}</em>
            </button>
          ))}
        </div>

        <div className="agent-flow-telemetry-json">
          {selectedItem ? (
            <>
              <div className="agent-flow-telemetry-json-head">
                <div>
                  <p className="agent-flow-drawer-label">{selectedItem.phase}</p>
                  <strong>{selectedItem.title}</strong>
                  <span>
                    {selectedItem.actor} · {formatDateTime(selectedItem.timestamp)}
                  </span>
                </div>
                <Braces size={17} />
              </div>
              {selectedItem.files.length > 0 ? (
                <div className="agent-flow-telemetry-files-inline">
                  {selectedItem.files.map((path) => (
                    <code key={path}>{path}</code>
                  ))}
                </div>
              ) : null}
              <pre>{stringifyJson(selectedItem.payload)}</pre>
            </>
          ) : (
            <p className="agent-flow-muted">Nenhuma etapa registrada.</p>
          )}
        </div>

        <div className="agent-flow-live-files-panel">
          <div className="agent-flow-live-files-head">
            <p className="agent-flow-drawer-label">Arquivos em tempo real</p>
            <strong>{liveFiles.length}</strong>
          </div>
          {liveFiles.length === 0 ? (
            <p className="agent-flow-muted">
              Nenhuma leitura ou alteração de arquivo registrada nesta execução.
            </p>
          ) : (
            <div className="agent-flow-live-files-list">
              {liveFiles.map((file) => (
                <article key={file.path}>
                  <div>
                    <strong>{file.path}</strong>
                    <span>{file.title}</span>
                  </div>
                  <em className={`is-${file.status}`}>{file.status}</em>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function buildTelemetryItems(run: HorusRunSnapshot): TelemetryPickerItem[] {
  const intakeTimestamp = run.startedAt;
  const items: TelemetryPickerItem[] = [
    {
      id: `intake:${run.threadId}`,
      kind: "input",
      title: "Ingestão de user stories",
      subtitle: `${run.userStories.length} história(s) recebida(s)`,
      timestamp: intakeTimestamp,
      phase: "received",
      actor: "Horus",
      files: [],
      payload: {
        threadId: run.threadId,
        workflowMode: run.workflowMode,
        workspaceFolderId: run.workspaceFolderId ?? null,
        projectWorkspaceId: run.sourceState.projectWorkspaceId ?? null,
        frontendProjectId: run.sourceState.frontendProjectId ?? null,
        userStories: run.sourceState.userStories,
        initialSpecs: run.sourceState.specs,
      },
    },
  ];

  for (const event of run.events) {
    items.push({
      id: `event:${event.id}`,
      kind: "event",
      title: event.title,
      subtitle: event.summary ?? event.eventType,
      timestamp: event.timestamp,
      phase: event.phase,
      actor: event.actorName,
      files: event.filePaths ?? [],
      payload: event,
    });
  }

  for (const execution of run.agentExecutions) {
    const result = findAgentResult(run, execution);
    items.push({
      id: `agent-output:${execution.id}`,
      kind: "agent_output",
      title: `${execution.agentName} output`,
      subtitle: execution.summary ?? execution.status,
      timestamp: execution.completedAt ?? run.startedAt,
      phase: execution.nodeId,
      actor: execution.agentName,
      files: filesFromAgentResult(result),
      payload: {
        execution,
        agentResult: result,
        output: result?.status === "success" ? result.output : null,
      },
    });
  }

  items.push({
    id: `terminal:${run.threadId}`,
    kind: "terminal",
    title: "Software concluído",
    subtitle: run.validationSummary?.message ?? run.status,
    timestamp: run.completedAt ?? run.events.at(-1)?.timestamp ?? run.startedAt,
    phase: run.currentPhase,
    actor: "Horus",
    files: run.evidenceSummaries.flatMap((summary) => summary.filesChanged),
    payload: {
      status: run.status,
      currentNode: run.currentNode,
      currentPhase: run.currentPhase,
      completedAt: run.completedAt ?? null,
      errorMessage: run.errorMessage ?? null,
      validationSummary: run.validationSummary ?? null,
      evidenceSummaries: run.evidenceSummaries,
    },
  });

  return items.sort((left, right) => {
    const byTime = left.timestamp.localeCompare(right.timestamp);
    if (byTime !== 0) return byTime;
    return left.id.localeCompare(right.id);
  });
}

function buildLiveFileRows(events: readonly HorusRunEventSnapshot[]): LiveFileRow[] {
  const latestByPath = new Map<string, LiveFileRow>();
  for (const event of events) {
    for (const path of event.filePaths ?? []) {
      latestByPath.set(path, {
        path,
        status: fileStatusFromEvent(event),
        actor: event.actorName,
        title: event.title,
        timestamp: event.timestamp,
      });
    }
  }
  return [...latestByPath.values()].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp)
  );
}

function fileStatusFromEvent(event: HorusRunEventSnapshot): string {
  if (event.type === "tool_call_started") return "editando";
  if (event.type === "tool_call_blocked") return "bloqueado";
  if (event.type === "tool_call_finished") return "aplicado";
  if (event.type === "patch_proposed") return "proposto";
  if (event.type === "patch_applied") return "aplicado";
  if (event.eventType === "failed") return "falhou";
  if (event.type === "validation_evidence") return "validado";
  return "observado";
}

function findAgentResult(
  run: HorusRunSnapshot,
  execution: HorusAgentExecutionSnapshot
): AgentResult | null {
  const results = run.sourceState.agentResults[execution.userStoryId] ?? [];
  const matches = results.filter(
    (result) =>
      result.agentName === execution.agentName &&
      result.completedAt === execution.completedAt
  );
  return matches.at(-1) ?? null;
}

function filesFromAgentResult(result: AgentResult | null): string[] {
  if (!result || result.status !== "success") return [];
  const value = result.output["filePaths"] ?? result.output["changedFiles"];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function kindLabel(kind: TelemetryKind): string {
  if (kind === "input") return "entrada";
  if (kind === "agent_output") return "output";
  if (kind === "terminal") return "final";
  return "evento";
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
