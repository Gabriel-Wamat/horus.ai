import type { JSX } from "react";
import type { PreviewSession } from "@u-build/shared";
import { PreviewIcon } from "./PreviewIcons.js";

export function PreviewCanvas({
  session,
}: {
  readonly session: PreviewSession | null;
}): JSX.Element {
  const status = session?.status ?? "waiting";
  const previewUrl =
    session?.status === "running" ? session.previewUrl ?? undefined : undefined;
  const frameSession = previewUrl && session ? session : null;

  return (
    <section className="preview-canvas" aria-label="Canvas do preview">
      {frameSession && previewUrl ? (
        <div className={`preview-frame-stage device-${frameSession.device.name}`}>
          <div
            className="preview-frame-shell"
            style={{
              maxWidth: `${frameSession.device.width}px`,
              aspectRatio: `${frameSession.device.width} / ${frameSession.device.height}`,
            }}
          >
            <iframe
              className="preview-frame"
              title="Preview visual"
              src={previewUrl}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
      ) : (
        <div className="preview-empty-state">
          <div className={`preview-empty-icon status-${status}`}>
            <PreviewIcon name={status === "error" ? "terminal" : "code"} />
          </div>
          <h2>{status === "error" ? "Preview com erro" : "Preview parado"}</h2>
          <p>
            {session?.errorMessage ??
              "Selecione um projeto de frontend e inicie uma sessão visual."}
          </p>
        </div>
      )}
    </section>
  );
}
