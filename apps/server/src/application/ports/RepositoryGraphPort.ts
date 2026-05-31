import type {
  AstAnalysisResult,
  RepositoryGraphConnectivity,
  RepositoryGraphNeighborhood,
  RepositoryGraphSnapshot,
  RepositoryRetrievalCandidate,
  RepositoryRetrievalResult,
  RepositoryScanSnapshot,
  StructuralPatchIntent,
  SymbolIndexResult,
} from "@u-build/shared";

export interface RepositoryGraphBuildInput {
  readonly scan: RepositoryScanSnapshot;
  readonly ast: AstAnalysisResult;
  readonly symbolIndex?: SymbolIndexResult;
  readonly signal?: AbortSignal;
}

export interface RepositoryGraphBuilderPort {
  build(input: RepositoryGraphBuildInput): Promise<RepositoryGraphSnapshot>;
}

export interface GraphAwareRetrievalInput {
  readonly graph: RepositoryGraphSnapshot;
  readonly retrieval: RepositoryRetrievalResult;
  readonly scan: RepositoryScanSnapshot;
  readonly query: string;
  readonly requestedPaths?: readonly string[];
  readonly maxDepth?: number;
  readonly nodeBudget?: number;
  readonly maxRelatedFiles?: number;
  readonly maxBytesPerFile?: number;
  readonly signal?: AbortSignal;
}

export interface GraphAwareRetrievalResult {
  readonly neighborhood: RepositoryGraphNeighborhood;
  readonly relatedCandidates: readonly RepositoryRetrievalCandidate[];
  readonly notes: readonly string[];
}

export interface GraphAwareRetrievalPort {
  buildContext(
    input: GraphAwareRetrievalInput
  ): Promise<GraphAwareRetrievalResult>;

  assessIntentConnectivity(input: {
    readonly graph: RepositoryGraphSnapshot;
    readonly intents: readonly StructuralPatchIntent[];
  }): RepositoryGraphConnectivity[];
}
