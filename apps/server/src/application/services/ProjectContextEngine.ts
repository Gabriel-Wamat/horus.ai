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
        await this.recordManifest({
          projectRootPath,
          cacheKey,
          cacheStatus: "hit",
          mtimeBucket,
          fileCount: cached.codeContext.files.length,
          stack: cached.inspection.framework.name,
        });
        return ProjectContextSnapshotSchema.parse(refreshed);
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
    await this.recordManifest({
      projectRootPath,
      cacheKey: cacheKey ?? "<no-cache>",
      cacheStatus: this.cache ? "miss" : "bypass",
      mtimeBucket,
      fileCount: parsed.codeContext.files.length,
      stack: parsed.inspection.framework.name,
    });
    return parsed;
  }

  private async recordManifest(input: {
    projectRootPath: string;
    cacheKey: string;
    cacheStatus: "hit" | "miss" | "bypass";
    mtimeBucket: number;
    fileCount: number | null;
    stack: string | null;
  }): Promise<void> {
    if (!this.manifestStore) return;
    await this.manifestStore
      .recordSnapshotResult(input)
      .catch(() => undefined);
  }
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

const MAX_MTIME_SCAN_PER_ROOT = 200;

async function maxEditableRootMtime(
  projectRootPath: string,
  editableRoots: readonly string[]
): Promise<number> {
  const roots = editableRoots.length > 0 ? editableRoots : ["."];
  let max = 0;
  for (const root of roots) {
    try {
      const absolute = join(projectRootPath, root);
      const stat = await fs.stat(absolute).catch(() => null);
      if (!stat) continue;
      if (stat.isFile()) {
        max = Math.max(max, stat.mtimeMs);
        continue;
      }
      // Walk shallow children — full tree walks are too expensive per turn.
      const entries = await fs
        .readdir(absolute, { withFileTypes: true })
        .catch(() => []);
      let scanned = 0;
      for (const entry of entries) {
        if (scanned >= MAX_MTIME_SCAN_PER_ROOT) break;
        if (entry.name.startsWith(".")) continue;
        if (entry.name === "node_modules") continue;
        const entryPath = join(absolute, entry.name);
        const entryStat = await fs.stat(entryPath).catch(() => null);
        if (!entryStat) continue;
        max = Math.max(max, entryStat.mtimeMs);
        scanned += 1;
      }
    } catch {
      // Best-effort cache key — never block snapshot build on stat failures.
    }
  }
  return Math.floor(max / 1000) * 1000; // Bucket to 1s to avoid micro-churn.
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
