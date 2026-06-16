import type { JSX } from "react";
import type {
	  ConsoleFileRow,
	  ContextReceiptRow,
	  OperationalTraceRow,
  TimelineRow,
  ValidationChainRow,
} from "./projections.js";
import {
  formatTime,
  operationStatusLabel,
  operationTypeLabel,
  shortId,
  terminalStatusTone,
} from "./projections.js";
import type { FollowedTaskOutput, TerminalRow } from "./useExecutionTaskOutputs.js";

export function ExecutionConsoleHeader({
  projectName,
  runLabel,
  onToggleCollapsed,
}: {
  readonly projectName: string;
  readonly runLabel: string;
  readonly onToggleCollapsed: () => void;
}): JSX.Element {
  return (
    <header className="execution-console-head">
      <div className="execution-console-title">
        <span>Execution Console</span>
        <strong>{projectName}</strong>
      </div>
      <div className="execution-console-head-actions">
        <code>{runLabel}</code>
        <button
          className="execution-console-toggle"
          type="button"
          aria-label="Recolher Execution Console"
          title="Recolher console"
          onClick={onToggleCollapsed}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="5" width="16" height="14" rx="2" />
            <path d="M15 5v14M10 8l4 4-4 4" />
          </svg>
        </button>
      </div>
    </header>
  );
}

export function ExecutionConsoleMetrics({
  eventCount,
  fileCount,
  commandCount,
}: {
  readonly eventCount: number;
  readonly fileCount: number;
  readonly commandCount: number;
}): JSX.Element {
  return (
    <div className="execution-console-metrics" aria-label="Resumo da execução">
      <span>
        Eventos <strong>{eventCount}</strong>
      </span>
      <span>
        Arquivos <strong>{fileCount}</strong>
      </span>
      <span>
        Comandos <strong>{commandCount}</strong>
      </span>
    </div>
  );
}

export function ExecutionTimelineSection({
  traces,
  events,
}: {
  readonly traces: readonly OperationalTraceRow[];
  readonly events: readonly TimelineRow[];
}): JSX.Element {
  return (
    <section className="execution-console-section">
      <div className="execution-console-section-head">
        <strong>Narrativa</strong>
        <span>{traces.length ? `${traces.length} etapas` : "aguardando"}</span>
      </div>
      <div className="execution-console-timeline" role="log" aria-live="polite">
        {traces.length ? (
          traces.map((row) => <TraceRow key={row.id} row={row} />)
        ) : events.length ? (
          events.map((row) => (
            <article key={row.id} className="execution-console-event">
              <time dateTime={row.timestamp}>{formatTime(row.timestamp)}</time>
              <div>
                <strong>{row.title}</strong>
                <span>{row.detail}</span>
              </div>
            </article>
          ))
        ) : (
          <p className="execution-console-empty">Nenhuma execução ativa.</p>
        )}
      </div>
    </section>
  );
}

export function ExecutionFilesSection({
  files,
}: {
  readonly files: readonly ConsoleFileRow[];
}): JSX.Element {
  return (
    <section className="execution-console-section">
      <div className="execution-console-section-head">
        <strong>Arquivos</strong>
        <span>{files.length} ops</span>
      </div>
      <div className="execution-console-file-list">
        {files.length ? (
          files.map((operation) => (
            <article key={operation.id} className="execution-console-file-row">
              <div>
                <strong>{operation.path}</strong>
                <span>
                  {operationTypeLabel(operation.operationType)} · {operation.source}
                </span>
              </div>
              <em className={`status-${operation.status}`}>
                {operationStatusLabel(operation.status)}
              </em>
            </article>
          ))
        ) : (
          <p className="execution-console-empty">Sem arquivos tocados.</p>
        )}
      </div>
    </section>
  );
}

