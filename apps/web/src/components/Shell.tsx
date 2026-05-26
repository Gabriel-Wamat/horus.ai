import { useState, type JSX, type ReactNode } from "react";

export type ShellMode = "stories" | "preview";
type SidebarIconName =
  | "menu"
  | "stories"
  | "preview"
  | "settings";

interface ShellProps {
  readonly title: string;
  readonly subtitle: string;
  readonly status: Array<{ label: string; value: string; live?: boolean }>;
  readonly activeMode: ShellMode;
  readonly onChangeMode: (mode: ShellMode) => void;
  readonly onOpenSettings: () => void;
  readonly children: ReactNode;
}

function Icon({ name }: { name: SidebarIconName }): JSX.Element {
  if (name === "menu") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  }

  if (name === "stories") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
        <path d="M4 5.5v16M8 7h7M8 11h6" />
      </svg>
    );
  }

  if (name === "preview") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21.3a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 1 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 3.8 15a1.8 1.8 0 0 0-1.65-1.1H2.1a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 3.8 8.6a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.97-2.97l.04.04a1.8 1.8 0 0 0 1.98.36 1.8 1.8 0 0 0 1.1-1.65V2.1a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04A1.8 1.8 0 0 0 19.4 8.6a1.8 1.8 0 0 0 1.65 1.1h.06a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
      </svg>
    );
  }

  return <></>;
}

export function Shell({
  title,
  subtitle,
  status,
  activeMode,
  onChangeMode,
  onOpenSettings,
  children,
}: ShellProps): JSX.Element {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  return (
    <div className={`app-shell ${isSidebarExpanded ? "sidebar-expanded" : ""}`}>
      <aside className="sidebar" aria-label="Navegação principal">
        <button
          className="sidebar-icon-button menu-button"
          type="button"
          aria-label={isSidebarExpanded ? "Recolher menu" : "Expandir menu"}
          title={isSidebarExpanded ? "Recolher menu" : "Expandir menu"}
          onClick={() => setIsSidebarExpanded((current) => !current)}
        >
          <Icon name="menu" />
          <span className="sidebar-label">Menu</span>
        </button>
        <div className="sidebar-separator" />
        <button
          className={`sidebar-icon-button ${activeMode === "stories" ? "active" : ""}`}
          type="button"
          aria-label="User Stories"
          title="User Stories"
          onClick={() => onChangeMode("stories")}
        >
          <Icon name="stories" />
          <span className="sidebar-label">User Stories</span>
        </button>
        <button
          className={`sidebar-icon-button ${activeMode === "preview" ? "active" : ""}`}
          type="button"
          aria-label="Preview"
          title="Preview"
          onClick={() => onChangeMode("preview")}
        >
          <Icon name="preview" />
          <span className="sidebar-label">Preview</span>
        </button>
        <div className="sidebar-spacer" />
        <div className="sidebar-separator" />
        <button
          className="sidebar-icon-button"
          type="button"
          aria-label="Configurações"
          title="Configurações"
          onClick={onOpenSettings}
        >
          <Icon name="settings" />
          <span className="sidebar-label">Config</span>
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="brand-title">{title}</h1>
            <p className="brand-subtitle">{subtitle}</p>
          </div>
          <div className="status-row">
            {status.map((item) => (
              <div className="status-chip" key={item.label}>
                {item.live && <span className="live-dot running" aria-hidden="true" />}
                <span className="status-chip-label">{item.label}</span>
                <span className="status-chip-value">{item.value}</span>
              </div>
            ))}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
