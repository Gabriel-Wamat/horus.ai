import type {
  AstAnalysisResult,
  RepositoryGraphSnapshot,
  RepositoryRetrievalResult,
  RepositoryScanSnapshot,
  SemanticRetrievalResult,
} from "@u-build/shared";

export interface SemanticRetrievalBudget {
  readonly maxSourceFiles?: number;
  readonly maxBytesPerFile?: number;
  readonly maxChunks?: number;
  readonly topK?: number;
}

export interface SemanticRetrievalInput {
  readonly scan: RepositoryScanSnapshot;
  readonly lexicalRetrieval: RepositoryRetrievalResult;
  readonly query: string;
  readonly requestedPaths?: readonly string[];
  readonly ast?: AstAnalysisResult;
  readonly graph?: RepositoryGraphSnapshot;
  readonly namespace?: string;
  readonly budget?: SemanticRetrievalBudget;
  readonly signal?: AbortSignal;
}

export interface SemanticRepositoryRetrievalPort {
  retrieve(input: SemanticRetrievalInput): Promise<SemanticRetrievalResult>;
}
