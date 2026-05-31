import { createHash } from "node:crypto";
import {
  RepositoryIndexCleanupPlanSchema,
  RepositoryIndexInvalidationPlanSchema,
  RepositoryIndexManifestSchema,
  type AgentMemoryItem,
  type RepositoryIndexCleanupPlan,
  type RepositoryIndexInvalidationPlan,
  type RepositoryIndexManifest,
  type RepositoryScanSnapshot,
  type SemanticRetrievalResult,
} from "@u-build/shared";

export interface BuildRepositoryIndexManifestInput {
  readonly scan: RepositoryScanSnapshot;
  readonly semanticRetrieval?: SemanticRetrievalResult;
  readonly namespace?: string;
  readonly indexVersion: string;
}

export interface PlanRepositoryIndexCleanupInput {
  readonly namespace: string;
  readonly manifests?: readonly RepositoryIndexManifest[];
  readonly memories?: readonly AgentMemoryItem[];
  readonly maxManifestAgeMs?: number;
  readonly maxEphemeralMemoryAgeMs?: number;
}

export class RepositoryIndexLifecycleService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  buildManifest(input: BuildRepositoryIndexManifestInput): RepositoryIndexManifest {
    const generatedAt = this.now().toISOString();
    const namespace = input.namespace ?? namespaceForScan(input.scan);
    const files = input.scan.files
      .map((file) => ({
        path: file.path,
        sourceHash: sourceHash(file),
        sizeBytes: file.sizeBytes,
        modifiedAt: file.modifiedAt,
        safety: file.safety,
        ...(file.reason ? { reason: file.reason } : {}),
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const chunks = (input.semanticRetrieval?.matches ?? [])
      .map((match) => ({
        id: match.chunk.id,
        path: match.chunk.path,
        contentHash: match.chunk.contentHash,
        indexVersion: match.chunk.indexVersion,
        tokenEstimate: match.chunk.tokenEstimate,
        vectorId: match.chunk.id,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));

    return RepositoryIndexManifestSchema.parse({
      id: manifestId(namespace, input.indexVersion, files, chunks),
      namespace,
      ...(input.scan.projectId ? { projectId: input.scan.projectId } : {}),
      indexVersion: input.indexVersion,
      ...(input.semanticRetrieval?.summary.embeddingModel
        ? { embeddingModel: input.semanticRetrieval.summary.embeddingModel }
        : {}),
      ...(input.semanticRetrieval?.summary.dimensions
        ? { dimensions: input.semanticRetrieval.summary.dimensions }
        : {}),
      files,
      chunks,
      sourceFileCount: files.length,
      chunkCount: chunks.length,
      generatedAt,
    });
  }

  planInvalidation(input: {
    readonly previous: RepositoryIndexManifest;
    readonly current: RepositoryIndexManifest;
  }): RepositoryIndexInvalidationPlan {
    const entries = new Map<string, Set<string>>();
    const previousFiles = new Map(input.previous.files.map((file) => [file.path, file]));
    const currentFiles = new Map(input.current.files.map((file) => [file.path, file]));
    const previousChunksByPath = groupChunkIdsByPath(input.previous);
    const currentChunksById = new Map(input.current.chunks.map((chunk) => [chunk.id, chunk]));

    if (input.previous.indexVersion !== input.current.indexVersion) {
      for (const file of input.previous.files) {
        addReason(entries, file.path, "index_version_changed");
      }
    }

    for (const previousFile of input.previous.files) {
      const currentFile = currentFiles.get(previousFile.path);
      if (!currentFile) {
        addReason(entries, previousFile.path, "missing_file");
        continue;
      }
      if (previousFile.sourceHash !== currentFile.sourceHash) {
        addReason(entries, previousFile.path, "source_hash_changed");
      }
      if (previousFile.safety !== currentFile.safety) {
        addReason(entries, previousFile.path, "safety_changed");
      }
    }

    for (const previousChunk of input.previous.chunks) {
      const currentChunk = currentChunksById.get(previousChunk.id);
      if (currentChunk && currentChunk.contentHash !== previousChunk.contentHash) {
        addReason(entries, previousChunk.path, "chunk_hash_changed");
      }
    }

    const entryList = [...entries.entries()]
      .map(([path, reasons]) => ({
        path,
        reasons: [...reasons],
        ...(previousFiles.get(path)?.sourceHash
          ? { previousSourceHash: previousFiles.get(path)!.sourceHash }
          : {}),
        ...(currentFiles.get(path)?.sourceHash
          ? { currentSourceHash: currentFiles.get(path)!.sourceHash }
          : {}),
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const stalePaths = entryList.map((entry) => entry.path);
    const staleChunkIds = stalePaths.flatMap((path) => previousChunksByPath.get(path) ?? []);
    const rebuildRequired = entryList.some((entry) =>
      entry.reasons.includes("index_version_changed")
    );

    return RepositoryIndexInvalidationPlanSchema.parse({
      namespace: input.current.namespace,
      status:
        entryList.length === 0
          ? "fresh"
          : rebuildRequired
            ? "rebuild_required"
            : "stale",
      stalePaths,
      staleChunkIds,
      entries: entryList,
      generatedAt: this.now().toISOString(),
    });
  }

  planCleanup(input: PlanRepositoryIndexCleanupInput): RepositoryIndexCleanupPlan {
    const now = this.now();
    const manifestCutoff =
      typeof input.maxManifestAgeMs === "number"
        ? new Date(now.getTime() - input.maxManifestAgeMs)
        : null;
    const memoryCutoff =
      typeof input.maxEphemeralMemoryAgeMs === "number"
        ? new Date(now.getTime() - input.maxEphemeralMemoryAgeMs)
        : null;
    const cutoffAt = new Date(
      Math.min(
        manifestCutoff?.getTime() ?? now.getTime(),
        memoryCutoff?.getTime() ?? now.getTime()
      )
    ).toISOString();

    return RepositoryIndexCleanupPlanSchema.parse({
      namespace: input.namespace,
      cutoffAt,
      expiredManifestIds: (input.manifests ?? [])
        .filter((manifest) => Boolean(manifestCutoff && Date.parse(manifest.generatedAt) <= manifestCutoff.getTime()))
        .map((manifest) => manifest.id),
      expiredMemoryIds: (input.memories ?? [])
        .filter((memory) => isExpiredEphemeralMemory(memory, memoryCutoff, now))
        .map((memory) => memory.id),
      generatedAt: now.toISOString(),
    });
  }
}

function namespaceForScan(scan: RepositoryScanSnapshot): string {
  if (scan.projectId) return `project:${scan.projectId}`;
  const pathSignature = scan.files
    .map((file) => `${file.path}:${file.sizeBytes}:${file.modifiedAt}`)
    .sort()
    .join("|");
  return `repository-scan:${hash(pathSignature).slice(0, 24)}`;
}

function sourceHash(file: RepositoryScanSnapshot["files"][number]): string {
  return hash([file.path, file.sizeBytes, file.modifiedAt, file.safety].join("\0"));
}

function manifestId(
  namespace: string,
  indexVersion: string,
  files: readonly { readonly path: string; readonly sourceHash: string }[],
  chunks: readonly { readonly id: string; readonly contentHash: string }[]
): string {
  const signature = JSON.stringify({
    namespace,
    indexVersion,
    files: files.map((file) => [file.path, file.sourceHash]),
    chunks: chunks.map((chunk) => [chunk.id, chunk.contentHash]),
  });
  return `repository-index:${hash(signature).slice(0, 32)}`;
}

function groupChunkIdsByPath(
  manifest: RepositoryIndexManifest
): Map<string, string[]> {
  const output = new Map<string, string[]>();
  for (const chunk of manifest.chunks) {
    output.set(chunk.path, [...(output.get(chunk.path) ?? []), chunk.id]);
  }
  return output;
}

function addReason(entries: Map<string, Set<string>>, path: string, reason: string): void {
  entries.set(path, new Set([...(entries.get(path) ?? []), reason]));
}

function isExpiredEphemeralMemory(
  memory: AgentMemoryItem,
  cutoff: Date | null,
  now: Date
): boolean {
  if (!memory.scope.codingTaskId) return false;
  if (!memory.tags.includes("ephemeral")) return false;
  if (memory.staleAt && Date.parse(memory.staleAt) <= now.getTime()) return true;
  return Boolean(cutoff && Date.parse(memory.createdAt) <= cutoff.getTime());
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
