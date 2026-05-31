import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  AgentOperationEventSchema,
  AgentOperationalSessionSchema,
  projectAgentOperationalSession,
  type AgentOperationEvent,
  type AgentOperationProjection,
  type AgentOperationalSession,
} from "@u-build/shared";
import {
  readJsonFileRaw,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";
import type {
  AgentOperationalSessionRepository,
  AppendAgentOperationEventInput,
  CreateAgentOperationalSessionInput,
} from "./contracts.js";

const OPERATIONAL_SESSIONS_FILE = "agent-operational-sessions.json";
const OPERATIONAL_SESSIONS_LOCK_FILE = "agent-operational-sessions.lock";

interface OperationalSessionDocument {
  sessions: AgentOperationalSession[];
  events: AgentOperationEvent[];
}

const emptyDocument = (): OperationalSessionDocument => ({
  sessions: [],
  events: [],
});

export class AgentOperationalSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Agent operational session not found: ${sessionId}`);
    this.name = "AgentOperationalSessionNotFoundError";
  }
}

export class FileAgentOperationalSessionRepository
  implements AgentOperationalSessionRepository
{
  constructor(private readonly baseDir = "./data/agent-operational-sessions") {}

  async createSession(
    input: CreateAgentOperationalSessionInput
  ): Promise<AgentOperationalSession> {
    const now = input.startedAt ?? new Date().toISOString();
    return this.update((document) => {
      const existing = document.sessions.find((session) => session.id === input.id);
      if (existing) return { document, value: existing };
      const session = AgentOperationalSessionSchema.parse({
        id: input.id,
        workflowThreadId: input.workflowThreadId,
        projectId: input.projectId,
        userStoryId: input.userStoryId,
        runId: input.runId ?? null,
        codeChangeSetId: input.codeChangeSetId ?? null,
        agentName: input.agentName,
        agentProfileId: input.agentProfileId,
        status: input.status ?? "running",
        startedAt: now,
        finishedAt: null,
        lastError: null,
        metadata: input.metadata ?? {},
      });
      return {
        document: {
          ...document,
          sessions: [...document.sessions, session],
        },
        value: session,
      };
    });
  }

  async getSession(sessionId: string): Promise<AgentOperationalSession | null> {
    return (
      (await this.read()).sessions.find((session) => session.id === sessionId) ??
      null
    );
  }

  async listSessionsByWorkflowThread(
    workflowThreadId: string
  ): Promise<AgentOperationalSession[]> {
    return (await this.read()).sessions
      .filter((session) => session.workflowThreadId === workflowThreadId)
      .sort(
        (left, right) =>
          left.startedAt.localeCompare(right.startedAt) ||
          left.id.localeCompare(right.id)
      );
  }

  async updateSessionStatus(input: {
    sessionId: string;
    status: AgentOperationalSession["status"];
    finishedAt?: string | null;
    lastError?: string | null;
  }): Promise<AgentOperationalSession> {
    return this.update((document) => {
      const index = document.sessions.findIndex(
        (session) => session.id === input.sessionId
      );
      if (index < 0) throw new AgentOperationalSessionNotFoundError(input.sessionId);
      const session = AgentOperationalSessionSchema.parse({
        ...document.sessions[index],
        status: input.status,
        finishedAt:
          input.finishedAt === undefined
            ? document.sessions[index]!.finishedAt
            : input.finishedAt,
        lastError:
          input.lastError === undefined
            ? document.sessions[index]!.lastError
            : input.lastError,
      });
      const sessions = document.sessions.slice();
      sessions[index] = session;
      return { document: { ...document, sessions }, value: session };
    });
  }

  async appendEvent(
    input: AppendAgentOperationEventInput
  ): Promise<AgentOperationEvent> {
    return this.update((document) => {
      if (!document.sessions.some((session) => session.id === input.sessionId)) {
        throw new AgentOperationalSessionNotFoundError(input.sessionId);
      }
      const existing = document.events.find((event) => event.id === input.id);
      if (existing) return { document, value: existing };
      const sequence = nextSequence(document.events, input.sessionId);
      const event = AgentOperationEventSchema.parse({
        id: input.id,
        sessionId: input.sessionId,
        sequence,
        type: input.type,
        toolName: input.toolName ?? null,
        toolStatus: input.toolStatus ?? null,
        summary: input.summary ?? null,
        filePaths: input.filePaths ?? [],
        commandIds: input.commandIds ?? [],
        errorMessage: input.errorMessage ?? null,
        metadata: input.metadata ?? {},
        createdAt: input.createdAt ?? new Date().toISOString(),
      });
      return {
        document: { ...document, events: [...document.events, event] },
        value: event,
      };
    });
  }

  async listEvents(sessionId: string): Promise<AgentOperationEvent[]> {
    return (await this.read()).events
      .filter((event) => event.sessionId === sessionId)
      .sort((left, right) => left.sequence - right.sequence);
  }

  async getProjection(
    sessionId: string
  ): Promise<AgentOperationProjection | null> {
    const document = await this.read();
    const session =
      document.sessions.find((candidate) => candidate.id === sessionId) ?? null;
    if (!session) return null;
    return projectAgentOperationalSession(
      session,
      document.events.filter((event) => event.sessionId === sessionId)
    );
  }

  private async read(): Promise<OperationalSessionDocument> {
    await fs.mkdir(this.baseDir, { recursive: true });
    try {
      const raw = await readJsonFileRaw(
        join(this.baseDir, OPERATIONAL_SESSIONS_FILE)
      );
      const document =
        raw && typeof raw === "object"
          ? (raw as Partial<OperationalSessionDocument>)
          : {};
      return {
        sessions: Array.isArray(document.sessions)
          ? document.sessions.map((session) =>
              AgentOperationalSessionSchema.parse(session)
            )
          : [],
        events: Array.isArray(document.events)
          ? document.events.map((event) => AgentOperationEventSchema.parse(event))
          : [],
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyDocument();
      }
      throw err;
    }
  }

  private async write(document: OperationalSessionDocument): Promise<void> {
    await writeJsonFileAtomic(
      join(this.baseDir, OPERATIONAL_SESSIONS_FILE),
      document,
      { trailingNewline: true }
    );
  }

  private async update<T>(
    mutate: (
      document: OperationalSessionDocument
    ) => { document: OperationalSessionDocument; value: T }
  ): Promise<T> {
    return withFileLock(join(this.baseDir, OPERATIONAL_SESSIONS_LOCK_FILE), async () => {
      const current = await this.read();
      const { document, value } = mutate(current);
      await this.write(document);
      return value;
    });
  }
}

function nextSequence(
  events: readonly AgentOperationEvent[],
  sessionId: string
): number {
  return (
    events
      .filter((event) => event.sessionId === sessionId)
      .reduce((max, event) => Math.max(max, event.sequence), -1) + 1
  );
}

async function withFileLock<T>(
  path: string,
  operation: () => Promise<T>
): Promise<T> {
  await fs.mkdir(dirname(path), { recursive: true });
  const lock = await acquireFileLock(path);
  try {
    return await operation();
  } finally {
    await lock.close();
    await fs.rm(path, { force: true }).catch(() => undefined);
  }
}

async function acquireFileLock(
  path: string
): Promise<Awaited<ReturnType<typeof fs.open>>> {
  const started = Date.now();
  const timeoutMs = 5_000;
  for (;;) {
    try {
      return await fs.open(path, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for agent operational session lock: ${path}`);
      }
      await delay(25);
    }
  }
}
