import { useState, type JSX } from "react";
import type { Spec } from "@u-build/shared";

interface SpecReviewProps {
  spec: Spec;
  onApprove: (editedSpec?: Spec) => void;
  onReject: () => void;
}

const COMPONENT_TYPE_COLORS: Record<string, string> = {
  ui: "var(--p)",
  api: "var(--info)",
  service: "var(--warn)",
  model: "var(--spark)",
  utility: "var(--t2)",
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
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="panel-kicker">Human checkpoint</p>
          <h2 className="panel-title">Especificação gerada</h2>
          <p className="workflow-meta">v{spec.version} · US {spec.userStoryId.slice(0, 8)}&hellip;</p>
        </div>
        {isDirty && (
          <span className="status-chip">
            <span className="status-chip-label">state</span>
            <span className="status-chip-value" style={{ color: "var(--warn)" }}>
            Editado
            </span>
          </span>
        )}
      </div>

      <div className="panel-body form-grid">
        <div>
          <label className="field-label">
            Resumo
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="textarea"
          />
        </div>

        <div>
          <label className="field-label">
            Abordagem Técnica
          </label>
          <textarea
            value={approach}
            onChange={(e) => setApproach(e.target.value)}
            rows={4}
            className="textarea"
          />
        </div>

        {spec.components.length > 0 && (
          <div>
            <p className="panel-kicker">
              Componentes ({spec.components.length})
            </p>
            <div className="form-grid" style={{ gap: 8 }}>
              {spec.components.map((c) => (
                <div
                  key={c.name}
                  className="story-card"
                >
                  <span
                    className="status-chip-value"
                    style={{ color: COMPONENT_TYPE_COLORS[c.type] ?? COMPONENT_TYPE_COLORS["utility"] }}
                  >
                    {c.type}
                  </span>
                  <div style={{ minWidth: 0, marginTop: 6 }}>
                    <p className="workflow-title">{c.name}</p>
                    <p className="workflow-meta">{c.description}</p>
                    {c.dependencies && c.dependencies.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {c.dependencies.map((dep) => (
                          <span key={dep} className="status-chip-value">
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

        {spec.acceptanceCriteria.length > 0 && (
          <div>
            <p className="panel-kicker">
              Critérios de Aceite
            </p>
            <div className="form-grid" style={{ gap: 8 }}>
              {spec.acceptanceCriteria.map((criterion, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span className="criteria-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="message-body">{criterion}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel-head" style={{ borderTop: "1px solid var(--bd)", borderBottom: 0 }}>
        <p className="workflow-meta">
          Você pode editar o resumo e a abordagem antes de aprovar.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={onReject}
            disabled={isSubmitting}
            className="ghost-button danger-button"
          >
            Rejeitar
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={isSubmitting}
            className="primary-button"
          >
            {isSubmitting ? (
              <>
                <svg className="icon animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Aprovando…
              </>
            ) : (
              <>
                {isDirty ? "Aprovar com edições" : "Aprovar"}
                <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
