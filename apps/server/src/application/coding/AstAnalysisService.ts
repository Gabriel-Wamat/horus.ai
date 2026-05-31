import { randomUUID } from "node:crypto";
import {
  AstAnalysisResultSchema,
  CodingRuntimeArtifactRefSchema,
  RepositoryRetrievalResultSchema,
  type AstAnalysisResult,
  type RepositoryRetrievalResult,
} from "@u-build/shared";
import type {
  AstAnalyzerPort,
  CodingRuntimeStepContext,
  CodingRuntimeStepResult,
} from "../ports/index.js";

export class AstAnalysisService {
  constructor(
    private readonly analyzer: AstAnalyzerPort,
    private readonly now: () => Date = () => new Date(),
    private readonly idGenerator: () => string = randomUUID
  ) {}

  async analyzeRetrieval(
    retrieval: RepositoryRetrievalResult,
    signal?: AbortSignal
  ): Promise<AstAnalysisResult> {
    throwIfAborted(signal);
    return this.analyzer.analyze({
      candidates: retrieval.candidates,
      ...(signal ? { signal } : {}),
    });
  }

  async execute(context: CodingRuntimeStepContext): Promise<CodingRuntimeStepResult> {
    const retrievalArtifact = context.artifacts
      .filter((artifact) => artifact.kind === "retrieval")
      .at(-1);
    if (!retrievalArtifact?.payload) {
      throw new Error("Coding task cannot analyze AST without retrieval artifact.");
    }
    const retrieval = RepositoryRetrievalResultSchema.parse(
      retrievalArtifact.payload
    );
    const analysis = await this.analyzeRetrieval(retrieval, context.signal);
    const artifact = CodingRuntimeArtifactRefSchema.parse({
      id: this.idGenerator(),
      kind: "ast_analysis",
      label: "AST analysis",
      status: analysis.status === "failed" ? "failed" : "ready",
      createdAt: this.now().toISOString(),
      summary: `${analysis.summary.parsedDocumentCount}/${analysis.summary.documentCount} AST document(s), ${analysis.summary.symbolCount} symbol(s), ${analysis.summary.diagnosticCount} diagnostic(s).`,
      payload: AstAnalysisResultSchema.parse(analysis),
    });
    return {
      message: `AST analysis finished with status ${analysis.status}.`,
      artifact,
      metadata: {
        status: analysis.status,
        documentCount: analysis.summary.documentCount,
        parsedDocumentCount: analysis.summary.parsedDocumentCount,
        symbolCount: analysis.summary.symbolCount,
        diagnosticCount: analysis.summary.diagnosticCount,
      },
    };
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("AST analysis cancelled.");
  error.name = "AbortError";
  throw error;
}
