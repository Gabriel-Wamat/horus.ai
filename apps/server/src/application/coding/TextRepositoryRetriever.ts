import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  CodingRuntimeArtifactRefSchema,
  RepositoryRetrievalResultSchema,
  RepositoryScanSnapshotSchema,
  type RepositoryRetrievalBudget,
  type RepositoryRetrievalCandidate,
  type RepositoryRetrievalExcerpt,
  type RepositoryRetrievalResult,
  type RepositoryScanSnapshot,
} from "@u-build/shared";
import type {
  CodingRuntimeStepContext,
  CodingRuntimeStepResult,
  TextRetrievalInput,
  TextRetrievalPort,
} from "../ports/index.js";
import {
  DEFAULT_REPOSITORY_PRIORITY_FILES,
  dedupe,
  detectRepositoryRoutingHints,
  extractRepositoryExplicitPaths,
  extractRepositorySearchTerms,
  mapWithRepositoryConcurrency,
  scoreRepositoryContent,
  scoreRepositoryPath,
  toRepositoryPath,
  buildRepositoryExcerpt,
} from "./RepositoryAccessPolicy.js";

const DEFAULT_RETRIEVAL_BUDGET: RepositoryRetrievalBudget = {
  maxFiles: 12,
  maxBytesPerFile: 8_000,
  maxTotalBytes: 32_000,
  maxContentScanFiles: 80,
  maxExcerpts: 5,
  concurrency: 4,
};

const MIN_MATCH_SCORE = 20;

export class TextRepositoryRetriever implements TextRetrievalPort {
  constructor(
    private readonly defaults: RepositoryRetrievalBudget = DEFAULT_RETRIEVAL_BUDGET,
    private readonly now: () => Date = () => new Date(),
    private readonly idGenerator: () => string = randomUUID
  ) {}

