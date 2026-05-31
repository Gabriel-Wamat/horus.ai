import { v4 as uuidv4 } from "uuid";
import {
  AppendChatMessageInputSchema,
  ChatAgentContextBundleSchema,
  ChatMessageSchema,
  ChatSessionSchema,
  CreateChatSessionInputSchema,
  type AgentResult,
  type AppendChatMessageInput,
  type ChatAgentContextBundle,
  type ChatContextSnapshot,
  type ChatMessage,
  type ChatSession,
  type CreateChatSessionInput,
  type IStorageProvider,
  type Spec,
  type UserStory,
  type WorkspaceArtifactContext,
} from "@u-build/shared";
import type { PgPool } from "../database/pool.js";
import { ChatSessionNotFoundError } from "../chat/FileChatMemoryStore.js";
import type { ChatMemoryRepository, StoryContextReader } from "./contracts.js";
import { json, toIso } from "./postgresUtils.js";

interface ChatSessionRow {
  id: string;
  workspace_folder_id: string;
  user_story_id: string;
  active_user_story_revision_id: string | null;
  active_spec_revision_id: string | null;
  workflow_thread_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ChatMessageRow {
  id: string;
  session_id: string;
  sequence: number;
  role: ChatMessage["role"];
  event_type: ChatMessage["eventType"];
  visibility: ChatMessage["visibility"];
  delivery_status: ChatMessage["deliveryStatus"];
  body: string;
  compact_body: string | null;
  turn_id: string | null;
  run_id: string | null;
  attempt_id: string | null;
  context_snapshot: unknown;
  metadata: unknown;
  created_at: Date;
}

export class PostgresChatMemoryRepository implements ChatMemoryRepository {
  constructor(
    private readonly pool: PgPool,
    private readonly workspaceReader: StoryContextReader,
    private readonly workflowStorage: IStorageProvider
  ) {}

