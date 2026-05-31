import {
  AgentOperationEventSchema,
  AgentOperationalSessionSchema,
  projectAgentOperationalSession,
  type AgentOperationEvent,
  type AgentOperationProjection,
  type AgentOperationalSession,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import { json, toIso } from "./postgresUtils.js";
import { AgentOperationalSessionNotFoundError } from "./FileAgentOperationalSessionRepository.js";
import type {
  AgentOperationalSessionRepository,
  AppendAgentOperationEventInput,
  CreateAgentOperationalSessionInput,
} from "./contracts.js";

interface OperationalSessionRow {
  id: string;
  workflow_thread_id: string;
  project_id: string;
  user_story_id: string;
  run_id: string | null;
  code_change_set_id: string | null;
  agent_name: AgentOperationalSession["agentName"];
  agent_profile_id: AgentOperationalSession["agentProfileId"];
  status: AgentOperationalSession["status"];
  started_at: Date;
  finished_at: Date | null;
  last_error: string | null;
  metadata: unknown;
}

interface OperationEventRow {
  id: string;
  session_id: string;
  sequence: number;
  type: AgentOperationEvent["type"];
  tool_name: AgentOperationEvent["toolName"];
  tool_status: AgentOperationEvent["toolStatus"];
  summary: string | null;
  file_paths: unknown;
  command_ids: unknown;
  error_message: string | null;
  metadata: unknown;
  created_at: Date;
}

export class PostgresAgentOperationalSessionRepository
  implements AgentOperationalSessionRepository
{
  constructor(private readonly pool: PgPool) {}

  async createSession(
    input: CreateAgentOperationalSessionInput
  ): Promise<AgentOperationalSession> {
    const startedAt = input.startedAt ?? new Date().toISOString();
    const result = await this.pool.query<OperationalSessionRow>(
      `
      INSERT INTO agent_operational_sessions (
        id, workflow_thread_id, project_id, user_story_id, run_id,
        code_change_set_id, agent_name, agent_profile_id, status,
        started_at, finished_at, last_error, metadata
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,NULL,$11::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        id = agent_operational_sessions.id
      RETURNING *
      `,
      [
        input.id,
        input.workflowThreadId,
        input.projectId,
        input.userStoryId,
        input.runId ?? null,
        input.codeChangeSetId ?? null,
        input.agentName,
        input.agentProfileId,
        input.status ?? "running",
        startedAt,
        json(input.metadata ?? {}),
      ]
    );
    return sessionFromRow(result.rows[0]!);
  }

  async getSession(sessionId: string): Promise<AgentOperationalSession | null> {
    const result = await this.pool.query<OperationalSessionRow>(
      "SELECT * FROM agent_operational_sessions WHERE id = $1",
      [sessionId]
    );
    return result.rows[0] ? sessionFromRow(result.rows[0]) : null;
  }

  async listSessionsByWorkflowThread(
    workflowThreadId: string
  ): Promise<AgentOperationalSession[]> {
    const result = await this.pool.query<OperationalSessionRow>(
      `
      SELECT *
      FROM agent_operational_sessions
      WHERE workflow_thread_id = $1
      ORDER BY started_at ASC, id ASC
      `,
      [workflowThreadId]
    );
    return result.rows.map(sessionFromRow);
  }

  async updateSessionStatus(input: {
    sessionId: string;
    status: AgentOperationalSession["status"];
    finishedAt?: string | null;
    lastError?: string | null;
  }): Promise<AgentOperationalSession> {
    const result = await this.pool.query<OperationalSessionRow>(
      `
      UPDATE agent_operational_sessions
      SET status = $2,
          finished_at = CASE WHEN $4 THEN $3::timestamptz ELSE finished_at END,
          last_error = CASE WHEN $6 THEN $5 ELSE last_error END
      WHERE id = $1
      RETURNING *
      `,
      [
        input.sessionId,
        input.status,
        input.finishedAt ?? null,
        input.finishedAt !== undefined,
        input.lastError ?? null,
        input.lastError !== undefined,
      ]
    );
    const row = result.rows[0];
    if (!row) throw new AgentOperationalSessionNotFoundError(input.sessionId);
    return sessionFromRow(row);
  }

  async appendEvent(
    input: AppendAgentOperationEventInput
  ): Promise<AgentOperationEvent> {
    const session = await this.getSession(input.sessionId);
    if (!session) throw new AgentOperationalSessionNotFoundError(input.sessionId);

    const sequence = await this.nextSequence(input.sessionId);
    const createdAt = input.createdAt ?? new Date().toISOString();
    const result = await this.pool.query<OperationEventRow>(
      `
      INSERT INTO agent_operation_events (
        id, session_id, sequence, type, tool_name, tool_status, summary,
        file_paths, command_ids, error_message, metadata, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11::jsonb,$12)
      ON CONFLICT (id) DO UPDATE SET
        id = agent_operation_events.id
      RETURNING *
      `,
      [
        input.id,
        input.sessionId,
        sequence,
        input.type,
        input.toolName ?? null,
        input.toolStatus ?? null,
        input.summary ?? null,
        json(input.filePaths ?? []),
        json(input.commandIds ?? []),
        input.errorMessage ?? null,
        json(input.metadata ?? {}),
        createdAt,
      ]
    );
    return eventFromRow(result.rows[0]!);
  }

  async listEvents(sessionId: string): Promise<AgentOperationEvent[]> {
    const result = await this.pool.query<OperationEventRow>(
      `
      SELECT *
      FROM agent_operation_events
      WHERE session_id = $1
      ORDER BY sequence ASC
      `,
      [sessionId]
    );
    return result.rows.map(eventFromRow);
  }

  async getProjection(
    sessionId: string
  ): Promise<AgentOperationProjection | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    return projectAgentOperationalSession(session, await this.listEvents(sessionId));
  }

  private async nextSequence(sessionId: string): Promise<number> {
    const result = await this.pool.query<{ next_sequence: number }>(
      `
      SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
      FROM agent_operation_events
      WHERE session_id = $1
      `,
      [sessionId]
    );
    return Number(result.rows[0]?.next_sequence ?? 0);
  }
}

function sessionFromRow(row: OperationalSessionRow): AgentOperationalSession {
  return AgentOperationalSessionSchema.parse({
    id: row.id,
    workflowThreadId: row.workflow_thread_id,
    projectId: row.project_id,
    userStoryId: row.user_story_id,
    runId: row.run_id,
    codeChangeSetId: row.code_change_set_id,
    agentName: row.agent_name,
    agentProfileId: row.agent_profile_id,
    status: row.status,
    startedAt: toIso(row.started_at),
    finishedAt: row.finished_at ? toIso(row.finished_at) : null,
    lastError: row.last_error,
    metadata: row.metadata ?? {},
  });
}

function eventFromRow(row: OperationEventRow): AgentOperationEvent {
  return AgentOperationEventSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    type: row.type,
    toolName: row.tool_name,
    toolStatus: row.tool_status,
    summary: row.summary,
    filePaths: Array.isArray(row.file_paths) ? row.file_paths : [],
    commandIds: Array.isArray(row.command_ids) ? row.command_ids : [],
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
  });
}
