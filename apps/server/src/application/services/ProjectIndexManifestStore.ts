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
  readonly notes: readonly string[];
  readonly updatedAt: string;
}

export interface RecordSnapshotResultInput {
  readonly projectRootPath: string;
  readonly cacheKey: string;
  readonly cacheStatus: "hit" | "miss" | "bypass";
  readonly mtimeBucket: number;
  readonly fileCount: number | null;
  readonly stack: string | null;
  readonly notes?: readonly string[];
  readonly now?: () => Date;
}

const MANIFEST_DIRNAME = ".horus";
const MANIFEST_FILENAME = "index-manifest.json";

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
      if (parsed?.version !== 1) return null;
      return parsed;
    } catch {
      return null;
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
  await fs.mkdir(dirname(filePath), { recursive: true }).catch(() => undefined);
  const payload = `${JSON.stringify(record, null, 2)}\n`;
  await fs.writeFile(filePath, payload, "utf-8").catch(() => undefined);
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export const defaultProjectIndexManifestStore = new ProjectIndexManifestStore();
