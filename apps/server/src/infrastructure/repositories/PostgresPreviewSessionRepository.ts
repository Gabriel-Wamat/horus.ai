import {
  PreviewEventSchema,
  PreviewSessionSchema,
  VisualInstructionDraftSchema,
  type PreviewEvent,
  type PreviewSession,
  type VisualInstructionDraft,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import { PreviewSessionNotFoundError } from "../preview/FilePreviewSessionStore.js";
import type { PreviewSessionRepository } from "./contracts.js";
import { json, toIso } from "./postgresUtils.js";

interface PreviewSessionRow {
  id: string;
  project_id: string;
  status: PreviewSession["status"];
  route: string;
  device: unknown;
  preview_url: string | null;
  process_id: number | null;
  started_at: Date | null;
  stopped_at: Date | null;
  updated_at: Date;
  error_message: string | null;
}

interface PreviewEventRow {
  id: string;
  session_id: string;
  project_id: string;
  type: PreviewEvent["type"];
  timestamp: Date;
  status: PreviewEvent["status"];
  message: string;
  data: unknown;
}

interface DraftRow {
  id: string;
  session_id: string;
  project_id: string;
  mode: VisualInstructionDraft["mode"];
  message: string;
  status: "drafted";
  created_at: Date;
}

export class PostgresPreviewSessionRepository
  implements PreviewSessionRepository
{
  constructor(private readonly pool: PgPool) {}

  async saveSession(session: PreviewSession): Promise<PreviewSession> {
    const validated = PreviewSessionSchema.parse(session);
    await this.pool.query(
      `
      INSERT INTO preview_sessions (
        id, project_id, status, route, device, preview_url, process_id,
        started_at, stopped_at, updated_at, error_message
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        status = EXCLUDED.status,
        route = EXCLUDED.route,
        device = EXCLUDED.device,
        preview_url = EXCLUDED.preview_url,
        process_id = EXCLUDED.process_id,
        started_at = EXCLUDED.started_at,
        stopped_at = EXCLUDED.stopped_at,
        updated_at = EXCLUDED.updated_at,
        error_message = EXCLUDED.error_message
      `,
      [
        validated.id,
        validated.projectId,
        validated.status,
        validated.route,
        json(validated.device),
        validated.previewUrl,
        validated.processId,
        validated.startedAt,
        validated.stoppedAt,
        validated.updatedAt,
        validated.errorMessage,
      ]
    );
    return validated;
  }

  async getSession(sessionId: string): Promise<PreviewSession> {
    const result = await this.pool.query<PreviewSessionRow>(
      "SELECT * FROM preview_sessions WHERE id = $1",
      [sessionId]
    );
    const row = result.rows[0];
    if (!row) throw new PreviewSessionNotFoundError(sessionId);
    return sessionFromRow(row);
  }

  async appendEvent(event: PreviewEvent): Promise<PreviewEvent> {
    const validated = PreviewEventSchema.parse(event);
    await this.pool.query(
      `
      INSERT INTO preview_events (id, session_id, project_id, type, timestamp, status, message, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        validated.id,
        validated.sessionId,
        validated.projectId,
        validated.type,
        validated.timestamp,
        validated.status,
        validated.message,
        json(validated.data),
      ]
    );
    return validated;
  }

  async listEvents(sessionId: string): Promise<PreviewEvent[]> {
    await this.getSession(sessionId);
    const result = await this.pool.query<PreviewEventRow>(
      "SELECT * FROM preview_events WHERE session_id = $1 ORDER BY timestamp",
      [sessionId]
    );
    return result.rows.map(eventFromRow);
  }

  async saveDraft(draft: VisualInstructionDraft): Promise<VisualInstructionDraft> {
    const validated = VisualInstructionDraftSchema.parse(draft);
    await this.pool.query(
      `
      INSERT INTO visual_instruction_drafts (id, session_id, project_id, mode, message, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        validated.id,
        validated.sessionId,
        validated.projectId,
        validated.mode,
        validated.message,
        validated.status,
        validated.createdAt,
      ]
    );
    return validated;
  }

  async listDrafts(sessionId: string): Promise<VisualInstructionDraft[]> {
    await this.getSession(sessionId);
    const result = await this.pool.query<DraftRow>(
      "SELECT * FROM visual_instruction_drafts WHERE session_id = $1 ORDER BY created_at",
      [sessionId]
    );
    return result.rows.map(draftFromRow);
  }
}

function sessionFromRow(row: PreviewSessionRow): PreviewSession {
  return PreviewSessionSchema.parse({
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    route: row.route,
    device: row.device,
    previewUrl: row.preview_url,
    processId: row.process_id,
    startedAt: row.started_at ? toIso(row.started_at) : null,
    stoppedAt: row.stopped_at ? toIso(row.stopped_at) : null,
    updatedAt: toIso(row.updated_at),
    errorMessage: row.error_message,
  });
}

function eventFromRow(row: PreviewEventRow): PreviewEvent {
  return PreviewEventSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    type: row.type,
    timestamp: toIso(row.timestamp),
    status: row.status,
    message: row.message,
    data: row.data,
  });
}

function draftFromRow(row: DraftRow): VisualInstructionDraft {
  return VisualInstructionDraftSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    mode: row.mode,
    message: row.message,
    status: row.status,
    createdAt: toIso(row.created_at),
  });
}
