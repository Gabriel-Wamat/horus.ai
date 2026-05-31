import type {
  RepositoryRetrievalBudget,
  RepositoryRetrievalResult,
  RepositoryScanBudget,
  RepositoryScanSnapshot,
} from "@u-build/shared";

export interface RepositoryScannerInput {
  readonly projectId?: string;
  readonly projectRootPath: string;
  readonly selectedPaths?: readonly string[];
  readonly budget?: Partial<RepositoryScanBudget>;
  readonly signal?: AbortSignal;
}

export interface TextRetrievalInput {
  readonly scan: RepositoryScanSnapshot;
  readonly query: string;
  readonly requestedPaths?: readonly string[];
  readonly budget?: Partial<RepositoryRetrievalBudget>;
  readonly signal?: AbortSignal;
}

export interface RepositoryScannerPort {
  scan(input: RepositoryScannerInput): Promise<RepositoryScanSnapshot>;
}

export interface TextRetrievalPort {
  retrieve(input: TextRetrievalInput): Promise<RepositoryRetrievalResult>;
}
