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
    await this.ensureSessionDir(validated.id);
    await fs.writeFile(
      this.sessionPath(validated.id),
      JSON.stringify(validated, null, 2),
      "utf-8"
    );
    return validated;
  }

  async getSession(sessionId: string): Promise<PreviewSession> {
    try {
      const raw = await fs.readFile(this.sessionPath(sessionId), "utf-8");
      return PreviewSessionSchema.parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new PreviewSessionNotFoundError(sessionId);
      }
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
    await fs.writeFile(
      this.timelinePath(validated.sessionId),
      JSON.stringify(nextEvents, null, 2),
      "utf-8"
    );
    return validated;
  }

  async listEvents(sessionId: string): Promise<PreviewEvent[]> {
    try {
      const raw = await fs.readFile(this.timelinePath(sessionId), "utf-8");
      return PreviewEventSchema.array().parse(JSON.parse(raw));
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
    await fs.writeFile(
      this.draftsPath(validated.sessionId),
      JSON.stringify([...drafts, validated], null, 2),
      "utf-8"
    );
    return validated;
  }

  async listDrafts(sessionId: string): Promise<VisualInstructionDraft[]> {
    try {
      const raw = await fs.readFile(this.draftsPath(sessionId), "utf-8");
      return VisualInstructionDraftSchema.array().parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    await this.getSession(sessionId);
    return [];
  }
}
