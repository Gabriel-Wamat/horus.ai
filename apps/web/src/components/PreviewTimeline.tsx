import type { JSX } from "react";
import type { PreviewEvent } from "@u-build/shared";

function formatEventTime(timestamp: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

interface RuntimeEvidenceView {
  commandId?: unknown;
  cwd?: unknown;
  durationMs?: unknown;
  exitCode?: unknown;
  signal?: unknown;
  stderrTail?: unknown;
}

function runtimeEvidence(event: PreviewEvent): RuntimeEvidenceView | null {
  const value = event.data["runtimeEvidence"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RuntimeEvidenceView;
}

function evidenceLine(evidence: RuntimeEvidenceView): string {
  const parts: string[] = [];
  if (typeof evidence.commandId === "string" && evidence.commandId) {
    parts.push(`cmd ${evidence.commandId}`);
  }
  if (typeof evidence.durationMs === "number") {
    parts.push(`${Math.round(evidence.durationMs)}ms`);
  }
  if (typeof evidence.exitCode === "number") {
    parts.push(`exit ${evidence.exitCode}`);
  }
  if (typeof evidence.signal === "string" && evidence.signal) {
    parts.push(evidence.signal);
  }
  if (typeof evidence.cwd === "string" && evidence.cwd) {
    parts.push(evidence.cwd);
  }
  return parts.join(" · ");
}

export function PreviewTimeline({
  events,
}: {
  readonly events: PreviewEvent[];
}): JSX.Element {
  if (events.length === 0) {
    return (
      <div className="preview-timeline-empty">
        Nenhuma ação registrada ainda.
      </div>
    );
  }

  return (
    <div className="preview-timeline-list" aria-label="Timeline do preview">
      {events.map((event) => {
        const evidence = runtimeEvidence(event);
        const detail = evidence ? evidenceLine(evidence) : "";
        const stderrTail =
          typeof evidence?.stderrTail === "string" ? evidence.stderrTail.trim() : "";

        return (
          <article className="preview-event-row" key={event.id}>
            <span
              className={`preview-event-dot status-${event.status}`}
              aria-hidden="true"
            />
            <div className="preview-event-copy">
              <div className="preview-event-head">
                <span>{event.type.replaceAll("_", " ")}</span>
                <time dateTime={event.timestamp}>{formatEventTime(event.timestamp)}</time>
              </div>
              <p>{event.message}</p>
              {detail ? <p className="preview-event-detail">{detail}</p> : null}
              {stderrTail ? (
                <pre className="preview-event-stderr">{stderrTail}</pre>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
