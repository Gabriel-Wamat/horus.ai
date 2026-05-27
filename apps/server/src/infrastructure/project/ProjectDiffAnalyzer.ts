import { promises as fs } from "node:fs";
import { extname, resolve } from "node:path";
import { GitCommandExecutor } from "./GitCommandExecutor.js";

export interface ProjectFileChangeSnapshot {
  path: string;
  status: "created" | "modified" | "deleted" | "renamed" | "binary" | "unknown";
  insertions: number;
  deletions: number;
  preview?: string;
  language?: string;
}

export interface ProjectDiffStatsSnapshot {
  filesChanged: number;
  insertions: number;
  deletions: number;
  changedPaths: string[];
  fileChanges: ProjectFileChangeSnapshot[];
}

export class ProjectDiffAnalyzer {
  constructor(private readonly git = new GitCommandExecutor()) {}

  async readDiff(projectRoot: string): Promise<string> {
    const result = await this.git.run(projectRoot, [
      "diff",
      "--no-ext-diff",
      "--relative",
      "HEAD",
    ]);
    return result.stdout;
  }

  async listChangedFiles(projectRoot: string): Promise<string[]> {
    const changed = await this.git.run(projectRoot, [
      "diff",
      "--name-only",
      "--relative",
      "HEAD",
    ]);
    const untracked = await this.git.run(projectRoot, [
      "ls-files",
      "--others",
      "--exclude-standard",
    ]);
    return [...new Set([...changed.stdout.split(/\r?\n/u), ...untracked.stdout.split(/\r?\n/u)]
      .map((line) => line.trim())
      .filter(Boolean))].sort();
  }

  async readDiffStats(projectRoot: string): Promise<ProjectDiffStatsSnapshot> {
    const paths = await this.listChangedFiles(projectRoot);
    const fileChanges: ProjectFileChangeSnapshot[] = [];
    for (const path of paths) {
      const absolutePath = resolve(projectRoot, path);
      const exists = await fs
        .stat(absolutePath)
        .then((stat) => stat.isFile())
        .catch(() => false);
      const content = exists
        ? await fs.readFile(absolutePath, "utf-8").catch(() => "")
        : "";
      const insertions = content ? content.split(/\r?\n/u).length : 0;
      const language = this.inferLanguage(path);
      fileChanges.push({
        path,
        status: exists ? "modified" : "deleted",
        insertions,
        deletions: 0,
        preview: content.slice(0, 8000),
        ...(language ? { language } : {}),
      });
    }
    return {
      filesChanged: paths.length,
      insertions: fileChanges.reduce((sum, file) => sum + file.insertions, 0),
      deletions: 0,
      changedPaths: paths,
      fileChanges,
    };
  }

  private inferLanguage(path: string): string | undefined {
    const suffix = extname(path).replace(".", "").toLowerCase();
    const aliases: Record<string, string> = {
      ts: "typescript",
      tsx: "tsx",
      js: "javascript",
      jsx: "jsx",
      json: "json",
      md: "markdown",
      css: "css",
      html: "html",
    };
    return aliases[suffix] ?? (suffix || undefined);
  }
}
