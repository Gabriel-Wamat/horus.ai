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
import type { PgPool } from "../database/pool.js";
import { json, toIso } from "./postgresUtils.js";
import { AgentExecutionLedgerNotFoundError } from "./FileAgentExecutionLedgerRepository.js";
import type {
  AgentExecutionLedgerRepository,
  CreateAgentExecutionTurnInput,
  CreateAgentWorkflowAttemptInput,
  CreateAgentWorkflowRunInput,
  EnqueueAgentExecutionOutboxInput,
} from "./contracts.js";
import { outboxProcessingStaleBeforeIso } from "./OutboxLeasePolicy.js";

interface TurnRow {
  id: string;
  chat_session_id: string;
  source_message_id: string | null;
  idempotency_key: string;
  intent: unknown;
  status: AgentExecutionTurn["status"];
  created_at: Date;
  updated_at: Date;
}

interface RunRow {
  id: string;
  turn_id: string | null;
  thread_id: string;
  workflow_mode: AgentWorkflowRun["workflowMode"];
  status: AgentWorkflowRun["status"];
  lease_owner: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
  last_error: string | null;
  created_at: Date;
}

interface AttemptRow {
  id: string;
  run_id: string;
  attempt_number: number;
  started_at: Date;
  completed_at: Date | null;
  status: AgentWorkflowAttempt["status"];
  failure_class: string | null;
}

interface OutboxRow {
  id: string;
  event_type: string;
  dedupe_key: string;
  payload: unknown;
  status: AgentExecutionOutboxEvent["status"];
  available_at: Date;
  locked_at: Date | null;
  processed_at: Date | null;
  attempt_count: number;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresAgentExecutionLedgerRepository
  implements AgentExecutionLedgerRepository
{
  constructor(private readonly pool: PgPool) {}

  async createTurn(
    input: CreateAgentExecutionTurnInput
  ): Promise<AgentExecutionTurn> {
    const now = input.createdAt ?? new Date().toISOString();
    const result = await this.pool.query<TurnRow>(
      `
      INSERT INTO agent_execution_turns (
        id, chat_session_id, source_message_id, idempotency_key, intent,
        status, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$7)
      ON CONFLICT (idempotency_key) DO UPDATE SET
        updated_at = agent_execution_turns.updated_at
      RETURNING *
      `,
      [
        input.id,
        input.chatSessionId,
        input.sourceMessageId ?? null,
        input.idempotencyKey,
        json(input.intent ?? {}),
        input.status ?? "accepted",
        now,
      ]
    );
    return turnFromRow(result.rows[0]!);
  }

  async updateTurnStatus(
    turnId: string,
    status: AgentExecutionTurn["status"]
  ): Promise<AgentExecutionTurn> {
    const result = await this.pool.query<TurnRow>(
      `
      UPDATE agent_execution_turns
      SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [turnId, status]
    );
    const row = result.rows[0];
    if (!row) throw new AgentExecutionLedgerNotFoundError("turn", turnId);
    return turnFromRow(row);
  }

  async createRun(input: CreateAgentWorkflowRunInput): Promise<AgentWorkflowRun> {
    const now = input.createdAt ?? new Date().toISOString();
    const result = await this.pool.query<RunRow>(
      `
      INSERT INTO agent_workflow_runs (
        id, turn_id, thread_id, workflow_mode, status, started_at,
        completed_at, updated_at, last_error, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,NULL,$7)
      ON CONFLICT (thread_id) DO UPDATE SET
        updated_at = agent_workflow_runs.updated_at
      RETURNING *
      `,
      [
        input.id,
        input.turnId ?? null,
        input.threadId,
        input.workflowMode,
        input.status ?? "running",
        input.startedAt ?? now,
        now,
      ]
    );
    return runFromRow(result.rows[0]!);
  }

  async getRunByThreadId(threadId: string): Promise<AgentWorkflowRun | null> {
    const result = await this.pool.query<RunRow>(
      "SELECT * FROM agent_workflow_runs WHERE thread_id = $1",
      [threadId]
    );
    return result.rows[0] ? runFromRow(result.rows[0]) : null;
  }

  async getRunByTurnId(turnId: string): Promise<AgentWorkflowRun | null> {
    const result = await this.pool.query<RunRow>(
      "SELECT * FROM agent_workflow_runs WHERE turn_id = $1 ORDER BY created_at LIMIT 1",
      [turnId]
    );
    return result.rows[0] ? runFromRow(result.rows[0]) : null;
  }

  async listRuns(filter: {
    status?: AgentWorkflowRun["status"];
    limit?: number;
  } = {}): Promise<AgentWorkflowRun[]> {
    const limit = normalizeLimit(filter.limit, 50, 200);
    const result = filter.status
      ? await this.pool.query<RunRow>(
          "SELECT * FROM agent_workflow_runs WHERE status = $1 ORDER BY updated_at DESC LIMIT $2",
          [filter.status, limit]
        )
      : await this.pool.query<RunRow>(
          "SELECT * FROM agent_workflow_runs ORDER BY updated_at DESC LIMIT $1",
          [limit]
        );
    return result.rows.map(runFromRow);
  }

  async listRecoverableRuns(): Promise<AgentWorkflowRun[]> {
    const result = await this.pool.query<RunRow>(
      "SELECT * FROM agent_workflow_runs WHERE status = 'running' ORDER BY updated_at"
    );
    return result.rows.map(runFromRow);
  }

  async updateRunStatus(input: {
    runId: string;
    status: AgentWorkflowRun["status"];
    completedAt?: string | null;
    lastError?: string | null;
    leaseOwner?: string | null;
  }): Promise<AgentWorkflowRun> {
    const result = await this.pool.query<RunRow>(
      `
      UPDATE agent_workflow_runs
      SET status = $2,
          completed_at = COALESCE($3, completed_at),
          last_error = $4,
          lease_owner = $5,
          updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        input.runId,
        input.status,
        input.completedAt ?? null,
        input.lastError ?? null,
        input.leaseOwner ?? null,
      ]
    );
    const row = result.rows[0];
    if (!row) throw new AgentExecutionLedgerNotFoundError("run", input.runId);
    return runFromRow(row);
  }

