import type {
  AstAnalysisResult,
  FrontendProject,
  PackedCodingContext,
  RepositoryGraphNeighborhood,
  RepositoryGraphSnapshot,
  RepositoryRetrievalResult,
  RepositoryScanSnapshot,
  SemanticRetrievalResult,
  SymbolIndexResult,
  StructuralPatchIntent,
} from "@u-build/shared";

export type ChatCodingPlannerDiagnosticSeverity = "error" | "warning" | "info";

export interface ChatCodingPlannerDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: ChatCodingPlannerDiagnosticSeverity;
  readonly path?: string;
}

export interface ChatCodingPlannerInput {
  readonly message: string;
  readonly project: FrontendProject;
  readonly chatSessionId: string;
  readonly sourceMessageId: string;
  readonly previewSessionId?: string;
  readonly signal?: AbortSignal;
}

export interface ChatCodingPlannerResult {
  readonly intents: readonly StructuralPatchIntent[];
  readonly diagnostics: readonly ChatCodingPlannerDiagnostic[];
  readonly selectedPaths: readonly string[];
  readonly scan?: RepositoryScanSnapshot;
  readonly retrieval?: RepositoryRetrievalResult;
  readonly ast?: AstAnalysisResult;
  readonly symbolIndex?: SymbolIndexResult;
  readonly repositoryGraph?: RepositoryGraphSnapshot;
  readonly graphContext?: RepositoryGraphNeighborhood;
  readonly semanticRetrieval?: SemanticRetrievalResult;
  readonly packedContext?: PackedCodingContext;
}

export interface ChatCodingPlannerPort {
  plan(input: ChatCodingPlannerInput): Promise<ChatCodingPlannerResult>;
}
