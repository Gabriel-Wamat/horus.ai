import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  AgentExecutionOutboxEventSchema,
  AgentExecutionTurnSchema,
  AgentWorkflowAttemptSchema,
  AgentWorkflowRunSchema,
  type AgentExecutionOutboxEvent,
  type AgentExecutionTurn,
  type AgentWorkflowAttempt,
  type AgentWorkflowRun,
} from "@u-build/shared";
import {
  readJsonFileRaw,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";
import type {
  AgentExecutionLedgerRepository,
  CreateAgentExecutionTurnInput,
  CreateAgentWorkflowAttemptInput,
  CreateAgentWorkflowRunInput,
  EnqueueAgentExecutionOutboxInput,
} from "./contracts.js";
import { isOutboxEventClaimable } from "./OutboxLeasePolicy.js";

const LEDGER_FILE = "agent-execution-ledger.json";

interface LedgerDocument {
  turns: AgentExecutionTurn[];
  runs: AgentWorkflowRun[];
  attempts: AgentWorkflowAttempt[];
  outbox: AgentExecutionOutboxEvent[];
}

const emptyLedger = (): LedgerDocument => ({
  turns: [],
  runs: [],
  attempts: [],
  outbox: [],
});

export class AgentExecutionLedgerNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found in agent execution ledger: ${id}`);
    this.name = "AgentExecutionLedgerNotFoundError";
  }
}

export class FileAgentExecutionLedgerRepository
  implements AgentExecutionLedgerRepository
{
  constructor(private readonly baseDir = "./data/agent-execution-ledger") {}

  async createTurn(
    input: CreateAgentExecutionTurnInput
  ): Promise<AgentExecutionTurn> {
    const now = input.createdAt ?? new Date().toISOString();
    return this.update((ledger) => {
      const existing = ledger.turns.find(
        (turn) => turn.idempotencyKey === input.idempotencyKey
      );
      if (existing) return { ledger, value: existing };
      const turn = AgentExecutionTurnSchema.parse({
        id: input.id,
        chatSessionId: input.chatSessionId,
        sourceMessageId: input.sourceMessageId ?? null,
        idempotencyKey: input.idempotencyKey,
        intent: input.intent ?? {},
        status: input.status ?? "accepted",
        createdAt: now,
        updatedAt: now,
      });
      return { ledger: { ...ledger, turns: [...ledger.turns, turn] }, value: turn };
    });
  }

  async updateTurnStatus(
    turnId: string,
    status: AgentExecutionTurn["status"]
  ): Promise<AgentExecutionTurn> {
    return this.update((ledger) => {
      const index = ledger.turns.findIndex((turn) => turn.id === turnId);
      if (index < 0) throw new AgentExecutionLedgerNotFoundError("turn", turnId);
      const turn = AgentExecutionTurnSchema.parse({
        ...ledger.turns[index],
        status,
        updatedAt: new Date().toISOString(),
      });
      const turns = ledger.turns.slice();
      turns[index] = turn;
      return { ledger: { ...ledger, turns }, value: turn };
    });
  }

  async createRun(input: CreateAgentWorkflowRunInput): Promise<AgentWorkflowRun> {
    const now = input.createdAt ?? new Date().toISOString();
    return this.update((ledger) => {
      const existingByThread = ledger.runs.find(
        (run) => run.threadId === input.threadId
      );
      if (existingByThread) return { ledger, value: existingByThread };

      const existingByTurn = input.turnId
        ? ledger.runs.find((run) => run.turnId === input.turnId)
        : undefined;
      if (existingByTurn) return { ledger, value: existingByTurn };

      const run = AgentWorkflowRunSchema.parse({
        id: input.id,
        turnId: input.turnId ?? null,
        threadId: input.threadId,
        workflowMode: input.workflowMode,
        status: input.status ?? "running",
        leaseOwner: null,
        startedAt: input.startedAt ?? now,
        completedAt: null,
        updatedAt: now,
        lastError: null,
        createdAt: now,
      });
      return { ledger: { ...ledger, runs: [...ledger.runs, run] }, value: run };
    });
  }

  async getRunByThreadId(threadId: string): Promise<AgentWorkflowRun | null> {
    return (await this.read()).runs.find((run) => run.threadId === threadId) ?? null;
  }

  async getRunByTurnId(turnId: string): Promise<AgentWorkflowRun | null> {
    return (await this.read()).runs.find((run) => run.turnId === turnId) ?? null;
  }

  async listRuns(filter: {
    status?: AgentWorkflowRun["status"];
    limit?: number;
  } = {}): Promise<AgentWorkflowRun[]> {
    const limit = normalizeLimit(filter.limit, 50, 200);
    return (await this.read()).runs
      .filter((run) => !filter.status || run.status === filter.status)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }

  async listRecoverableRuns(): Promise<AgentWorkflowRun[]> {
    return (await this.read()).runs.filter((run) => run.status === "running");
  }

  async updateRunStatus(input: {
    runId: string;
    status: AgentWorkflowRun["status"];
    completedAt?: string | null;
    lastError?: string | null;
    leaseOwner?: string | null;
  }): Promise<AgentWorkflowRun> {
    return this.update((ledger) => {
      const index = ledger.runs.findIndex((run) => run.id === input.runId);
      if (index < 0) throw new AgentExecutionLedgerNotFoundError("run", input.runId);
      const now = new Date().toISOString();
      const run = AgentWorkflowRunSchema.parse({
        ...ledger.runs[index],
        status: input.status,
        completedAt:
          input.completedAt === undefined
            ? ledger.runs[index]!.completedAt
            : input.completedAt,
        lastError:
          input.lastError === undefined
            ? ledger.runs[index]!.lastError
            : input.lastError,
        leaseOwner:
          input.leaseOwner === undefined
            ? ledger.runs[index]!.leaseOwner
            : input.leaseOwner,
        updatedAt: now,
      });
      const runs = ledger.runs.slice();
      runs[index] = run;
      return { ledger: { ...ledger, runs }, value: run };
    });
  }

  async createAttempt(
    input: CreateAgentWorkflowAttemptInput
  ): Promise<AgentWorkflowAttempt> {
    const startedAt = input.startedAt ?? new Date().toISOString();
    return this.update((ledger) => {
      const existing = ledger.attempts.find(
        (attempt) =>
          attempt.runId === input.runId &&
          attempt.attemptNumber === input.attemptNumber
      );
      if (existing) return { ledger, value: existing };
      const attempt = AgentWorkflowAttemptSchema.parse({
        id: input.id,
        runId: input.runId,
        attemptNumber: input.attemptNumber,
        startedAt,
        completedAt: null,
        status: input.status ?? "running",
        failureClass: input.failureClass ?? null,
      });
      return {
        ledger: { ...ledger, attempts: [...ledger.attempts, attempt] },
        value: attempt,
      };
    });
  }

  async updateAttemptStatus(input: {
    attemptId: string;
    status: AgentWorkflowAttempt["status"];
    completedAt?: string | null;
    failureClass?: string | null;
  }): Promise<AgentWorkflowAttempt> {
    return this.update((ledger) => {
      const index = ledger.attempts.findIndex(
        (attempt) => attempt.id === input.attemptId
      );
      if (index < 0) {
        throw new AgentExecutionLedgerNotFoundError("attempt", input.attemptId);
      }
      const attempt = AgentWorkflowAttemptSchema.parse({
        ...ledger.attempts[index],
        status: input.status,
        completedAt:
          input.completedAt === undefined
            ? ledger.attempts[index]!.completedAt
            : input.completedAt,
        failureClass:
          input.failureClass === undefined
            ? ledger.attempts[index]!.failureClass
            : input.failureClass,
      });
      const attempts = ledger.attempts.slice();
      attempts[index] = attempt;
      return { ledger: { ...ledger, attempts }, value: attempt };
    });
  }

  async enqueueOutbox(
    input: EnqueueAgentExecutionOutboxInput
  ): Promise<AgentExecutionOutboxEvent> {
    const now = input.createdAt ?? new Date().toISOString();
    return this.update((ledger) => {
      const existing = ledger.outbox.find(
        (event) => event.dedupeKey === input.dedupeKey
      );
      if (existing) return { ledger, value: existing };
      const event = AgentExecutionOutboxEventSchema.parse({
        id: input.id,
        eventType: input.eventType,
        dedupeKey: input.dedupeKey,
        payload: input.payload,
        status: "pending",
        availableAt: input.availableAt ?? now,
        lockedAt: null,
        processedAt: null,
        attemptCount: 0,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      });
      return {
        ledger: { ...ledger, outbox: [...ledger.outbox, event] },
        value: event,
      };
    });
  }

  async claimNextOutbox(input: {
    ownerId: string;
    now?: string;
  }): Promise<AgentExecutionOutboxEvent | null> {
    const now = input.now ?? new Date().toISOString();
    return this.update((ledger) => {
      const index = ledger.outbox
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => isOutboxEventClaimable(event, now))
        .sort((left, right) =>
          left.event.availableAt.localeCompare(right.event.availableAt)
        )[0]?.index;
      if (index === undefined) return { ledger, value: null };
      const event = AgentExecutionOutboxEventSchema.parse({
        ...ledger.outbox[index],
        status: "processing",
        lockedAt: now,
        attemptCount: ledger.outbox[index]!.attemptCount + 1,
        updatedAt: now,
      });
      const outbox = ledger.outbox.slice();
      outbox[index] = event;
      return { ledger: { ...ledger, outbox }, value: event };
    });
  }

  async completeOutbox(outboxId: string): Promise<AgentExecutionOutboxEvent> {
    return this.updateOutbox(outboxId, {
      status: "processed",
      processedAt: new Date().toISOString(),
      lastError: null,
    });
  }

  async failOutbox(input: {
    outboxId: string;
    status?: "failed" | "dead_letter";
    error: string;
  }): Promise<AgentExecutionOutboxEvent> {
    return this.updateOutbox(input.outboxId, {
      status: input.status ?? "failed",
      lastError: input.error,
    });
  }

  async listOutbox(filter: {
    status?: AgentExecutionOutboxEvent["status"];
    limit?: number;
  } = {}): Promise<AgentExecutionOutboxEvent[]> {
    const limit = normalizeLimit(filter.limit, 50, 200);
    return (await this.read()).outbox
      .filter((event) => !filter.status || event.status === filter.status)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }

  private async updateOutbox(
    outboxId: string,
    patch: Partial<AgentExecutionOutboxEvent>
  ): Promise<AgentExecutionOutboxEvent> {
    return this.update((ledger) => {
      const index = ledger.outbox.findIndex((event) => event.id === outboxId);
      if (index < 0) {
        throw new AgentExecutionLedgerNotFoundError("outbox", outboxId);
      }
      const event = AgentExecutionOutboxEventSchema.parse({
        ...ledger.outbox[index],
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      const outbox = ledger.outbox.slice();
      outbox[index] = event;
      return { ledger: { ...ledger, outbox }, value: event };
    });
  }

  private async read(): Promise<LedgerDocument> {
    await fs.mkdir(this.baseDir, { recursive: true });
    try {
      const raw = await readJsonFileRaw(join(this.baseDir, LEDGER_FILE));
      const document = raw && typeof raw === "object" ? raw as Partial<LedgerDocument> : {};
      return {
        turns: Array.isArray(document.turns)
          ? document.turns.map((turn) => AgentExecutionTurnSchema.parse(turn))
          : [],
        runs: Array.isArray(document.runs)
          ? document.runs.map((run) => AgentWorkflowRunSchema.parse(run))
          : [],
        attempts: Array.isArray(document.attempts)
          ? document.attempts.map((attempt) =>
              AgentWorkflowAttemptSchema.parse(attempt)
            )
          : [],
        outbox: Array.isArray(document.outbox)
          ? document.outbox.map((event) =>
              AgentExecutionOutboxEventSchema.parse(event)
            )
          : [],
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
      throw err;
    }
  }

  private async write(ledger: LedgerDocument): Promise<void> {
    await writeJsonFileAtomic(join(this.baseDir, LEDGER_FILE), ledger, {
      trailingNewline: true,
    });
  }

  private async update<T>(
    mutate: (ledger: LedgerDocument) => { ledger: LedgerDocument; value: T }
  ): Promise<T> {
    const current = await this.read();
    const { ledger, value } = mutate(current);
    await this.write(ledger);
    return value;
  }
}

function normalizeLimit(
  value: number | undefined,
  fallback: number,
  max: number
): number {
  if (!Number.isInteger(value) || value === undefined || value <= 0) return fallback;
  return Math.min(value, max);
}
