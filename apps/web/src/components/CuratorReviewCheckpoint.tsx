import type { JSX } from "react";

export interface CuratorReviewPayload {
  userStoryId: string;
  score: number;
  notes: string;
  previewSessionId: string | null;
}

interface CuratorReviewCheckpointProps {
  payload: CuratorReviewPayload;
  onAccept: () => void;
  onRequestAdjustment: () => void;
  onOpenPreview: () => void;
  isSubmitting: boolean;
}

export function CuratorReviewCheckpoint({
  payload,
  onAccept,
  onRequestAdjustment,
  onOpenPreview,
  isSubmitting,
}: CuratorReviewCheckpointProps): JSX.Element {
  const scoreColor =
    payload.score >= 70
      ? "var(--p)"
      : payload.score >= 50
      ? "var(--warn)"
      : "var(--danger)";

  return (
    <section className="panel">
      <div className="panel-head" style={{ background: "rgba(99, 102, 241, 0.05)" }}>
        <div>
          <p className="panel-kicker">Curator review</p>
          <h2 className="panel-title">Score abaixo do esperado — revisão necessária</h2>
          <p className="workflow-meta">
            O curador retornou um score baixo. Revise o preview e decida se o resultado é
            aceitável ou se os agentes devem refazer a entrega.
          </p>
        </div>
      </div>

      <div className="panel-body form-grid">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="story-card" style={{ width: 72, textAlign: "center" }}>
            <span className="panel-title" style={{ color: scoreColor }}>
              {payload.score}
            </span>
            <span className="workflow-meta">/100</span>
          </div>
          <div>
            <p className="panel-kicker">Avaliação do Curador</p>
            <p className="message-body">{payload.notes}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenPreview}
          className="ghost-button"
          style={{ alignSelf: "flex-start" }}
        >
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
              d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.641 0-8.573-3.007-9.964-7.178Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
          Ver preview do resultado
        </button>
      </div>

      <div className="panel-head" style={{ borderTop: "1px solid var(--bd)", borderBottom: 0 }}>
        <p className="workflow-meta">
          Se aceitar, o workflow avança. Se solicitar ajuste, os agentes refazem a entrega.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={onRequestAdjustment}
            disabled={isSubmitting}
            className="ghost-button"
          >
            Solicitar ajuste
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={isSubmitting}
            className="primary-button"
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
                O resultado está bom
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
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
