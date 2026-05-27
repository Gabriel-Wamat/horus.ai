import type { JSX } from "react";
import type {
  HorusAgentEvidenceSummary,
  HorusRunEventSnapshot,
  HorusRunSnapshot,
} from "../types/api.types.js";

interface AgentEvidencePanelProps {
  run: HorusRunSnapshot;
  summary: HorusAgentEvidenceSummary | null;
  events: HorusRunEventSnapshot[];
}

export function AgentEvidencePanel({
  run,
  summary,
  events,
}: AgentEvidencePanelProps): JSX.Element {
  const validationGates = summary?.validationGates.length
    ? summary.validationGates
    : run.validationSummary?.gates ?? [];
  const errors = summary?.errorMessages.length
    ? summary.errorMessages
    : events.flatMap((event) => (event.errorMessage ? [event.errorMessage] : []));

  return (
    <section className="agent-flow-evidence-panel" aria-label="Evidências do agente">
      <div className="agent-flow-evidence-head">
        <div>
          <p className="agent-flow-drawer-label">Evidências</p>
          <strong>{summary?.latestEventTitle ?? "Sem evento recente"}</strong>
        </div>
        {run.validationSummary && (
          <span className={`agent-flow-gate-badge is-${run.validationSummary.finalStatus}`}>
            {run.validationSummary.finalStatus}
          </span>
        )}
      </div>

      <EvidenceGroup
        title="Arquivos lidos"
        empty="Nenhum arquivo lido registrado para este agente."
        items={summary?.filesRead ?? []}
      />
      <EvidenceGroup
        title="Arquivos alterados"
        empty="Nenhum arquivo alterado registrado para este agente."
        items={summary?.filesChanged ?? []}
      />
      <EvidenceGroup
        title="Ferramentas"
        empty="Nenhuma tool registrada para este agente."
        items={summary?.toolNames ?? []}
      />
      <EvidenceGroup
        title="Comandos"
        empty="Nenhum comando registrado para este agente."
        items={summary?.commandIds ?? []}
      />

      <div className="agent-flow-evidence-group">
        <p className="agent-flow-drawer-label">Validação</p>
        {validationGates.length === 0 ? (
          <p className="agent-flow-muted">Nenhum gate de validação foi registrado.</p>
        ) : (
          <div className="agent-flow-gate-list">
            {validationGates.map((gate) => (
              <article key={gate.id} className={`agent-flow-gate-row is-${gate.status}`}>
                <span>{gate.status}</span>
                <div>
                  <strong>{gate.label}</strong>
                  <p>{gate.message ?? "Sem mensagem registrada."}</p>
                  {gate.commandId && <code>{gate.commandId}</code>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="agent-flow-evidence-group danger">
          <p className="agent-flow-drawer-label">Erros</p>
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
    </section>
  );
}

function EvidenceGroup({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: string[];
}): JSX.Element {
  return (
    <div className="agent-flow-evidence-group">
      <p className="agent-flow-drawer-label">{title}</p>
      {items.length === 0 ? (
        <p className="agent-flow-muted">{empty}</p>
      ) : (
        <div className="agent-flow-chip-list">
          {items.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}
    </div>
  );
}
