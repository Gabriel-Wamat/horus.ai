import { useState, type JSX } from "react";
import type { Spec } from "@u-build/shared";

interface SpecReviewProps {
  spec: Spec;
  onApprove: (editedSpec?: Spec) => void;
  onReject: () => void;
}

const COMPONENT_TYPE_COLORS: Record<string, string> = {
  ui: "text-violet-400 bg-violet-950 border-violet-800",
  api: "text-sky-400 bg-sky-950 border-sky-800",
  service: "text-amber-400 bg-amber-950 border-amber-800",
  model: "text-emerald-400 bg-emerald-950 border-emerald-800",
  utility: "text-slate-400 bg-slate-800 border-slate-700",
};

export function SpecReview({ spec, onApprove, onReject }: SpecReviewProps): JSX.Element {
  const [summary, setSummary] = useState(spec.summary);
  const [approach, setApproach] = useState(spec.technicalApproach);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = summary !== spec.summary || approach !== spec.technicalApproach;

  const handleApprove = async (): Promise<void> => {
    setIsSubmitting(true);
    onApprove(isDirty ? { ...spec, summary, technicalApproach: approach } : undefined);
  };

  return (
    <div className="bg-slate-900 border border-violet-800/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-violet-600/20 border border-violet-700 flex items-center justify-center">
            <svg className="size-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Especificação Gerada</h2>
            <p className="text-xs text-slate-500">v{spec.version} · US {spec.userStoryId.slice(0, 8)}&hellip;</p>
          </div>
        </div>
        {isDirty && (
          <span className="text-xs font-medium text-amber-400 bg-amber-950 border border-amber-800 px-2.5 py-1 rounded-full">
            Editado
          </span>
        )}
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* Summary */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Resumo
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition resize-none"
          />
        </div>

        {/* Technical approach */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Abordagem Técnica
          </label>
          <textarea
            value={approach}
            onChange={(e) => setApproach(e.target.value)}
            rows={4}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition resize-none"
          />
        </div>

        {/* Components */}
        {spec.components.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
              Componentes ({spec.components.length})
            </p>
            <div className="flex flex-col gap-2">
              {spec.components.map((c) => (
                <div
                  key={c.name}
                  className="flex items-start gap-3 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3.5 py-2.5"
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider border rounded px-1.5 py-0.5 mt-0.5 shrink-0 ${
                      COMPONENT_TYPE_COLORS[c.type] ?? COMPONENT_TYPE_COLORS["utility"]
                    }`}
                  >
                    {c.type}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{c.description}</p>
                    {c.dependencies && c.dependencies.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {c.dependencies.map((dep) => (
                          <span key={dep} className="text-[10px] font-mono text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
                            {dep}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acceptance criteria */}
        {spec.acceptanceCriteria.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
              Critérios de Aceite
            </p>
            <div className="flex flex-col gap-2">
              {spec.acceptanceCriteria.map((criterion, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-violet-500 text-xs font-mono select-none mt-0.5 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm text-slate-300 leading-relaxed">{criterion}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-4">
        <p className="text-xs text-slate-500">
          Você pode editar o resumo e a abordagem antes de aprovar.
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onReject}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 border border-slate-700 hover:border-rose-800 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Rejeitar
          </button>
          <button
            onClick={handleApprove}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Aprovando…
              </>
            ) : (
              <>
                {isDirty ? "Aprovar com edições" : "Aprovar"}
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}