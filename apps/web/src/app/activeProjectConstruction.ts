import type { FrontendProject, PreviewSession } from "@u-build/shared";

export interface ActiveProjectConstruction {
  readonly projectWorkspaceId: string;
  readonly constructionRunId: string;
  readonly workflowThreadId: string | null;
  readonly frontendProjectId: string | null;
  readonly frontendProject: FrontendProject | null;
  readonly previewSessionId: string | null;
  readonly previewSession: PreviewSession | null;
  readonly projectName: string;
  readonly startedAt: string | null;
}
