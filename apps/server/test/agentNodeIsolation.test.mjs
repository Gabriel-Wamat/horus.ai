import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentCircuitOpenError,
  AgentNodeIsolationController,
  AgentNodeTimeoutError,
} from "../dist/infrastructure/langgraph/AgentNodeIsolation.js";
import {
  getCurrentAgentRuntimeIsolationContext,
} from "../dist/infrastructure/langgraph/AgentRuntimeIsolationContext.js";

const fastPolicy = {
  timeoutMs: 50,
  maxAttempts: 2,
  retryBackoffMs: 0,
  circuitBreaker: {
    failureThreshold: 2,
    cooldownMs: 1_000,
  },
};

test("AgentNodeIsolationController retries transient node failures within policy", async () => {
  const controller = new AgentNodeIsolationController({
    policyOverrides: { front_agent: fastPolicy },
    sleep: async () => {},
  });
  let calls = 0;
  const isolated = controller.wrap("front_agent", async () => {
    calls += 1;
    if (calls === 1) throw new Error("transient");
    return { status: "running" };
  });

  const result = await isolated({});

  assert.equal(calls, 2);
  assert.equal(result.status, "running");
});

test("AgentNodeIsolationController exposes runtime context to isolated nodes", async () => {
  const controller = new AgentNodeIsolationController({
    policyOverrides: { spec_agent: fastPolicy },
    sleep: async () => {},
  });
  const attempts = [];
  const isolated = controller.wrap("spec_agent", async () => {
    const context = getCurrentAgentRuntimeIsolationContext();
    attempts.push(context?.attempt);
    assert.equal(context?.agentProfileId, "spec_agent");
    assert.equal(context?.signal.aborted, false);
    if (context?.attempt === 1) throw new Error("first attempt");
    return { status: "running" };
  });

  const result = await isolated({});

  assert.equal(result.status, "running");
  assert.deepEqual(attempts, [1, 2]);
  assert.equal(getCurrentAgentRuntimeIsolationContext(), undefined);
});

test("AgentNodeIsolationController fails with a named timeout error", async () => {
  const controller = new AgentNodeIsolationController({
    policyOverrides: { qa_agent: { ...fastPolicy, maxAttempts: 1 } },
  });
  let aborted = false;
  const isolated = controller.wrap(
    "qa_agent",
    () =>
      new Promise(() => {
        const signal = getCurrentAgentRuntimeIsolationContext()?.signal;
        signal?.addEventListener("abort", () => {
          aborted = true;
        });
      })
  );

  await assert.rejects(
    () => isolated({}),
    (err) =>
      err instanceof AgentNodeTimeoutError &&
      err.agentProfileId === "qa_agent"
  );
  assert.equal(aborted, true);
});

test("AgentNodeIsolationController opens circuit after repeated final failures", async () => {
  let now = 10_000;
  const controller = new AgentNodeIsolationController({
    policyOverrides: {
      curator_agent: {
        ...fastPolicy,
        maxAttempts: 1,
        circuitBreaker: { failureThreshold: 2, cooldownMs: 5_000 },
      },
    },
    nowMs: () => now,
    sleep: async () => {},
  });
  const isolated = controller.wrap("curator_agent", async () => {
    throw new Error("hard failure");
  });

  await assert.rejects(() => isolated({}), /hard failure/);
  await assert.rejects(() => isolated({}), /hard failure/);
  await assert.rejects(
    () => isolated({}),
    (err) =>
      err instanceof AgentCircuitOpenError &&
      err.agentProfileId === "curator_agent"
  );

  now += 5_001;
  await assert.rejects(() => isolated({}), /hard failure/);
});

test("AgentNodeIsolationController uses the injected circuit breaker store", async () => {
  const writes = [];
  const store = {
    state: undefined,
    async get() {
      return this.state;
    },
    async set(_agentProfileId, state) {
      this.state = state;
      writes.push(state);
    },
    async clear() {
      this.state = undefined;
    },
  };
  const controller = new AgentNodeIsolationController({
    circuitBreakerStore: store,
    policyOverrides: {
      odin_agent: {
        ...fastPolicy,
        maxAttempts: 1,
        circuitBreaker: { failureThreshold: 1, cooldownMs: 1_000 },
      },
    },
  });
  const isolated = controller.wrap("odin_agent", async () => {
    throw new Error("boom");
  });

  await assert.rejects(() => isolated({}), /boom/);

  assert.equal(writes.length, 1);
  assert.equal(writes[0].failureCount, 1);
  assert.equal(typeof writes[0].openedAtMs, "number");
  await assert.rejects(
    () => isolated({}),
    (err) =>
      err instanceof AgentCircuitOpenError &&
      err.agentProfileId === "odin_agent"
  );
});
