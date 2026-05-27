import { X } from "lucide-react";
import { useMemo, useState, type JSX, type ReactNode } from "react";
import type {
  HorusAgentExecutionSnapshot,
  HorusAgentEvidenceSummary,
  HorusRunEventSnapshot,
  HorusRunSnapshot,
} from "../types/api.types.js";
import type { AgentFlowNode } from "../types/flow.types.js";

type DrawerTab = "summary" | "events" | "actions" | "code" | "deps";

const TABS: Array<{ id: DrawerTab; label: string }> = [
  { id: "summary", label: "Resumo" },
  { id: "events", label: "Eventos" },
  { id: "actions", label: "Ações" },
  { id: "code", label: "Código" },
  { id: "deps", label: "Deps" },
];

interface RunFlowDrawerProps {
  run: HorusRunSnapshot;
  node: AgentFlowNode;
  onClose: () => void;
}

export function RunFlowDrawer({ run, node, onClose }: RunFlowDrawerProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<DrawerTab>("summary");
  const data = node.data;
  const relatedEvents = useMemo(
    () =>
      run.events.filter((event) => {
        if (data.kind === "agentExecution") {
          return event.agentName === data.agentName && event.userStoryId === data.userStoryId;
        }
        return event.nodeId === data.nodeName;
      }),
    [data, run.events]
  );
  const relatedExecutions = run.agentExecutions.filter((execution) => {
    if (data.kind === "agentExecution") return execution.id === data.executionId;
    return execution.nodeId === data.nodeName;
  });
  const evidenceSummary =
    run.evidenceSummaries.find((summary) => {
      if (data.kind === "agentExecution") {
        return summary.agentName === data.agentName && summary.nodeId === data.nodeName;
      }
      return summary.nodeId === data.nodeName;
    }) ?? null;
  const latestEvent = relatedEvents.at(-1) ?? null;
  const latestExecution = relatedExecutions.at(-1) ?? null;

  return (
    <aside className="agent-flow-drawer" aria-label={`Inspeção de ${data.label}`}>
      <div className="agent-flow-drawer-head">
        <div>
          <p className="agent-flow-drawer-kicker">
            Inspeção <span className={`agent-flow-status-badge is-${data.status}`}>{statusLabel(data.status)}</span>
          </p>
          <h2>{data.label}</h2>
          <p className="agent-flow-muted">{data.description}</p>
        </div>
        <button
          type="button"
          className="agent-flow-icon-button"
          aria-label="Fechar detalhe"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      <div className="agent-flow-drawer-tabs" role="tablist" aria-label="Detalhes do agente">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "is-active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "summary" && (
        <SummaryTab
          run={run}
          node={node}
          events={relatedEvents}
          executions={relatedExecutions}
          executionCount={relatedExecutions.length}
          summary={evidenceSummary}
          latestEvent={latestEvent}
          latestExecution={latestExecution}
        />
      )}
      {activeTab === "events" && <EventsTab events={relatedEvents} />}
      {activeTab === "actions" && (
        <ActionsTab events={relatedEvents} summary={evidenceSummary} />
      )}
      {activeTab === "code" && <CodeTab events={relatedEvents} summary={evidenceSummary} />}
      {activeTab === "deps" && (
        <DepsTab
          events={relatedEvents}
          executions={relatedExecutions}
          summary={evidenceSummary}
          run={run}
        />
      )}
    </aside>
  );
}

