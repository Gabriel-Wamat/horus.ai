import {
  CodingRuntimeEventSchema,
  CodingRuntimeSnapshotSchema,
  CodingTaskSchema,
  type CodingRuntimeEvent,
  type CodingRuntimeSnapshot,
  type CodingTask,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import { json } from "./postgresUtils.js";
import type {
  CodingTaskRepository,
  CreateCodingTaskRecordInput,
} from "../../application/ports/CodingRuntimePorts.js";

interface CodingTaskRow {
  id: string;
  idempotency_key: string | null;
  prompt: string;
  project_id: string;
  project_root_path: string | null;
  selected_paths: unknown;
  surface: CodingTask["surface"];
  route_reason: string;
  state: CodingTask["state"];
  workflow_thread_id: string | null;
  chat_session_id: string | null;
  source_message_id: string | null;
  user_story_id: string | null;
  artifacts: unknown;
  error: unknown | null;
  metadata: unknown;
  version: number;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
}

interface CodingTaskEventRow {
  id: string;
  task_id: string;
  sequence: number;
  type: CodingRuntimeEvent["type"];
  from_state: CodingTask["state"] | null;
  to_state: CodingTask["state"];
  message: string;
  artifact_refs: unknown;
  error: unknown | null;
  duration_ms: number | null;
  created_at: Date;
}

export class PostgresCodingTaskRepository implements CodingTaskRepository {
  constructor(private readonly pool: PgPool) {}

  async findByIdempotencyKey(
    idempotencyKey: string
  ): Promise<CodingRuntimeSnapshot | null> {
    const result = await this.pool.query<CodingTaskRow>(
      "SELECT * FROM coding_tasks WHERE idempotency_key = $1 LIMIT 1",
      [idempotencyKey]
    );
    const row = result.rows[0];
    return row ? this.getSnapshot(row.id) : null;
  }

  async getTask(taskId: string): Promise<CodingTask | null> {
    const result = await this.pool.query<CodingTaskRow>(
      "SELECT * FROM coding_tasks WHERE id = $1",
      [taskId]
    );
    const row = result.rows[0];
    return row ? taskFromRow(row) : null;
  }

  async getSnapshot(taskId: string): Promise<CodingRuntimeSnapshot | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;
    const events = await this.listEvents(taskId);
    return CodingRuntimeSnapshotSchema.parse({
      task,
      events,
      latestSequence: events.at(-1)?.sequence ?? 0,
    });
  }

  async listEvents(
    taskId: string,
    filter: { afterSequence?: number } = {}
  ): Promise<CodingRuntimeEvent[]> {
    const result = await this.pool.query<CodingTaskEventRow>(
      `
      SELECT * FROM coding_task_events
      WHERE task_id = $1 AND sequence > $2
      ORDER BY sequence
      `,
      [taskId, filter.afterSequence ?? 0]
    );
    return result.rows.map(eventFromRow);
  }

  async recordTransition(
    input: CreateCodingTaskRecordInput
  ): Promise<CodingRuntimeSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<CodingTaskRow>(
        "SELECT * FROM coding_tasks WHERE id = $1 FOR UPDATE",
        [input.task.id]
      );
      await upsertTask(client, input.task);
      const sequenceResult = await client.query<{ sequence: number }>(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM coding_task_events WHERE task_id = $1",
        [input.task.id]
      );
      const sequence = sequenceResult.rows[0]?.sequence ?? 1;
      const event = CodingRuntimeEventSchema.parse({
        ...input.event,
        sequence,
        createdAt: input.event.createdAt ?? new Date().toISOString(),
      });
      await client.query(
        `
        INSERT INTO coding_task_events (
          id,
          task_id,
          sequence,
          type,
          from_state,
          to_state,
          message,
          artifact_refs,
          error,
          duration_ms,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
        `,
        [
          event.id,
          event.taskId,
          event.sequence,
          event.type,
          event.fromState,
          event.toState,
          event.message,
          json(event.artifactRefs),
          event.error ? json(event.error) : null,
          event.durationMs ?? null,
          event.createdAt,
        ]
      );
      await client.query("COMMIT");
      const previousEvents = existing.rows[0]
        ? await this.listEvents(input.task.id)
        : [event];
      return CodingRuntimeSnapshotSchema.parse({
        task: input.task,
        events: previousEvents,
        latestSequence: previousEvents.at(-1)?.sequence ?? 0,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

async function upsertTask(
  client: { query: PgPool["query"] },
  task: CodingTask
): Promise<void> {
  await client.query(
    `
    INSERT INTO coding_tasks (
      id,
      idempotency_key,
      prompt,
      project_id,
      project_root_path,
      selected_paths,
      surface,
      route_reason,
      state,
      workflow_thread_id,
      chat_session_id,
      source_message_id,
      user_story_id,
      artifacts,
      error,
      metadata,
      version,
      created_at,
      updated_at,
      started_at,
      completed_at,
      cancelled_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13,
      $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19, $20, $21, $22
    )
    ON CONFLICT (id) DO UPDATE SET
      state = EXCLUDED.state,
      selected_paths = EXCLUDED.selected_paths,
      artifacts = EXCLUDED.artifacts,
      error = EXCLUDED.error,
      metadata = EXCLUDED.metadata,
      version = EXCLUDED.version,
      updated_at = EXCLUDED.updated_at,
      started_at = EXCLUDED.started_at,
      completed_at = EXCLUDED.completed_at,
      cancelled_at = EXCLUDED.cancelled_at
    `,
    [
      task.id,
      task.idempotencyKey ?? null,
      task.prompt,
      task.projectId,
      task.projectRootPath ?? null,
      json(task.selectedPaths),
      task.surface,
      task.routeReason,
      task.state,
      task.workflowThreadId ?? null,
      task.chatSessionId ?? null,
      task.sourceMessageId ?? null,
      task.userStoryId ?? null,
      json(task.artifacts),
      task.error ? json(task.error) : null,
      json(task.metadata),
      task.version,
      task.createdAt,
      task.updatedAt,
      task.startedAt,
      task.completedAt,
      task.cancelledAt,
    ]
  );
}

function taskFromRow(row: CodingTaskRow): CodingTask {
  return CodingTaskSchema.parse({
    id: row.id,
    idempotencyKey: row.idempotency_key ?? undefined,
    prompt: row.prompt,
    projectId: row.project_id,
    projectRootPath: row.project_root_path ?? undefined,
    selectedPaths: row.selected_paths,
    surface: row.surface,
    routeReason: row.route_reason,
    state: row.state,
    workflowThreadId: row.workflow_thread_id ?? undefined,
    chatSessionId: row.chat_session_id ?? undefined,
    sourceMessageId: row.source_message_id ?? undefined,
    userStoryId: row.user_story_id ?? undefined,
    artifacts: row.artifacts,
    error: row.error,
    metadata: row.metadata,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
  });
}

function eventFromRow(row: CodingTaskEventRow): CodingRuntimeEvent {
  return CodingRuntimeEventSchema.parse({
    id: row.id,
    taskId: row.task_id,
    sequence: row.sequence,
    type: row.type,
    fromState: row.from_state,
    toState: row.to_state,
    message: row.message,
    artifactRefs: row.artifact_refs,
    error: row.error,
    durationMs: row.duration_ms ?? undefined,
    createdAt: row.created_at.toISOString(),
  });
}
