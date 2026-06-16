import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { ExternalLink, Maximize2, X } from "lucide-react";
import type { PreviewSession } from "@u-build/shared";
import { PreviewIcon } from "./PreviewIcons.js";

export function PreviewCanvas({
  session,
  refreshToken,
}: {
  readonly session: PreviewSession | null;
  readonly refreshToken?: string | null;
}): JSX.Element {
  const status = session?.status ?? "waiting";
  const previewUrl =
    session?.status === "running" ? session.previewUrl ?? undefined : undefined;
  const frameUrl =
    previewUrl && refreshToken ? withRefreshToken(previewUrl, refreshToken) : previewUrl;
  const frameSession = previewUrl && session ? session : null;
  const frameKey = useMemo(
    () =>
      frameSession
        ? `${frameSession.id}:${refreshToken ?? frameSession.updatedAt}`
        : "preview-empty",
    [frameSession, refreshToken],
  );
  const hasLiveFrame = Boolean(frameSession && frameUrl);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const openFullscreen = useCallback(() => {
    if (!hasLiveFrame) {
      return;
    }
    setIsFullscreen(true);
  }, [hasLiveFrame]);

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  const openLocalPreview = useCallback(() => {
    if (!frameUrl) {
      return;
    }
    window.open(frameUrl, "_blank", "noopener,noreferrer");
  }, [frameUrl]);

  useEffect(() => {
    if (!hasLiveFrame) {
      setIsFullscreen(false);
    }
  }, [hasLiveFrame]);

  useEffect(() => {
    if (!isFullscreen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeFullscreen, isFullscreen]);

  return (
    <section className="preview-canvas" aria-label="Canvas do preview">
      <div className="preview-frame-controls" aria-label="Ações do preview">
        <button
          type="button"
          className="preview-frame-control-button"
          onClick={openFullscreen}
          disabled={!hasLiveFrame}
          aria-label="Abrir preview em tela cheia"
          title={
            hasLiveFrame
              ? "Abrir preview em tela cheia"
              : "Inicie o preview para abrir em tela cheia"
          }
        >
          <Maximize2 aria-hidden="true" />
        </button>
        <button
          type="button"
          className="preview-frame-control-button"
          onClick={openLocalPreview}
          disabled={!hasLiveFrame}
          aria-label="Abrir preview em nova aba"
          title={
            hasLiveFrame
              ? "Abrir preview em nova aba"
              : "Inicie o preview para abrir em nova aba"
          }
        >
          <ExternalLink aria-hidden="true" />
        </button>
      </div>
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
              key={frameKey}
              className="preview-frame"
              title="Preview visual"
              src={frameUrl}
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
      {isFullscreen && frameSession && frameUrl ? (
        <div
          className={`preview-fullscreen-backdrop device-${frameSession.device.name}`}
          role="dialog"
          aria-modal="true"
          aria-label="Preview em tela cheia"
        >
          <div className="preview-fullscreen-toolbar">
            <strong>Preview em tela cheia</strong>
            <div className="preview-fullscreen-actions">
              <button
                type="button"
                className="preview-frame-control-button"
                onClick={openLocalPreview}
                aria-label="Abrir preview em nova aba"
                title="Abrir preview em nova aba"
              >
                <ExternalLink aria-hidden="true" />
              </button>
              <button
                type="button"
                className="preview-frame-control-button"
                onClick={closeFullscreen}
                aria-label="Fechar tela cheia"
                title="Fechar tela cheia"
              >
                <X aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="preview-fullscreen-frame-wrap">
            <iframe
              key={`fullscreen:${frameKey}`}
              className="preview-fullscreen-frame"
              title="Preview visual em tela cheia"
              src={frameUrl}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        </div>
      ) : null}
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
