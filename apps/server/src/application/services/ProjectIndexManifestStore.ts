import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

// Persists a lightweight per-project manifest under .horus/index-manifest.json
// so cache reuse survives server restarts and gives operators visibility into
// snapshot hit/miss rates per project. Distinct from the in-memory KV cache:
// the KV cache stores the snapshot payload, this store stores metadata about
// the index itself.
//
// Format is intentionally small and JSON-stable so it can be diffed and
// committed by the project owner when convenient.

export interface ProjectIndexManifestRecord {
  readonly version: 1;
  readonly projectRootPath: string;
  readonly lastCacheKey: string | null;
  readonly lastSnapshotAt: string | null;
  readonly mtimeBucket: number | null;
  readonly hits: number;
  readonly misses: number;
  readonly invalidations: number;
  readonly fileCount: number | null;
  readonly stack: string | null;
  readonly repositoryIndex?: ProjectIndexSnapshotSummary | undefined;
  readonly notes: readonly string[];
  readonly updatedAt: string;
}

export interface ProjectIndexSnapshotSummary {
  readonly files: readonly {
    readonly path: string;
    readonly contentHash: string;
    readonly sizeBytes: number;
    readonly modifiedAt: string;
    readonly language?: string | undefined;
  }[];
  readonly ignorePolicy: {
    readonly gitignoreApplied: boolean;
    readonly horusignoreApplied: boolean;
    readonly ignoredEntries: number;
    readonly blockedFiles: number;
    readonly binaryFiles: number;
    readonly oversizedFiles: number;
  };
  readonly ast: {
    readonly status: "complete" | "partial" | "failed" | "unavailable";
    readonly parsedDocumentCount: number;
    readonly symbolCount: number;
    readonly diagnosticCount: number;
    readonly importCount: number;
  };
  readonly chunks: readonly {
    readonly path: string;
    readonly kind: string;
    readonly startLine: number;
    readonly endLine: number;
    readonly symbolNames: readonly string[];
  }[];
  readonly embeddings: {
    readonly enabled: boolean;
    readonly provider?: string | undefined;
    readonly model?: string | undefined;
    readonly embeddedChunkCount: number;
  };
  readonly graph: {
    readonly status: "complete" | "partial" | "failed" | "unavailable";
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly importCount: number;
    readonly exportCount: number;
  };
  readonly freshness: {
    readonly status: "fresh" | "stale" | "rebuild_required";
    readonly contentSignature: string;
    readonly merkleRoot?: string | undefined;
    readonly checkedAt: string;
  };
  readonly retrievalFusion: readonly string[];
}

export interface RecordSnapshotResultInput {
  readonly projectRootPath: string;
  readonly cacheKey: string;
  readonly cacheStatus: "hit" | "miss" | "bypass";
  readonly mtimeBucket: number;
  readonly fileCount: number | null;
  readonly stack: string | null;
  readonly repositoryIndex?: ProjectIndexSnapshotSummary | undefined;
  readonly notes?: readonly string[];
  readonly now?: () => Date;
}

const MANIFEST_DIRNAME = ".horus";
const MANIFEST_FILENAME = "index-manifest.json";

export class ProjectIndexManifestReadError extends Error {
  constructor(
    readonly filePath: string,
    message: string,
    readonly originalCause?: unknown
  ) {
    super(`Failed to read project index manifest ${filePath}: ${message}`);
    this.name = "ProjectIndexManifestReadError";
  }
}

export class ProjectIndexManifestWriteError extends Error {
  constructor(
    readonly filePath: string,
    message: string,
    readonly originalCause?: unknown
  ) {
    super(`Failed to write project index manifest ${filePath}: ${message}`);
    this.name = "ProjectIndexManifestWriteError";
  }
}

export class ProjectIndexManifestStore {
  async read(projectRootPath: string): Promise<ProjectIndexManifestRecord | null> {
    const filePath = manifestPath(projectRootPath);
    const raw = await fs.readFile(filePath, "utf-8").catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as ProjectIndexManifestRecord;
      if (parsed?.version !== 1) {
        throw new ProjectIndexManifestReadError(
          filePath,
          "unsupported manifest version"
        );
      }
      return parsed;
    } catch (err) {
      if (err instanceof ProjectIndexManifestReadError) throw err;
      throw new ProjectIndexManifestReadError(filePath, toErrorMessage(err), err);
    }
  }

  async recordSnapshotResult(
    input: RecordSnapshotResultInput
  ): Promise<ProjectIndexManifestRecord> {
    const previous = await this.read(input.projectRootPath);
    const now = input.now ?? (() => new Date());
    const previousMtime = previous?.mtimeBucket ?? null;
    const isInvalidation =
      previousMtime !== null && previousMtime !== input.mtimeBucket;
    const record: ProjectIndexManifestRecord = {
      version: 1,
      projectRootPath: input.projectRootPath,
      lastCacheKey: input.cacheKey,
      lastSnapshotAt: now().toISOString(),
      mtimeBucket: input.mtimeBucket,
      hits: (previous?.hits ?? 0) + (input.cacheStatus === "hit" ? 1 : 0),
      misses: (previous?.misses ?? 0) + (input.cacheStatus === "miss" ? 1 : 0),
      invalidations: (previous?.invalidations ?? 0) + (isInvalidation ? 1 : 0),
      fileCount: input.fileCount,
      stack: input.stack,
      ...(input.repositoryIndex ? { repositoryIndex: input.repositoryIndex } : {}),
      notes: dedupe([...(previous?.notes ?? []), ...(input.notes ?? [])]).slice(-20),
      updatedAt: now().toISOString(),
    };
    await writeManifest(input.projectRootPath, record);
    return record;
  }
}

function manifestPath(projectRootPath: string): string {
  return join(projectRootPath, MANIFEST_DIRNAME, MANIFEST_FILENAME);
}

async function writeManifest(
  projectRootPath: string,
  record: ProjectIndexManifestRecord
): Promise<void> {
  const filePath = manifestPath(projectRootPath);
  const payload = `${JSON.stringify(record, null, 2)}\n`;
  try {
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, payload, "utf-8");
  } catch (err) {
    throw new ProjectIndexManifestWriteError(filePath, toErrorMessage(err), err);
  }
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "unknown error";
  }
}

export const defaultProjectIndexManifestStore = new ProjectIndexManifestStore();
