import type { JSX } from "react";
import type { PreviewEvent } from "@u-build/shared";

function formatEventTime(timestamp: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
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
      {events.map((event) => (
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
          </div>
        </article>
      ))}
    </div>
  );
}
