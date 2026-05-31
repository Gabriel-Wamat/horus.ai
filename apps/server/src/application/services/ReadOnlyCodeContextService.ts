import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type {
  ChatAgentContextBundle,
  CodeContextBundle,
  CodeContextLimits,
  CodeContextStructuralContext,
  FrontendProject,
  HorusProjectManifest,
  RepositoryRetrievalResult,
  RepositoryScanSnapshot,
} from "@u-build/shared";
import { CodeContextBundleSchema, HorusProjectManifestSchema } from "@u-build/shared";
import type { ProjectManifestReader } from "../ports/ProjectServicesPort.js";
import type {
  RepositoryScannerPort,
  TextRetrievalPort,
} from "../ports/RepositoryRetrievalPort.js";
import type {
  AstAnalyzerPort,
  KeyValueCachePort,
  SemanticRepositoryRetrievalPort,
} from "../ports/index.js";
import { RepositoryScanner } from "../coding/RepositoryScanner.js";
import { TextRepositoryRetriever } from "../coding/TextRepositoryRetriever.js";

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
const DEFAULT_RETRIEVAL_OPTIONS = {
  maxContentScanFiles: 80,
  concurrency: 4,
};
const DEFAULT_STRUCTURAL_CONTEXT_CACHE_TTL_MS = 120_000;

export class ReadOnlyCodeContextService {
  constructor(
    private readonly limits: CodeContextLimits = DEFAULT_LIMITS,
    private readonly manifestService: ProjectManifestReader =
      new JsonProjectManifestReader(),
    private readonly retrievalOptions: {
      readonly maxContentScanFiles?: number | undefined;
      readonly concurrency?: number | undefined;
    } = DEFAULT_RETRIEVAL_OPTIONS,
    private readonly scanner: RepositoryScannerPort = new RepositoryScanner(),
    private readonly retriever: TextRetrievalPort = new TextRepositoryRetriever(),
    private readonly astAnalyzer?: AstAnalyzerPort | undefined,
    private readonly semanticRetrieval?: SemanticRepositoryRetrievalPort | undefined,
    private readonly cache?: KeyValueCachePort | undefined,
    private readonly structuralContextCacheTtlMs: number =
      DEFAULT_STRUCTURAL_CONTEXT_CACHE_TTL_MS
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
    const scan = await this.scanner.scan({
      projectId: input.projectId,
      projectRootPath: root,
      ...(input.requestedPaths ? { selectedPaths: input.requestedPaths } : {}),
      budget: {
        maxBytesPerFile: Math.max(this.limits.maxBytesPerFile, 64_000),
      },
    });
    const retrieval = await this.retriever.retrieve({
      scan,
      query: input.query,
      ...(input.requestedPaths ? { requestedPaths: input.requestedPaths } : {}),
      budget: {
        maxFiles: this.limits.maxFiles,
        maxBytesPerFile: this.limits.maxBytesPerFile,
        maxTotalBytes: this.limits.maxTotalBytes,
        maxContentScanFiles:
          this.retrievalOptions.maxContentScanFiles ??
          DEFAULT_RETRIEVAL_OPTIONS.maxContentScanFiles,
        maxExcerpts: Math.max(1, Math.min(5, this.limits.maxFiles)),
        concurrency:
          this.retrievalOptions.concurrency ??
          DEFAULT_RETRIEVAL_OPTIONS.concurrency,
      },
    });
    const files = retrieval.candidates.map((candidate) => ({
      path: candidate.path,
      bytes: candidate.bytes,
      content: candidate.content,
      startLine: candidate.startLine,
      ...(candidate.endLine ? { endLine: candidate.endLine } : {}),
      matchedTerms: candidate.matchedTerms,
    }));
    const structuralContext = await this.buildStructuralContext({
      scan,
      retrieval,
      query: input.query,
      requestedPaths: input.requestedPaths,
    });

    return CodeContextBundleSchema.parse({
      projectId: input.projectId,
      query: input.query,
      inspectedFiles: files.map((file) => file.path),
      files,
      excerpts: retrieval.excerpts,
      omittedFilesCount: retrieval.omittedFilesCount,
      totalBytes: retrieval.totalBytes,
      limits: this.limits,
      manifest,
      retrievalStatus: retrieval.status,
      retrievalNotes: retrieval.notes,
      retrievalStats: {
        totalFiles: retrieval.stats.totalFiles,
        indexedFiles: retrieval.stats.indexedFiles,
        contentScannedFiles: retrieval.stats.contentScannedFiles,
        explicitPathCount: retrieval.stats.explicitPathCount,
      },
      structuralContext,
    });
  }

