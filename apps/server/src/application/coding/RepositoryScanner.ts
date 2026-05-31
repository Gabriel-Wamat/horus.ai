import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import {
  CodingRuntimeArtifactRefSchema,
  RepositoryScanSnapshotSchema,
  type RepositoryFileEntry,
  type RepositoryFileSafety,
  type RepositoryScanBudget,
  type RepositoryScanSnapshot,
} from "@u-build/shared";
import type {
  CodingRuntimeStepContext,
  CodingRuntimeStepResult,
  RepositoryScannerInput,
  RepositoryScannerPort,
} from "../ports/index.js";
import {
  inferRepositoryLanguage,
  isIgnoredRepositoryPath,
  isProbablyBinaryBuffer,
  isSensitiveRepositoryPath,
  isTextRepositoryFile,
  shouldIgnoreRepositoryPath,
  toRepositoryPath,
} from "./RepositoryAccessPolicy.js";

const DEFAULT_SCAN_BUDGET: RepositoryScanBudget = {
  maxFiles: 2_000,
  maxDepth: 16,
  maxBytesPerFile: 8_000,
};

export class RepositoryScanner implements RepositoryScannerPort {
  constructor(
    private readonly defaults: RepositoryScanBudget = DEFAULT_SCAN_BUDGET,
    private readonly now: () => Date = () => new Date(),
    private readonly idGenerator: () => string = randomUUID
  ) {}

  async scan(input: RepositoryScannerInput): Promise<RepositoryScanSnapshot> {
    throwIfAborted(input.signal);
    const budget = this.resolveBudget(input.budget);
    const root = await fs.realpath(input.projectRootPath);
    const files: RepositoryFileEntry[] = [];
    const notes: string[] = [];
    const selectedPaths = (input.selectedPaths ?? [])
      .map((path) => toRepositoryPath(path))
      .filter(Boolean);
    const counters = {
      totalEntries: 0,
      totalFiles: 0,
      ignoredEntries: 0,
      blockedFiles: 0,
      binaryFiles: 0,
      oversizedFiles: 0,
      partial: false,
    };

    if (selectedPaths.length > 0) {
      for (const selectedPath of selectedPaths) {
        await this.visitSelectedPath({
          root,
          requestedPath: selectedPath,
          files,
          notes,
          counters,
          budget,
          signal: input.signal,
        });
      }
    } else {
      await this.visitDirectory({
        root,
        directory: root,
        depth: 1,
        files,
        counters,
        budget,
        signal: input.signal,
      });
    }

    const snapshotInput = {
      ...(input.projectId ? { projectId: input.projectId } : {}),
      projectRootPath: root,
      selectedPaths,
      files: files.sort((left, right) => left.path.localeCompare(right.path)),
      stats: {
        totalEntries: counters.totalEntries,
        totalFiles: counters.totalFiles,
        indexedFiles: files.filter((file) => file.safety === "readable").length,
        ignoredEntries: counters.ignoredEntries,
        blockedFiles: counters.blockedFiles,
        binaryFiles: counters.binaryFiles,
        oversizedFiles: counters.oversizedFiles,
        partial: counters.partial,
      },
      notes: this.buildScanNotes(notes, counters),
      generatedAt: this.now().toISOString(),
    };
    return RepositoryScanSnapshotSchema.parse(snapshotInput);
  }

  async execute(context: CodingRuntimeStepContext): Promise<CodingRuntimeStepResult> {
    if (!context.task.projectRootPath) {
      throw new Error("Coding task cannot scan without projectRootPath.");
    }
    const snapshot = await this.scan({
      projectId: context.task.projectId,
      projectRootPath: context.task.projectRootPath,
      selectedPaths: context.task.selectedPaths,
      signal: context.signal,
    });
    return {
      message: `Repository scan completed with ${snapshot.stats.indexedFiles} readable files.`,
      artifact: CodingRuntimeArtifactRefSchema.parse({
        id: this.idGenerator(),
        kind: "scan",
        label: "Repository scan",
        status: snapshot.stats.indexedFiles > 0 ? "ready" : "skipped",
        createdAt: this.now().toISOString(),
        summary: `${snapshot.stats.indexedFiles}/${snapshot.stats.totalFiles} files readable.`,
        payload: snapshot,
      }),
      metadata: {
        totalFiles: snapshot.stats.totalFiles,
        indexedFiles: snapshot.stats.indexedFiles,
        partial: snapshot.stats.partial,
      },
    };
  }

