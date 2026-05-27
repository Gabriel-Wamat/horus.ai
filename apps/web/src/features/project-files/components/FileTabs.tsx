import type { JSX } from "react";
import { X } from "lucide-react";
import type { OpenProjectFileTab } from "../hooks/useProjectFilesState.js";

interface FileTabsProps {
  readonly tabs: readonly OpenProjectFileTab[];
  readonly activePath: string | null;
  readonly dirtyPaths?: ReadonlySet<string>;
  readonly onSelect: (path: string) => void;
  readonly onClose: (path: string) => void;
}

export function FileTabs({
  tabs,
  activePath,
  dirtyPaths = new Set(),
  onSelect,
  onClose,
}: FileTabsProps): JSX.Element {
  if (tabs.length === 0) {
    return (
      <div className="project-files-tabs is-empty">
        <span>Nenhum arquivo aberto</span>
      </div>
    );
  }

  return (
    <div className="project-files-tabs" role="tablist" aria-label="Arquivos abertos">
      {tabs.map((tab) => (
        <button
          key={tab.path}
          type="button"
          role="tab"
          aria-selected={activePath === tab.path}
          className={`project-files-tab ${activePath === tab.path ? "active" : ""}`}
          onClick={() => onSelect(tab.path)}
          title={tab.path}
        >
          <span className="project-files-tab-name">{tab.name}</span>
          {dirtyPaths.has(tab.path) ? (
            <span className="project-files-tab-dirty" aria-label="Alterações não salvas" />
          ) : null}
          <span className="project-files-tab-language">{tab.language ?? ""}</span>
          <span
            role="button"
            tabIndex={0}
            className="project-files-tab-close"
            aria-label={`Fechar ${tab.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.path);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onClose(tab.path);
            }}
          >
            <X size={13} aria-hidden="true" />
          </span>
        </button>
      ))}
    </div>
  );
}