function SummaryTab({
  run,
  node,
  events,
  executions,
  executionCount,
  summary,
  latestEvent,
  latestExecution,
}: {
  run: HorusRunSnapshot;
  node: AgentFlowNode;
  events: HorusRunEventSnapshot[];
  executions: HorusAgentExecutionSnapshot[];
  executionCount: number;
  summary: HorusAgentEvidenceSummary | null;
  latestEvent: HorusRunEventSnapshot | null;
  latestExecution: HorusAgentExecutionSnapshot | null;
}): JSX.Element {
  const data = node.data;
  const commandIds = dedupe([
    ...(summary?.commandIds ?? []),
    ...events.flatMap((event) => event.commandIds ?? []),
  ]);
  const fileCount = new Set([
    ...(summary?.filesRead ?? []),
    ...(summary?.filesChanged ?? []),
    ...events.flatMap((event) => event.filePaths ?? []),
  ]).size;

  return (
    <div className="agent-flow-drawer-tab-panel">
      <InfoCard label="Resumo">
        <p>{latestEvent?.summary ?? data.latestSummary ?? latestExecution?.summary ?? data.description}</p>
        {latestEvent && (
          <p className="agent-flow-rich-line">
            <code>{latestEvent.nodeId ?? data.nodeName}</code> publicou um update com status{" "}
            <code>{data.status}</code>.
          </p>
        )}
      </InfoCard>

      <InfoCard label="Sinais">
        <MetricRows
          rows={[
            ["Eventos", String(events.length)],
            ["Execuções", String(executionCount)],
            ["Comandos", String(commandIds.length)],
            ["Arquivos", String(fileCount)],
            ["Último evento", latestEvent ? formatDateTime(latestEvent.timestamp) : "Nenhum"],
            [
              "Última execução",
              latestExecution?.completedAt ? formatDateTime(latestExecution.completedAt) : "Nenhuma",
            ],
          ]}
        />
      </InfoCard>

      <InfoCard label="Run">
        <MetricRows
          rows={[
            ["Status", run.status],
            ["Fase", run.currentPhase],
            ["História", run.currentUserStoryTitle ?? "Não informada"],
            ["Nó atual", run.currentNode ?? "Sem nó ativo"],
            ["Último ator", latestEvent?.actorName ?? "Sem ator recente"],
            [
              "Latência",
              data.kind === "agentExecution"
                ? data.executionTimeMs != null
                  ? `${data.executionTimeMs}ms`
                  : "Não medida"
                : data.latencyMs != null
                  ? `${data.latencyMs}ms`
                  : "Não medida",
            ],
            ["Workspace", run.workspaceFolderId ?? "Não informado"],
          ]}
        />
      </InfoCard>

      {data.errorMessage && (
        <InfoCard label="Erro" tone="danger">
          <p>{data.errorMessage}</p>
        </InfoCard>
      )}
    </div>
  );
}

