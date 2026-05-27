import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  PreviewEventSchema,
  PreviewSessionSchema,
  VisualInstructionDraftSchema,
  type PreviewEvent,
  type PreviewSession,
  type VisualInstructionDraft,
} from "@u-build/shared";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";

const SESSION_FILE = "session.json";
const TIMELINE_FILE = "timeline.json";
const DRAFTS_FILE = "drafts.json";

export class PreviewSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Preview session not found: ${sessionId}`);
    this.name = "PreviewSessionNotFoundError";
  }
}

export class FilePreviewSessionStore {
  constructor(private readonly baseDir = "./data/preview-sessions") {}

  private sessionDir(sessionId: string): string {
    return join(this.baseDir, sessionId);
  }

  private sessionPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), SESSION_FILE);
  }

  private timelinePath(sessionId: string): string {
    return join(this.sessionDir(sessionId), TIMELINE_FILE);
  }

  private draftsPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), DRAFTS_FILE);
  }

  private async ensureSessionDir(sessionId: string): Promise<void> {
    await fs.mkdir(this.sessionDir(sessionId), { recursive: true });
  }

  async saveSession(session: PreviewSession): Promise<PreviewSession> {
    const validated = PreviewSessionSchema.parse(session);
    await writeJsonFileAtomic(this.sessionPath(validated.id), validated);
    return validated;
  }

  async getSession(sessionId: string): Promise<PreviewSession> {
    try {
      return await readJsonFile(this.sessionPath(sessionId), PreviewSessionSchema);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new PreviewSessionNotFoundError(sessionId);
      }
      throw err;
    }
  }

  async listSessions(): Promise<PreviewSession[]> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const sessions = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) => this.getSession(entry.name))
      );
      return sessions.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async appendEvent(event: PreviewEvent): Promise<PreviewEvent> {
    const validated = PreviewEventSchema.parse(event);
    await this.ensureSessionDir(validated.sessionId);
    const events = await this.listEvents(validated.sessionId).catch((err) => {
      if (err instanceof PreviewSessionNotFoundError) return [];
      throw err;
    });
    const nextEvents = [...events, validated];
    await writeJsonFileAtomic(this.timelinePath(validated.sessionId), nextEvents);
    return validated;
  }

  async listEvents(sessionId: string): Promise<PreviewEvent[]> {
    try {
      return await readJsonFile(
        this.timelinePath(sessionId),
        PreviewEventSchema.array()
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    await this.getSession(sessionId);
    return [];
  }

  async saveDraft(draft: VisualInstructionDraft): Promise<VisualInstructionDraft> {
    const validated = VisualInstructionDraftSchema.parse(draft);
    await this.ensureSessionDir(validated.sessionId);
    const drafts = await this.listDrafts(validated.sessionId).catch((err) => {
      if (err instanceof PreviewSessionNotFoundError) return [];
      throw err;
    });
    await writeJsonFileAtomic(this.draftsPath(validated.sessionId), [
      ...drafts,
      validated,
    ]);
    return validated;
  }

  async listDrafts(sessionId: string): Promise<VisualInstructionDraft[]> {
    try {
      return await readJsonFile(
        this.draftsPath(sessionId),
        VisualInstructionDraftSchema.array()
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    await this.getSession(sessionId);
    return [];
  }
}
