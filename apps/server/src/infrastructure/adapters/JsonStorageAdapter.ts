import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { IStorageProvider } from "@u-build/shared";
import { WorkflowStateSchema } from "@u-build/shared";
import type { WorkflowState } from "@u-build/shared";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../storage/JsonFileStore.js";

export class JsonStorageAdapter implements IStorageProvider {
  private readonly baseDir: string;

  constructor(baseDir = "./data/workflows") {
    this.baseDir = baseDir;
  }

  private filePath(threadId: string): string {
    return join(this.baseDir, `${threadId}.json`);
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async save(state: WorkflowState): Promise<void> {
    const validated = WorkflowStateSchema.parse(state);
    await writeJsonFileAtomic(this.filePath(state.threadId), validated);
  }

  async load(threadId: string): Promise<WorkflowState | null> {
    return readJsonFile(this.filePath(threadId), WorkflowStateSchema, {
      defaultValue: null,
    });
  }

  async list(): Promise<string[]> {
    await this.ensureBaseDir();
    const files = await fs.readdir(this.baseDir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  }

  async delete(threadId: string): Promise<void> {
    await fs.unlink(this.filePath(threadId));
  }

  async loadLatestByFolder(folderId: string): Promise<string | null> {
    const threadIds = await this.list();
    let latest: { threadId: string; startedAt: string } | null = null;
    for (const threadId of threadIds) {
      const state = await this.load(threadId);
      if (state?.workspaceFolderId === folderId) {
        const ts = state.startedAt ?? "";
        if (!latest || ts > latest.startedAt) {
          latest = { threadId, startedAt: ts };
        }
      }
    }
    return latest?.threadId ?? null;
  }
}
