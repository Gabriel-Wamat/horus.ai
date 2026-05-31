import type { AgentExecutionOutboxEvent } from "@u-build/shared";

export const DEFAULT_OUTBOX_PROCESSING_LEASE_TTL_MS = 2 * 60 * 1000;

export function resolveOutboxProcessingLeaseTtlMs(
  env: NodeJS.ProcessEnv = process.env
): number {
  const configured = Number(env["HORUS_OUTBOX_PROCESSING_LEASE_TTL_MS"]);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_OUTBOX_PROCESSING_LEASE_TTL_MS;
}

export function outboxProcessingStaleBeforeIso(
  nowIso: string,
  leaseTtlMs = resolveOutboxProcessingLeaseTtlMs()
): string {
  return new Date(Date.parse(nowIso) - leaseTtlMs).toISOString();
}

export function isOutboxEventClaimable(
  event: AgentExecutionOutboxEvent,
  nowIso: string,
  leaseTtlMs = resolveOutboxProcessingLeaseTtlMs()
): boolean {
  if (event.availableAt > nowIso) return false;
  if (event.status === "pending" || event.status === "failed") return true;
  if (event.status !== "processing") return false;
  if (!event.lockedAt) return true;
  return event.lockedAt <= outboxProcessingStaleBeforeIso(nowIso, leaseTtlMs);
}