export function ExecutionContextSection({
  rows,
}: {
  readonly rows: readonly ContextReceiptRow[];
}): JSX.Element {
  return (
    <section className="execution-console-section">
      <div className="execution-console-section-head">
        <strong>Contexto usado</strong>
        <span>{rows.length}</span>
      </div>
      <div className="execution-console-context-list">
        {rows.length ? (
          rows.map((row) => (
            <article key={row.id} className="execution-console-context-row">
              <header>
                <div>
                  <strong>{row.agent}</strong>
                  <span>
                    {row.profile} · confiança {Math.round(row.confidence * 100)}%
                  </span>
                </div>
                <code>{shortId(row.snapshotId)}</code>
              </header>
              <p>
                {row.selectedFiles.length
                  ? row.selectedFiles.slice(0, 4).join(", ")
                  : "Nenhum arquivo selecionado."}
              </p>
              <span className="execution-console-trace">
                tipos: {row.contextChannels.join(" · ") || "não informados"}
              </span>
              <span className="execution-console-trace">
                retrieval: {retrievalStatusLabel(row.retrievalStatus)} ·{" "}
                {row.channels.join(" · ") || "sem canais"} · {row.selectedBytes} bytes
                {row.omittedFiles ? ` · ${row.omittedFiles} omitidos` : ""}
              </span>
              {row.reasons.length ? (
                <ul>
                  {row.reasons.slice(0, 2).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))
        ) : (
          <p className="execution-console-empty">Sem recibo de contexto.</p>
        )}
      </div>
    </section>
  );
}

function retrievalStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    matched: "match",
    partial: "parcial",
    no_match: "sem match",
    blocked: "bloqueado",
  };
  return labels[status] ?? status;
}

export function ExecutionTerminalSection({
  rows,
  commandCount,
  followedTasks,
  selectedProjectId,
  killingTaskIds,
  retryingTaskIds,
  approvingTaskIds,
  onStopTask,
  onRetryTask,
  onApproveTask,
}: {
  readonly rows: readonly TerminalRow[];
  readonly commandCount: number;
  readonly followedTasks: ReadonlyMap<string, FollowedTaskOutput>;
  readonly selectedProjectId: string | null;
  readonly killingTaskIds: ReadonlySet<string>;
  readonly retryingTaskIds: ReadonlySet<string>;
  readonly approvingTaskIds: ReadonlySet<string>;
  readonly onStopTask: (row: TerminalRow) => void;
  readonly onRetryTask: (row: TerminalRow) => void;
  readonly onApproveTask: (row: TerminalRow) => void;
}): JSX.Element {
  return (
    <section className="execution-console-section">
      <div className="execution-console-section-head">
        <strong>Terminal</strong>
        <span>{commandCount}</span>
      </div>
      <div className="execution-console-terminal">
        {rows.length ? (
          rows.slice(0, 8).map((row) => {
            const followed = followedTasks.get(row.id);
            const status = followed?.status ?? row.status;
            const output = followed?.output ?? row.output;
            const canStop = Boolean(
              row.taskId && selectedProjectId && isStoppableTaskStatus(status)
            );
            const isStopping = row.taskId ? killingTaskIds.has(row.taskId) : false;
            const canRetry = Boolean(
              row.taskId &&
                selectedProjectId &&
                !isStoppableTaskStatus(status) &&
                status !== "aguardando aprovação"
            );
            const isRetrying = row.taskId ? retryingTaskIds.has(row.taskId) : false;
            const canApprove = Boolean(
              row.taskId && selectedProjectId && status === "aguardando aprovação"
            );
            const isApproving = row.taskId ? approvingTaskIds.has(row.taskId) : false;
            return (
              <article key={row.id}>
                <div className="execution-console-terminal-meta">
                  <code>{row.label}</code>
                  <span>
                    {row.agent} · {row.tool}
                  </span>
                </div>
                <div className="execution-console-terminal-actions">
                  <em className={`terminal-status terminal-${terminalStatusTone(status)}`}>
                    {status}
                  </em>
                  {canStop ? (
                    <button
                      type="button"
                      className="execution-console-stop-task"
                      disabled={isStopping}
                      title="Parar tarefa"
                      aria-label={`Parar tarefa ${row.label}`}
                      onClick={() => onStopTask(row)}
                    >
                      ■
                    </button>
                  ) : null}
                  {canRetry ? (
                    <button
                      type="button"
                      className="execution-console-retry-task"
                      disabled={isRetrying}
                      title="Rodar novamente"
                      aria-label={`Rodar novamente ${row.label}`}
                      onClick={() => onRetryTask(row)}
                    >
                      ↻
                    </button>
                  ) : null}
                  {canApprove ? (
                    <button
                      type="button"
                      className="execution-console-approve-task"
                      disabled={isApproving}
                      title="Aprovar comando"
                      aria-label={`Aprovar comando ${row.label}`}
                      onClick={() => onApproveTask(row)}
                    >
                      OK
                    </button>
                  ) : null}
                </div>
                <span className="execution-console-trace">
                  {row.taskId ? `task ${shortId(row.taskId)}` : "sem task"} ·{" "}
                  {row.traceId ? `trace ${shortId(row.traceId)}` : "sem trace"}
                  {row.approvalRequired ? " · aprovação requerida" : ""}
                  {row.policyReason ? ` · ${row.policyReason}` : ""}
                  {status === "aguardando input" ? " · prompt interativo" : ""}
                </span>
                {output ? (
                  <pre className={`terminal-output output-${row.stream}`}>
                    <code>{output}</code>
                  </pre>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="execution-console-empty">Sem comando registrado.</p>
        )}
      </div>
    </section>
  );
}

export function ExecutionValidationSection({
  chains,
}: {
  readonly chains: readonly ValidationChainRow[];
}): JSX.Element {
  return (
    <section className="execution-console-section">
      <div className="execution-console-section-head">
        <strong>Validação</strong>
        <span>{chains.length}</span>
      </div>
      <div className="execution-console-validation-list">
        {chains.length ? (
          chains.map((chain) => (
            <article key={chain.id} className="execution-console-validation-chain">
              <header>
                <div>
                  <strong>{chain.title}</strong>
                  <span>
                    {chain.agent}
                    {chain.traceId ? ` · trace ${shortId(chain.traceId)}` : ""}
                  </span>
                </div>
                <em className={`terminal-status terminal-${chain.tone}`}>
                  {chain.status}
                </em>
              </header>
              <ol>
                {chain.steps.map((step) => (
                  <li
                    key={step.id}
                    className={`validation-step validation-step-${step.tone}`}
                  >
                    <span>{step.label}</span>
                    <code>{step.commandId}</code>
                    <em>{step.status}</em>
                    {step.taskId ? <small>task {shortId(step.taskId)}</small> : null}
                  </li>
                ))}
              </ol>
            </article>
          ))
        ) : (
          <p className="execution-console-empty">Sem cadeia de validação.</p>
        )}
      </div>
    </section>
  );
}

export function ExecutionDiffSection({
  rows,
}: {
  readonly rows: readonly ConsoleFileRow[];
}): JSX.Element {
  return (
    <section className="execution-console-section">
      <div className="execution-console-section-head">
        <strong>Diff</strong>
        <span>{rows.length}</span>
      </div>
      <div className="execution-console-diff-list">
        {rows.length ? (
          rows.map((operation) => (
            <details key={operation.id} className="execution-console-diff-row">
              <summary>
                <span>{operation.path}</span>
                <em>
                  +{operation.additions ?? 0}/-{operation.deletions ?? 0}
                </em>
              </summary>
              {operation.diffPreview ? (
                <pre>
                  <code>{operation.diffPreview}</code>
                </pre>
              ) : null}
            </details>
          ))
        ) : (
          <p className="execution-console-empty">Sem diff disponível.</p>
        )}
      </div>
    </section>
  );
}

function TraceRow({ row }: { readonly row: OperationalTraceRow }): JSX.Element {
  return (
    <article className={`execution-console-trace-row trace-row-${row.tone}`}>
      <header>
        <div>
          <strong>{row.title}</strong>
          <span>{row.detail}</span>
        </div>
        <em className={`terminal-status terminal-${row.tone}`}>
          {traceToneLabel(row.tone)}
        </em>
      </header>
      <span className="execution-console-trace">
        {row.toolCallId ? `tool ${shortId(row.toolCallId)}` : "sem tool"} ·{" "}
        {row.traceId ? `trace ${shortId(row.traceId)}` : "sem trace"}
      </span>
      <ol>
        {row.steps.map((step) => (
          <li key={step.id} className={`trace-step trace-step-${step.tone}`}>
            <span>{step.label}</span>
            <code>{step.value}</code>
            <em>{step.detail}</em>
          </li>
        ))}
      </ol>
    </article>
  );
}

function traceToneLabel(tone: OperationalTraceRow["tone"]): string {
  if (tone === "running") return "rodando";
  if (tone === "failed") return "falhou";
  if (tone === "success") return "ok";
  return "info";
}

function isStoppableTaskStatus(status: string): boolean {
  return (
    status === "na fila" ||
    status === "rodando" ||
    status === "running" ||
    status === "started" ||
    status === "aguardando input"
  );
}
