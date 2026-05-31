import type {
  AgentMemoryItem,
  AstAnalysisResult,
  ContextBudgetConfig,
  PackedCodingContext,
  RepositoryGraphNeighborhood,
  RepositoryRetrievalResult,
  SemanticRetrievalResult,
  SymbolIndexResult,
} from "@u-build/shared";

export interface CodingContextBudgetInput {
  readonly request: string;
  readonly budget: ContextBudgetConfig;
  readonly retrieval?: RepositoryRetrievalResult;
  readonly ast?: AstAnalysisResult;
  readonly symbolIndex?: SymbolIndexResult;
  readonly graphContext?: RepositoryGraphNeighborhood;
  readonly semanticRetrieval?: SemanticRetrievalResult;
  readonly memories?: readonly AgentMemoryItem[];
  readonly signal?: AbortSignal;
}

export interface CodingContextBudgeterPort {
  pack(input: CodingContextBudgetInput): PackedCodingContext;
}
