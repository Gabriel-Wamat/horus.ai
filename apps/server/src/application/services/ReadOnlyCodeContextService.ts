import { promises as fs } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type {
  ChatAgentContextBundle,
  CodeContextBundle,
  CodeContextLimits,
  FrontendProject,
} from "@u-build/shared";
import { CodeContextBundleSchema } from "@u-build/shared";

export class CodeContextAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodeContextAccessError";
  }
}

export interface BuildCodeContextInput {
  readonly project: FrontendProject;
  readonly chatContext: ChatAgentContextBundle;
  readonly query: string;
  readonly requestedPaths?: string[];
}

const DEFAULT_LIMITS: CodeContextLimits = {
  maxFiles: 12,
  maxBytesPerFile: 8_000,
  maxTotalBytes: 32_000,
};

const IGNORED_DIRS = new Set([
  ".git",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const DEFAULT_PRIORITY_FILES = [
  "package.json",
  "src/main.tsx",
  "src/main.ts",
  "src/App.tsx",
  "src/App.ts",
  "src/index.css",
  "vite.config.ts",
  "tsconfig.json",
];

export class ReadOnlyCodeContextService {
  constructor(private readonly limits: CodeContextLimits = DEFAULT_LIMITS) {}

  async buildContext(input: BuildCodeContextInput): Promise<CodeContextBundle> {
    const root = await fs.realpath(input.project.rootPath);
    const candidates =
      input.requestedPaths && input.requestedPaths.length > 0
        ? input.requestedPaths
        : await this.selectCandidatePaths(root, input.query);

    const files = [];
    let totalBytes = 0;
    let omittedFilesCount = 0;

    for (const candidate of candidates) {
      if (files.length >= this.limits.maxFiles) {
        omittedFilesCount += 1;
        continue;
      }

      const absolutePath = await this.resolveInsideRoot(root, candidate);
      const stat = await fs.stat(absolutePath).catch(() => null);
      if (!stat?.isFile()) continue;

      const bytesToRead = Math.min(stat.size, this.limits.maxBytesPerFile);
      if (totalBytes + bytesToRead > this.limits.maxTotalBytes) {
        omittedFilesCount += 1;
        continue;
      }

      const raw = await fs.readFile(absolutePath, "utf-8");
      const content = raw.slice(0, this.limits.maxBytesPerFile);
      const normalizedPath = normalizeRelativePath(relative(root, absolutePath));
      files.push({
        path: normalizedPath,
        bytes: Buffer.byteLength(content, "utf-8"),
        content,
      });
      totalBytes += Buffer.byteLength(content, "utf-8");
    }

    return CodeContextBundleSchema.parse({
      projectId: input.project.id,
      query: input.query,
      inspectedFiles: files.map((file) => file.path),
      files,
      omittedFilesCount,
      totalBytes,
      limits: this.limits,
    });
  }

  async readProjectFile(
    project: FrontendProject,
    relativePath: string
  ): Promise<{ path: string; content: string; bytes: number }> {
    const root = await fs.realpath(project.rootPath);
    const absolutePath = await this.resolveInsideRoot(root, relativePath);
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      throw new CodeContextAccessError(`Path is not a file: ${relativePath}`);
    }
    const content = (await fs.readFile(absolutePath, "utf-8")).slice(
      0,
      this.limits.maxBytesPerFile
    );
    return {
      path: normalizeRelativePath(relative(root, absolutePath)),
      content,
      bytes: Buffer.byteLength(content, "utf-8"),
    };
  }

  private async selectCandidatePaths(
    root: string,
    query: string
  ): Promise<string[]> {
    const allFiles = await this.listFiles(root);
    const terms = extractSearchTerms(query);
    const scored = allFiles
      .map((path) => ({
        path,
        score: scorePath(path, terms),
      }))
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

    return [
      ...DEFAULT_PRIORITY_FILES,
      ...scored.filter((item) => item.score > 0).map((item) => item.path),
      ...scored.slice(0, this.limits.maxFiles).map((item) => item.path),
    ].filter(dedupe);
  }

  private async listFiles(root: string): Promise<string[]> {
    const output: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".env.example") {
          continue;
        }
        if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
          continue;
        }

        const absolutePath = join(directory, entry.name);
        const relativePath = normalizeRelativePath(relative(root, absolutePath));

        if (entry.isDirectory()) {
          await visit(absolutePath);
        } else if (entry.isFile() && isTextSourceFile(relativePath)) {
          output.push(relativePath);
        }
      }
    };

    await visit(root);
    return output.sort();
  }

  private async resolveInsideRoot(
    root: string,
    requestedPath: string
  ): Promise<string> {
    if (!requestedPath.trim()) {
      throw new CodeContextAccessError("Path cannot be empty.");
    }

    const absolutePath = resolve(root, requestedPath);
    const canonical = await fs
      .realpath(absolutePath)
      .catch(async (err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
        try {
          const parent = await fs.realpath(dirname(absolutePath));
          return join(parent, basename(absolutePath));
        } catch (parentErr) {
          if ((parentErr as NodeJS.ErrnoException).code === "ENOENT") {
            throw new CodeContextAccessError(
              `Path escapes selected project root or does not exist: ${requestedPath}`
            );
          }
          throw parentErr;
        }
      });
    const relation = relative(root, canonical);

    if (
      relation.startsWith("..") ||
      relation.includes(`..${sep}`) ||
      relation === ""
    ) {
      if (relation === "") return canonical;
      throw new CodeContextAccessError(
        `Path escapes selected project root: ${requestedPath}`
      );
    }

    return canonical;
  }
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function isTextSourceFile(path: string): boolean {
  return /\.(css|html|js|jsx|json|md|mjs|ts|tsx|yaml|yml)$/.test(path);
}

function extractSearchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);
}

function scorePath(path: string, terms: string[]): number {
  const normalized = path.toLowerCase();
  return terms.reduce(
    (score, term) => score + (normalized.includes(term) ? 1 : 0),
    0
  );
}

function dedupe(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}