  private async buildStructuralContext(input: {
    scan: RepositoryScanSnapshot;
    retrieval: RepositoryRetrievalResult;
    query: string;
    requestedPaths?: readonly string[] | undefined;
  }): Promise<CodeContextStructuralContext | null> {
    if (!this.astAnalyzer) return null;
    const notes: string[] = [];
    const cacheKey = this.cache
      ? buildStructuralContextCacheKey(input)
      : undefined;
    if (cacheKey && this.cache) {
      const cached = await this.cache
        .getJson<CodeContextStructuralContext>(cacheKey)
        .catch(() => null);
      if (cached) {
        return {
          ...cached,
          notes: [...cached.notes, "cache_hit: structural_context"],
        };
      }
    }
    try {
      const ast = await this.astAnalyzer.analyze({
        candidates: input.retrieval.candidates,
      });
      const semantic = this.semanticRetrieval
        ? await this.semanticRetrieval
            .retrieve({
              scan: input.scan,
              lexicalRetrieval: input.retrieval,
              query: input.query,
              requestedPaths: input.requestedPaths ?? [],
              ast,
              budget: {
                maxSourceFiles: 24,
                maxBytesPerFile: 16_000,
                maxChunks: 80,
                topK: 8,
              },
            })
            .catch((err: unknown) => {
              notes.push(
                err instanceof Error
                  ? `semantic_retrieval_unavailable: ${err.message}`
                  : "semantic_retrieval_unavailable"
              );
              return undefined;
            })
        : undefined;

      const structuralContext: CodeContextStructuralContext = {
        status: ast.status,
        parsedDocumentCount: ast.summary.parsedDocumentCount,
        symbolCount: ast.summary.symbolCount,
        diagnosticCount: ast.summary.diagnosticCount,
        symbols: ast.documents
          .flatMap((document) => document.symbols)
          .slice(0, 40)
          .map((symbol) => ({
            path: symbol.path,
            name: symbol.name,
            kind: symbol.kind,
            startLine: symbol.range.startPosition.row + 1,
            endLine: Math.max(
              symbol.range.startPosition.row + 1,
              symbol.range.endPosition.row + 1
            ),
            ...(symbol.detail ? { detail: symbol.detail } : {}),
          })),
        diagnostics: ast.diagnostics.slice(0, 16).map((diagnostic) => ({
          path: diagnostic.path,
          code: diagnostic.code,
          message: diagnostic.message,
          severity: diagnostic.severity,
          ...(diagnostic.range
            ? {
                startLine: diagnostic.range.startPosition.row + 1,
                endLine: Math.max(
                  diagnostic.range.startPosition.row + 1,
                  diagnostic.range.endPosition.row + 1
                ),
              }
            : {}),
        })),
        semanticMatches:
          semantic?.matches.slice(0, 8).map((match) => ({
            path: match.chunk.path,
            kind: match.chunk.kind,
            startLine: match.chunk.startLine,
            endLine: match.chunk.endLine,
            score: match.scoreBreakdown.finalScore,
            symbolNames: match.chunk.symbolNames.slice(0, 8),
            reasons: match.scoreBreakdown.reasons.slice(0, 4),
          })) ?? [],
        notes: [
          ...notes,
          ...(semantic?.notes.slice(0, 6) ?? []),
        ],
      };
      if (cacheKey && this.cache && structuralContext.status !== "failed") {
        await this.cache
          .setJson(cacheKey, structuralContext, {
            ttlMs: this.structuralContextCacheTtlMs,
          })
          .catch(() => undefined);
      }
      return structuralContext;
    } catch (err) {
      return {
        status: "failed",
        parsedDocumentCount: 0,
        symbolCount: 0,
        diagnosticCount: 1,
        symbols: [],
        diagnostics: [
          {
            path: "<context>",
            code: "ast_context_unavailable",
            message:
              err instanceof Error
                ? err.message
                : "AST context unavailable for this retrieval.",
            severity: "warning",
          },
        ],
        semanticMatches: [],
        notes,
      };
    }
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

class JsonProjectManifestReader implements ProjectManifestReader {
  async read(projectRoot: string): Promise<HorusProjectManifest | null> {
    const manifestPath = join(projectRoot, "horus.project.json");
    const raw = await fs.readFile(manifestPath, "utf-8").catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    });
    if (raw === null) return null;
    return HorusProjectManifestSchema.parse(JSON.parse(raw));
  }
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function buildStructuralContextCacheKey(input: {
  scan: RepositoryScanSnapshot;
  retrieval: RepositoryRetrievalResult;
  query: string;
  requestedPaths?: readonly string[] | undefined;
}): string {
  const payload = JSON.stringify({
    projectRootPath: input.scan.projectRootPath,
    query: input.query,
    requestedPaths: [...(input.requestedPaths ?? [])].sort(),
    candidates: input.retrieval.candidates.map((candidate) => ({
      path: candidate.path,
      bytes: candidate.bytes,
      hash: sha256(candidate.content),
    })),
  });
  return `code-context:structural:v1:${sha256(payload)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