function EventsTab({ events }: { events: HorusRunEventSnapshot[] }): JSX.Element {
  if (events.length === 0) {
    return <EmptyDrawerState>Nenhum evento registrado para este agente.</EmptyDrawerState>;
  }

  return (
    <div className="agent-flow-drawer-tab-panel">
      {events.slice().reverse().map((event) => (
        <article key={event.id} className="agent-flow-inspector-event">
          <div className="agent-flow-inspector-event-head">
            <div>
              <strong>{event.title}</strong>
              <span>{event.eventType}</span>
            </div>
            <time dateTime={event.timestamp}>{formatDateTime(event.timestamp)}</time>
          </div>
          {event.summary ? <p>{event.summary}</p> : null}
          <p className="agent-flow-rich-line">
            {event.actorName} em <code>{event.nodeId ?? "workflow"}</code>.
          </p>
          {event.evidence ? (
            <details className="agent-flow-evidence-json">
              <summary>Evidência</summary>
              <pre>{JSON.stringify(event.evidence, null, 2)}</pre>
            </details>
          ) : null}
          {event.metadata ? (
            <details className="agent-flow-evidence-json">
              <summary>Metadata</summary>
              <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ActionsTab({
  events,
  summary,
}: {
  events: HorusRunEventSnapshot[];
  summary: HorusAgentEvidenceSummary | null;
}): JSX.Element {
  const tools = dedupe([
    ...(summary?.toolNames ?? []),
    ...events.map((event) => toolNameFromEvent(event)).filter((name): name is string => Boolean(name)),
  ]);
  const commands = dedupe([
    ...(summary?.commandIds ?? []),
    ...events.flatMap((event) => event.commandIds ?? []),
  ]);
  const validationEvents = events.filter((event) => event.validationGateId || event.evidence);

  return (
    <div className="agent-flow-drawer-tab-panel">
      <ChipCard label="Ferramentas" empty="Nenhuma ferramenta registrada." items={tools} />
      <ChipCard label="Comandos" empty="Nenhum comando registrado." items={commands} />
      <InfoCard label="Validação">
        {validationEvents.length === 0 ? (
          <p className="agent-flow-muted">Nenhuma validação registrada para este agente.</p>
        ) : (
          <div className="agent-flow-compact-list">
            {validationEvents.map((event) => (
              <span key={event.id}>
                <strong>{event.title}</strong>
                <em>{event.validationGateId ?? event.evidence?.status ?? event.eventType}</em>
              </span>
            ))}
          </div>
        )}
      </InfoCard>
      {summary?.errorMessages.length ? (
        <ChipCard label="Erros" empty="" items={summary.errorMessages} tone="danger" />
      ) : null}
    </div>
  );
}

function CodeTab({
  events,
  summary,
}: {
  events: HorusRunEventSnapshot[];
  summary: HorusAgentEvidenceSummary | null;
}): JSX.Element {
  const codeEvents = events.filter((event) => event.filePaths?.length);
  const changed = dedupe([
    ...(summary?.filesChanged ?? []),
    ...codeEvents
      .filter((event) => event.eventType === "patch_proposed" || event.eventType === "patch_applied")
      .flatMap((event) => event.filePaths ?? []),
  ]);
  const filesRead = dedupe([
    ...(summary?.filesRead ?? []),
    ...codeEvents
      .filter((event) => event.eventType !== "patch_proposed" && event.eventType !== "patch_applied")
      .flatMap((event) => event.filePaths ?? []),
  ]);
  return (
    <div className="agent-flow-drawer-tab-panel">
      <ChipCard label="Arquivos lidos" empty="Nenhum arquivo lido registrado." items={filesRead} />
      <ChipCard label="Arquivos alterados" empty="Nenhum arquivo alterado registrado." items={changed} />
      <InfoCard label="Eventos de código">
        {codeEvents.length === 0 ? (
          <p className="agent-flow-muted">Nenhum evento com arquivo associado.</p>
        ) : (
          <div className="agent-flow-compact-list">
            {codeEvents.map((event) => (
                <span key={event.id}>
                  <strong>{event.title}</strong>
                  <em>{event.filePaths?.join(", ")}</em>
                </span>
              ))}
          </div>
        )}
      </InfoCard>
    </div>
  );
}

function DepsTab({
  events,
  executions,
  summary,
  run,
}: {
  events: HorusRunEventSnapshot[];
  executions: HorusAgentExecutionSnapshot[];
  summary: HorusAgentEvidenceSummary | null;
  run: HorusRunSnapshot;
}): JSX.Element {
  const profile =
    [...events].reverse().find((event) => event.agentProfile)?.agentProfile ??
    [...executions].reverse().find((execution) => execution.agentProfile)?.agentProfile;
  return (
    <div className="agent-flow-drawer-tab-panel">
      <InfoCard label="Perfil">
        {profile ? (
          <>
            <p>{profile.purpose}</p>
            <ChipList items={profile.allowedTools} />
          </>
        ) : (
          <p className="agent-flow-muted">Nenhum perfil de agente registrado neste node.</p>
        )}
      </InfoCard>
      <ChipCard
        label="Dependências observadas"
        empty="Nenhuma dependência explícita registrada."
        items={dedupe([
          ...(summary?.toolNames ?? []),
          ...events.map((event) => event.causedByEventId).filter((id): id is string => Boolean(id)),
        ])}
      />
      <InfoCard label="Contexto da run">
        <MetricRows
          rows={[
            ["Thread", run.threadId],
            ["História atual", run.currentUserStoryTitle ?? "Não informada"],
            ["Fase", run.currentPhase],
            ["Validação", run.validationSummary?.finalStatus ?? "Sem validação"],
          ]}
        />
      </InfoCard>
    </div>
  );
}

function InfoCard({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "danger";
  children: ReactNode;
}): JSX.Element {
  return (
    <section className={`agent-flow-inspector-card ${tone === "danger" ? "danger" : ""}`}>
      <p className="agent-flow-drawer-label">{label}</p>
      {children}
    </section>
  );
}

function ChipCard({
  label,
  empty,
  items,
  tone,
}: {
  label: string;
  empty: string;
  items: string[];
  tone?: "danger";
}): JSX.Element {
  return (
    <InfoCard label={label} {...(tone ? { tone } : {})}>
      {items.length === 0 ? <p className="agent-flow-muted">{empty}</p> : <ChipList items={items} />}
    </InfoCard>
  );
}

function ChipList({ items }: { items: string[] }): JSX.Element {
  return (
    <div className="agent-flow-chip-list">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function MetricRows({ rows }: { rows: Array<[string, string]> }): JSX.Element {
  return (
    <div className="agent-flow-metric-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function EmptyDrawerState({ children }: { children: string }): JSX.Element {
  return (
    <div className="agent-flow-drawer-tab-panel">
      <section className="agent-flow-inspector-card">
        <p className="agent-flow-muted">{children}</p>
      </section>
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "completed") return "concluído";
  if (status === "active") return "ativo";
  if (status === "waiting") return "aguardando";
  if (status === "failed") return "falhou";
  return status;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toolNameFromEvent(event: HorusRunEventSnapshot): string | null {
  const value = event.metadata?.["toolName"] ?? event.metadata?.["tool"];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
