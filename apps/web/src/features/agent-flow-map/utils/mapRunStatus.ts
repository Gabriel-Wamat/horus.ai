import type { FlowNodeStatus } from "../types/flow.types.js";

const WAITING_STATUSES = new Set(["awaiting_human", "awaiting_approval", "waiting", "paused", "review"]);
const RUNNING_STATUSES = new Set(["running", "in_progress", "started", "queued"]);
const DONE_STATUSES = new Set(["completed", "completed_unverified", "done", "succeeded", "success"]);
const FAILED_STATUSES = new Set(["failed", "failed_validation", "blocked", "error", "cancelled", "canceled"]);
const SKIPPED_STATUSES = new Set(["skipped"]);

export function mapSnapshotStatus(status: string | undefined | null): FlowNodeStatus {
  const normalized = (status ?? "").toLowerCase();
  if (FAILED_STATUSES.has(normalized)) return "failed";
  if (SKIPPED_STATUSES.has(normalized)) return "skipped";
  if (WAITING_STATUSES.has(normalized)) return "waiting";
  if (DONE_STATUSES.has(normalized)) return "completed";
  if (RUNNING_STATUSES.has(normalized)) return "active";
  return "pending";
}

export function isWorkingRunStatus(status: string | undefined | null): boolean {
  const normalized = (status ?? "").toLowerCase();
  return RUNNING_STATUSES.has(normalized) || WAITING_STATUSES.has(normalized);
}

export function isFailedRunStatus(status: string | undefined | null): boolean {
  return FAILED_STATUSES.has((status ?? "").toLowerCase());
}

export function isCompletedRunStatus(status: string | undefined | null): boolean {
  return DONE_STATUSES.has((status ?? "").toLowerCase());
}
