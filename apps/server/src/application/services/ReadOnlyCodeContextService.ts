import { promises as fs } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type {
  ChatAgentContextBundle,
  CodeContextBundle,
  CodeContextExcerpt,
  CodeContextLimits,
  FrontendProject,
} from "@u-build/shared";
import { CodeContextBundleSchema } from "@u-build/shared";
import { ProjectManifestService } from "../../infrastructure/project/ProjectManifestService.js";

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

export interface BuildCodeContextFromRootInput {
  readonly projectId: string;
  readonly projectRootPath: string;
  readonly query: string;
  readonly requestedPaths?: string[];
}

const DEFAULT_LIMITS: CodeContextLimits = {
  maxFiles: 12,
  maxBytesPerFile: 8_000,
  maxTotalBytes: 32_000,
};
const EXCERPT_RADIUS = 6;
const MIN_MATCH_SCORE = 20;

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
  "horus.project.json",
  "package.json",
  "src/main.tsx",
  "src/main.ts",
  "src/App.tsx",
  "src/App.ts",
  "src/styles/tokens.css",
  "src/styles/app.css",
  "src/index.css",
  "src/features/welcome/components/WelcomeScreen.tsx",
  "vite.config.ts",
  "tsconfig.json",
];

export class ReadOnlyCodeContextService {
  constructor(
    private readonly limits: CodeContextLimits = DEFAULT_LIMITS,
    private readonly manifestService = new ProjectManifestService()
  ) {}

  async buildContext(input: BuildCodeContextInput): Promise<CodeContextBundle> {
    return this.buildContextFromProjectRoot({
      projectId: input.project.id,
      projectRootPath: input.project.rootPath,
      query: input.query,
      ...(input.requestedPaths ? { requestedPaths: input.requestedPaths } : {}),
    });
  }

  async buildContextFromProjectRoot(
    input: BuildCodeContextFromRootInput
  ): Promise<CodeContextBundle> {
    const root = await fs.realpath(input.projectRootPath);
    const manifest = await this.manifestService.read(root);
    const allFiles = await this.listFiles(root);
    const candidates =
      input.requestedPaths && input.requestedPaths.length > 0
        ? input.requestedPaths
        : await this.selectCandidatePaths(root, input.query, allFiles);
    const terms = extractSearchTerms(input.query);

    const files = [];
    const excerpts: CodeContextExcerpt[] = [];
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
      const matchedTerms = terms.filter((term) =>
        `${normalizedPath}\n${content}`.toLowerCase().includes(term)
      );
      const lineCount = Math.max(1, content.split("\n").length);
      files.push({
        path: normalizedPath,
        bytes: Buffer.byteLength(content, "utf-8"),
        content,
        startLine: 1,
        endLine: lineCount,
        matchedTerms,
      });
      if (normalizedPath !== "horus.project.json") {
        const excerpt = buildBestExcerpt(normalizedPath, content, terms);
        if (excerpt) excerpts.push(excerpt);
      }
      totalBytes += Buffer.byteLength(content, "utf-8");
    }
    excerpts.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath));
    const bestScore = excerpts[0]?.score ?? 0;
    const retrievalStatus =
      excerpts.length === 0
        ? "no_match"
        : bestScore >= MIN_MATCH_SCORE
          ? "matched"
          : "partial";

    return CodeContextBundleSchema.parse({
      projectId: input.projectId,
      query: input.query,
      inspectedFiles: files.map((file) => file.path),
      files,
      excerpts: excerpts.slice(0, Math.min(5, this.limits.maxFiles)),
      omittedFilesCount,
      totalBytes,
      limits: this.limits,
      manifest,
      retrievalStatus,
      retrievalNotes:
        retrievalStatus === "no_match"
          ? ["Nenhum trecho de código compatível com a pergunta foi encontrado."]
          : retrievalStatus === "partial"
            ? ["A busca encontrou apenas evidências fracas ou arquivos de fallback."]
            : [],
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
    query: string,
    allFiles: string[]
  ): Promise<string[]> {
    const terms = extractSearchTerms(query);
    const explicitPaths = extractExplicitPaths(query).filter((path) =>
      allFiles.includes(path)
    );
    const contentScores = await Promise.all(
      allFiles.map(async (path) => {
        const absolutePath = await this.resolveInsideRoot(root, path);
        const content = await fs.readFile(absolutePath, "utf-8").catch(() => "");
        return {
          path,
          score: scorePath(path, terms) + scoreContent(content, terms),
        };
      })
    );
    const scored = allFiles
      .map((path) => ({
        path,
        score: contentScores.find((item) => item.path === path)?.score ?? scorePath(path, terms),
      }))
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

    return [
      ...explicitPaths,
      ...scored.filter((item) => item.score > 0).map((item) => item.path),
      ...DEFAULT_PRIORITY_FILES.filter((path) => allFiles.includes(path)),
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

function scoreContent(content: string, terms: string[]): number {
  const normalized = content.toLowerCase();
  return terms.reduce((score, term) => {
    const exact = normalized.includes(term) ? 8 : 0;
    const symbol = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(content) ? 12 : 0;
    return score + exact + symbol;
  }, 0);
}

function extractExplicitPaths(query: string): string[] {
  return [...query.matchAll(/[A-Za-z0-9_./-]+\.(?:tsx?|jsx?|css|html|json|md|ya?ml)/g)]
    .map((match) => match[0].replace(/^['"`]+|['"`.,;:]+$/g, ""))
    .map((path) => normalizeRelativePath(path.replace(/^\.?\//, "")))
    .filter(dedupe);
}

function buildBestExcerpt(
  filePath: string,
  content: string,
  terms: string[]
): CodeContextExcerpt | null {
  const lines = content.split("\n");
  if (lines.length === 0) return null;
  let bestLine = -1;
  let bestScore = 0;
  const normalizedTerms = terms.length > 0 ? terms : [filePath.split("/").pop() ?? filePath];

  lines.forEach((line, index) => {
    const normalized = line.toLowerCase();
    const lineScore = normalizedTerms.reduce(
      (score, term) => score + (normalized.includes(term.toLowerCase()) ? 10 : 0),
      0
    );
    if (lineScore > bestScore) {
      bestScore = lineScore;
      bestLine = index;
    }
  });

  if (bestLine < 0) {
    if (terms.length > 0) return null;
    bestLine = 0;
    bestScore = 1;
  }

  const start = Math.max(0, bestLine - EXCERPT_RADIUS);
  const end = Math.min(lines.length - 1, bestLine + EXCERPT_RADIUS);
  return {
    filePath,
    startLine: start + 1,
    endLine: end + 1,
    content: lines.slice(start, end + 1).join("\n"),
    reason: bestScore >= MIN_MATCH_SCORE ? "Correspondência forte com a pergunta." : "Correspondência parcial com a pergunta.",
    score: bestScore,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupe(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}
