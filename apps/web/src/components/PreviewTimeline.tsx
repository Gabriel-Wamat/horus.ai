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
  executable?: unknown;
  args?: unknown;
  cwd?: unknown;
  durationMs?: unknown;
  exitCode?: unknown;
  signal?: unknown;
  stdoutTail?: unknown;
  stderrTail?: unknown;
  reason?: unknown;
  dependencyBootstrap?: unknown;
}

interface CommandEvidenceView {
  commandId?: unknown;
  executable?: unknown;
  args?: unknown;
  cwd?: unknown;
  durationMs?: unknown;
  exitCode?: unknown;
  signal?: unknown;
  stdoutTail?: unknown;
  stderrTail?: unknown;
  reason?: unknown;
}

function runtimeEvidence(event: PreviewEvent): RuntimeEvidenceView | null {
  const value = event.data["runtimeEvidence"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RuntimeEvidenceView;
}

function commandEvidence(value: unknown): CommandEvidenceView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as CommandEvidenceView;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function evidenceLine(evidence: CommandEvidenceView): string {
  const parts: string[] = [];
  if (typeof evidence.commandId === "string" && evidence.commandId) {
    parts.push(`cmd ${evidence.commandId}`);
  }
  if (typeof evidence.executable === "string" && evidence.executable) {
    const args = stringArrayValue(evidence.args);
    parts.push([evidence.executable, ...args].join(" "));
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

function suggestedAction(
  evidence: RuntimeEvidenceView,
  dependencyBootstrap: CommandEvidenceView | null
): string {
  const mainStderr = stringValue(evidence.stderrTail).toLowerCase();
  const dependencyStderr = stringValue(dependencyBootstrap?.stderrTail).toLowerCase();
  const reason = stringValue(evidence.reason).toLowerCase();
  const combined = [mainStderr, dependencyStderr, reason].join("\n");

  if (
    reason === "dependency_bootstrap_failed" ||
    (typeof dependencyBootstrap?.exitCode === "number" &&
      dependencyBootstrap.exitCode !== 0)
  ) {
    return "Ação sugerida: revisar o comando de install do command catalog e executar novamente o preview.";
  }
  if (
    combined.includes("command not found") ||
    combined.includes("vite: not found") ||
    combined.includes("enoent")
  ) {
    return "Ação sugerida: instalar as dependências do workspace antes de iniciar o preview.";
  }
  if (combined.includes("eaddrinuse") || combined.includes("address already in use")) {
    return "Ação sugerida: liberar a porta configurada ou regenerar o preview em outra porta.";
  }
  if (combined.includes("timeout") || combined.includes("timed out")) {
    return "Ação sugerida: verificar se o servidor do preview iniciou e responde no host/porta públicos.";
  }
  return "";
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
        const dependencyBootstrap = commandEvidence(evidence?.dependencyBootstrap);
        const detail = evidence ? evidenceLine(evidence) : "";
        const stderrTail =
          typeof evidence?.stderrTail === "string" ? evidence.stderrTail.trim() : "";
        const stdoutTail =
          typeof evidence?.stdoutTail === "string" ? evidence.stdoutTail.trim() : "";
        const bootstrapDetail = dependencyBootstrap
          ? evidenceLine(dependencyBootstrap)
          : "";
        const bootstrapOutput = [
          stringValue(dependencyBootstrap?.stderrTail),
          stringValue(dependencyBootstrap?.stdoutTail),
        ]
          .filter(Boolean)
          .join("\n");
        const action = evidence ? suggestedAction(evidence, dependencyBootstrap) : "";

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
              {bootstrapDetail ? (
                <p className="preview-event-detail">bootstrap · {bootstrapDetail}</p>
              ) : null}
              {stderrTail ? (
                <pre className="preview-event-stderr">{stderrTail}</pre>
              ) : null}
              {!stderrTail && stdoutTail ? (
                <pre className="preview-event-stderr muted">{stdoutTail}</pre>
              ) : null}
              {bootstrapOutput ? (
                <pre className="preview-event-stderr muted">{bootstrapOutput}</pre>
              ) : null}
              {action ? <p className="preview-event-action">{action}</p> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
