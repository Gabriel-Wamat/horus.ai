import type {
  AstAnalysisResult,
  RepositoryRetrievalCandidate,
} from "@u-build/shared";

export interface AstAnalyzerInput {
  readonly candidates: readonly RepositoryRetrievalCandidate[];
  readonly signal?: AbortSignal;
}

export interface AstAnalyzerPort {
  analyze(input: AstAnalyzerInput): Promise<AstAnalysisResult>;
}
