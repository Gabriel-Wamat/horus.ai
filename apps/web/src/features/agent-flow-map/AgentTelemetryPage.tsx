import { useMemo, useState, type JSX } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Braces, CircleDot, FileClock, History, ListFilter, RadioTower } from "lucide-react";
import type { WorkflowEvent, WorkflowState } from "@u-build/shared";
import "./styles/agent-flow-map.css";
import { useRunFileOperations } from "./hooks/useRunFileOperations.js";
import { useRunFlowData } from "./hooks/useRunFlowData.js";
import { agentFlowApi } from "./utils/agentFlowApi.js";
import type {
  AgentFileOperationTelemetry,
  HorusRunLocator,
} from "./types/api.types.js";

interface AgentTelemetryPageProps {
  workflowState: WorkflowState | null;
  events: WorkflowEvent[];
}

type OperationFilter = "all" | AgentFileOperationTelemetry["operationType"];
type StatusFilter = "all" | AgentFileOperationTelemetry["status"];

const telemetryQueryClient = new QueryClient();
const RUN_SELECTOR_VISIBLE_LIMIT = 8;
const RUN_HISTORY_PAGE_SIZE = 20;

export function AgentTelemetryPage(props: AgentTelemetryPageProps): JSX.Element {
  return (
    <QueryClientProvider client={telemetryQueryClient}>
      <AgentTelemetryPageContent {...props} />
    </QueryClientProvider>
  );
}

