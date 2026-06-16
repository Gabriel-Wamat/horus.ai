import type { JSX } from "react";
import type { PreviewSession } from "@u-build/shared";
import { PreviewIcon } from "./PreviewIcons.js";

export function PreviewCanvas({
  session,
  refreshToken,
  htmlDoc,
}: {
  readonly session: PreviewSession | null;
  readonly refreshToken?: string | null;
  readonly htmlDoc?: string | null;
}): JSX.Element {
  const status = session?.status ?? "waiting";
  const previewUrl =
    session?.status === "running" ? session.previewUrl ?? undefined : undefined;
  const frameUrl =
    previewUrl && refreshToken ? withRefreshToken(previewUrl, refreshToken) : previewUrl;
  const frameSession = previewUrl && session ? session : null;
  const showStaticHtml = !frameSession && htmlDoc;

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
              key={`${frameSession.id}:${refreshToken ?? frameSession.updatedAt}`}
              className="preview-frame"
              title="Preview visual"
              src={frameUrl}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
      ) : showStaticHtml ? (
        <iframe
          key={htmlDoc}
          className="preview-frame"
          title="Preview HTML"
          srcDoc={htmlDoc}
          sandbox="allow-scripts"
          style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
        />
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

function withRefreshToken(previewUrl: string, refreshToken: string): string {
  try {
    const url = new URL(previewUrl);
    url.searchParams.set("horus_refresh", refreshToken);
    return url.toString();
  } catch {
    return previewUrl;
  }
}
