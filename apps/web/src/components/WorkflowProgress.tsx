import type { JSX } from "react";
import type { WorkflowEvent } from "@u-build/shared";

interface WorkflowProgressProps {
  threadId: string;
  events: WorkflowEvent[];
  isConnected: boolean;
  streamError?: string | null;
}

// Phases: 0=spec  1=human-review  2=implementation  3=done
type Phase = 0 | 1 | 2 | 3;

function derivePhase(events: WorkflowEvent[]): Phase {
  if (
    events.some(
      (e) =>
        e.type === "status_changed" &&
        (e.status === "completed" || e.status === "cancelled")
    )
  ) {
    return 3;
  }

  const approvalIdx = events.findIndex((e) => e.type === "awaiting_approval");
  if (approvalIdx === -1) return 0;

  const hasRunningAfter = events
    .slice(approvalIdx + 1)
    .some((e) => e.type === "status_changed" && e.status === "running");
  if (hasRunningAfter) return 2;

  return 1;
}

function hasError(events: WorkflowEvent[]): string | null {
  const err = events.find((e) => e.type === "error");
  return err?.type === "error" ? err.message : null;
}

function getRetryInfo(events: WorkflowEvent[]): {
  retryCount: number;
  score: number;
  notes: string;
} | null {
  // Find the latest retry_started event
  const last = [...events].reverse().find((e) => e.type === "retry_started");
  if (!last || last.type !== "retry_started") return null;
  return { retryCount: last.retryCount, score: last.score, notes: last.notes };
}

function getImplementationSubSteps(events: WorkflowEvent[]): {
  odin: boolean;
  front: boolean;
  qa: boolean;
  curator: boolean;
  curatorScore: number | null;
} {
  const completedAgents = new Set(
    events
      .filter((e) => e.type === "node_completed")
      .map((e) => (e.type === "node_completed" ? e.agentName : ""))
  );

  // Get the latest curator score from node_completed events via retry_started
  const lastRetry = [...events].reverse().find((e) => e.type === "retry_started");
  const curatorScore =
    lastRetry?.type === "retry_started" ? lastRetry.score : null;

  return {
    odin: completedAgents.has("odin"),
    front: completedAgents.has("front"),
    qa: completedAgents.has("qa"),
    curator: completedAgents.has("curator"),
    curatorScore,
  };
}

const STEPS: { label: string; description: string }[] = [
  { label: "Gerando Especificação", description: "Analisando a história e criando a spec técnica" },
  { label: "Revisão Humana", description: "Aguardando sua aprovação da especificação" },
  { label: "Implementação", description: "Odin roteia → FrontAgent + QAAgent → Curador" },
  { label: "Concluído", description: "Artefatos disponíveis para download" },
];

function StepIcon({ state }: { state: "done" | "active" | "pending" }): JSX.Element {
  return <span className={`step-dot ${state === "done" ? "completed" : state === "active" ? "running" : ""}`} />;
}

