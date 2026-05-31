import type {
  AstDocument,
  RepositoryRetrievalCandidate,
} from "@u-build/shared";

export interface TreeSitterLanguageAdapter {
  readonly id: string;
  supports(candidate: RepositoryRetrievalCandidate): boolean;
  parse(candidate: RepositoryRetrievalCandidate, signal?: AbortSignal): AstDocument;
}
