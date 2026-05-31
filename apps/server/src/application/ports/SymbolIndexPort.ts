import type {
  AstAnalysisResult,
  RepositoryRetrievalCandidate,
  SymbolIndexResult,
} from "@u-build/shared";

export interface SymbolIndexInput {
  readonly projectRootPath: string;
  readonly candidates: readonly RepositoryRetrievalCandidate[];
  readonly ast: AstAnalysisResult;
  readonly signal?: AbortSignal;
}

export interface SymbolIndexPort {
  buildIndex(input: SymbolIndexInput): Promise<SymbolIndexResult>;
}
