import type { JSX } from "react";
import type { WorkflowEvent } from "@u-build/shared";

interface WorkflowProgressProps {
  threadId: string;
  latestEvent: WorkflowEvent | null;
  events: WorkflowEvent[];
  isConnected: boolean;
}

type Phase = 0 | 1 | 2 | 3;
// 0 = Gerando Especificação
// 1 = Aguardando Revisão
// 2 = Implementando
// 3 = Concluído

function derivePhase(events: WorkflowEvent[]): Phase {
  const hasCompleted = events.some(
    (e) => e.type === "status_changed" && e.status === "completed"
  );
  if (hasCompleted) return 3;

  const approvalIndex = events.findIndex((e) => e.type === "awaiting_approval");
  if (approvalIndex === -1) return 0;

  const hasRunningAfterApproval = events
    .slice(approvalIndex + 1)
    .some((e) => e.type === "status_changed" && e.status === "running");
  if (hasRunningAfterApproval) return 2;

  return 1;
}

function hasError(events: WorkflowEvent[]): string | null {
  const err = events.find((e) => e.type === "error");
  return err && err.type === "error" ? err.message : null;
}

const STEPS: { label: string; description: string }[] = [
  { label: "Gerando Especificação", description: "Analisando a história e criando a spec técnica" },
  { label: "Revisão Humana", description: "Aguardando sua aprovação da especificação" },
  { label: "Implementação", description: "Gerando frontend e validando qualidade" },
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
    <div className="size-7 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center shrink-0" />
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
  if (event.type === "status_changed") {
    const MAP: Record<string, string> = {
      running: "Workflow iniciado",
      awaiting_human: "Aguardando revisão",
      completed: "Concluído",
      error: "Erro",
      idle: "Idle",
    };
    return <span>{MAP[event.status] ?? event.status}</span>;
  }
  if (event.type === "awaiting_approval") return <span>Especificação gerada</span>;
  if (event.type === "node_started") return <span>Agente <code className="text-violet-400">{event.agentName}</code> iniciado</span>;
  if (event.type === "node_completed") return <span>Agente <code className="text-violet-400">{event.agentName}</code> concluído</span>;
  if (event.type === "error") return <span className="text-rose-400">Erro: {event.message}</span>;
  return <span>{(event as { type: string }).type}</span>;
}

export function WorkflowProgress({
  threadId,
  events,
  isConnected,
}: WorkflowProgressProps): JSX.Element {
  const phase = derivePhase(events);
  const errorMsg = hasError(events);

  const visibleEvents = events
    .filter((e) => e.type !== "status_changed" || e.status !== "idle")
    .slice(-6);

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

      {/* Steps */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col gap-0">
          {STEPS.map((step, i) => {
            const stepState: "done" | "active" | "pending" =
              i < phase ? "done" : i === phase ? "active" : "pending";
            const isLast = i === STEPS.length - 1;

            return (
              <div key={step.label} className="flex gap-3">
                {/* Icon + connector */}
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

                {/* Text */}
                <div className="pb-5 pt-0.5">
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
                    <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
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
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-slate-300 min-w-0">
                  <div className="size-1.5 rounded-full bg-violet-500 shrink-0" />
                  <EventLabel event={evt} />
                </div>
                <span className="text-xs text-slate-600 font-mono shrink-0">
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