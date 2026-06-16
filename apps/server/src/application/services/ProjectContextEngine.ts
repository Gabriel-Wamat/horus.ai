import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type {
  AgentProfileId,
  CodeContextBundle,
  ProjectContextRunHistoryEntry,
  ProjectContextRuntimeHint,
  ProjectContextSnapshot,
  ProjectEditRestrictions,
  ProjectInspectionProfile,
  ValidationStrategy,
} from "@u-build/shared";
import { ProjectContextSnapshotSchema } from "@u-build/shared";
import type { KeyValueCachePort } from "../ports/KeyValueCachePort.js";
import { ProjectIndexManifestStore } from "./ProjectIndexManifestStore.js";
import type { ProjectIndexSnapshotSummary } from "./ProjectIndexManifestStore.js";
import { ProjectInspectionService } from "./ProjectInspectionService.js";
import { ReadOnlyCodeContextService } from "./ReadOnlyCodeContextService.js";
import { RuntimeEvidenceAggregator } from "./RuntimeEvidenceAggregator.js";
import { ValidationStrategyRegistry } from "./ValidationStrategyRegistry.js";
import { RepositoryScanner } from "../coding/RepositoryScanner.js";

// The Engine is the single canonical entry point for "give me the project
// context to feed an agent". It orchestrates inspection, code-context
// retrieval, and validation policy into one ProjectContextSnapshot, and
// forwards runtime/run history hints the caller already collected. Downstream
// role-based packagers (e.g. AgentContextProfileService) consume the snapshot
// and produce the AgentContextEnvelope for Front/QA/Curator/ODIN.
export interface BuildProjectContextSnapshotInput {
  readonly projectId?: string | undefined;
  readonly projectRootPath: string;
  readonly query: string;
  readonly agentProfileId?: AgentProfileId | undefined;
  readonly requestedPaths?: readonly string[] | undefined;
  readonly runtimeHints?: readonly ProjectContextRuntimeHint[] | undefined;
  readonly runHistory?: readonly ProjectContextRunHistoryEntry[] | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface ProjectContextEnginePorts {
  readonly inspector?: ProjectInspectionService | undefined;
  readonly codeContext?: ReadOnlyCodeContextService | undefined;
  readonly validationStrategy?: ValidationStrategyRegistry | undefined;
  readonly now?: (() => Date) | undefined;
  // Optional cache so consecutive turns within the same run reuse the
  // expensive inspection + retrieval work. Cache key includes mtimes of the
  // editable roots so file edits invalidate automatically.
  readonly cache?: KeyValueCachePort | undefined;
  readonly cacheTtlMs?: number | undefined;
  // Optional disk-persisted manifest under .horus/index-manifest.json so cache
  // hit/miss/invalidation stats survive across server restarts and operators
  // can see per-project index health on disk.
  readonly manifestStore?: ProjectIndexManifestStore | undefined;
  // Live runtime evidence buffer. When provided, the Engine automatically
  // drains hints recorded by preview adapters / validation runners between
  // turns so the agent sees fresh runtime errors without each caller having
  // to plumb them manually.
  readonly runtimeEvidence?: RuntimeEvidenceAggregator | undefined;
}

const DEFAULT_SNAPSHOT_CACHE_TTL_MS = 120_000;

// Conservative default protected globs that complement the inspector's
// protectedPaths set. Engine adds them so every consumer sees the same baseline
// even when the project's inspection profile under-reports.
const BASE_FORBIDDEN_WRITE_PATTERNS = [
  "**/.env",
  "**/.env.*",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.vite/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/pnpm-lock.yaml",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/bun.lockb",
  "**/AGENTS.md",
  "**/CLAUDE.md",
];

export class ProjectContextEngine {
  private readonly inspector: ProjectInspectionService;
  private readonly codeContext: ReadOnlyCodeContextService;
  private readonly validationStrategy: ValidationStrategyRegistry;
  private readonly now: () => Date;
  private readonly cache: KeyValueCachePort | undefined;
  private readonly cacheTtlMs: number;
  private readonly manifestStore: ProjectIndexManifestStore | undefined;
  private readonly runtimeEvidence: RuntimeEvidenceAggregator | undefined;

