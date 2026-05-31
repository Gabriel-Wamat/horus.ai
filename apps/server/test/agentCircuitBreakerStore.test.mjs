import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileAgentCircuitBreakerStore } from "../dist/infrastructure/repositories/FileAgentCircuitBreakerStore.js";

test("FileAgentCircuitBreakerStore persists circuit state across instances", async () => {
  const dir = await mkdtemp(join(tmpdir(), "horus-circuit-breaker-"));
  const first = new FileAgentCircuitBreakerStore(dir);

  await first.set("front_agent", {
    failureCount: 3,
    openedAtMs: 1_234,
  });

  const second = new FileAgentCircuitBreakerStore(dir);
  assert.deepEqual(await second.get("front_agent"), {
    failureCount: 3,
    openedAtMs: 1_234,
  });

  await second.clear("front_agent");
  assert.equal(await first.get("front_agent"), undefined);
});
