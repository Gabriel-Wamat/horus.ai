import type {
  AstAnalysisResult,
  CodingTask,
  RepositoryRetrievalCandidate,
  StructuralPatchIntent,
  StructuralPatchPlan,
} from "@u-build/shared";

export interface PatchPlannerInput {
  readonly task?: CodingTask;
  readonly ast: AstAnalysisResult;
  readonly candidates: readonly RepositoryRetrievalCandidate[];
  readonly intents: readonly StructuralPatchIntent[];
  readonly signal?: AbortSignal;
}

export interface PatchPlannerPort {
  plan(input: PatchPlannerInput): Promise<StructuralPatchPlan>;
}
