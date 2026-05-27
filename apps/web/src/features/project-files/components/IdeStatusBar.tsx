import type { JSX } from "react";

interface IdeStatusBarProps {
  readonly column: number;
  readonly dirty: boolean;
  readonly language: string;
  readonly line: number;
  readonly readonlyReason: string | null;
  readonly saveState: "pristine" | "dirty" | "saved" | "error" | "conflict";
  readonly sizeLabel: string;
}

function statusLabel(input: Pick<IdeStatusBarProps, "dirty" | "readonlyReason" | "saveState">): string {
  if (input.readonlyReason) return input.readonlyReason;
  if (input.saveState === "conflict") return "Conflito externo";
  if (input.saveState === "error") return "Falha ao salvar";
  if (input.dirty) return "Alterações locais";
  if (input.saveState === "saved") return "Salvo";
  return "Pronto";
}

export function IdeStatusBar({
  column,
  dirty,
  language,
  line,
  readonlyReason,
  saveState,
  sizeLabel,
}: IdeStatusBarProps): JSX.Element {
  const status = statusLabel({ dirty, readonlyReason, saveState });
  const statusClass = readonlyReason ? "readonly" : saveState === "pristine" && dirty ? "dirty" : saveState;

  return (
    <footer className="project-files-ide-status-bar" aria-label="Estado do editor">
      <div className="project-files-ide-status-left">
        <span className={`project-files-ide-status-chip is-${statusClass}`}>{status}</span>
        <span>{sizeLabel}</span>
      </div>
      <div className="project-files-ide-status-right">
        <span>
          Ln {line}, Col {column}
        </span>
        <span>{language}</span>
        <span>UTF-8</span>
      </div>
    </footer>
  );
}