  private resolveBudget(input: Partial<RepositoryScanBudget> = {}): RepositoryScanBudget {
    return {
      maxFiles: clampPositive(input.maxFiles ?? this.defaults.maxFiles, 1, 20_000),
      maxDepth: clampPositive(input.maxDepth ?? this.defaults.maxDepth, 1, 48),
      maxBytesPerFile: clampPositive(
        input.maxBytesPerFile ?? this.defaults.maxBytesPerFile,
        1,
        2_000_000
      ),
    };
  }

  private async visitSelectedPath(input: VisitSelectedInput): Promise<void> {
    throwIfAborted(input.signal);
    if (!input.requestedPath.trim()) return;
    const absolutePath = resolve(input.root, input.requestedPath);
    const canonical = await fs.realpath(absolutePath).catch(() => null);
    if (!canonical || !isInsideRoot(input.root, canonical)) {
      input.counters.blockedFiles += 1;
      input.notes.push(
        `Caminho bloqueado por escapar da raiz ou não existir: ${input.requestedPath}.`
      );
      return;
    }
    const relativePath = toRepositoryPath(relative(input.root, canonical));
    if (isIgnoredRepositoryPath(relativePath)) {
      input.counters.ignoredEntries += 1;
      input.notes.push(`Caminho ignorado por política: ${relativePath}.`);
      return;
    }
    if (isSensitiveRepositoryPath(relativePath)) {
      input.counters.blockedFiles += 1;
      input.notes.push(`Caminho sensível bloqueado: ${relativePath}.`);
      return;
    }
    const stat = await fs.lstat(canonical);
    input.counters.totalEntries += 1;
    if (stat.isDirectory()) {
      await this.visitDirectory({
        ...input,
        directory: canonical,
        depth: 1,
      });
      return;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      input.counters.ignoredEntries += 1;
      return;
    }
    await this.inspectFile({
      root: input.root,
      absolutePath: canonical,
      relativePath,
      stat,
      files: input.files,
      counters: input.counters,
      budget: input.budget,
      signal: input.signal,
    });
  }