  constructor(ports: ProjectContextEnginePorts = {}) {
    this.inspector =
      ports.inspector ?? new ProjectInspectionService(new RepositoryScanner());
    this.codeContext = ports.codeContext ?? new ReadOnlyCodeContextService();
    this.validationStrategy =
      ports.validationStrategy ?? new ValidationStrategyRegistry();
    this.now = ports.now ?? (() => new Date());
    this.cache = ports.cache;
    this.cacheTtlMs = ports.cacheTtlMs ?? DEFAULT_SNAPSHOT_CACHE_TTL_MS;
    this.manifestStore = ports.manifestStore;
    this.runtimeEvidence = ports.runtimeEvidence;
  }

  async buildSnapshot(
    input: BuildProjectContextSnapshotInput
  ): Promise<ProjectContextSnapshot> {
    throwIfAborted(input.signal);
    const projectRootPath = await fs.realpath(input.projectRootPath);
    const notes: string[] = [];

    const inspection = await this.inspector.inspect({
      projectRootPath,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });

    // Compute cache key after inspection so we know which roots are editable.
    // mtime bucket = max mtime across editable-root files (cheap, deterministic
    // and forces invalidation as soon as an agent edits anything in scope).
    const needsCacheKey = Boolean(this.cache) || Boolean(this.manifestStore);
    const mtimeBucket = needsCacheKey
      ? await maxEditableRootMtime(projectRootPath, inspection.roots.editableRoots)
      : 0;
    const cacheKey = needsCacheKey
      ? buildCacheKey({
          projectRootPath,
          query: input.query,
          requestedPaths: input.requestedPaths,
          agentProfileId: input.agentProfileId,
          mtimeBucket,
        })
      : undefined;

    if (cacheKey && this.cache) {
      const cached = await this.cache
        .getJson<ProjectContextSnapshot>(cacheKey)
        .catch(() => null);
      if (cached) {
        // Forward fresh hints/history from the caller even on cache hit — the
        // structural part is stable across the TTL, but per-turn signals must
        // not be stale.
        const refreshed: ProjectContextSnapshot = {
          ...cached,
          ...(input.agentProfileId ? { agentProfileId: input.agentProfileId } : {}),
          runtimeHints: [...(input.runtimeHints ?? cached.runtimeHints)],
          runHistory: [...(input.runHistory ?? cached.runHistory)],
          notes: dedupe([...cached.notes, "engine_cache_hit:snapshot"]),
        };
        const manifestFailureNote = await this.recordManifest({
          projectRootPath,
          cacheKey,
          cacheStatus: "hit",
          mtimeBucket,
          fileCount: cached.codeContext.files.length,
          stack: cached.inspection.framework.name,
          repositoryIndex: await buildProjectIndexSummary({
            projectRootPath,
            inspection: cached.inspection,
            codeContext: cached.codeContext,
            checkedAt: this.now().toISOString(),
          }),
        });
        return ProjectContextSnapshotSchema.parse({
          ...refreshed,
          notes: manifestFailureNote
            ? dedupe([...refreshed.notes, manifestFailureNote])
            : refreshed.notes,
        });
      }
    }

    const codeContext = await this.codeContext.buildContextFromProjectRoot({
      projectId: input.projectId ?? inspection.projectId ?? projectRootPath,
      projectRootPath,
      query: input.query,
      ...(input.requestedPaths
        ? { requestedPaths: [...input.requestedPaths] }
        : {}),
    });

    const strategy = this.validationStrategy.resolve(inspection);
    if (strategy.stack === "unknown") {
      notes.push(
        "Validation strategy: stack unknown, falling back to project script catalog."
      );
    }

    const editRestrictions = buildEditRestrictions(inspection, codeContext);

    // Merge live runtime evidence the aggregator collected since the last
    // snapshot. Caller-supplied hints take precedence — they reflect what the
    // workflow node already decided to surface this turn — but live hints
    // (preview/console/network errors) are appended so nothing is lost.
    const liveHints =
      input.projectId && this.runtimeEvidence
        ? this.runtimeEvidence.consume(input.projectId)
        : [];
    const mergedHints = mergeRuntimeHints([
      ...(input.runtimeHints ?? []),
      ...liveHints,
    ]);

    const snapshot: ProjectContextSnapshot = {
      ...(input.projectId ? { projectId: input.projectId } : {}),
      projectRootPath,
      ...(input.agentProfileId ? { agentProfileId: input.agentProfileId } : {}),
      ...(input.query ? { query: input.query } : {}),
      inspection,
      codeContext,
      validationStrategy: strategy,
      editRestrictions,
      runtimeHints: mergedHints,
      runHistory: [...(input.runHistory ?? [])],
      notes: dedupe([
        ...notes,
        ...(codeContext.retrievalNotes ?? []),
        ...(strategy.notes ?? []),
      ]),
      generatedAt: this.now().toISOString(),
    };

    const parsed = ProjectContextSnapshotSchema.parse(snapshot);
    if (cacheKey && this.cache) {
      await this.cache
        .setJson(cacheKey, parsed, { ttlMs: this.cacheTtlMs })
        .catch(() => undefined);
    }
    const manifestFailureNote = await this.recordManifest({
      projectRootPath,
      cacheKey: cacheKey ?? "<no-cache>",
      cacheStatus: this.cache ? "miss" : "bypass",
      mtimeBucket,
      fileCount: parsed.codeContext.files.length,
      stack: parsed.inspection.framework.name,
      repositoryIndex: await buildProjectIndexSummary({
        projectRootPath,
        inspection: parsed.inspection,
        codeContext: parsed.codeContext,
        checkedAt: parsed.generatedAt,
      }),
    });
    if (!manifestFailureNote) return parsed;
    return ProjectContextSnapshotSchema.parse({
      ...parsed,
      notes: dedupe([...parsed.notes, manifestFailureNote]),
    });
  }