  async retrieve(input: TextRetrievalInput): Promise<RepositoryRetrievalResult> {
    throwIfAborted(input.signal);
    const budget = this.resolveBudget(input.budget);
    const terms = extractRepositorySearchTerms(input.query);
    const readableFiles = input.scan.files.filter(
      (file) => file.safety === "readable"
    );
    const fileByPath = new Map(readableFiles.map((file) => [file.path, file]));
    const allFileByPath = new Map(input.scan.files.map((file) => [file.path, file]));
    const explicitRequests = [
      ...(input.requestedPaths ?? []).map((path) => toRepositoryPath(path)),
      ...extractRepositoryExplicitPaths(input.query),
    ]
      .filter(Boolean)
      .filter(dedupe);
    const explicitPaths: string[] = [];
    const notes: string[] = [...input.scan.notes];
    let blockedPathCount = 0;

    for (const path of explicitRequests) {
      if (path.startsWith("..") || path.includes("/../")) {
        blockedPathCount += 1;
        notes.push(`Caminho explícito bloqueado por escapar da raiz: ${path}.`);
        continue;
      }
      const file = allFileByPath.get(path);
      if (!file) {
        blockedPathCount += 1;
        notes.push(`Caminho explícito não encontrado ou fora da política: ${path}.`);
        continue;
      }
      if (file.safety !== "readable") {
        blockedPathCount += 1;
        notes.push(`Caminho explícito não legível por política: ${path}.`);
        continue;
      }
      explicitPaths.push(path);
    }

    const pathScores = readableFiles
      .map((file) => ({
        path: file.path,
        score: scoreRepositoryPath(file.path, terms),
      }))
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
    const priorityFiles = DEFAULT_REPOSITORY_PRIORITY_FILES.filter((path) =>
      fileByPath.has(path)
    );
    const pathShortlist = [
      ...explicitPaths,
      ...pathScores.filter((item) => item.score > 0).map((item) => item.path),
      ...priorityFiles,
      ...pathScores.slice(0, Math.min(budget.maxFiles, pathScores.length)).map(
        (item) => item.path
      ),
    ]
      .filter(dedupe)
      .slice(0, budget.maxContentScanFiles);

    const contentScores = await mapWithRepositoryConcurrency(
      pathShortlist,
      budget.concurrency,
      async (path) => {
        throwIfAborted(input.signal);
        const content = await this.readSafeContent(input.scan, path, budget);
        return {
          path,
          content,
          score: scoreRepositoryPath(path, terms) + scoreRepositoryContent(content, terms),
        };
      }
    );
    const contentByPath = new Map(contentScores.map((item) => [item.path, item.content]));
    const scoreByPath = new Map(contentScores.map((item) => [item.path, item.score]));
    const ranked = pathShortlist
      .map((path) => ({
        path,
        score: scoreByPath.get(path) ?? scoreRepositoryPath(path, terms),
      }))
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
    const finalPaths = [
      ...explicitPaths,
      ...ranked.filter((item) => item.score > 0).map((item) => item.path),
      ...priorityFiles,
      ...ranked.slice(0, budget.maxFiles).map((item) => item.path),
    ].filter(dedupe);

    const candidates: RepositoryRetrievalCandidate[] = [];
    let totalBytes = 0;
    let omittedFilesCount = Math.max(0, readableFiles.length - pathShortlist.length);

    for (const path of finalPaths) {
      throwIfAborted(input.signal);
      if (candidates.length >= budget.maxFiles) {
        omittedFilesCount += 1;
        continue;
      }
      const file = fileByPath.get(path);
      if (!file) continue;
      const content =
        contentByPath.get(path) ?? (await this.readSafeContent(input.scan, path, budget));
      const bytes = Buffer.byteLength(content, "utf-8");
      if (totalBytes + bytes > budget.maxTotalBytes) {
        omittedFilesCount += 1;
        continue;
      }
      const matchedTerms = terms.filter((term) =>
        `${path}\n${content}`.toLowerCase().includes(term)
      );
      const excerpt =
        path === "horus.project.json"
          ? null
          : buildRepositoryExcerpt(path, content, terms, {
              minStrongScore: MIN_MATCH_SCORE,
            });
      const lineCount = Math.max(1, content.split("\n").length);
      candidates.push({
        path,
        language: file.language,
        bytes,
        content,
        startLine: 1,
        endLine: lineCount,
        score: scoreByPath.get(path) ?? scoreRepositoryPath(path, terms),
        matchedTerms,
        excerpts: excerpt ? [excerpt] : [],
      });
      totalBytes += bytes;
    }

    const excerpts = candidates
      .flatMap((candidate) => candidate.excerpts)
      .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))
      .slice(0, budget.maxExcerpts);
    const bestScore = excerpts[0]?.score ?? 0;
    const status =
      blockedPathCount > 0 &&
      explicitRequests.length > 0 &&
      explicitPaths.length === 0
        ? "blocked"
        : excerpts.length === 0
          ? "no_match"
          : bestScore >= MIN_MATCH_SCORE
            ? "matched"
            : "partial";

    const retrievalNotes = this.buildRetrievalNotes({
      notes,
      status,
      readableCount: readableFiles.length,
      scannedCount: pathShortlist.length,
      blockedPathCount,
    });
    const resultInput = {
      query: input.query,
      status,
      candidates,
      excerpts,
      omittedFilesCount,
      totalBytes,
      stats: {
        totalFiles: input.scan.stats.totalFiles,
        indexedFiles: readableFiles.length,
        contentScannedFiles: pathShortlist.length,
        explicitPathCount: explicitPaths.length,
        blockedPathCount,
      },
      notes: retrievalNotes,
      routingHints: detectRepositoryRoutingHints({
        query: input.query,
        paths: candidates.map((candidate) => candidate.path),
        projectRootPath: input.scan.projectRootPath,
      }),
    };
    return RepositoryRetrievalResultSchema.parse(resultInput);
  }

  async execute(context: CodingRuntimeStepContext): Promise<CodingRuntimeStepResult> {
    const scanArtifact = context.artifacts
      .filter((artifact) => artifact.kind === "scan")
      .at(-1);
    if (!scanArtifact?.payload) {
      throw new Error("Coding task cannot retrieve context without a scan artifact.");
    }
    const scan = RepositoryScanSnapshotSchema.parse(scanArtifact.payload);
    const result = await this.retrieve({
      scan,
      query: context.task.prompt,
      requestedPaths: context.task.selectedPaths,
      signal: context.signal,
    });
    return {
      message: `Repository retrieval finished with status ${result.status}.`,
      artifact: CodingRuntimeArtifactRefSchema.parse({
        id: this.idGenerator(),
        kind: "retrieval",
        label: "Code retrieval",
        status: result.status === "blocked" ? "failed" : "ready",
        createdAt: this.now().toISOString(),
        summary: `${result.candidates.length} candidate file(s), ${result.excerpts.length} excerpt(s).`,
        payload: result,
      }),
      metadata: {
        status: result.status,
        candidates: result.candidates.length,
        excerpts: result.excerpts.length,
        routingHints: result.routingHints,
      },
    };
  }

  private resolveBudget(
    input: Partial<RepositoryRetrievalBudget> = {}
  ): RepositoryRetrievalBudget {
    return {
      maxFiles: clampPositive(input.maxFiles ?? this.defaults.maxFiles, 1, 100),
      maxBytesPerFile: clampPositive(
        input.maxBytesPerFile ?? this.defaults.maxBytesPerFile,
        1,
        2_000_000
      ),
      maxTotalBytes: clampPositive(
        input.maxTotalBytes ?? this.defaults.maxTotalBytes,
        1,
        10_000_000
      ),
      maxContentScanFiles: clampPositive(
        input.maxContentScanFiles ?? this.defaults.maxContentScanFiles,
        1,
        10_000
      ),
      maxExcerpts: clampPositive(input.maxExcerpts ?? this.defaults.maxExcerpts, 1, 50),
      concurrency: clampPositive(input.concurrency ?? this.defaults.concurrency, 1, 32),
    };
  }

  private async readSafeContent(
    scan: RepositoryScanSnapshot,
    relativePath: string,
    budget: RepositoryRetrievalBudget
  ): Promise<string> {
    const absolutePath = resolve(scan.projectRootPath, relativePath);
    const relation = relative(scan.projectRootPath, absolutePath);
    if (
      relation.startsWith("..") ||
      relation.includes(`..${sep}`) ||
      relation === ""
    ) {
      if (relation !== "") return "";
    }
    const raw = await fs.readFile(absolutePath, "utf-8").catch(() => "");
    return raw.slice(0, budget.maxBytesPerFile);
  }

  private buildRetrievalNotes(input: {
    readonly notes: readonly string[];
    readonly status: RepositoryRetrievalResult["status"];
    readonly readableCount: number;
    readonly scannedCount: number;
    readonly blockedPathCount: number;
  }): string[] {
    const notes = [...input.notes];
    if (input.status === "blocked") {
      notes.unshift("A recuperação foi bloqueada por política de caminho ou segurança.");
    } else if (input.status === "no_match") {
      notes.unshift("Nenhum trecho de código compatível com a pergunta foi encontrado.");
    } else if (input.status === "partial") {
      notes.unshift("A busca encontrou apenas evidências fracas ou arquivos de fallback.");
    }
    if (input.scannedCount < input.readableCount) {
      notes.push(
        `Busca de conteúdo limitada a ${input.scannedCount}/${input.readableCount} arquivos por orçamento de retrieval.`
      );
    }
    if (input.blockedPathCount > 0) {
      notes.push(`${input.blockedPathCount} caminho(s) explícito(s) bloqueado(s).`);
    }
    return notes.filter((note, index, values) => values.indexOf(note) === index);
  }
}

function clampPositive(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Repository retrieval cancelled.");
  error.name = "AbortError";
  throw error;
}
