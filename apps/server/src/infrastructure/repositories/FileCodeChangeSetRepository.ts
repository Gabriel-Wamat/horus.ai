import { promises as fs } from "node:fs";
import { join } from "node:path";
import { CodeChangeSetSchema, type CodeChangeSet } from "@u-build/shared";
import type { CodeChangeSetRepository } from "./contracts.js";

export class FileCodeChangeSetRepository implements CodeChangeSetRepository {
  constructor(private readonly baseDir = "./data/code-change-sets") {}

  async save(changeSet: CodeChangeSet): Promise<CodeChangeSet> {
    const validated = CodeChangeSetSchema.parse(changeSet);
    await fs.mkdir(this.workflowDir(validated.workflowThreadId), {
      recursive: true,
    });
    await fs.writeFile(
      this.changeSetPath(validated.workflowThreadId, validated.id),
      JSON.stringify(validated, null, 2),
      "utf-8"
    );
    return validated;
  }

  async listByWorkflow(threadId: string): Promise<CodeChangeSet[]> {
    try {
      const entries = await fs.readdir(this.workflowDir(threadId), {
        withFileTypes: true,
      });
      const changeSets = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map(async (entry) => {
            const raw = await fs.readFile(
              join(this.workflowDir(threadId), entry.name),
              "utf-8"
            );
            return CodeChangeSetSchema.parse(JSON.parse(raw));
          })
      );
      return changeSets.sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt)
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  private workflowDir(threadId: string): string {
    return join(this.baseDir, threadId);
  }

  private changeSetPath(threadId: string, changeSetId: string): string {
    return join(this.workflowDir(threadId), `${changeSetId}.json`);
  }
}
