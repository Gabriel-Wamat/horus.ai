import type { FrontendProject } from "@u-build/shared";

export interface ActiveProjectConstruction {
  readonly projectWorkspaceId: string;
  readonly constructionRunId: string;
  readonly workflowThreadId: string | null;
  readonly frontendProjectId: string | null;
  readonly frontendProject: FrontendProject | null;
  readonly projectName: string;
  readonly startedAt: string | null;
}
