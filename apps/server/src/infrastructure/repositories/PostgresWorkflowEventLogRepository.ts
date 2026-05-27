import {
  HorusRunEventSnapshotSchema,
  type HorusRunEventSnapshot,
  type WorkflowEvent,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import { json } from "./postgresUtils.js";
import type { WorkflowEventLogRepository } from "./contracts.js";
import { mapWorkflowEvent } from "../../application/services/horusRunFlowMapping.js";

interface WorkflowEventRow {
  snapshot: unknown;
}

export class PostgresWorkflowEventLogRepository
  implements WorkflowEventLogRepository
{
  constructor(private readonly pool: PgPool) {}

  async append(event: WorkflowEvent): Promise<HorusRunEventSnapshot> {
    const result = await this.pool.query<{ sequence: number }>(
      `
      INSERT INTO workflow_event_counters (thread_id, next_sequence)
      VALUES ($1, 2)
      ON CONFLICT (thread_id) DO UPDATE SET
        next_sequence = workflow_event_counters.next_sequence + 1
      RETURNING next_sequence - 1 AS sequence
      `,
      [event.threadId]
    );
    const sequence = result.rows[0]?.sequence ?? 1;
    const snapshot = HorusRunEventSnapshotSchema.parse(
      mapWorkflowEvent(event, sequence)
    );
    await this.pool.query(
      `
      INSERT INTO workflow_events (
        id,
        thread_id,
        sequence,
        type,
        node_id,
        agent_name,
        user_story_id,
        title,
        summary,
        timestamp,
        event,
        snapshot
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        event = EXCLUDED.event,
        snapshot = EXCLUDED.snapshot
      `,
      [
        snapshot.id,
        snapshot.threadId,
        snapshot.sequence,
        snapshot.type,
        snapshot.nodeId ?? null,
        snapshot.agentName ?? null,
        snapshot.userStoryId ?? null,
        snapshot.title,
        snapshot.summary ?? null,
        snapshot.timestamp,
        json(event),
        json(snapshot),
      ]
    );
    return snapshot;
  }

  async list(threadId: string): Promise<HorusRunEventSnapshot[]> {
    const result = await this.pool.query<WorkflowEventRow>(
      "SELECT snapshot FROM workflow_events WHERE thread_id = $1 ORDER BY sequence",
      [threadId]
    );
    return result.rows.map((row) => HorusRunEventSnapshotSchema.parse(row.snapshot));
  }

  async listAfter(
    threadId: string,
    sequence: number
  ): Promise<HorusRunEventSnapshot[]> {
    const result = await this.pool.query<WorkflowEventRow>(
      "SELECT snapshot FROM workflow_events WHERE thread_id = $1 AND sequence > $2 ORDER BY sequence",
      [threadId, sequence]
    );
    return result.rows.map((row) => HorusRunEventSnapshotSchema.parse(row.snapshot));
  }
}