  private async recordManifest(input: {
    projectRootPath: string;
    cacheKey: string;
    cacheStatus: "hit" | "miss" | "bypass";
    mtimeBucket: number;
    fileCount: number | null;
    stack: string | null;
    repositoryIndex?: ProjectIndexSnapshotSummary | undefined;
  }): Promise<string | null> {
    if (!this.manifestStore) return null;
    try {
      await this.manifestStore.recordSnapshotResult(input);
      return null;
    } catch (err) {
      return `index_manifest_persist_failed:${errorMessage(err)}`;
    }
  }
}

async function buildProjectIndexSummary(input: {
  projectRootPath: string;
  inspection: ProjectInspectionProfile;
  codeContext: CodeContextBundle;
  checkedAt: string;
}): Promise<ProjectIndexSnapshotSummary> {
  const files = await Promise.all(
    input.inspection.editableFiles.map(async (file) => {
      const contentHash = await hashProjectFile(input.projectRootPath, file.path);
      return {
        path: file.path,
        contentHash,
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
        language: file.language,
      };
    })
  );
  const structural = input.codeContext.structuralContext;
  const symbols = structural?.symbols ?? [];
  const importCount = symbols.filter((symbol) => symbol.kind === "import").length;
  const exportCount = symbols.filter((symbol) => symbol.kind === "export").length;
  const semanticChunks = structural?.semanticMatches ?? [];
  const chunks = mergeIndexChunks([
    ...symbols.map((symbol) => ({
      path: symbol.path,
      kind: symbol.kind,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      symbolNames: [symbol.name],
    })),
    ...semanticChunks.map((chunk) => ({
      path: chunk.path,
      kind: chunk.kind,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      symbolNames: chunk.symbolNames,
    })),
  ]);
  const contentSignature = sha256(
    JSON.stringify({
      files: files.map((file) => [file.path, file.contentHash]),
      chunks: chunks.map((chunk) => [
        chunk.path,
        chunk.kind,
        chunk.startLine,
        chunk.endLine,
        chunk.symbolNames,
      ]),
    })
  );
  const merkleRoot = merkleHash(
    files.map((file) => sha256(`${file.path}\0${file.contentHash}`))
  );
  return {
    files,
    ignorePolicy: {
      gitignoreApplied: await fileExists(input.projectRootPath, ".gitignore"),
      horusignoreApplied: await fileExists(input.projectRootPath, ".horusignore"),
      ignoredEntries: input.inspection.stats.ignoredEntries,
      blockedFiles: input.inspection.stats.blockedFiles,
      binaryFiles: input.inspection.stats.binaryFiles,
      oversizedFiles: input.inspection.stats.oversizedFiles,
    },
    ast: {
      status: structural?.status ?? "unavailable",
      parsedDocumentCount: structural?.parsedDocumentCount ?? 0,
      symbolCount: structural?.symbolCount ?? 0,
      diagnosticCount: structural?.diagnosticCount ?? 0,
      importCount,
    },
    chunks: chunks.map((chunk) => ({
      path: chunk.path,
      kind: chunk.kind,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      symbolNames: chunk.symbolNames,
    })),
    embeddings: {
      enabled: semanticChunks.length > 0,
      embeddedChunkCount: semanticChunks.length,
    },
    graph: {
      status: structural
        ? structural.status === "failed"
          ? "failed"
          : "partial"
        : "unavailable",
      nodeCount: new Set([
        ...files.map((file) => `file:${file.path}`),
        ...symbols.map((symbol) => `symbol:${symbol.path}:${symbol.name}`),
      ]).size,
      edgeCount: importCount + exportCount,
      importCount,
      exportCount,
    },
    freshness: {
      status: "fresh",
      contentSignature,
      merkleRoot,
      checkedAt: input.checkedAt,
    },
    retrievalFusion: [
      "explicit_paths",
      "runtime_errors",
      "git_diff",
      "lexical_bm25",
      "ast_symbols",
      "graph_neighbors",
      "semantic_embeddings",
      "reranker",
      "budget_packer",
    ],
  };
}

async function hashProjectFile(projectRootPath: string, relativePath: string): Promise<string> {
  const raw = await fs.readFile(join(projectRootPath, relativePath)).catch(() => null);
  if (!raw) return sha256(`${relativePath}:unreadable`);
  return sha256(raw);
}

async function fileExists(projectRootPath: string, relativePath: string): Promise<boolean> {
  return fs
    .access(join(projectRootPath, relativePath))
    .then(() => true)
    .catch(() => false);
}

function buildCacheKey(input: {
  projectRootPath: string;
  query: string;
  requestedPaths: readonly string[] | undefined;
  agentProfileId: AgentProfileId | undefined;
  mtimeBucket: number;
}): string {
  const payload = JSON.stringify({
    v: 1,
    projectRootPath: input.projectRootPath,
    query: input.query,
    requestedPaths: [...(input.requestedPaths ?? [])].sort(),
    agentProfileId: input.agentProfileId ?? null,
    mtimeBucket: input.mtimeBucket,
  });
  return `project-context:snapshot:${sha256(payload)}`;
}

const MAX_MTIME_SCAN_PER_ROOT = 500;
const MAX_MTIME_SCAN_DEPTH = 8;
const MTIME_SCAN_IGNORED_NAMES = new Set([
  ".git",
  ".horus",
  ".next",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

async function maxEditableRootMtime(
  projectRootPath: string,
  editableRoots: readonly string[]
): Promise<number> {
  const roots = editableRoots.length > 0 ? editableRoots : ["."];
  let max = 0;
  for (const root of roots) {
    try {
      const absolute = join(projectRootPath, root);
      max = Math.max(max, await maxMtimeUnderPath(absolute));
    } catch {
      // Best-effort cache key — never block snapshot build on stat failures.
    }
  }
  return Math.floor(max / 1000) * 1000; // Bucket to 1s to avoid micro-churn.
}

async function maxMtimeUnderPath(rootPath: string): Promise<number> {
  let max = 0;
  let scanned = 0;
  const pending: Array<{ path: string; depth: number }> = [
    { path: rootPath, depth: 0 },
  ];
  while (pending.length > 0 && scanned < MAX_MTIME_SCAN_PER_ROOT) {
    const current = pending.shift()!;
    const stat = await fs.stat(current.path).catch(() => null);
    if (!stat) continue;
    max = Math.max(max, stat.mtimeMs);
    scanned += 1;
    if (!stat.isDirectory() || current.depth >= MAX_MTIME_SCAN_DEPTH) continue;
    const entries = await fs
      .readdir(current.path, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      if (shouldSkipMtimeEntry(entry.name)) continue;
      pending.push({
        path: join(current.path, entry.name),
        depth: current.depth + 1,
      });
    }
  }
  return max;
}

function shouldSkipMtimeEntry(name: string): boolean {
  return MTIME_SCAN_IGNORED_NAMES.has(name);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "unknown error";
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function mergeIndexChunks(
  chunks: readonly {
    readonly path: string;
    readonly kind: string;
    readonly startLine: number;
    readonly endLine: number;
    readonly symbolNames: readonly string[];
  }[]
): {
  path: string;
  kind: string;
  startLine: number;
  endLine: number;
  symbolNames: string[];
}[] {
  const byIdentity = new Map<
    string,
    {
      path: string;
      kind: string;
      startLine: number;
      endLine: number;
      symbolNames: string[];
    }
  >();
  for (const chunk of chunks) {
    const key = `${chunk.path}\0${chunk.kind}\0${chunk.startLine}\0${chunk.endLine}`;
    const existing = byIdentity.get(key);
    byIdentity.set(key, {
      path: chunk.path,
      kind: chunk.kind,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      symbolNames: [
        ...new Set([...(existing?.symbolNames ?? []), ...chunk.symbolNames]),
      ],
    });
  }
  return [...byIdentity.values()].sort((left, right) =>
    `${left.path}:${left.startLine}:${left.kind}`.localeCompare(
      `${right.path}:${right.startLine}:${right.kind}`
    )
  );
}

function merkleHash(leaves: readonly string[]): string {
  if (leaves.length === 0) return sha256("empty");
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index]!;
      const right = level[index + 1] ?? left;
      next.push(sha256(`${left}\0${right}`));
    }
    level = next;
  }
  return level[0]!;
}

function mergeRuntimeHints(
  hints: readonly ProjectContextRuntimeHint[]
): ProjectContextRuntimeHint[] {
  const seen = new Set<string>();
  const out: ProjectContextRuntimeHint[] = [];
  for (const hint of hints) {
    const key = `${hint.kind}|${hint.source}|${hint.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hint);
    if (out.length >= 24) break;
  }
  return out;
}

function buildEditRestrictions(
  inspection: ProjectInspectionProfile,
  _codeContext: CodeContextBundle
): ProjectEditRestrictions {
  return {
    protectedPaths: inspection.protectedPaths.map((entry) => entry.path),
    unsafePaths: inspection.unsafePaths.map((entry) => entry.path),
    editableRoots: inspection.roots.editableRoots,
    forbiddenWritePatterns: [...BASE_FORBIDDEN_WRITE_PATTERNS],
  };
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("ProjectContextEngine.buildSnapshot cancelled.");
  error.name = "AbortError";
  throw error;
}

export const defaultProjectContextEngine = new ProjectContextEngine();

// Convenience helper: derive ValidationStrategy alone (without code retrieval).
// Useful for places that already inspected the project and just need the
// declarative policy.
export function resolveValidationStrategy(
  inspection: ProjectInspectionProfile,
  registry: ValidationStrategyRegistry = new ValidationStrategyRegistry()
): ValidationStrategy {
  return registry.resolve(inspection);
}