  async createSession(input: CreateChatSessionInput): Promise<ChatSession> {
    const validated = CreateChatSessionInputSchema.parse(input);
    const { snapshot } = await this.buildSnapshot(validated);
    const now = new Date().toISOString();
    const session = ChatSessionSchema.parse({
      id: uuidv4(),
      workspaceFolderId: validated.workspaceFolderId,
      userStoryId: validated.userStoryId,
      ...(snapshot.userStoryRevisionId
        ? { activeUserStoryRevisionId: snapshot.userStoryRevisionId }
        : {}),
      ...(snapshot.specRevisionId
        ? { activeSpecRevisionId: snapshot.specRevisionId }
        : {}),
      ...(validated.workflowThreadId
        ? { workflowThreadId: validated.workflowThreadId }
        : {}),
      createdAt: now,
      updatedAt: now,
    });

    await this.pool.query(
      `
      INSERT INTO chat_sessions (
        id, workspace_folder_id, user_story_id, active_user_story_revision_id,
        active_spec_revision_id, workflow_thread_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        session.id,
        session.workspaceFolderId,
        session.userStoryId,
        session.activeUserStoryRevisionId ?? null,
        session.activeSpecRevisionId ?? null,
        session.workflowThreadId ?? null,
        session.createdAt,
        session.updatedAt,
      ]
    );
    return session;
  }

  async listSessions(filter?: {
    workspaceFolderId?: string;
    userStoryId?: string;
  }): Promise<ChatSession[]> {
    const clauses: string[] = [];
    const values: string[] = [];
    if (filter?.workspaceFolderId) {
      values.push(filter.workspaceFolderId);
      clauses.push(`workspace_folder_id = $${values.length}`);
    }
    if (filter?.userStoryId) {
      values.push(filter.userStoryId);
      clauses.push(`user_story_id = $${values.length}`);
    }

    const result = await this.pool.query<ChatSessionRow>(
      `
      SELECT * FROM chat_sessions
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY updated_at DESC
      `,
      values
    );
    return result.rows.map(sessionFromRow);
  }

  async appendMessage(
    sessionId: string,
    input: AppendChatMessageInput
  ): Promise<ChatMessage> {
    const validated = AppendChatMessageInputSchema.parse(input);
    const session = await this.getSession(sessionId);
    const { snapshot } = await this.buildSnapshot(session, validated.workflowThreadId, {
      ...(validated.projectId ? { projectId: validated.projectId } : {}),
      ...(validated.previewSessionId
        ? { previewSessionId: validated.previewSessionId }
        : {}),
    });
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM chat_sessions WHERE id = $1 FOR UPDATE", [
        sessionId,
      ]);
      const sequenceResult = await client.query<{ sequence: number }>(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM chat_messages WHERE session_id = $1",
        [sessionId]
      );
      const sequence = sequenceResult.rows[0]?.sequence ?? 1;
      const message = ChatMessageSchema.parse({
        id: uuidv4(),
        sessionId,
        sequence,
        role: validated.role,
        eventType: validated.eventType,
        visibility: validated.visibility,
        deliveryStatus: validated.deliveryStatus,
        body: validated.body,
        ...(validated.compactBody ? { compactBody: validated.compactBody } : {}),
        ...(validated.turnId ? { turnId: validated.turnId } : {}),
        ...(validated.runId ? { runId: validated.runId } : {}),
        ...(validated.attemptId ? { attemptId: validated.attemptId } : {}),
        contextSnapshot: snapshot,
        metadata: validated.metadata,
        createdAt: now,
      });

      await client.query(
        `
        INSERT INTO chat_messages (
          id, session_id, sequence, role, event_type, visibility, delivery_status,
          body, compact_body, turn_id, run_id, attempt_id, context_snapshot,
          metadata, created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15)
        `,
        [
          message.id,
          message.sessionId,
          message.sequence,
          message.role,
          message.eventType,
          message.visibility,
          message.deliveryStatus,
          message.body,
          message.compactBody ?? null,
          message.turnId ?? null,
          message.runId ?? null,
          message.attemptId ?? null,
          json(message.contextSnapshot),
          json(message.metadata),
          message.createdAt,
        ]
      );
      await client.query(
        `
        UPDATE chat_sessions
        SET active_user_story_revision_id = $2,
            active_spec_revision_id = $3,
            workflow_thread_id = COALESCE($4, workflow_thread_id),
            updated_at = $5
        WHERE id = $1
        `,
        [
          sessionId,
          snapshot.userStoryRevisionId ?? null,
          snapshot.specRevisionId ?? null,
          snapshot.workflowThreadId ?? null,
          now,
        ]
      );
      await client.query("COMMIT");
      return message;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async listMessages(
    sessionId: string,
    filter?: { afterSequence?: number }
  ): Promise<ChatMessage[]> {
    await this.getSession(sessionId);
    const values: Array<string | number> = [sessionId];
    const afterClause =
      filter?.afterSequence === undefined
        ? ""
        : `AND sequence > $${values.push(filter.afterSequence)}`;
    const result = await this.pool.query<ChatMessageRow>(
      `
      SELECT * FROM chat_messages
      WHERE session_id = $1 ${afterClause}
      ORDER BY sequence, created_at
      `,
      values
    );
    return result.rows.map(messageFromRow);
  }

  async buildAgentContext(sessionId: string): Promise<ChatAgentContextBundle> {
    const session = await this.getSession(sessionId);
    const messages = await this.listMessages(sessionId);
    const latestThreadId =
      messages[messages.length - 1]?.contextSnapshot.workflowThreadId ??
      session.workflowThreadId;
    const active = await this.buildSnapshot(session, latestThreadId);
    const workflowState = latestThreadId
      ? await this.workflowStorage.load(latestThreadId)
      : null;
    const previousAgentResults: AgentResult[] =
      workflowState?.agentResults[session.userStoryId] ?? [];

    return ChatAgentContextBundleSchema.parse({
      session,
      messages,
      activeUserStory: active.activeStory,
      ...(active.activeSpec ? { activeSpec: active.activeSpec } : {}),
      artifactContext: active.artifactContext,
      previousAgentResults,
    });
  }

  private async getSession(sessionId: string): Promise<ChatSession> {
    const result = await this.pool.query<ChatSessionRow>(
      "SELECT * FROM chat_sessions WHERE id = $1",
      [sessionId]
    );
    const row = result.rows[0];
    if (!row) throw new ChatSessionNotFoundError(sessionId);
    return sessionFromRow(row);
  }

  private async buildSnapshot(
    session: Pick<
      ChatSession,
      "workspaceFolderId" | "userStoryId" | "workflowThreadId"
    >,
    workflowThreadId?: string,
    previewContext?: Pick<AppendChatMessageInput, "projectId" | "previewSessionId">
  ): Promise<{
    snapshot: ChatContextSnapshot;
    activeStory: UserStory;
    activeSpec?: Spec;
    artifactContext: WorkspaceArtifactContext;
  }> {
    const active = await this.workspaceReader.getActiveStoryContext(
      session.workspaceFolderId,
      session.userStoryId
    );
    const effectiveThreadId = workflowThreadId ?? session.workflowThreadId;
    const snapshot: ChatContextSnapshot = {
      workspaceFolderId: session.workspaceFolderId,
      userStoryId: session.userStoryId,
      ...(active.artifactContext.userStoryRevisionId
        ? { userStoryRevisionId: active.artifactContext.userStoryRevisionId }
        : {}),
      ...(active.artifactContext.specRevisionId
        ? { specRevisionId: active.artifactContext.specRevisionId }
        : {}),
      ...(effectiveThreadId ? { workflowThreadId: effectiveThreadId } : {}),
      ...(previewContext?.projectId ? { projectId: previewContext.projectId } : {}),
      ...(previewContext?.previewSessionId
        ? { previewSessionId: previewContext.previewSessionId }
        : {}),
    };

    return {
      snapshot,
      activeStory: active.story,
      ...(active.spec ? { activeSpec: active.spec } : {}),
      artifactContext: active.artifactContext,
    };
  }
}

function sessionFromRow(row: ChatSessionRow): ChatSession {
  return ChatSessionSchema.parse({
    id: row.id,
    workspaceFolderId: row.workspace_folder_id,
    userStoryId: row.user_story_id,
    ...(row.active_user_story_revision_id
      ? { activeUserStoryRevisionId: row.active_user_story_revision_id }
      : {}),
    ...(row.active_spec_revision_id
      ? { activeSpecRevisionId: row.active_spec_revision_id }
      : {}),
    ...(row.workflow_thread_id ? { workflowThreadId: row.workflow_thread_id } : {}),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function messageFromRow(row: ChatMessageRow): ChatMessage {
  return ChatMessageSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    role: row.role,
    eventType: row.event_type,
    visibility: row.visibility,
    deliveryStatus: row.delivery_status,
    body: row.body,
    ...(row.compact_body ? { compactBody: row.compact_body } : {}),
    ...(row.turn_id ? { turnId: row.turn_id } : {}),
    ...(row.run_id ? { runId: row.run_id } : {}),
    ...(row.attempt_id ? { attemptId: row.attempt_id } : {}),
    contextSnapshot: row.context_snapshot,
    metadata: row.metadata,
    createdAt: toIso(row.created_at),
  });
}