function SubStep({
  label,
  done,
  active,
  badge,
}: {
  label: string;
  done: boolean;
  active: boolean;
  badge?: string;
}): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
      <div
        className={`step-dot ${
          done
            ? "completed"
            : active
            ? "running"
            : ""
        }`}
        style={{ width: 7, height: 7, boxShadow: "none" }}
      />
      <span
        style={{ color: done ? "var(--p)" : active ? "var(--t2)" : "var(--t3)", fontSize: 11 }}
      >
        {label}
      </span>
      {badge && (
        <span className="status-chip-value" style={{ color: "var(--warn)" }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function EventLabel({ event }: { event: WorkflowEvent }): JSX.Element {
  switch (event.type) {
    case "status_changed": {
      const MAP: Record<string, string> = {
        running: "Workflow em execução",
        awaiting_human: "Aguardando decisão humana",
        completed: "Concluído com sucesso",
        cancelled: "Cancelado",
        error: "Erro",
        idle: "Idle",
      };
      return <span>{MAP[event.status] ?? event.status}</span>;
    }
    case "awaiting_approval":
      return <span>Especificação gerada — aguardando aprovação</span>;
    case "node_started":
      return (
        <span>
          Agente <code style={{ color: "var(--p)" }}>{event.agentName}</code> iniciado
        </span>
      );
    case "node_completed":
      return (
        <span>
          Agente <code style={{ color: "var(--p)" }}>{event.agentName}</code> concluído
        </span>
      );
    case "retry_started":
      return (
        <span style={{ color: "var(--warn)" }}>
          Tentativa {event.retryCount} — corrigindo{" "}
          <code>{event.fixTarget}</code>
          {" "}(score anterior: {event.score}/100)
        </span>
      );
    case "awaiting_retry_approval":
      return (
        <span style={{ color: "var(--warn)" }}>
          {event.retryCount} tentativas sem aprovação (score: {event.score}/100) — aguardando sua decisão
        </span>
      );
    case "error":
      return <span style={{ color: "var(--danger)" }}>Erro: {event.message}</span>;
    default:
      return <span>{(event as { type: string }).type}</span>;
  }
}

export function WorkflowProgress({
  threadId,
  events,
  isConnected,
  streamError = null,
}: WorkflowProgressProps): JSX.Element {
  const phase = derivePhase(events);
  const errorMsg = hasError(events);
  const retryInfo = getRetryInfo(events);
  const subSteps = getImplementationSubSteps(events);
  const isAwaiting = events.some((e) => e.type === "awaiting_retry_approval");

  const visibleEvents = events
    .filter((e) => e.type !== "status_changed" || e.status !== "idle")
    .slice(-8);

  return (
    <section className="workflow-panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Workflow</p>
          <h2 className="panel-title">Execução em tempo real</h2>
        </div>
        <div className="status-chip">
          <span className={`live-dot ${isConnected ? "running" : ""}`} aria-hidden="true" />
          <span className="status-chip-label">sse</span>
          <span className="status-chip-value">
            {isConnected ? "Conectado" : "Desconectado"}
          </span>
        </div>
      </div>

      {(streamError || errorMsg) && (
        <div className="error-banner" style={{ margin: 12 }}>
          {streamError ?? errorMsg}
        </div>
      )}

      {retryInfo && phase === 2 && !isAwaiting && (
        <div className="story-card" style={{ margin: 12, color: "var(--warn)" }}>
          Tentativa {retryInfo.retryCount}/3 — Score: {retryInfo.score}/100 — {retryInfo.notes}
        </div>
      )}

      <div className="workflow-list">
          {STEPS.map((step, i) => {
            const stepState: "done" | "active" | "pending" =
              i < phase ? "done" : i === phase ? "active" : "pending";

            return (
              <div key={step.label} className={`workflow-step ${stepState === "done" ? "completed" : stepState === "active" ? "active" : ""}`}>
                <StepIcon state={stepState} />
                <div style={{ minWidth: 0 }}>
                  <p className="workflow-title">
                    {step.label}
                  </p>
                  <p className="workflow-meta">
                      {step.description}
                  </p>

                  {i === 2 && stepState !== "pending" && (
                    <div style={{ marginTop: 6, borderLeft: "1px solid var(--bd)", paddingLeft: 8 }}>
                      <SubStep
                        label="Odin — roteando agentes"
                        done={subSteps.odin}
                        active={stepState === "active" && !subSteps.odin}
                      />
                      <SubStep
                        label="FrontAgent — gerando página"
                        done={subSteps.front}
                        active={stepState === "active" && subSteps.odin && !subSteps.front}
                        {...(subSteps.curatorScore !== null ? { badge: `score: ${subSteps.curatorScore}` } : {})}
                      />
                      <SubStep
                        label="QAAgent — gerando testes"
                        done={subSteps.qa}
                        active={stepState === "active" && subSteps.odin && !subSteps.qa}
                      />
                      <SubStep
                        label="Curador — validando output"
                        done={subSteps.curator && phase === 3}
                        active={stepState === "active" && subSteps.front && subSteps.qa && !isAwaiting}
                        {...(isAwaiting ? { badge: "aguardando" } : {})}
                      />
                    </div>
                  )}
                </div>
                <span className="status-chip-value">{String(i + 1).padStart(2, "0")}</span>
              </div>
            );
          })}
      </div>

      {visibleEvents.length > 0 && (
        <>
          <div className="panel-head" style={{ borderTop: "1px solid var(--bd)" }}>
            <div>
              <p className="panel-kicker">Events</p>
              <h2 className="panel-title">Histórico</h2>
            </div>
          </div>
          <div className="event-list" style={{ padding: 12 }}>
            {visibleEvents.map((evt, i) => (
              <div key={i} className="message" style={{ maxWidth: "100%" }}>
                <div className="message-meta">
                  <span>
                    {evt.type === "retry_started" || evt.type === "awaiting_retry_approval"
                      ? "Retry"
                      : evt.type === "error"
                      ? "Error"
                      : "Event"}
                  </span>
                  <span className="message-time">{formatTime(evt.timestamp)}</span>
                </div>
                <div className="message-body" style={{ display: "flex", gap: 8 }}>
                  <span
                    className={`step-dot ${
                      evt.type === "retry_started" || evt.type === "awaiting_retry_approval"
                        ? ""
                        : evt.type === "error"
                        ? "failed"
                        : "completed"
                    }`}
                    style={{
                      width: 7,
                      height: 7,
                      marginTop: 7,
                      boxShadow: evt.type === "retry_started" || evt.type === "awaiting_retry_approval" ? "none" : undefined,
                      background: evt.type === "retry_started" || evt.type === "awaiting_retry_approval" ? "var(--warn)" : undefined,
                    }}
                  />
                  <EventLabel event={evt} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
