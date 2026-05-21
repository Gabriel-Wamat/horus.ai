import type { JSX } from "react";

export interface RetryApprovalPayload {
  userStoryId: string;
  retryCount: number;
  score: number;
  notes: string;
  missingItems: string[];
}

interface RetryApprovalProps {
  payload: RetryApprovalPayload;
  onContinue: () => void;
  onStop: () => void;
  isSubmitting: boolean;
}

const MAX_RETRIES = 3;

export function RetryApproval({
  payload,
  onContinue,
  onStop,
  isSubmitting,
}: RetryApprovalProps): JSX.Element {
  const scoreColor =
    payload.score >= 70
      ? "text-emerald-400"
      : payload.score >= 50
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <div className="bg-slate-900 border border-amber-700/60 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3 bg-amber-950/30">
        <div className="size-8 rounded-lg bg-amber-600/20 border border-amber-700 flex items-center justify-center shrink-0">
          <svg
            className="size-4 text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">
            Curadoria não aprovada após {MAX_RETRIES} tentativas
          </h2>
          <p className="text-xs text-slate-500">
            Deseja continuar com mais {MAX_RETRIES} tentativas?
          </p>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-5">
        {/* Score */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center justify-center size-16 rounded-xl bg-slate-800 border border-slate-700 shrink-0">
            <span className={`text-xl font-bold tabular-nums ${scoreColor}`}>
              {payload.score}
            </span>
            <span className="text-[10px] text-slate-500">/100</span>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
              Avaliação do Curador
            </p>
            <p className="text-sm text-slate-300 leading-relaxed">
              {payload.notes}
            </p>
          </div>
        </div>

        {/* Missing items */}
        {payload.missingItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Itens Faltando ({payload.missingItems.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {payload.missingItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-rose-500 mt-0.5 shrink-0">
                    <svg
                      className="size-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </span>
                  <p className="text-sm text-slate-400">{item}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attempt counter */}
        <div className="flex items-center gap-2">
          {Array.from({ length: MAX_RETRIES }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < payload.retryCount % MAX_RETRIES || payload.retryCount >= MAX_RETRIES
                  ? "bg-amber-500"
                  : "bg-slate-700"
              }`}
            />
          ))}
          <span className="text-xs text-slate-500 shrink-0 ml-1">
            {payload.retryCount} tentativa{payload.retryCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-4">
        <p className="text-xs text-slate-500">
          Se continuar, os agentes receberão o feedback do curador para corrigir os problemas.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onStop}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Encerrar
          </button>
          <button
            onClick={onContinue}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Enviando…
              </>
            ) : (
              <>
                Continuar mais {MAX_RETRIES} tentativas
                <svg
                  className="size-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}