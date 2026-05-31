import type {
  CreatePreviewSessionInput,
  CreateVisualInstructionDraftInput,
  FrontendProject,
  PreviewEvent,
  PreviewSession,
  SetPreviewDeviceInput,
  VisualInstructionDraft,
} from "@u-build/shared";

export type PreviewProjectListVisibility = "visible" | "all" | "archived";

export interface PreviewActionResult {
  session: PreviewSession;
  event: PreviewEvent;
}

export interface VisualInstructionDraftResult {
  draft: VisualInstructionDraft;
  event: PreviewEvent;
}

export interface PreviewRuntimePort {
  listProjects(
    visibility?: PreviewProjectListVisibility
  ): Promise<FrontendProject[]>;
  createSession(input: CreatePreviewSessionInput): Promise<PreviewActionResult>;
  getSession(sessionId: string): Promise<PreviewSession>;
  listTimeline(sessionId: string): Promise<PreviewEvent[]>;
  startSession(sessionId: string): Promise<PreviewActionResult>;
  stopSession(sessionId: string): Promise<PreviewActionResult>;
  reloadSession(sessionId: string): Promise<PreviewActionResult>;
  setDevice(
    sessionId: string,
    input: SetPreviewDeviceInput
  ): Promise<PreviewActionResult>;
  createVisualInstructionDraft(
    input: CreateVisualInstructionDraftInput
  ): Promise<VisualInstructionDraftResult>;
}