function AgentTelemetryPageContent({
  workflowState,
  events,
}: AgentTelemetryPageProps): JSX.Element {
  const runData = useRunFlowData({ workflowState, events });
  const run = runData.run;
  const telemetry = useRunFileOperations(run);
  const [operationFilter, setOperationFilter] = useState<OperationFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedOperationId, setSelectedOperationId] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyOffset, setHistoryOffset] = useState(0);
  const selectedProjectId = useMemo(() => readSelectedProjectId(), []);
  const runHistoryQuery = useQuery({
    queryKey: [
      "agent-flow-run-history",
      selectedProjectId,
      historyQuery,
      historyOffset,
      RUN_HISTORY_PAGE_SIZE,
    ],
    queryFn: () =>
      agentFlowApi.listRunsWithProjectFallback({
        projectId: selectedProjectId,
        query: historyQuery.trim(),
        offset: historyOffset,
        limit: RUN_HISTORY_PAGE_SIZE + 1,
      }),
    enabled: isHistoryOpen,
    refetchInterval: isHistoryOpen ? 10000 : false,
  });
  const historyRuns = (runHistoryQuery.data ?? []).slice(0, RUN_HISTORY_PAGE_SIZE);
  const hasMoreHistoryRuns =
    (runHistoryQuery.data?.length ?? 0) > RUN_HISTORY_PAGE_SIZE;
  const filteredOperations = useMemo(
    () =>
      filterOperations(telemetry.operations, {
        operationFilter,
        statusFilter,
        agentFilter,
        query,
      }),
    [agentFilter, operationFilter, query, statusFilter, telemetry.operations]
  );
  const selected =
    filteredOperations.find((operation) => operation.id === selectedOperationId) ??
    filteredOperations[0] ??
    telemetry.operations.at(-1) ??
    null;
  const agents = useMemo(
    () =>
      [...new Set(telemetry.operations.map((operation) => operation.agentName).filter(Boolean))]
        .sort() as string[],
    [telemetry.operations]
  );

  return (
    <div className="agent-flow-map-root">
      <div className="agent-flow-page agent-telemetry-page">
        <header className="agent-telemetry-hero">
          <div className="agent-telemetry-title">
            <span className="agent-flow-toolbar-icon" aria-hidden="true">
              <RadioTower size={17} />
            </span>
            <div>
              <p className="agent-flow-rail-kicker">Telemetria dedicada</p>
              <h2>Arquivos tocados pelos agentes</h2>
              <span>
                {run
                  ? `${run.threadId.slice(0, 8)} · ${run.status}`
                  : "Aguardando uma run do Horus"}
              </span>
            </div>
          </div>
          <RunSelector
            runOptions={runData.runOptions}
            activeRunId={runData.activeRunId}
            onChangeRun={runData.setActiveRunId}
            onOpenHistory={() => setIsHistoryOpen((open) => !open)}
          />
        </header>

        {isHistoryOpen ? (
          <RunHistoryPanel
            runs={historyRuns}
            activeRunId={runData.activeRunId}
            isLoading={runHistoryQuery.isLoading}
            error={runHistoryQuery.error}
            query={historyQuery}
            offset={historyOffset}
            hasMore={hasMoreHistoryRuns}
            onQueryChange={(value) => {
              setHistoryQuery(value);
              setHistoryOffset(0);
            }}
            onSelectRun={(threadId) => {
              runData.setActiveRunId(threadId);
              setIsHistoryOpen(false);
            }}
            onPreviousPage={() =>
              setHistoryOffset((current) =>
                Math.max(0, current - RUN_HISTORY_PAGE_SIZE)
              )
            }
            onNextPage={() =>
              setHistoryOffset((current) => current + RUN_HISTORY_PAGE_SIZE)
            }
            onClose={() => setIsHistoryOpen(false)}
          />
        ) : null}

        <section className="agent-telemetry-stats" aria-label="Resumo da telemetria">
          <StatCard label="operações" value={String(telemetry.operations.length)} />
          <StatCard
            label="arquivos"
            value={String(new Set(telemetry.operations.map((operation) => operation.path)).size)}
          />
          <StatCard
            label="falhas"
            value={String(
              telemetry.operations.filter((operation) =>
                operation.status === "failed" || operation.status === "blocked"
              ).length
            )}
          />
          <StatCard
            label="stream"
            value={run && (run.status === "running" || run.status === "awaiting_human") ? "live" : "replay"}
          />
        </section>

        <section className="agent-telemetry-workbench">
          <div className="agent-telemetry-main">
            <div className="agent-telemetry-filterbar">
              <span aria-hidden="true">
                <ListFilter size={15} />
              </span>
              <label>
                <span>Operação</span>
                <select
                  value={operationFilter}
                  onChange={(event) =>
                    setOperationFilter(event.target.value as OperationFilter)
                  }
                >
                  <option value="all">Todas</option>
                  <option value="read">Leitura</option>
                  <option value="create">Criação</option>
                  <option value="update">Edição</option>
                  <option value="delete">Remoção</option>
                  <option value="apply">Apply</option>
                  <option value="validate">Validação</option>
                  <option value="diff">Diff</option>
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                >
                  <option value="all">Todos</option>
                  <option value="running">Rodando</option>
                  <option value="read">Lido</option>
                  <option value="changed">Alterado</option>
                  <option value="proposed">Proposto</option>
                  <option value="applied">Aplicado</option>
                  <option value="validated">Validado</option>
                  <option value="blocked">Bloqueado</option>
                  <option value="failed">Falhou</option>
                </select>
              </label>
              <label>
                <span>Agente</span>
                <select
                  value={agentFilter}
                  onChange={(event) => setAgentFilter(event.target.value)}
                >
                  <option value="all">Todos</option>
                  {agents.map((agent) => (
                    <option key={agent} value={agent}>
                      {agentLabel(agent)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="agent-telemetry-search">
                <span>Arquivo</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filtrar por caminho"
                />
              </label>
            </div>

            <div className="agent-telemetry-table-shell">
              {telemetry.isLoading ? (
                <p className="agent-flow-muted">Carregando operações de arquivo.</p>
              ) : telemetry.error ? (
                <p className="agent-flow-muted">
                  Não foi possível carregar a telemetria: {telemetry.error.message}
                </p>
              ) : filteredOperations.length === 0 ? (
                <p className="agent-flow-muted">
                  Nenhuma operação de arquivo encontrada para os filtros atuais.
                </p>
              ) : (
                <table className="agent-telemetry-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Operação</th>
                      <th>Arquivo</th>
                      <th>Agente</th>
                      <th>Tool</th>
                      <th>Quando</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOperations.map((operation) => (
                      <tr
                        key={operation.id}
                        className={operation.id === selected?.id ? "is-selected" : ""}
                        onClick={() => setSelectedOperationId(operation.id)}
                      >
                        <td>
                          <span className={`agent-telemetry-status is-${operation.status}`}>
                            <CircleDot size={11} />
                            {statusLabel(operation.status)}
                          </span>
                        </td>
                        <td>{operationLabel(operation)}</td>
                        <td>
                          <code title={operation.path}>{operation.path}</code>
                        </td>
                        <td>{operation.agentName ? agentLabel(operation.agentName) : "Sistema"}</td>
                        <td>{operation.toolName ?? "workflow"}</td>
                        <td>{formatTime(operation.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <aside className="agent-telemetry-inspector" aria-label="Detalhe da operação">
            {selected ? (
              <>
                <div className="agent-flow-telemetry-json-head">
                  <div>
                    <p className="agent-flow-drawer-label">Operação selecionada</p>
                    <strong>{selected.path}</strong>
                    <span>
                      {operationLabel(selected)} · {statusLabel(selected.status)}
                    </span>
                  </div>
                  <FileClock size={17} />
                </div>
                <div className="agent-telemetry-detail-grid">
                  <Detail label="Agente" value={selected.agentName ? agentLabel(selected.agentName) : "Sistema"} />
                  <Detail label="Node" value={selected.nodeId ?? "n/a"} />
                  <Detail label="Tool" value={selected.toolName ?? "workflow"} />
                  <Detail label="Sequência" value={String(selected.sequence)} />
                  <Detail label="Sessão" value={selected.operationalSessionId ?? "n/a"} />
                  <Detail label="Comandos" value={selected.commandIds.join(", ") || "n/a"} />
                </div>
                {hasPatchMetadata(selected) ? (
                  <section className="agent-telemetry-patch-card" aria-label="Evidência estrutural da edição">
                    <div className="agent-telemetry-patch-card-head">
                      <span>Patch estrutural</span>
                      <strong>{selected.patchStrategy ?? "preconditioned_patch"}</strong>
                    </div>
                    <div className="agent-telemetry-detail-grid">
                      <Detail
                        label="Intents"
                        value={selected.structuralIntentKinds.join(", ") || "n/a"}
                      />
                      <Detail label="Símbolo" value={selected.structuralSymbolName ?? "n/a"} />
                      <Detail label="Tipo" value={selected.structuralSymbolKind ?? "n/a"} />
                      <Detail label="Preconditions" value={String(selected.preconditionCount)} />
                      <Detail label="Hash base" value={selected.preconditionHash ?? "n/a"} />
                      <Detail
                        label="Novo hash"
                        value={selected.newVersionHash ?? "n/a"}
                      />
                    </div>
                  </section>
                ) : null}
                {selected.errorMessage ? (
                  <p className="agent-telemetry-error">{operationErrorMessage(selected)}</p>
                ) : null}
                {selected.diffPreview ? (
                  <pre className="agent-telemetry-diff">{selected.diffPreview}</pre>
                ) : null}
                <details className="agent-flow-evidence-json agent-telemetry-json-details">
                  <summary>
                    <Braces size={14} /> Payload técnico
                  </summary>
                  <pre>{JSON.stringify(selected, null, 2)}</pre>
                </details>
              </>
            ) : (
              <p className="agent-flow-muted">
                Selecione uma operação para ver a evidência completa.
              </p>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}

function RunSelector({
  runOptions,
  activeRunId,
  onChangeRun,
  onOpenHistory,
}: {
  runOptions: HorusRunLocator[];
  activeRunId: string | null;
  onChangeRun: (threadId: string) => void;
  onOpenHistory: () => void;
}): JSX.Element {
  const visibleRunOptions = selectVisibleRunOptions(runOptions, activeRunId);
  const selectedRun = runOptions.find((option) => option.threadId === activeRunId) ?? null;
  return (
    <div className="agent-telemetry-run-controls">
      <label className="agent-flow-run-select agent-telemetry-run-select">
        <span>Run</span>
        <select
          value={activeRunId ?? ""}
          onChange={(event) => onChangeRun(event.target.value)}
          disabled={runOptions.length === 0}
          aria-label="Selecionar run recente"
          title={selectedRun ? `${selectedRun.title} · ${selectedRun.threadId}` : "Sem runs"}
        >
          {runOptions.length === 0 ? (
            <option value="">Sem runs</option>
          ) : (
            visibleRunOptions.map((option) => (
              <option key={option.threadId} value={option.threadId}>
                {compactRunTitle(option)} · {option.threadId.slice(0, 8)}
              </option>
            ))
          )}
        </select>
      </label>
      <button
        type="button"
        className="agent-flow-tool-button agent-telemetry-history-trigger"
        onClick={onOpenHistory}
      >
        <History size={15} />
        Histórico
      </button>
    </div>
  );
}

function RunHistoryPanel({
  runs,
  activeRunId,
  isLoading,
  error,
  query,
  offset,
  hasMore,
  onQueryChange,
  onSelectRun,
  onPreviousPage,
  onNextPage,
  onClose,
}: {
  runs: HorusRunLocator[];
  activeRunId: string | null;
  isLoading: boolean;
  error: Error | null;
  query: string;
  offset: number;
  hasMore: boolean;
  onQueryChange: (value: string) => void;
  onSelectRun: (threadId: string) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onClose: () => void;
}): JSX.Element {
  const groupedRuns = groupHistoryRuns(runs);
  return (
    <section className="agent-telemetry-history-panel" aria-label="Histórico de runs">
      <div className="agent-telemetry-history-head">
        <div>
          <strong>Histórico de runs</strong>
          <span>Busca por código, status ou ID da execução.</span>
        </div>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Buscar PM-01, erro, b17df18d..."
        aria-label="Buscar no histórico de runs"
      />
      <div className="agent-telemetry-history-list">
        {isLoading ? (
          <p className="agent-flow-muted">Carregando histórico.</p>
        ) : error ? (
          <p className="agent-flow-muted">
            Não foi possível carregar o histórico: {error.message}
          </p>
        ) : runs.length === 0 ? (
          <p className="agent-flow-muted">Nenhuma run encontrada.</p>
        ) : (
          groupedRuns.map((group) => (
            <section key={group.id} className="agent-telemetry-history-group">
              <header>
                <strong>{group.title}</strong>
                <span>{group.runs.length} runs</span>
              </header>
              {group.runs.map((run) => (
                <button
                  key={run.threadId}
                  type="button"
                  className={`agent-telemetry-history-item ${
                    run.threadId === activeRunId ? "is-active" : ""
                  }`}
                  onClick={() => onSelectRun(run.threadId)}
                >
                  <strong>
                    {compactRunTitle(run)} · {runStatusLabel(run.status)}
                  </strong>
                  <span>
                    {run.threadId.slice(0, 8)} · {formatRunTime(run.completedAt ?? run.startedAt)}
                  </span>
                </button>
              ))}
            </section>
          ))
        )}
      </div>
      <div className="agent-telemetry-history-pages">
        <span>{runs.length > 0 ? `${offset + 1}-${offset + runs.length}` : "0-0"}</span>
        <button type="button" onClick={onPreviousPage} disabled={offset === 0}>
          Anteriores
        </button>
        <button type="button" onClick={onNextPage} disabled={!hasMore}>
          Mais antigas
        </button>
      </div>
    </section>
  );
}

function groupHistoryRuns(
  runs: readonly HorusRunLocator[]
): Array<{ id: string; title: string; runs: HorusRunLocator[] }> {
  const groups = new Map<string, { id: string; title: string; runs: HorusRunLocator[] }>();
  for (const run of runs) {
    const title = historyGroupTitle(run);
    const id = title.toLowerCase();
    const group = groups.get(id) ?? { id, title, runs: [] };
    group.runs.push(run);
    groups.set(id, group);
  }
  return [...groups.values()];
}

function historyGroupTitle(run: HorusRunLocator): string {
  const title = run.title.trim();
  const dashIndex = title.indexOf(" - ");
  if (dashIndex > 0) return truncateText(title.slice(0, dashIndex), 48);
  const middleDotIndex = title.indexOf(" · ");
  if (middleDotIndex > 0) return truncateText(title.slice(0, middleDotIndex), 48);
  return truncateText(title || "Runs sem story", 48);
}

function selectVisibleRunOptions(
  runOptions: HorusRunLocator[],
  activeRunId: string | null
): HorusRunLocator[] {
  const visible = runOptions.slice(0, RUN_SELECTOR_VISIBLE_LIMIT);
  if (!activeRunId || visible.some((option) => option.threadId === activeRunId)) {
    return visible;
  }
  const active = runOptions.find((option) => option.threadId === activeRunId);
  return active ? [active, ...visible.slice(0, RUN_SELECTOR_VISIBLE_LIMIT - 1)] : visible;
}

function compactRunTitle(option: HorusRunLocator): string {
  const title = option.title.trim();
  const dashIndex = title.indexOf(" - ");
  const primary = dashIndex > 0 ? title.slice(0, dashIndex) : title;
  return truncateText(primary || "Run", 24);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function runStatusLabel(status: HorusRunLocator["status"]): string {
  if (status === "running") return "rodando";
  if (status === "awaiting_human") return "aguardando";
  if (status === "completed") return "concluída";
  if (status === "cancelled") return "cancelada";
  if (status === "error") return "erro";
  return status;
}

function formatRunTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readSelectedProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("projectId");
}

function StatCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function filterOperations(
  operations: AgentFileOperationTelemetry[],
  filters: {
    operationFilter: OperationFilter;
    statusFilter: StatusFilter;
    agentFilter: string;
    query: string;
  }
): AgentFileOperationTelemetry[] {
  const normalizedQuery = filters.query.trim().toLowerCase();
  return [...operations]
    .filter((operation) => {
      if (
        filters.operationFilter !== "all" &&
        operation.operationType !== filters.operationFilter
      ) {
        return false;
      }
      if (filters.statusFilter !== "all" && operation.status !== filters.statusFilter) {
        return false;
      }
      if (filters.agentFilter !== "all" && operation.agentName !== filters.agentFilter) {
        return false;
      }
      if (normalizedQuery && !operation.path.toLowerCase().includes(normalizedQuery)) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const bySequence = right.sequence - left.sequence;
      if (bySequence !== 0) return bySequence;
      return right.timestamp.localeCompare(left.timestamp);
    });
}

function operationLabel(operation: AgentFileOperationTelemetry): string {
  if (operation.operationType === "read") return "Leitura";
  if (operation.operationType === "create") return "Criação";
  if (operation.operationType === "update") return "Edição";
  if (operation.operationType === "delete") return "Remoção";
  if (operation.operationType === "apply") return "Aplicação";
  if (operation.operationType === "validate") return "Validação";
  if (operation.operationType === "diff") return "Diff";
  return "Operação";
}

function statusLabel(status: AgentFileOperationTelemetry["status"]): string {
  if (status === "running") return "rodando";
  if (status === "read") return "lido";
  if (status === "changed") return "alterado";
  if (status === "proposed") return "proposto";
  if (status === "applied") return "aplicado";
  if (status === "validated") return "validado";
  if (status === "blocked") return "bloqueado";
  if (status === "failed") return "falhou";
  if (status === "skipped") return "ignorado";
  return "desconhecido";
}

function operationErrorMessage(operation: AgentFileOperationTelemetry): string {
  const message = operation.errorMessage ?? "";
  const noopPrefix = "edit_file requires oldString and newString to differ for ";
  if (message.startsWith(noopPrefix)) {
    const rawPath = message.slice(noopPrefix.length);
    const path = rawPath.endsWith(".") ? rawPath.slice(0, -1) : rawPath;
    return `Edição ignorada: o conteúdo proposto é igual ao conteúdo atual${
      path ? ` em ${path}` : ""
    }. Nenhuma alteração foi aplicada.`;
  }
  return message;
}

function hasPatchMetadata(operation: AgentFileOperationTelemetry): boolean {
  return Boolean(
    operation.patchStrategy ||
      operation.structuralIntentKinds.length > 0 ||
      operation.structuralSymbolName ||
      operation.structuralSymbolKind ||
      operation.preconditionCount > 0 ||
      operation.preconditionHash
  );
}

function agentLabel(agent: string): string {
  if (agent === "spec") return "Spec";
  if (agent === "odin") return "Odin";
  if (agent === "front") return "Front";
  if (agent === "qa") return "QA";
  if (agent === "curator") return "Curator";
  return agent;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
