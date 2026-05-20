import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { IStorageProvider } from "@u-build/shared";
import { WorkflowStateSchema } from "@u-build/shared";
import type { WorkflowState } from "@u-build/shared";

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
    await this.ensureBaseDir();
    const validated = WorkflowStateSchema.parse(state);
    await fs.writeFile(
      this.filePath(state.threadId),
      JSON.stringify(validated, null, 2),
      "utf-8"
    );
  }

  async load(threadId: string): Promise<WorkflowState | null> {
    try {
      const raw = await fs.readFile(this.filePath(threadId), "utf-8");
      return WorkflowStateSchema.parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
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
}
