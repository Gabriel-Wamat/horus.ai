import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { relative, resolve, sep } from "node:path";
import {
  SemanticRetrievalResultSchema,
  type RepositoryRetrievalCandidate,
  type SemanticRetrievalResult,
} from "@u-build/shared";
import type {
  EmbeddingProvider,
  SemanticRepositoryRetrievalPort,
  SemanticRetrievalInput,
  VectorStore,
  VectorStoreDocument,
} from "../ports/index.js";
import { RepositoryChunker, DEFAULT_SEMANTIC_INDEX_VERSION } from "./RepositoryChunker.js";
import { HybridRetrievalRanker } from "./HybridRetrievalRanker.js";
import { dedupe } from "./RepositoryAccessPolicy.js";

const DEFAULT_MAX_SOURCE_FILES = 80;
const DEFAULT_MAX_BYTES_PER_FILE = 8_000;
const DEFAULT_MAX_CHUNKS = 240;
const DEFAULT_TOP_K = 12;

export class SemanticRepositoryIndexer implements SemanticRepositoryRetrievalPort {
  constructor(
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly vectorStore: VectorStore,
    private readonly chunker = new RepositoryChunker(),
    private readonly ranker = new HybridRetrievalRanker(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async retrieve(input: SemanticRetrievalInput): Promise<SemanticRetrievalResult> {
    throwIfAborted(input.signal);
    const namespace = input.namespace ?? repositoryNamespace(input.scan.projectRootPath);
    const budget = {
      maxSourceFiles: clampPositive(
        input.budget?.maxSourceFiles ?? DEFAULT_MAX_SOURCE_FILES,
        1,
        1_000
      ),
      maxBytesPerFile: clampPositive(
        input.budget?.maxBytesPerFile ?? DEFAULT_MAX_BYTES_PER_FILE,
        1,
        2_000_000
      ),
      maxChunks: clampPositive(input.budget?.maxChunks ?? DEFAULT_MAX_CHUNKS, 1, 5_000),
      topK: clampPositive(input.budget?.topK ?? DEFAULT_TOP_K, 1, 100),
    };

    try {
      const sourceCandidates = await this.buildSourceCandidates(input, budget);
      const chunks = this.chunker
        .chunk({
          candidates: sourceCandidates,
          options: {
            indexVersion: DEFAULT_SEMANTIC_INDEX_VERSION,
          },
          ...(input.ast ? { ast: input.ast } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        })
        .slice(0, budget.maxChunks);

      if (chunks.length === 0) {
        return SemanticRetrievalResultSchema.parse({
          query: input.query,
          namespace,
          status: "no_match",
          indexVersion: DEFAULT_SEMANTIC_INDEX_VERSION,
          matches: [],
          summary: {
            chunkCount: 0,
            embeddedChunkCount: 0,
            matchedChunkCount: 0,
            omittedChunkCount: 0,
          },
          notes: ["No repository chunks were available for semantic retrieval."],
          generatedAt: this.now().toISOString(),
        });
      }

      const embeddings = await this.embeddingProvider.embedBatch({
        inputs: chunks.map((chunk) => ({
          text: chunk.content,
          purpose: "search" as const,
          metadata: {
            path: chunk.path,
            chunkId: chunk.id,
            contentHash: chunk.contentHash,
            indexVersion: chunk.indexVersion,
          },
        })),
        ...(input.signal ? { signal: input.signal } : {}),
      });
      const documents: VectorStoreDocument[] = chunks.map((chunk, index) => ({
        id: chunk.id,
        vector: embeddings[index]?.values ?? [],
        text: chunk.content,
        metadata: {
          path: chunk.path,
          language: chunk.language,
          chunkKind: chunk.kind,
          contentHash: chunk.contentHash,
          indexVersion: chunk.indexVersion,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          symbolNames: chunk.symbolNames,
        },
      }));
      await this.vectorStore.upsert({
        namespace,
        documents,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      const queryEmbedding = await this.embeddingProvider.embedText({
        text: input.query,
        purpose: "search",
        metadata: {
          namespace,
          indexVersion: DEFAULT_SEMANTIC_INDEX_VERSION,
        },
        ...(input.signal ? { signal: input.signal } : {}),
      });
      const vectorMatches = await this.vectorStore.query({
        namespace,
        vector: queryEmbedding.values,
        topK: Math.min(chunks.length, budget.topK * 3),
        filter: { indexVersion: DEFAULT_SEMANTIC_INDEX_VERSION },
        ...(input.signal ? { signal: input.signal } : {}),
      });
      const sourceByPath = new Map(
        sourceCandidates.map((candidate) => [candidate.path, candidate])
      );
      const matches = this.ranker.rank({
        query: input.query,
        chunks,
        vectorMatches,
        lexicalRetrieval: input.lexicalRetrieval,
        topK: budget.topK,
        ...(input.requestedPaths ? { requestedPaths: input.requestedPaths } : {}),
        ...(input.graph ? { graph: input.graph } : {}),
      }).map((match) => ({
        ...match,
        ...(sourceByPath.get(match.chunk.path)
          ? { candidate: sourceByPath.get(match.chunk.path)! }
          : {}),
      }));
      const model = embeddings.find((item) => item.model)?.model ?? queryEmbedding.model;
      const dimensions =
        embeddings.find((item) => item.dimensions)?.dimensions ??
        queryEmbedding.dimensions ??
        queryEmbedding.values.length;

      return SemanticRetrievalResultSchema.parse({
        query: input.query,
        namespace,
        status:
          matches.length === 0
            ? "no_match"
            : matches[0]!.scoreBreakdown.finalScore >= 25
              ? "matched"
              : "partial",
        indexVersion: DEFAULT_SEMANTIC_INDEX_VERSION,
        matches,
        summary: {
          chunkCount: chunks.length,
          embeddedChunkCount: documents.filter((document) => document.vector.length > 0).length,
          matchedChunkCount: matches.length,
          omittedChunkCount: Math.max(0, sourceCandidates.length - budget.maxSourceFiles),
          ...(model ? { embeddingModel: model } : {}),
          ...(dimensions > 0 ? { dimensions } : {}),
        },
        notes: semanticNotes(input, sourceCandidates.length, chunks.length),
        generatedAt: this.now().toISOString(),
      });
    } catch (err) {
      return SemanticRetrievalResultSchema.parse({
        query: input.query,
        namespace,
        status: "unavailable",
        indexVersion: DEFAULT_SEMANTIC_INDEX_VERSION,
        matches: [],
        summary: {
          chunkCount: 0,
          embeddedChunkCount: 0,
          matchedChunkCount: 0,
          omittedChunkCount: 0,
        },
        notes: [
          `Semantic retrieval unavailable: ${
            err instanceof Error ? err.message : String(err)
          }`,
          "Falling back to lexical, AST, symbol and graph retrieval.",
        ],
        generatedAt: this.now().toISOString(),
      });
    }
  }

  private async buildSourceCandidates(
    input: SemanticRetrievalInput,
    budget: {
      readonly maxSourceFiles: number;
      readonly maxBytesPerFile: number;
    }
  ): Promise<RepositoryRetrievalCandidate[]> {
    const candidatesByPath = new Map(
      input.lexicalRetrieval.candidates.map((candidate) => [candidate.path, candidate])
    );
    const readablePaths = input.scan.files
      .filter((file) => file.safety === "readable")
      .map((file) => file.path);
    const orderedPaths = [
      ...input.lexicalRetrieval.candidates.map((candidate) => candidate.path),
      ...(input.requestedPaths ?? []),
      ...readablePaths,
    ]
      .filter(Boolean)
      .filter(dedupe)
      .slice(0, budget.maxSourceFiles);
    const filesByPath = new Map(input.scan.files.map((file) => [file.path, file]));
    const sourceCandidates: RepositoryRetrievalCandidate[] = [];

    for (const path of orderedPaths) {
      throwIfAborted(input.signal);
      const existing = candidatesByPath.get(path);
      if (existing) {
        sourceCandidates.push({
          ...existing,
          content: existing.content.slice(0, budget.maxBytesPerFile),
          bytes: Math.min(existing.bytes, budget.maxBytesPerFile),
        });
        continue;
      }
      const file = filesByPath.get(path);
      if (!file || file.safety !== "readable") continue;
      const content = await readSafeContent(
        input.scan.projectRootPath,
        path,
        budget.maxBytesPerFile
      );
      if (!content.trim()) continue;
      sourceCandidates.push({
        path,
        language: file.language,
        bytes: Buffer.byteLength(content, "utf-8"),
        content,
        startLine: 1,
        endLine: Math.max(1, content.split("\n").length),
        score: candidatesByPath.get(path)?.score ?? 0,
        matchedTerms: [],
        excerpts: [],
      });
    }

    return sourceCandidates;
  }
}

async function readSafeContent(
  projectRootPath: string,
  path: string,
  maxBytes: number
): Promise<string> {
  const absolutePath = resolve(projectRootPath, path);
  const relation = relative(projectRootPath, absolutePath);
  if (relation.startsWith("..") || relation.includes(`..${sep}`)) return "";
  const raw = await fs.readFile(absolutePath, "utf-8").catch(() => "");
  return raw.slice(0, maxBytes);
}

function repositoryNamespace(projectRootPath: string): string {
  return `repository:${createHash("sha256").update(projectRootPath).digest("hex").slice(0, 24)}`;
}

function semanticNotes(
  input: SemanticRetrievalInput,
  sourceCandidateCount: number,
  chunkCount: number
): string[] {
  const notes: string[] = [];
  if (sourceCandidateCount < input.scan.stats.indexedFiles) {
    notes.push(
      `Semantic retrieval indexed ${sourceCandidateCount}/${input.scan.stats.indexedFiles} readable file(s) by budget.`
    );
  }
  if (chunkCount > sourceCandidateCount) {
    notes.push(`Semantic retrieval created ${chunkCount} bounded chunk(s).`);
  }
  return notes;
}

function clampPositive(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Semantic repository retrieval cancelled.");
  error.name = "AbortError";
  throw error;
}
