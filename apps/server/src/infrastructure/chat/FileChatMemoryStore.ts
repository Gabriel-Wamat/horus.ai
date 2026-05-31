import { join } from "node:path";
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
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";

interface ActiveStoryContextReader {
  getActiveStoryContext(
    folderId: string,
    storyId: string
  ): Promise<{
    story: UserStory;
    spec?: Spec;
    artifactContext: WorkspaceArtifactContext;
  }>;
}

export class ChatSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Chat session not found: ${sessionId}`);
    this.name = "ChatSessionNotFoundError";
  }
}

const SESSIONS_FILE = "sessions.json";
const MESSAGES_FILE = "messages.json";

export class FileChatMemoryStore {
  private readonly messageLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly workspaceReader: ActiveStoryContextReader,
    private readonly workflowStorage: IStorageProvider,
    private readonly baseDir = "./data/chat-memory"
  ) {}

  private sessionsPath(): string {
    return join(this.baseDir, SESSIONS_FILE);
  }

  private sessionDir(sessionId: string): string {
    return join(this.baseDir, sessionId);
  }

  private messagesPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), MESSAGES_FILE);
  }

  private async readSessions(): Promise<ChatSession[]> {
    return readJsonFile(this.sessionsPath(), ChatSessionSchema.array(), {
      defaultValue: [],
    });
  }

  private async writeSessions(sessions: ChatSession[]): Promise<void> {
    const validated = ChatSessionSchema.array().parse(sessions);
    await writeJsonFileAtomic(this.sessionsPath(), validated);
  }

  private async getSession(sessionId: string): Promise<ChatSession> {
    const session = (await this.readSessions()).find(
      (item) => item.id === sessionId
    );
    if (!session) throw new ChatSessionNotFoundError(sessionId);
    return session;
  }

  private async readMessages(sessionId: string): Promise<ChatMessage[]> {
    await this.getSession(sessionId);
    return readJsonFile(this.messagesPath(sessionId), ChatMessageSchema.array(), {
      defaultValue: [],
    });
  }

  private async writeMessages(
    sessionId: string,
    messages: ChatMessage[]
  ): Promise<void> {
    const validated = ChatMessageSchema.array().parse(messages);
    await writeJsonFileAtomic(this.messagesPath(sessionId), validated);
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

  async createSession(input: CreateChatSessionInput): Promise<ChatSession> {
    const validated = CreateChatSessionInputSchema.parse(input);
    const { snapshot } = await this.buildSnapshot(validated);
    const now = new Date().toISOString();
    const session: ChatSession = {
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
    };

    await this.writeSessions([...(await this.readSessions()), session]);
    await this.writeMessages(session.id, []);
    return session;
  }

  async listSessions(filter?: {
    workspaceFolderId?: string;
    userStoryId?: string;
  }): Promise<ChatSession[]> {
    const sessions = await this.readSessions();
    return sessions
      .filter((session) =>
        filter?.workspaceFolderId
          ? session.workspaceFolderId === filter.workspaceFolderId
          : true
      )
      .filter((session) =>
        filter?.userStoryId ? session.userStoryId === filter.userStoryId : true
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async appendMessage(
    sessionId: string,
    input: AppendChatMessageInput
  ): Promise<ChatMessage> {
    return this.withMessageLock(sessionId, async () => {
      const validated = AppendChatMessageInputSchema.parse(input);
      const session = await this.getSession(sessionId);
      const { snapshot } = await this.buildSnapshot(
        session,
        validated.workflowThreadId,
        {
          ...(validated.projectId ? { projectId: validated.projectId } : {}),
          ...(validated.previewSessionId
            ? { previewSessionId: validated.previewSessionId }
            : {}),
        }
      );
      const now = new Date().toISOString();
      const messages = await this.readMessages(sessionId);
      const sequence =
        messages.reduce((max, message) => Math.max(max, message.sequence), 0) + 1;
      const message: ChatMessage = {
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
      };

      await this.writeMessages(sessionId, [...messages, message]);
      await this.writeSessions(
        (await this.readSessions()).map((item) =>
          item.id === sessionId
            ? {
                ...item,
                activeUserStoryRevisionId: snapshot.userStoryRevisionId,
                activeSpecRevisionId: snapshot.specRevisionId,
                workflowThreadId: snapshot.workflowThreadId ?? item.workflowThreadId,
                updatedAt: now,
              }
            : item
        )
      );
      return message;
    });
  }

  async listMessages(
    sessionId: string,
    filter?: { afterSequence?: number }
  ): Promise<ChatMessage[]> {
    return (await this.readMessages(sessionId))
      .filter((message) =>
        filter?.afterSequence === undefined
          ? true
          : message.sequence > filter.afterSequence
      )
      .sort((left, right) => {
        if (left.sequence !== right.sequence) return left.sequence - right.sequence;
        return left.createdAt.localeCompare(right.createdAt);
      });
  }

  async buildAgentContext(sessionId: string): Promise<ChatAgentContextBundle> {
    const session = await this.getSession(sessionId);
    const messages = await this.readMessages(sessionId);
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

  private async withMessageLock<T>(
    sessionId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.messageLocks.get(sessionId) ?? Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const next = previous.catch(() => undefined).then(() => current);
    this.messageLocks.set(sessionId, next);
    await previous.catch(() => undefined);

    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (this.messageLocks.get(sessionId) === next) {
        this.messageLocks.delete(sessionId);
      }
    }
  }
}
