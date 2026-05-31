import { createHash } from "node:crypto";
import {
  AstAnalysisResultSchema,
  AstDocumentSchema,
  type AstAnalysisResult,
  type AstDiagnostic,
  type AstDocument,
  type RepositoryRetrievalCandidate,
} from "@u-build/shared";
import type {
  AstAnalyzerInput,
  AstAnalyzerPort,
} from "../../application/ports/index.js";
import { TypeScriptTreeSitterAdapter } from "./languages/typescriptAdapter.js";
import type { TreeSitterLanguageAdapter } from "./languages/TreeSitterLanguageAdapter.js";

export class TreeSitterAstAnalyzer implements AstAnalyzerPort {
  constructor(
    private readonly adapters: readonly TreeSitterLanguageAdapter[] = [
      new TypeScriptTreeSitterAdapter(),
    ],
    private readonly now: () => Date = () => new Date()
  ) {}

  async analyze(input: AstAnalyzerInput): Promise<AstAnalysisResult> {
    throwIfAborted(input.signal);
    const documents: AstDocument[] = [];

    for (const candidate of input.candidates) {
      throwIfAborted(input.signal);
      const adapter = this.adapters.find((item) => item.supports(candidate));
      if (!adapter) {
        documents.push(unsupportedDocument(candidate));
        continue;
      }
      try {
        documents.push(adapter.parse(candidate, input.signal));
      } catch (err) {
        if (isAbortError(err)) throw err;
        documents.push(parserUnavailableDocument(candidate, err));
      }
    }

    const diagnostics = documents.flatMap((document) => document.diagnostics);
    const parsedDocumentCount = documents.filter(
      (document) => document.parseStatus === "parsed"
    ).length;
    const unsupportedDocumentCount = documents.filter(
      (document) => document.parseStatus === "unsupported_language"
    ).length;
    const parseErrorDocumentCount = documents.filter(
      (document) => document.parseStatus === "parse_error"
    ).length;
    const hasBlockingDiagnostics = diagnostics.some(
      (diagnostic) => diagnostic.severity === "error"
    );
    const languageCounts = documents.reduce<Record<string, number>>(
      (counts, document) => ({
        ...counts,
        [document.language]: (counts[document.language] ?? 0) + 1,
      }),
      {}
    );
    const status =
      documents.length === 0
        ? "failed"
        : parsedDocumentCount === documents.length && !hasBlockingDiagnostics
          ? "complete"
          : parsedDocumentCount > 0
            ? "partial"
            : "failed";

    return AstAnalysisResultSchema.parse({
      status,
      documents,
      diagnostics,
      summary: {
        documentCount: documents.length,
        parsedDocumentCount,
        unsupportedDocumentCount,
        parseErrorDocumentCount,
        diagnosticCount: diagnostics.length,
        symbolCount: documents.reduce(
          (total, document) => total + document.symbols.length,
          0
        ),
        hasBlockingDiagnostics,
        languageCounts,
      },
      generatedAt: this.now().toISOString(),
    });
  }
}

function unsupportedDocument(candidate: RepositoryRetrievalCandidate): AstDocument {
  const diagnostic: AstDiagnostic = {
    path: candidate.path,
    code: "unsupported_language",
    message: `AST parser does not support language '${candidate.language}' for ${candidate.path}.`,
    severity: "error",
    source: "tree-sitter",
  };
  return AstDocumentSchema.parse({
    path: candidate.path,
    language: candidate.language,
    contentHash: hashContent(candidate.content),
    bytes: candidate.bytes,
    lineCount: Math.max(1, candidate.content.split("\n").length),
    parseStatus: "unsupported_language",
    symbols: [],
    diagnostics: [diagnostic],
  });
}

function parserUnavailableDocument(
  candidate: RepositoryRetrievalCandidate,
  err: unknown
): AstDocument {
  const diagnostic: AstDiagnostic = {
    path: candidate.path,
    code: "parser_unavailable",
    message:
      err instanceof Error
        ? err.message
        : "Tree-sitter parser failed with an unknown error.",
    severity: "error",
    source: "tree-sitter",
  };
  return AstDocumentSchema.parse({
    path: candidate.path,
    language: candidate.language,
    contentHash: hashContent(candidate.content),
    bytes: candidate.bytes,
    lineCount: Math.max(1, candidate.content.split("\n").length),
    parseStatus: "parser_unavailable",
    symbols: [],
    diagnostics: [diagnostic],
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("AST analysis cancelled.");
  error.name = "AbortError";
  throw error;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
