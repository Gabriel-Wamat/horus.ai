import {
  WorkflowStateSchema,
  type IStorageProvider,
  type WorkflowState,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import { json } from "./postgresUtils.js";

export class PostgresWorkflowStateRepository implements IStorageProvider {
  constructor(private readonly pool: PgPool) {}

  async save(state: WorkflowState): Promise<void> {
    const validated = WorkflowStateSchema.parse(state);
    await this.pool.query(
      `
      INSERT INTO workflow_states (
        thread_id,
        workspace_folder_id,
        workflow_mode,
        status,
        state,
        started_at,
        completed_at,
        error_message,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, now())
      ON CONFLICT (thread_id) DO UPDATE SET
        workspace_folder_id = EXCLUDED.workspace_folder_id,
        workflow_mode = EXCLUDED.workflow_mode,
        status = EXCLUDED.status,
        state = EXCLUDED.state,
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at,
        error_message = EXCLUDED.error_message,
        updated_at = now()
      `,
      [
        validated.threadId,
        validated.workspaceFolderId ?? null,
        validated.workflowMode,
        validated.status,
        json(validated),
        validated.startedAt,
        validated.completedAt ?? null,
        validated.errorMessage ?? null,
      ]
    );
  }

  async load(threadId: string): Promise<WorkflowState | null> {
    const result = await this.pool.query<{ state: unknown }>(
      "SELECT state FROM workflow_states WHERE thread_id = $1",
      [threadId]
    );
    const row = result.rows[0];
    return row ? WorkflowStateSchema.parse(row.state) : null;
  }

  async list(): Promise<string[]> {
    const result = await this.pool.query<{ thread_id: string }>(
      "SELECT thread_id FROM workflow_states ORDER BY updated_at DESC"
    );
    return result.rows.map((row) => row.thread_id);
  }

  async delete(threadId: string): Promise<void> {
    await this.pool.query("DELETE FROM workflow_states WHERE thread_id = $1", [
      threadId,
    ]);
  }
}
