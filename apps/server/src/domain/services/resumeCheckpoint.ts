export class WorkflowResumeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowResumeUnavailableError";
  }
}

export function hasPendingCheckpoint(
  snapshot: { next?: readonly unknown[] },
  nodeName: string
): boolean {
  return Array.isArray(snapshot.next) && snapshot.next.includes(nodeName);
}
