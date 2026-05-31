import { createHash } from "node:crypto";
import {
  RepositoryChunkSchema,
  type AstAnalysisResult,
  type AstDocument,
  type AstRange,
  type AstSymbol,
  type RepositoryChunk,
  type RepositoryRetrievalCandidate,
} from "@u-build/shared";

export const DEFAULT_SEMANTIC_INDEX_VERSION = "semantic-retrieval.v1";

interface RepositoryChunkerOptions {
  readonly indexVersion?: string;
  readonly maxChunkBytes?: number;
  readonly maxChunksPerFile?: number;
  readonly overlapLines?: number;
}

export interface RepositoryChunkInput {
  readonly candidates: readonly RepositoryRetrievalCandidate[];
  readonly ast?: AstAnalysisResult;
  readonly options?: RepositoryChunkerOptions;
  readonly signal?: AbortSignal;
}

const DEFAULT_MAX_CHUNK_BYTES = 2_400;
const DEFAULT_MAX_CHUNKS_PER_FILE = 12;
const DEFAULT_OVERLAP_LINES = 4;

export class RepositoryChunker {
  chunk(input: RepositoryChunkInput): RepositoryChunk[] {
    throwIfAborted(input.signal);
    const indexVersion =
      input.options?.indexVersion ?? DEFAULT_SEMANTIC_INDEX_VERSION;
    const maxChunkBytes = clampPositive(
      input.options?.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES,
      160,
      20_000
    );
    const maxChunksPerFile = clampPositive(
      input.options?.maxChunksPerFile ?? DEFAULT_MAX_CHUNKS_PER_FILE,
      1,
      200
    );
    const overlapLines = clampPositive(
      input.options?.overlapLines ?? DEFAULT_OVERLAP_LINES,
      0,
      20
    );
    const documentsByPath = new Map(
      (input.ast?.documents ?? []).map((document) => [document.path, document])
    );
    const chunks: RepositoryChunk[] = [];
    const seen = new Set<string>();

    for (const candidate of input.candidates) {
      throwIfAborted(input.signal);
      const document = documentsByPath.get(candidate.path);
      const fileChunks = document?.parseStatus === "parsed"
        ? symbolChunks(candidate, document, indexVersion, maxChunkBytes)
        : [];
      const fallbackChunks =
        fileChunks.length > 0
          ? []
          : textWindowChunks(candidate, indexVersion, maxChunkBytes, overlapLines);

      for (const chunk of [...fileChunks, ...fallbackChunks].slice(0, maxChunksPerFile)) {
        if (seen.has(chunk.id)) continue;
        seen.add(chunk.id);
        chunks.push(chunk);
      }
    }

    return chunks.sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.startLine - right.startLine ||
        left.id.localeCompare(right.id)
    );
  }
}

function symbolChunks(
  candidate: RepositoryRetrievalCandidate,
  document: AstDocument,
  indexVersion: string,
  maxChunkBytes: number
): RepositoryChunk[] {
  const editableSymbols = document.symbols
    .filter(isChunkableSymbol)
    .sort((left, right) => left.range.startByte - right.range.startByte);
  const chunks: RepositoryChunk[] = [];

  for (const symbol of editableSymbols) {
    const content = sliceByByteRange(
      candidate.content,
      symbol.range.startByte,
      symbol.range.endByte
    ).slice(0, maxChunkBytes);
    if (!content.trim()) continue;
    chunks.push(
      buildChunk({
        candidate,
        content,
        indexVersion,
        kind: "symbol",
        startByte: symbol.range.startByte,
        endByte: Math.min(
          symbol.range.startByte + Buffer.byteLength(content, "utf-8"),
          symbol.range.endByte
        ),
        range: symbol.range,
        symbolIds: [symbol.id],
        symbolNames: [symbol.name],
      })
    );
  }

  return chunks;
}

function textWindowChunks(
  candidate: RepositoryRetrievalCandidate,
  indexVersion: string,
  maxChunkBytes: number,
  overlapLines: number
): RepositoryChunk[] {
  const lines = candidate.content.split("\n");
  const chunks: RepositoryChunk[] = [];
  let lineCursor = 0;

  while (lineCursor < lines.length) {
    let endLine = lineCursor;
    let content = "";
    while (endLine < lines.length) {
      const next = content ? `${content}\n${lines[endLine]}` : lines[endLine] ?? "";
      if (Buffer.byteLength(next, "utf-8") > maxChunkBytes && content) break;
      content = next;
      endLine += 1;
    }
    if (!content.trim()) break;
    const startByte = byteOffsetForLine(candidate.content, lineCursor + 1);
    const endByte = startByte + Buffer.byteLength(content, "utf-8");
    chunks.push(
      buildChunk({
        candidate,
        content,
        indexVersion,
        kind: "text_window",
        startByte,
        endByte,
      })
    );
    if (endLine >= lines.length) break;
    lineCursor = Math.max(endLine - overlapLines, lineCursor + 1);
  }

  if (chunks.length === 0 && candidate.content.trim()) {
    const content = candidate.content.slice(0, maxChunkBytes);
    chunks.push(
      buildChunk({
        candidate,
        content,
        indexVersion,
        kind: "file",
        startByte: 0,
        endByte: Buffer.byteLength(content, "utf-8"),
      })
    );
  }

  return chunks;
}

function buildChunk(input: {
  readonly candidate: RepositoryRetrievalCandidate;
  readonly content: string;
  readonly indexVersion: string;
  readonly kind: RepositoryChunk["kind"];
  readonly startByte: number;
  readonly endByte: number;
  readonly range?: AstRange;
  readonly symbolIds?: readonly string[];
  readonly symbolNames?: readonly string[];
}): RepositoryChunk {
  const contentHash = hashContent(input.content);
  return RepositoryChunkSchema.parse({
    id: [
      "chunk",
      input.indexVersion,
      input.candidate.path,
      input.startByte,
      input.endByte,
      input.kind,
      contentHash.slice(0, 16),
    ].join(":"),
    path: input.candidate.path,
    language: input.candidate.language,
    kind: input.kind,
    content: input.content,
    contentHash,
    indexVersion: input.indexVersion,
    startLine: lineForByteOffset(input.candidate.content, input.startByte),
    endLine: lineForByteOffset(input.candidate.content, input.endByte),
    tokenEstimate: estimateTokens(input.content),
    ...(input.range ? { range: input.range } : {}),
    symbolIds: [...(input.symbolIds ?? [])],
    symbolNames: [...(input.symbolNames ?? [])],
  });
}

function sliceByByteRange(content: string, startByte: number, endByte: number): string {
  return Buffer.from(content, "utf-8").subarray(startByte, endByte).toString("utf-8");
}

function byteOffsetForLine(content: string, line: number): number {
  if (line <= 1) return 0;
  const lines = content.split("\n").slice(0, line - 1);
  return Buffer.byteLength(lines.join("\n"), "utf-8") + 1;
}

function lineForByteOffset(content: string, byteOffset: number): number {
  const prefix = Buffer.from(content, "utf-8")
    .subarray(0, Math.max(0, byteOffset))
    .toString("utf-8");
  return Math.max(1, prefix.split("\n").length);
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function isChunkableSymbol(symbol: AstSymbol): boolean {
  return [
    "component",
    "function",
    "class",
    "method",
    "variable",
    "type",
    "interface",
  ].includes(symbol.kind);
}

function clampPositive(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("Repository chunking cancelled.");
  error.name = "AbortError";
  throw error;
}
