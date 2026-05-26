import type { JSX, ReactNode } from "react";

interface ShellProps {
  readonly title: string;
  readonly subtitle: string;
  readonly status: Array<{ label: string; value: string; live?: boolean }>;
  readonly onOpenSettings: () => void;
  readonly children: ReactNode;
}

function Icon({ name }: { name: "layers" | "activity" | "settings" }): JSX.Element {
  if (name === "activity") {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12h4l3-8 4 16 3-8h4" />
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

  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 4 7l8 4 8-4-8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 17 8 4 8-4" />
    </svg>
  );
}

export function Shell({
  title,
  subtitle,
  status,
  onOpenSettings,
  children,
}: ShellProps): JSX.Element {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand-mark" aria-label="Horus">
          H
        </div>
        <button className="nav-button active" type="button" aria-label="Workflow">
          <Icon name="layers" />
        </button>
        <button className="nav-button" type="button" aria-label="Atividade">
          <Icon name="activity" />
        </button>
        <div className="sidebar-spacer" />
        <button
          className="settings-button"
          type="button"
          aria-label="Configurações"
          onClick={onOpenSettings}
        >
          <Icon name="settings" />
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
