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
  role: ChatMessage["role"];
  body: string;
  context_snapshot: unknown;
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
    const message = ChatMessageSchema.parse({
      id: uuidv4(),
      sessionId,
      role: validated.role,
      body: validated.body,
      contextSnapshot: snapshot,
      createdAt: now,
    });

    await this.pool.query(
      `
      INSERT INTO chat_messages (id, session_id, role, body, context_snapshot, created_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      `,
      [
        message.id,
        message.sessionId,
        message.role,
        message.body,
        json(message.contextSnapshot),
        message.createdAt,
      ]
    );
    await this.pool.query(
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
    return message;
  }

  async listMessages(sessionId: string): Promise<ChatMessage[]> {
    await this.getSession(sessionId);
    const result = await this.pool.query<ChatMessageRow>(
      "SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at",
      [sessionId]
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
    role: row.role,
    body: row.body,
    contextSnapshot: row.context_snapshot,
    createdAt: toIso(row.created_at),
  });
}
