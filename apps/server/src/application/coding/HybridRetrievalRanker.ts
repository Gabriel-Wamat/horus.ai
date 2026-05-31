import {
  SemanticRetrievalMatchSchema,
  type RepositoryChunk,
  type RepositoryGraphEdge,
  type RepositoryGraphSnapshot,
  type RepositoryRetrievalResult,
  type SemanticRetrievalMatch,
} from "@u-build/shared";
import type { VectorStoreMatch } from "../ports/index.js";
import {
  extractRepositorySearchTerms,
  scoreRepositoryContent,
  scoreRepositoryPath,
  toRepositoryPath,
} from "./RepositoryAccessPolicy.js";

export interface HybridRetrievalRankInput {
  readonly query: string;
  readonly chunks: readonly RepositoryChunk[];
  readonly vectorMatches: readonly VectorStoreMatch[];
  readonly lexicalRetrieval: RepositoryRetrievalResult;
  readonly requestedPaths?: readonly string[];
  readonly graph?: RepositoryGraphSnapshot;
  readonly topK?: number;
}

const DEFAULT_TOP_K = 12;

export class HybridRetrievalRanker {
  rank(input: HybridRetrievalRankInput): SemanticRetrievalMatch[] {
    const topK = clampPositive(input.topK ?? DEFAULT_TOP_K, 1, 100);
    const vectorScoreById = new Map(
      input.vectorMatches.map((match) => [match.id, normalizeVectorScore(match.score)])
    );
    const lexicalPathScores = new Map(
      input.lexicalRetrieval.candidates.map((candidate) => [
        candidate.path,
        Math.min(100, candidate.score),
      ])
    );
    const requestedPaths = new Set(
      (input.requestedPaths ?? []).map(toRepositoryPath).filter(Boolean)
    );
    const terms = extractRepositorySearchTerms(input.query);
    const graphScores = graphScoresByPath(input.graph, input.lexicalRetrieval);

    return input.chunks
      .map((chunk) => {
        const directLexical =
          scoreRepositoryPath(chunk.path, terms) +
          scoreRepositoryContent(chunk.content, terms);
        const lexicalScore = Math.min(
          100,
          Math.max(directLexical, lexicalPathScores.get(chunk.path) ?? 0)
        );
        const vectorScore = vectorScoreById.get(chunk.id) ?? 0;
        const symbolScore = symbolScoreForTerms(chunk, terms);
        const graphScore = graphScores.get(chunk.path) ?? 0;
        const explicitPathScore = requestedPaths.has(chunk.path) ? 100 : 0;
        const finalScore =
          lexicalScore * 0.42 +
          vectorScore * 0.32 +
          symbolScore * 0.12 +
          graphScore * 0.09 +
          explicitPathScore * 0.25;
        return SemanticRetrievalMatchSchema.parse({
          chunk,
          scoreBreakdown: {
            lexicalScore,
            vectorScore,
            symbolScore,
            graphScore,
            explicitPathScore,
            finalScore,
            reasons: scoreReasons({
              lexicalScore,
              vectorScore,
              symbolScore,
              graphScore,
              explicitPathScore,
            }),
          },
        });
      })
      .filter((match) => match.scoreBreakdown.finalScore > 0)
      .sort(
        (left, right) =>
          right.scoreBreakdown.finalScore - left.scoreBreakdown.finalScore ||
          right.scoreBreakdown.lexicalScore - left.scoreBreakdown.lexicalScore ||
          left.chunk.path.localeCompare(right.chunk.path) ||
          left.chunk.startLine - right.chunk.startLine
      )
      .slice(0, topK);
  }
}

function normalizeVectorScore(score: number): number {
  const clamped = Math.max(-1, Math.min(1, score));
  return Math.round(((clamped + 1) / 2) * 100);
}

function symbolScoreForTerms(
  chunk: RepositoryChunk,
  terms: readonly string[]
): number {
  if (terms.length === 0 || chunk.symbolNames.length === 0) return 0;
  const symbolText = chunk.symbolNames.join(" ").toLowerCase();
  return Math.min(
    100,
    terms.reduce(
      (score, term) => score + (symbolText.includes(term.toLowerCase()) ? 30 : 0),
      0
    )
  );
}

function graphScoresByPath(
  graph: RepositoryGraphSnapshot | undefined,
  lexicalRetrieval: RepositoryRetrievalResult
): Map<string, number> {
  const scores = new Map<string, number>();
  if (!graph) return scores;
  const seedPaths = new Set(
    lexicalRetrieval.candidates.map((candidate) => candidate.path)
  );
  for (const path of seedPaths) {
    scores.set(path, Math.max(scores.get(path) ?? 0, 80));
  }
  const adjacency = new Map<string, RepositoryGraphEdge[]>();
  for (const edge of graph.edges) {
    if (edge.sourcePath) {
      adjacency.set(edge.sourcePath, [...(adjacency.get(edge.sourcePath) ?? []), edge]);
    }
    if (edge.targetPath) {
      adjacency.set(edge.targetPath, [...(adjacency.get(edge.targetPath) ?? []), edge]);
    }
  }
  const queue = [...seedPaths].map((path) => ({ path, distance: 0 }));
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.path) || current.distance >= 2) continue;
    visited.add(current.path);
    for (const edge of adjacency.get(current.path) ?? []) {
      const nextPath = edge.sourcePath === current.path ? edge.targetPath : edge.sourcePath;
      if (!nextPath || visited.has(nextPath)) continue;
      const score = Math.max(10, Math.round(edge.confidence * (60 - current.distance * 20)));
      scores.set(nextPath, Math.max(scores.get(nextPath) ?? 0, score));
      queue.push({ path: nextPath, distance: current.distance + 1 });
    }
  }
  return scores;
}

function scoreReasons(input: {
  readonly lexicalScore: number;
  readonly vectorScore: number;
  readonly symbolScore: number;
  readonly graphScore: number;
  readonly explicitPathScore: number;
}): string[] {
  const reasons: string[] = [];
  if (input.explicitPathScore > 0) reasons.push("explicit_path");
  if (input.lexicalScore >= 30) reasons.push("lexical_match");
  if (input.vectorScore >= 55) reasons.push("vector_similarity");
  if (input.symbolScore > 0) reasons.push("symbol_match");
  if (input.graphScore > 0) reasons.push("graph_proximity");
  return reasons;
}

function clampPositive(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}