  async createAttempt(
    input: CreateAgentWorkflowAttemptInput
  ): Promise<AgentWorkflowAttempt> {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const result = await this.pool.query<AttemptRow>(
      `
      INSERT INTO agent_workflow_attempts (
        id, run_id, attempt_number, started_at, completed_at, status, failure_class
      )
      VALUES ($1,$2,$3,$4,NULL,$5,$6)
      ON CONFLICT (run_id, attempt_number) DO UPDATE SET
        status = agent_workflow_attempts.status
      RETURNING *
      `,
      [
        input.id,
        input.runId,
        input.attemptNumber,
        startedAt,
        input.status ?? "running",
        input.failureClass ?? null,
      ]
    );
    return attemptFromRow(result.rows[0]!);
  }

  async updateAttemptStatus(input: {
    attemptId: string;
    status: AgentWorkflowAttempt["status"];
    completedAt?: string | null;
    failureClass?: string | null;
  }): Promise<AgentWorkflowAttempt> {
    const result = await this.pool.query<AttemptRow>(
      `
      UPDATE agent_workflow_attempts
      SET status = $2,
          completed_at = COALESCE($3, completed_at),
          failure_class = $4
      WHERE id = $1
      RETURNING *
      `,
      [
        input.attemptId,
        input.status,
        input.completedAt ?? null,
        input.failureClass ?? null,
      ]
    );
    const row = result.rows[0];
    if (!row) {
      throw new AgentExecutionLedgerNotFoundError("attempt", input.attemptId);
    }
    return attemptFromRow(row);
  }

  async enqueueOutbox(
    input: EnqueueAgentExecutionOutboxInput
  ): Promise<AgentExecutionOutboxEvent> {
    const now = input.createdAt ?? new Date().toISOString();
    const result = await this.pool.query<OutboxRow>(
      `
      INSERT INTO agent_execution_outbox (
        id, event_type, dedupe_key, payload, status, available_at, locked_at,
        processed_at, attempt_count, last_error, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4::jsonb,'pending',$5,NULL,NULL,0,NULL,$6,$6)
      ON CONFLICT (dedupe_key) DO UPDATE SET
        updated_at = agent_execution_outbox.updated_at
      RETURNING *
      `,
      [
        input.id,
        input.eventType,
        input.dedupeKey,
        json(input.payload),
        input.availableAt ?? now,
        now,
      ]
    );
    return outboxFromRow(result.rows[0]!);
  }

