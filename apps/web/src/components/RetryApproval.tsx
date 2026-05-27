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
      ? "var(--p)"
      : payload.score >= 50
      ? "var(--warn)"
      : "var(--danger)";

  return (
    <section className="panel">
      <div className="panel-head" style={{ background: "rgba(240, 180, 41, 0.05)" }}>
        <div>
          <p className="panel-kicker">Curator escalation</p>
          <h2 className="panel-title">
            Curadoria não aprovada após {MAX_RETRIES} tentativas
          </h2>
          <p className="workflow-meta">
            Deseja continuar com mais {MAX_RETRIES} tentativas?
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
            <p className="panel-kicker">
              Avaliação do Curador
            </p>
            <p className="message-body">
              {payload.notes}
            </p>
          </div>
        </div>

        {payload.missingItems.length > 0 && (
          <div>
            <p className="panel-kicker">
              Itens Faltando ({payload.missingItems.length})
            </p>
            <div className="form-grid" style={{ gap: 8 }}>
              {payload.missingItems.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span className="step-dot failed" style={{ width: 7, height: 7, marginTop: 6 }} />
                  <p className="message-body">{item}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Array.from({ length: MAX_RETRIES }, (_, i) => (
            <div
              key={i}
              style={{
                height: 6,
                flex: 1,
                borderRadius: 999,
                background:
                  i < payload.retryCount % MAX_RETRIES || payload.retryCount >= MAX_RETRIES
                    ? "var(--warn)"
                    : "var(--s3)",
              }}
            />
          ))}
          <span className="workflow-meta">
            {payload.retryCount} tentativa{payload.retryCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="panel-head" style={{ borderTop: "1px solid var(--bd)", borderBottom: 0 }}>
        <p className="workflow-meta">
          Se continuar, os agentes receberão o feedback do curador para corrigir os problemas.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={onStop}
            disabled={isSubmitting}
            className="ghost-button"
          >
            Encerrar
          </button>
          <button
            type="button"
            onClick={onContinue}
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
    </section>
  );
}
