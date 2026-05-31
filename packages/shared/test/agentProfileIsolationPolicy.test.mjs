import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentProfileSchema,
  AgentRuntimeIsolationPolicySchema,
} from "../dist/index.js";

test("AgentProfileSchema carries runtime isolation policy defaults", () => {
  const profile = AgentProfileSchema.parse({
    id: "front_agent",
    agentName: "front",
    label: "Front Agent",
    purpose: "Produce auditable frontend changes.",
    allowedTools: ["read_file"],
    forbiddenTools: ["git_push"],
    inputContract: "Spec",
    outputContract: "CodeChangeSet",
  });

  assert.equal(profile.isolationPolicy.timeoutMs, 120_000);
  assert.equal(profile.isolationPolicy.maxAttempts, 1);
  assert.equal(profile.isolationPolicy.circuitBreaker.failureThreshold, 3);
});

test("AgentRuntimeIsolationPolicySchema accepts explicit bounded policies", () => {
  const policy = AgentRuntimeIsolationPolicySchema.parse({
    timeoutMs: 5_000,
    maxAttempts: 2,
    retryBackoffMs: 25,
    circuitBreaker: {
      failureThreshold: 2,
      cooldownMs: 1_000,
    },
  });

  assert.equal(policy.timeoutMs, 5_000);
  assert.equal(policy.maxAttempts, 2);
  assert.equal(policy.retryBackoffMs, 25);
  assert.equal(policy.circuitBreaker.cooldownMs, 1_000);
});
