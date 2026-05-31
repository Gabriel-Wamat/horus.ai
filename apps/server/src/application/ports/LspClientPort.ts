import type {
  LspDiagnostic,
  LspDocumentSymbol,
  RepositoryRetrievalCandidate,
  SymbolLocation,
} from "@u-build/shared";

export interface LspInitializeInput {
  readonly projectRootPath: string;
  readonly candidates?: readonly RepositoryRetrievalCandidate[];
  readonly signal?: AbortSignal;
}

export interface LspLocationInput {
  readonly location: SymbolLocation;
  readonly signal?: AbortSignal;
}

export interface LspPathInput {
  readonly path: string;
  readonly signal?: AbortSignal;
}

export interface LspReferencesInput extends LspLocationInput {
  readonly includeDeclaration?: boolean;
}

export interface LspClientPort {
  initialize(input: LspInitializeInput): Promise<void>;
  documentSymbols(input: LspPathInput): Promise<LspDocumentSymbol[]>;
  definition(input: LspLocationInput): Promise<SymbolLocation[]>;
  references(input: LspReferencesInput): Promise<SymbolLocation[]>;
  diagnostics(input: LspPathInput): Promise<LspDiagnostic[]>;
  shutdown(): Promise<void>;
}
