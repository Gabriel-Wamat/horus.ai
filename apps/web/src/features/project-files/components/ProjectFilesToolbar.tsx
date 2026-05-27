import type { JSX } from "react";
import type { ProjectFileBrowserProject, ProjectFileTreeResponse } from "@u-build/shared";
import { ChevronDown, FileSearch, RefreshCw } from "lucide-react";

interface ProjectFilesToolbarProps {
  readonly projects: readonly ProjectFileBrowserProject[];
  readonly selectedProjectId: string;
  readonly selectedProject?: ProjectFileBrowserProject | undefined;
  readonly tree?: ProjectFileTreeResponse | undefined;
  readonly search: string;
  readonly isRefreshing: boolean;
  readonly onSelectProject: (projectId: string) => void;
  readonly onChangeSearch: (search: string) => void;
  readonly onRefresh: () => void;
}

export function ProjectFilesToolbar({
  projects,
  selectedProjectId,
  tree,
  search,
  isRefreshing,
  onSelectProject,
  onChangeSearch,
  onRefresh,
}: ProjectFilesToolbarProps): JSX.Element {
  const fileCount = tree?.entries.filter((entry) => entry.kind === "file").length;

  return (
    <header className="project-files-toolbar">
      <div className="project-files-toolbar-main">
        <label className="project-files-project-select">
          <span>Projeto</span>
          <div className="project-files-select-wrap">
            <select
              aria-label="Selecionar projeto"
              value={selectedProjectId}
              onChange={(event) => onSelectProject(event.target.value)}
            >
              {projects.length === 0 ? (
                <option value="">Nenhum projeto</option>
              ) : null}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
        </label>
      </div>

      <div className="project-files-toolbar-actions">
        <label className="project-files-search">
          <FileSearch size={15} aria-hidden="true" />
          <input
            type="search"
            value={search}
            placeholder="Buscar arquivo..."
            aria-label="Buscar arquivo"
            onChange={(event) => onChangeSearch(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="project-files-icon-button"
          aria-label="Atualizar arquivos"
          title="Atualizar arquivos"
          onClick={onRefresh}
          disabled={isRefreshing || !selectedProjectId}
        >
          <RefreshCw size={16} className={isRefreshing ? "is-spinning" : ""} />
          <span>Atualizar</span>
        </button>
      </div>
      {typeof fileCount === "number" ? (
        <span className="project-files-toolbar-count">{fileCount} arquivos</span>
      ) : null}
    </header>
  );
}
