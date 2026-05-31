import { setTimeout as delay } from "node:timers/promises";
import type {
  AgentProfileId,
  AgentRuntimeIsolationPolicy,
} from "@u-build/shared";
import { AgentRuntimeIsolationPolicySchema } from "@u-build/shared";
import {
  AgentProfileRegistry,
  defaultAgentProfileRegistry,
} from "../../application/services/AgentProfileRegistry.js";
import type { UBuildState, UBuildUpdate } from "./state.js";
import {
  runWithAgentRuntimeIsolationContext,
} from "./AgentRuntimeIsolationContext.js";
import {
  InMemoryAgentCircuitBreakerStore,
  type AgentCircuitBreakerStore,
} from "../../application/services/AgentCircuitBreakerStore.js";

type AgentNode = (state: UBuildState) => Promise<UBuildUpdate>;

export interface AgentNodeIsolationControllerOptions {
  profileRegistry?: AgentProfileRegistry;
  policyOverrides?: Partial<Record<AgentProfileId, AgentRuntimeIsolationPolicy>>;
  circuitBreakerStore?: AgentCircuitBreakerStore;
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class AgentNodeTimeoutError extends Error {
  constructor(
    readonly agentProfileId: AgentProfileId,
    readonly timeoutMs: number
  ) {
    super(`Agent node ${agentProfileId} timed out after ${timeoutMs}ms`);
    this.name = "AgentNodeTimeoutError";
  }
}

export class AgentCircuitOpenError extends Error {
  constructor(
    readonly agentProfileId: AgentProfileId,
    readonly cooldownMs: number
  ) {
    super(`Agent node ${agentProfileId} circuit breaker is open`);
    this.name = "AgentCircuitOpenError";
  }
}

export class AgentNodeIsolationController {
  private readonly profileRegistry: AgentProfileRegistry;
  private readonly policyOverrides: Partial<
    Record<AgentProfileId, AgentRuntimeIsolationPolicy>
  >;
  private readonly circuitBreakerStore: AgentCircuitBreakerStore;
  private readonly nowMs: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: AgentNodeIsolationControllerOptions = {}) {
    this.profileRegistry =
      options.profileRegistry ?? defaultAgentProfileRegistry;
    this.policyOverrides = options.policyOverrides ?? {};
    this.circuitBreakerStore =
      options.circuitBreakerStore ?? new InMemoryAgentCircuitBreakerStore();
    this.nowMs = options.nowMs ?? Date.now;
    this.sleep = options.sleep ?? delay;
  }

  wrap(agentProfileId: AgentProfileId, node: AgentNode): AgentNode {
    return async (state) => {
      const policy = this.resolvePolicy(agentProfileId);
      await this.assertCircuitAllowsExecution(agentProfileId, policy);

      let lastError: unknown;
      for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
        const abortController = new AbortController();
        try {
          const result = await this.runWithTimeout(
            agentProfileId,
            () =>
              runWithAgentRuntimeIsolationContext(
                {
                  agentProfileId,
                  attempt,
                  signal: abortController.signal,
                },
                () => node(state)
              ),
            abortController,
            policy.timeoutMs
          );
          await this.recordSuccess(agentProfileId);
          return result;
        } catch (err) {
          lastError = err;
          if (err instanceof AgentCircuitOpenError || attempt >= policy.maxAttempts) {
            break;
          }
          if (policy.retryBackoffMs > 0) {
            await this.sleep(policy.retryBackoffMs * attempt);
          }
        }
      }

      await this.recordFailure(agentProfileId, policy);
      throw lastError;
    };
  }

  private resolvePolicy(agentProfileId: AgentProfileId): AgentRuntimeIsolationPolicy {
    return AgentRuntimeIsolationPolicySchema.parse({
      ...this.profileRegistry.getProfile(agentProfileId).isolationPolicy,
      ...this.policyOverrides[agentProfileId],
    });
  }

  private async runWithTimeout<T>(
    agentProfileId: AgentProfileId,
    execute: () => Promise<T>,
    abortController: AbortController,
    timeoutMs: number
  ): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        abortController.abort(
          new AgentNodeTimeoutError(agentProfileId, timeoutMs)
        );
        reject(new AgentNodeTimeoutError(agentProfileId, timeoutMs));
      }, timeoutMs);
    });
    try {
      return await Promise.race([execute(), timeoutPromise]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async assertCircuitAllowsExecution(
    agentProfileId: AgentProfileId,
    policy: AgentRuntimeIsolationPolicy
  ): Promise<void> {
    const state = await this.circuitBreakerStore.get(agentProfileId);
    if (!state?.openedAtMs) return;
    const elapsedMs = this.nowMs() - state.openedAtMs;
    if (elapsedMs < policy.circuitBreaker.cooldownMs) {
      throw new AgentCircuitOpenError(
        agentProfileId,
        policy.circuitBreaker.cooldownMs
      );
    }
    await this.circuitBreakerStore.clear(agentProfileId);
  }

  private async recordSuccess(agentProfileId: AgentProfileId): Promise<void> {
    await this.circuitBreakerStore.clear(agentProfileId);
  }

  private async recordFailure(
    agentProfileId: AgentProfileId,
    policy: AgentRuntimeIsolationPolicy
  ): Promise<void> {
    const previous = await this.circuitBreakerStore.get(agentProfileId);
    const failureCount = (previous?.failureCount ?? 0) + 1;
    await this.circuitBreakerStore.set(agentProfileId, {
      failureCount,
      openedAtMs:
        failureCount >= policy.circuitBreaker.failureThreshold
          ? this.nowMs()
          : null,
    });
  }
}
