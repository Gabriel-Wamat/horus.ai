import type { JSX } from "react";
import type {
  FrontendProject,
  PreviewEvent,
  PreviewSession,
} from "@u-build/shared";
import { PreviewIcon } from "./PreviewIcons.js";
import { PreviewTimeline } from "./PreviewTimeline.js";

function getStatusLabel(session: PreviewSession | null): string {
  if (!session) return "Sem sessão";

  const labels: Record<PreviewSession["status"], string> = {
    waiting: "Aguardando",
    stopped: "Parado",
    starting: "Iniciando",
    running: "Rodando",
    inspecting: "Inspecionando",
    applying: "Aplicando",
    error: "Erro",
  };

  return labels[session.status];
}

export function PreviewProjectPanel({
  projects,
  selectedProjectId,
  selectedProject,
  session,
  timeline,
  route,
  isLoading,
  error,
  onSelectProject,
  onChangeRoute,
}: {
  readonly projects: FrontendProject[];
  readonly selectedProjectId: string;
  readonly selectedProject: FrontendProject | null;
  readonly session: PreviewSession | null;
  readonly timeline: PreviewEvent[];
  readonly route: string;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly onSelectProject: (projectId: string) => void;
  readonly onChangeRoute: (route: string) => void;
}): JSX.Element {
  return (
    <aside className="preview-side" aria-label="Projeto e timeline">
      <section className="preview-side-section">
        <div className="preview-section-head">
          <div>
            <p className="panel-kicker">Projeto</p>
            <h2 className="panel-title">Preview visual</h2>
          </div>
          <span className={`preview-session-status status-${session?.status ?? "waiting"}`}>
            {getStatusLabel(session)}
          </span>
        </div>

        <label className="field-label" htmlFor="preview-project">
          Frontend
        </label>
        <select
          id="preview-project"
          className="select"
          value={selectedProjectId}
          disabled={isLoading || projects.length === 0}
          onChange={(event) => onSelectProject(event.target.value)}
        >
          {projects.length === 0 ? (
            <option value="">Nenhum projeto</option>
          ) : (
            projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))
          )}
        </select>

        <label className="field-label preview-route-label" htmlFor="preview-route">
          Rota
        </label>
        <input
          id="preview-route"
          className="input"
          value={route}
          disabled={Boolean(session)}
          onChange={(event) => onChangeRoute(event.target.value)}
          placeholder="/"
        />

        {selectedProject && (
          <div className="preview-project-meta">
            <div>
              <span>Slug</span>
              <strong>{selectedProject.slug}</strong>
            </div>
            <div>
              <span>Comando</span>
              <strong>{selectedProject.devCommand ?? "Manual"}</strong>
            </div>
          </div>
        )}

        {session && (
          <div className="preview-session-card">
            <PreviewIcon name="terminal" />
            <div>
              <span>Sessão</span>
              <strong>{session.id.slice(0, 8)}...{session.id.slice(-4)}</strong>
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
      </section>

      <section className="preview-side-section preview-timeline-section">
        <div className="preview-section-head compact">
          <div>
            <p className="panel-kicker">Timeline</p>
            <h2 className="panel-title">Eventos</h2>
          </div>
          <span className="preview-count-pill">{timeline.length}</span>
        </div>
        <PreviewTimeline events={timeline} />
      </section>
    </aside>
  );
}
