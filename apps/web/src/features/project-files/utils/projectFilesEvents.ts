export const PROJECT_FILES_CHANGED_EVENT = "horus:project-files-changed" as const;

export interface ProjectFilesChangedDetail {
  readonly projectId: string;
  readonly paths?: readonly string[];
  readonly runId?: string | null;
  readonly workflowThreadId?: string;
  readonly source: "project-construction" | "preview-workflow" | "manual-save";
  readonly selectProject?: boolean;
  readonly timestamp: string;
}

export function emitProjectFilesChanged(detail: ProjectFilesChangedDetail): void {
  window.dispatchEvent(
    new CustomEvent<ProjectFilesChangedDetail>(PROJECT_FILES_CHANGED_EVENT, {
      detail,
    })
  );
}

export function isProjectFilesChangedEvent(
  event: Event
): event is CustomEvent<ProjectFilesChangedDetail> {
  return event.type === PROJECT_FILES_CHANGED_EVENT && "detail" in event;
}
