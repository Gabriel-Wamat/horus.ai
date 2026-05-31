import type { WorkflowProgressEvent } from "../../features/visual-preview/workflowProgress.js";

export function eventTitle(event: WorkflowProgressEvent): string {
  return (
    event.title ??
    event.agentName ??
    event.nodeId ??
    event.action ??
    event.type
  );
}

export function eventDetail(event: WorkflowProgressEvent): string {
  return (
    event.summary ??
    event.message ??
    event.errorMessage ??
    event.status ??
    event.type
  );
}