  async claimNextOutbox(input: {
    ownerId: string;
    now?: string;
  }): Promise<AgentExecutionOutboxEvent | null> {
    const now = input.now ?? new Date().toISOString();
    const staleBefore = outboxProcessingStaleBeforeIso(now);
    const result = await this.pool.query<OutboxRow>(
      `
      UPDATE agent_execution_outbox
      SET status = 'processing',
          locked_at = $1,
          attempt_count = attempt_count + 1,
          updated_at = $1
      WHERE id = (
        SELECT id
        FROM agent_execution_outbox
        WHERE available_at <= $1
          AND (
            status IN ('pending', 'failed')
            OR (
              status = 'processing'
              AND (locked_at IS NULL OR locked_at <= $2)
            )
          )
        ORDER BY available_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *
      `,
      [now, staleBefore]
    );
    return result.rows[0] ? outboxFromRow(result.rows[0]) : null;
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
    const result = filter.status
      ? await this.pool.query<OutboxRow>(
          "SELECT * FROM agent_execution_outbox WHERE status = $1 ORDER BY updated_at DESC LIMIT $2",
          [filter.status, limit]
        )
      : await this.pool.query<OutboxRow>(
          "SELECT * FROM agent_execution_outbox ORDER BY updated_at DESC LIMIT $1",
          [limit]
        );
    return result.rows.map(outboxFromRow);
  }

  private async updateOutbox(
    outboxId: string,
    patch: {
      status: AgentExecutionOutboxEvent["status"];
      processedAt?: string | null;
      lastError?: string | null;
    }
  ): Promise<AgentExecutionOutboxEvent> {
    const result = await this.pool.query<OutboxRow>(
      `
      UPDATE agent_execution_outbox
      SET status = $2,
          processed_at = $3,
          last_error = $4,
          updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [outboxId, patch.status, patch.processedAt ?? null, patch.lastError ?? null]
    );
    const row = result.rows[0];
    if (!row) throw new AgentExecutionLedgerNotFoundError("outbox", outboxId);
    return outboxFromRow(row);
  }
}

function turnFromRow(row: TurnRow): AgentExecutionTurn {
  return AgentExecutionTurnSchema.parse({
    id: row.id,
    chatSessionId: row.chat_session_id,
    sourceMessageId: row.source_message_id,
    idempotencyKey: row.idempotency_key,
    intent: row.intent,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function runFromRow(row: RunRow): AgentWorkflowRun {
  return AgentWorkflowRunSchema.parse({
    id: row.id,
    turnId: row.turn_id,
    threadId: row.thread_id,
    workflowMode: row.workflow_mode,
    status: row.status,
    leaseOwner: row.lease_owner,
    startedAt: row.started_at ? toIso(row.started_at) : null,
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    updatedAt: toIso(row.updated_at),
    lastError: row.last_error,
    createdAt: toIso(row.created_at),
  });
}

function attemptFromRow(row: AttemptRow): AgentWorkflowAttempt {
  return AgentWorkflowAttemptSchema.parse({
    id: row.id,
    runId: row.run_id,
    attemptNumber: row.attempt_number,
    startedAt: toIso(row.started_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    status: row.status,
    failureClass: row.failure_class,
  });
}

function outboxFromRow(row: OutboxRow): AgentExecutionOutboxEvent {
  return AgentExecutionOutboxEventSchema.parse({
    id: row.id,
    eventType: row.event_type,
    dedupeKey: row.dedupe_key,
    payload: row.payload,
    status: row.status,
    availableAt: toIso(row.available_at),
    lockedAt: row.locked_at ? toIso(row.locked_at) : null,
    processedAt: row.processed_at ? toIso(row.processed_at) : null,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function normalizeLimit(
  value: number | undefined,
  fallback: number,
  max: number
): number {
  if (!Number.isInteger(value) || value === undefined || value <= 0) return fallback;
  return Math.min(value, max);
}
