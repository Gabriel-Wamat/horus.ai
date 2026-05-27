import { CodeChangeSetSchema, type CodeChangeSet } from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import { json } from "./postgresUtils.js";
import type { CodeChangeSetRepository } from "./contracts.js";

interface CodeChangeSetRow {
  id: string;
  workflow_thread_id: string;
  workspace_folder_id: string | null;
  story_id: string;
  spec_revision_id: string | null;
  source_agent: CodeChangeSet["sourceAgent"];
  status: CodeChangeSet["status"];
  operations: unknown;
  validation: unknown;
  created_at: Date;
  applied_at: Date | null;
  failed_reason: string | null;
}

export class PostgresCodeChangeSetRepository
  implements CodeChangeSetRepository
{
  constructor(private readonly pool: PgPool) {}

  async save(changeSet: CodeChangeSet): Promise<CodeChangeSet> {
    const validated = CodeChangeSetSchema.parse(changeSet);
    await this.pool.query(
      `
      INSERT INTO code_change_sets (
        id,
        workflow_thread_id,
        workspace_folder_id,
        story_id,
        spec_revision_id,
        source_agent,
        status,
        operations,
        validation,
        created_at,
        applied_at,
        failed_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        operations = EXCLUDED.operations,
        validation = EXCLUDED.validation,
        applied_at = EXCLUDED.applied_at,
        failed_reason = EXCLUDED.failed_reason
      `,
      [
        validated.id,
        validated.workflowThreadId,
        validated.workspaceFolderId ?? null,
        validated.userStoryId,
        validated.specRevisionId ?? null,
        validated.sourceAgent,
        validated.status,
        json(validated.operations),
        json(validated.validation),
        validated.createdAt,
        validated.appliedAt ?? null,
        validated.failedReason ?? null,
      ]
    );
    return validated;
  }

  async listByWorkflow(threadId: string): Promise<CodeChangeSet[]> {
    const result = await this.pool.query<CodeChangeSetRow>(
      "SELECT * FROM code_change_sets WHERE workflow_thread_id = $1 ORDER BY created_at",
      [threadId]
    );
    return result.rows.map(changeSetFromRow);
  }
}

function changeSetFromRow(row: CodeChangeSetRow): CodeChangeSet {
  return CodeChangeSetSchema.parse({
    id: row.id,
    workflowThreadId: row.workflow_thread_id,
    workspaceFolderId: row.workspace_folder_id ?? undefined,
    userStoryId: row.story_id,
    specRevisionId: row.spec_revision_id ?? undefined,
    sourceAgent: row.source_agent,
    status: row.status,
    operations: row.operations,
    validation: row.validation,
    createdAt: row.created_at.toISOString(),
    appliedAt: row.applied_at?.toISOString(),
    failedReason: row.failed_reason ?? undefined,
  });
}
