import type { JSX } from "react";
import type { WorkflowEvent } from "@u-build/shared";

interface WorkflowProgressProps {
  threadId: string;
  events: WorkflowEvent[];
  isConnected: boolean;
}

// Phases: 0=spec  1=human-review  2=implementation  3=done
type Phase = 0 | 1 | 2 | 3;

function derivePhase(events: WorkflowEvent[]): Phase {
  if (events.some((e) => e.type === "status_changed" && e.status === "completed"))
    return 3;

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
  if (state === "done") {
    return (
      <div className="size-7 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
        <svg className="size-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
    );
  }
  if (state === "active") {
    return (
      <div className="size-7 rounded-full bg-violet-600/20 border-2 border-violet-500 flex items-center justify-center shrink-0">
        <div className="size-2 rounded-full bg-violet-400 animate-pulse" />
      </div>
    );
  }
  return (
    <div className="size-7 rounded-full bg-slate-800 border-2 border-slate-700 shrink-0" />
  );
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
    <div className="flex items-center gap-2 py-0.5">
      <div
        className={`size-2 rounded-full shrink-0 ${
          done
            ? "bg-violet-500"
            : active
            ? "bg-violet-400 animate-pulse"
            : "bg-slate-700"
        }`}
      />
      <span
        className={`text-xs ${
          done ? "text-violet-300" : active ? "text-slate-300" : "text-slate-600"
        }`}
      >
        {label}
      </span>
      {badge && (
        <span className="text-[10px] font-mono text-amber-400 bg-amber-950 border border-amber-800 px-1.5 py-0.5 rounded">
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
          Agente <code className="text-violet-400">{event.agentName}</code> iniciado
        </span>
      );
    case "node_completed":
      return (
        <span>
          Agente <code className="text-violet-400">{event.agentName}</code> concluído
        </span>
      );
    case "retry_started":
      return (
        <span className="text-amber-300">
          Tentativa {event.retryCount} — corrigindo{" "}
          <code className="text-amber-400">{event.fixTarget}</code>
          {" "}(score anterior: {event.score}/100)
        </span>
      );
    case "awaiting_retry_approval":
      return (
        <span className="text-amber-400">
          {event.retryCount} tentativas sem aprovação (score: {event.score}/100) — aguardando sua decisão
        </span>
      );
    case "error":
      return <span className="text-rose-400">Erro: {event.message}</span>;
    default:
      return <span>{(event as { type: string }).type}</span>;
  }
}

export function WorkflowProgress({
  threadId,
  events,
  isConnected,
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
    <div className="flex flex-col gap-4">
      {/* Header card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-widest">
            Workflow em andamento
          </span>
          <span className="text-sm font-mono text-slate-400">
            {threadId.slice(0, 8)}&hellip;{threadId.slice(-4)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`size-2 rounded-full ${
              isConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
            }`}
          />
          <span className={`text-xs font-medium ${isConnected ? "text-emerald-400" : "text-slate-500"}`}>
            {isConnected ? "Conectado" : "Desconectado"}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="flex items-start gap-3 bg-rose-950/50 border border-rose-800 rounded-xl px-4 py-3.5 text-sm text-rose-300">
          <svg className="size-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {errorMsg}
        </div>
      )}

      {/* Retry warning banner */}
      {retryInfo && phase === 2 && !isAwaiting && (
        <div className="flex items-center gap-3 bg-amber-950/40 border border-amber-800/60 rounded-xl px-4 py-3 text-sm text-amber-300">
          <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          <span>
            Tentativa {retryInfo.retryCount}/3 — Score: {retryInfo.score}/100 — {retryInfo.notes}
          </span>
        </div>
      )}

      {/* Steps */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col gap-0">
          {STEPS.map((step, i) => {
            const stepState: "done" | "active" | "pending" =
              i < phase ? "done" : i === phase ? "active" : "pending";
            const isLast = i === STEPS.length - 1;

            return (
              <div key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <StepIcon state={stepState} />
                  {!isLast && (
                    <div
                      className={`w-px flex-1 my-1 ${
                        i < phase ? "bg-violet-700" : "bg-slate-800"
                      }`}
                      style={{ minHeight: "1.5rem" }}
                    />
                  )}
                </div>

                <div className="pb-5 pt-0.5 flex-1 min-w-0">
                  <p
                    className={`text-sm font-semibold leading-tight ${
                      stepState === "active"
                        ? "text-white"
                        : stepState === "done"
                        ? "text-violet-300"
                        : "text-slate-600"
                    }`}
                  >
                    {step.label}
                  </p>
                  {stepState === "active" && (
                    <p className="text-xs text-slate-500 mt-0.5 mb-2">
                      {step.description}
                    </p>
                  )}

                  {/* Implementation sub-steps */}
                  {i === 2 && stepState !== "pending" && (
                    <div className="mt-1 flex flex-col gap-0.5 pl-1 border-l border-slate-700/50">
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
              </div>
            );
          })}
        </div>
      </div>

      {/* Event feed */}
      {visibleEvents.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Histórico de eventos
          </p>
          <div className="flex flex-col gap-2">
            {visibleEvents.map((evt, i) => (
              <div key={i} className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-2 text-sm text-slate-300 min-w-0">
                  <div
                    className={`size-1.5 rounded-full shrink-0 mt-1.5 ${
                      evt.type === "retry_started" || evt.type === "awaiting_retry_approval"
                        ? "bg-amber-500"
                        : evt.type === "error"
                        ? "bg-rose-500"
                        : "bg-violet-500"
                    }`}
                  />
                  <span className="break-words min-w-0">
                    <EventLabel event={evt} />
                  </span>
                </div>
                <span className="text-xs text-slate-600 font-mono shrink-0 mt-0.5">
                  {formatTime(evt.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}