import type { FrontendProject, PreviewSession } from "@u-build/shared";

export interface BrowserPreviewStartResult {
  previewUrl: string | null;
  processId: number | null;
  evidence?: Record<string, unknown>;
}

export interface BrowserPreviewAdapter {
  start(
    project: FrontendProject,
    session: PreviewSession
  ): Promise<BrowserPreviewStartResult>;
  stop(session: PreviewSession): Promise<void>;
  reload(session: PreviewSession): Promise<void>;
}

export class BrowserPreviewStartError extends Error {
  constructor(
    message: string,
    readonly evidence: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "BrowserPreviewStartError";
  }
}

export class NoopBrowserPreviewAdapter implements BrowserPreviewAdapter {
  async start(project: FrontendProject): Promise<BrowserPreviewStartResult> {
    return {
      previewUrl: project.previewUrl,
      processId: null,
    };
  }

  async stop(): Promise<void> {}

  async reload(): Promise<void> {}
}
