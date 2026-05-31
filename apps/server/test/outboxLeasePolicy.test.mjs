import assert from "node:assert/strict";
import test from "node:test";
import {
  isOutboxEventClaimable,
  outboxProcessingStaleBeforeIso,
  resolveOutboxProcessingLeaseTtlMs,
} from "../dist/infrastructure/repositories/OutboxLeasePolicy.js";

function event(status, lockedAt = null) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    eventType: "workflow.start",
    dedupeKey: "workflow.start:test",
    payload: {},
    status,
    availableAt: "2026-05-28T15:00:00.000Z",
    lockedAt,
    processedAt: null,
    attemptCount: 1,
    lastError: null,
    createdAt: "2026-05-28T15:00:00.000Z",
    updatedAt: "2026-05-28T15:00:00.000Z",
  };
}

test("outbox lease policy keeps processing events isolated until stale", () => {
  const now = "2026-05-28T15:02:00.000Z";

  assert.equal(isOutboxEventClaimable(event("pending"), now), true);
  assert.equal(isOutboxEventClaimable(event("failed"), now), true);
  assert.equal(
    isOutboxEventClaimable(
      event("processing", "2026-05-28T15:01:30.000Z"),
      now
    ),
    false
  );
  assert.equal(
    isOutboxEventClaimable(
      event("processing", "2026-05-28T14:59:59.000Z"),
      now
    ),
    true
  );
  assert.equal(isOutboxEventClaimable(event("dead_letter"), now), false);
});

test("outbox lease policy exposes deterministic stale cutoff", () => {
  assert.equal(resolveOutboxProcessingLeaseTtlMs({}), 120_000);
  assert.equal(
    outboxProcessingStaleBeforeIso("2026-05-28T15:02:00.000Z", 30_000),
    "2026-05-28T15:01:30.000Z"
  );
});
