import type {
  RepositoryRetrievalExcerpt,
  RepositoryRetrievalResult,
  SemanticRetrievalResult,
} from "@u-build/shared";

export function mergeSemanticRetrieval(
  lexicalRetrieval: RepositoryRetrievalResult,
  semanticRetrieval: SemanticRetrievalResult
): RepositoryRetrievalResult {
  if (
    !["matched", "partial"].includes(semanticRetrieval.status) ||
    semanticRetrieval.matches.length === 0
  ) {
    return {
      ...lexicalRetrieval,
      notes: mergeStrings(lexicalRetrieval.notes, semanticRetrieval.notes),
    };
  }

  const candidatesByPath = new Map(
    lexicalRetrieval.candidates.map((candidate) => [candidate.path, candidate])
  );
  const semanticExcerpts: RepositoryRetrievalExcerpt[] = [];

  for (const match of semanticRetrieval.matches) {
    if (!match.candidate) continue;
    const score = Math.max(0, Math.round(match.scoreBreakdown.finalScore));
    const reasons = match.scoreBreakdown.reasons.map((reason) => `semantic:${reason}`);
    const excerpt = {
      filePath: match.chunk.path,
      startLine: match.chunk.startLine,
      endLine: match.chunk.endLine,
      content: match.chunk.content,
      reason: reasons.join(", ") || "semantic:retrieval",
      score,
    };
    semanticExcerpts.push(excerpt);

    const existing = candidatesByPath.get(match.candidate.path);
    if (existing) {
      candidatesByPath.set(existing.path, {
        ...existing,
        score: Math.max(existing.score, score),
        matchedTerms: mergeStrings(existing.matchedTerms, reasons),
        excerpts: mergeExcerpts(existing.excerpts, [excerpt]),
      });
      continue;
    }

    candidatesByPath.set(match.candidate.path, {
      ...match.candidate,
      score: Math.max(match.candidate.score, score),
      matchedTerms: mergeStrings(match.candidate.matchedTerms, reasons),
      excerpts: mergeExcerpts(match.candidate.excerpts, [excerpt]),
    });
  }

  const candidates = [...candidatesByPath.values()].sort(
    (left, right) => right.score - left.score || left.path.localeCompare(right.path)
  );
  return {
    ...lexicalRetrieval,
    status: candidates.length > 0 ? "matched" : lexicalRetrieval.status,
    candidates,
    excerpts: mergeExcerpts(lexicalRetrieval.excerpts, semanticExcerpts),
    totalBytes: candidates.reduce((sum, candidate) => sum + candidate.bytes, 0),
    notes: mergeStrings(
      lexicalRetrieval.notes,
      [
        `Semantic retrieval ${semanticRetrieval.status} with ${semanticRetrieval.matches.length} ranked chunk(s).`,
        ...semanticRetrieval.notes,
      ]
    ),
  };
}

function mergeStrings(left: readonly string[], right: readonly string[]): string[] {
  return [...left, ...right].filter((value, index, all) => all.indexOf(value) === index);
}

function mergeExcerpts(
  left: readonly RepositoryRetrievalExcerpt[],
  right: readonly RepositoryRetrievalExcerpt[]
): RepositoryRetrievalExcerpt[] {
  const seen = new Set<string>();
  return [...left, ...right].filter((excerpt) => {
    const key = [
      excerpt.filePath,
      excerpt.startLine,
      excerpt.endLine,
      excerpt.reason,
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
