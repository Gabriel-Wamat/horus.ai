import type {
  AgentContextRetrievalChannel,
  ContextRetrievalEvaluationCase,
  ContextRetrievalEvaluationReport,
  ProjectContextSnapshot,
} from "@u-build/shared";
import {
  ContextRetrievalEvaluationReportSchema,
  ContextRetrievalEvaluationResultSchema,
} from "@u-build/shared";

export interface ContextRetrievalCandidate {
  readonly caseId: string;
  readonly selectedFiles: readonly string[];
  readonly selectedSymbols?: readonly string[] | undefined;
  readonly retrievalChannels?: readonly AgentContextRetrievalChannel[] | undefined;
}

export function contextRetrievalCandidateFromSnapshot(
  caseId: string,
  snapshot: ProjectContextSnapshot
): ContextRetrievalCandidate {
  const selectedFiles = snapshot.codeContext.files.map((file) => file.path);
  const selectedFileSet = new Set(selectedFiles);
  const selectedSymbols =
    snapshot.codeContext.structuralContext?.symbols
      .filter((symbol) => selectedFileSet.has(symbol.path))
      .map((symbol) => symbol.name) ?? [];
  return {
    caseId,
    selectedFiles,
    selectedSymbols,
    retrievalChannels: inferRetrievalChannels(snapshot),
  };
}

export interface ContextRetrievalEvaluationInput {
  readonly cases: readonly ContextRetrievalEvaluationCase[];
  readonly candidates: readonly ContextRetrievalCandidate[];
  readonly k?: number | undefined;
  readonly now?: Date | undefined;
}

export class ContextRetrievalEvaluationService {
  evaluate(input: ContextRetrievalEvaluationInput): ContextRetrievalEvaluationReport {
    const k = input.k ?? 5;
    const candidatesByCase = new Map(
      input.candidates.map((candidate) => [candidate.caseId, candidate])
    );
    const results = input.cases.map((item) => {
      const candidate = candidatesByCase.get(item.id);
      const selectedFiles = [...(candidate?.selectedFiles ?? [])].slice(0, k);
      const selectedSymbols = [...(candidate?.selectedSymbols ?? [])];
      const expectedFiles = unique([
        ...item.expectedFiles,
        ...item.expectedEditFiles,
        ...item.expectedTestFiles,
        ...(item.terminalErrorPath ? [item.terminalErrorPath] : []),
      ]);
      const matchingFiles = selectedFiles.filter((path) => expectedFiles.includes(path));
      const firstRelevantRank = selectedFiles.findIndex((path) =>
        expectedFiles.includes(path)
      );
      const expectedSymbols = [...item.expectedSymbols];
      const symbolHit =
        expectedSymbols.length > 0 &&
        selectedSymbols.some((symbol) => expectedSymbols.includes(symbol));
      const terminalErrorFileHit = item.terminalErrorPath
        ? selectedFiles.includes(item.terminalErrorPath)
        : null;
      return ContextRetrievalEvaluationResultSchema.parse({
        caseId: item.id,
        query: item.query,
        selectedFiles,
        selectedSymbols,
        retrievalChannels: [...(candidate?.retrievalChannels ?? [])],
        expectedFiles,
        expectedEditFiles: [...item.expectedEditFiles],
        expectedTestFiles: [...item.expectedTestFiles],
        expectedSymbols,
        recallAtK:
          expectedFiles.length === 0 ? 1 : matchingFiles.length / expectedFiles.length,
        precisionAtK: selectedFiles.length === 0 ? 0 : matchingFiles.length / selectedFiles.length,
        reciprocalRank: firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0,
        editFileHit: anySelected(selectedFiles, item.expectedEditFiles),
        testFileHit: anySelected(selectedFiles, item.expectedTestFiles),
        symbolHit,
        terminalErrorFileHit,
        missingFiles: expectedFiles.filter((path) => !selectedFiles.includes(path)),
      });
    });
    return ContextRetrievalEvaluationReportSchema.parse({
      generatedAt: (input.now ?? new Date()).toISOString(),
      k,
      caseCount: results.length,
      averageRecallAtK: average(results.map((result) => result.recallAtK)),
      averagePrecisionAtK: average(results.map((result) => result.precisionAtK)),
      meanReciprocalRank: average(results.map((result) => result.reciprocalRank)),
      editFileHitRate: rate(results.map((result) => result.editFileHit)),
      testFileHitRate: rate(results.map((result) => result.testFileHit)),
      symbolHitRate: rate(results.map((result) => result.symbolHit)),
      terminalErrorFileHitRate: nullableRate(
        results.map((result) => result.terminalErrorFileHit)
      ),
      results,
    });
  }
}

function anySelected(
  selectedFiles: readonly string[],
  expectedFiles: readonly string[]
): boolean {
  return expectedFiles.length > 0 && selectedFiles.some((path) => expectedFiles.includes(path));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function rate(values: readonly boolean[]): number {
  if (values.length === 0) return 0;
  return round(values.filter(Boolean).length / values.length);
}

function nullableRate(values: readonly (boolean | null)[]): number | null {
  const concrete = values.filter((value): value is boolean => value !== null);
  if (concrete.length === 0) return null;
  return rate(concrete);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

export const defaultContextRetrievalEvaluationService =
  new ContextRetrievalEvaluationService();

function inferRetrievalChannels(
  snapshot: ProjectContextSnapshot
): AgentContextRetrievalChannel[] {
  const context = snapshot.codeContext;
  const channels: AgentContextRetrievalChannel[] = [];
  if (context.retrievalStats?.explicitPathCount) channels.push("explicit_paths");
  if (snapshot.runtimeHints.length) channels.push("runtime_errors");
  channels.push("lexical_bm25");
  if (context.structuralContext?.symbols.length) channels.push("ast_symbols");
  if (context.structuralContext) channels.push("graph_neighbors");
  if (context.structuralContext?.semanticMatches.length) {
    channels.push("semantic_embeddings", "reranker");
  }
  channels.push("budget_packer", "project_manifest");
  return [...new Set(channels)];
}