  private async visitDirectory(input: VisitDirectoryInput): Promise<void> {
    throwIfAborted(input.signal);
    if (input.counters.partial) return;
    if (input.depth > input.budget.maxDepth) {
      input.counters.partial = true;
      return;
    }

    const entries = await fs
      .readdir(input.directory, { withFileTypes: true })
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT" || err.code === "EACCES") return [];
        throw err;
      });
    entries.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    for (const entry of entries) {
      throwIfAborted(input.signal);
      if (input.files.length >= input.budget.maxFiles) {
        input.counters.partial = true;
        return;
      }
      const absolutePath = join(input.directory, entry.name);
      const relativePath = toRepositoryPath(relative(input.root, absolutePath));
      input.counters.totalEntries += 1;

      if (isSensitiveRepositoryPath(relativePath)) {
        input.counters.blockedFiles += 1;
        continue;
      }
      if (shouldIgnoreRepositoryPath(relativePath, entry.name)) {
        input.counters.ignoredEntries += 1;
        continue;
      }

      const stat = await fs.lstat(absolutePath).catch((err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT" || err.code === "EACCES") return null;
        throw err;
      });
      if (!stat) {
        input.counters.ignoredEntries += 1;
        continue;
      }
      const canonical = await fs.realpath(absolutePath).catch(() => null);
      if (!canonical || !isInsideRoot(input.root, canonical) || stat.isSymbolicLink()) {
        input.counters.ignoredEntries += 1;
        continue;
      }
      if (stat.isDirectory()) {
        await this.visitDirectory({
          ...input,
          directory: canonical,
          depth: input.depth + 1,
        });
        continue;
      }
      if (!stat.isFile()) {
        input.counters.ignoredEntries += 1;
        continue;
      }
      await this.inspectFile({
        root: input.root,
        absolutePath: canonical,
        relativePath,
        stat,
        files: input.files,
        counters: input.counters,
        budget: input.budget,
        signal: input.signal,
      });
    }
  }

  private async inspectFile(input: InspectFileInput): Promise<void> {
    throwIfAborted(input.signal);
    input.counters.totalFiles += 1;
    const safety = await this.classifyFile(input);
    if (safety === "blocked") input.counters.blockedFiles += 1;
    if (safety === "binary") input.counters.binaryFiles += 1;
    if (safety === "too_large") input.counters.oversizedFiles += 1;
    if (safety === "ignored") input.counters.ignoredEntries += 1;

    input.files.push({
      path: input.relativePath,
      language: inferRepositoryLanguage(input.relativePath),
      sizeBytes: Number(input.stat.size),
      modifiedAt: input.stat.mtime.toISOString(),
      safety,
      ...(safety === "readable"
        ? {}
        : { reason: reasonForSafety(input.relativePath, safety) }),
    });
  }

  private async classifyFile(input: InspectFileInput): Promise<RepositoryFileSafety> {
    if (isSensitiveRepositoryPath(input.relativePath)) return "blocked";
    if (!isTextRepositoryFile(input.relativePath)) return "binary";
    if (input.stat.size > input.budget.maxBytesPerFile) return "too_large";
    const sample = await fs
      .readFile(input.absolutePath)
      .then((buffer) => buffer.subarray(0, Math.min(buffer.length, 1024)))
      .catch(() => Buffer.from([]));
    if (isProbablyBinaryBuffer(sample)) return "binary";
    return "readable";
  }

  private buildScanNotes(
    notes: readonly string[],
    counters: { partial: boolean; blockedFiles: number; ignoredEntries: number }
  ): string[] {
    const output = [...notes];
    if (counters.partial) {
      output.push("Varredura parcial por limite de profundidade ou quantidade de arquivos.");
    }
    if (counters.blockedFiles > 0) {
      output.push(`${counters.blockedFiles} arquivo(s) bloqueado(s) por política de segurança.`);
    }
    if (counters.ignoredEntries > 0) {
      output.push(`${counters.ignoredEntries} entrada(s) ignorada(s) por política de repositório.`);
    }
    return output.filter((note, index, values) => values.indexOf(note) === index);
  }
}

interface CounterBag {
  totalEntries: number;
  totalFiles: number;
  ignoredEntries: number;
  blockedFiles: number;
  binaryFiles: number;
  oversizedFiles: number;
  partial: boolean;
}

interface VisitSelectedInput {
  readonly root: string;
  readonly requestedPath: string;
  readonly files: RepositoryFileEntry[];
  readonly notes: string[];
  readonly counters: CounterBag;
  readonly budget: RepositoryScanBudget;
  readonly signal: AbortSignal | undefined;
}

interface VisitDirectoryInput {
  readonly root: string;
  readonly directory: string;
  readonly depth: number;
  readonly files: RepositoryFileEntry[];
  readonly counters: CounterBag;
  readonly budget: RepositoryScanBudget;
  readonly signal: AbortSignal | undefined;
}

interface InspectFileInput {
  readonly root: string;
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly stat: Awaited<ReturnType<typeof fs.stat>>;
  readonly files: RepositoryFileEntry[];
  readonly counters: CounterBag;
  readonly budget: RepositoryScanBudget;
  readonly signal: AbortSignal | undefined;
}

function clampPositive(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function isInsideRoot(root: string, target: string): boolean {
  const relation = relative(root, target);
  return relation === "" || (!relation.startsWith("..") && !relation.includes(`..${sep}`));
}

function reasonForSafety(path: string, safety: Exclude<RepositoryFileSafety, "readable">): string {
  switch (safety) {
    case "blocked":
      return `Arquivo bloqueado por política de segurança: ${path}.`;
    case "binary":
      return `Arquivo binário ou não textual: ${path}.`;
    case "ignored":
      return `Arquivo ignorado por política de repositório: ${path}.`;
    case "too_large":
      return `Arquivo maior que o orçamento de leitura: ${path}.`;
  }
  return `Arquivo não legível por política: ${path}.`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("Repository scan cancelled.");
    error.name = "AbortError";
    throw error;
  }
}
