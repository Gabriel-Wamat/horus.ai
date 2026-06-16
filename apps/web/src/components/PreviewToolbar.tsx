import type { JSX } from "react";
import type { PreviewDeviceName, PreviewSession } from "@u-build/shared";
import { PreviewIcon } from "./PreviewIcons.js";

const devices: Array<{
  name: PreviewDeviceName;
  label: string;
  icon: "monitor" | "phone" | "tablet";
}> = [
  { name: "pc", label: "PC", icon: "monitor" },
  { name: "phone", label: "Phone", icon: "phone" },
  { name: "tablet", label: "Tablet", icon: "tablet" },
];

export function PreviewToolbar({
  session,
  route,
  isActing,
  isConnected,
  canStart,
  onStart,
  onStop,
  onReload,
  onSetDevice,
}: {
  readonly session: PreviewSession | null;
  readonly route: string;
  readonly isActing: boolean;
  readonly isConnected: boolean;
  readonly canStart?: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onReload: () => void;
  readonly onSetDevice: (device: PreviewDeviceName) => void;
}): JSX.Element {
  const running = session?.status === "running";
  const busy = isActing || session?.status === "starting";

  return (
    <header className="preview-toolbar">
      <div className="preview-route-display">
        <PreviewIcon name="monitor" />
        <span>{route || "/"}</span>
      </div>

      <div className="preview-toolbar-actions">
        <button
          className="primary-button preview-action-button"
          type="button"
          disabled={busy || running || canStart === false}
          title={canStart === false ? "Nenhum projeto de frontend disponível" : undefined}
          onClick={onStart}
        >
          <PreviewIcon name="play" />
          <span>Iniciar</span>
        </button>
        <button
          className="ghost-button preview-action-button"
          type="button"
          disabled={busy || !session || !running}
          onClick={onStop}
        >
          <PreviewIcon name="pause" />
          <span>Parar</span>
        </button>
        <button
          className="ghost-button preview-action-button"
          type="button"
          disabled={busy || !session}
          onClick={onReload}
        >
          <PreviewIcon name="refresh" />
          <span>Recarregar</span>
        </button>
      </div>

      <div className="preview-toolbar-spacer" />

      <div className="preview-stream-chip">
        <span className={`live-dot ${isConnected ? "running" : ""}`} aria-hidden="true" />
        <span>{isConnected ? "SSE live" : "SSE offline"}</span>
      </div>

      <div className="preview-device-switcher" aria-label="Dispositivo do preview">
        {devices.map((device) => (
          <button
            key={device.name}
            className={`preview-device-button ${
              session?.device.name === device.name ? "active" : ""
            }`}
            type="button"
            disabled={busy || !session}
            onClick={() => onSetDevice(device.name)}
          >
            <PreviewIcon name={device.icon} />
            <span>{device.label}</span>
          </button>
        ))}
      </div>
    </header>
  );
}
