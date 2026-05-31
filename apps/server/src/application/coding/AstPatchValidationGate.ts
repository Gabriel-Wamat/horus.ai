import { randomUUID } from "node:crypto";
import {
  AstAnalysisResultSchema,
  CodingRuntimeArtifactRefSchema,
  RepositoryRetrievalCandidateSchema,
  StructuralPatchPlanSchema,
  type AstAnalysisResult,
  type RepositoryRetrievalCandidate,
  type StructuralPatchPlan,
} from "@u-build/shared";
import type {
  AstAnalyzerPort,
  CodingRuntimeStepContext,
  CodingRuntimeStepResult,
} from "../ports/index.js";

export class AstPatchValidationGate {
  constructor(
    private readonly analyzer: AstAnalyzerPort,
    private readonly now: () => Date = () => new Date(),
    private readonly idGenerator: () => string = randomUUID
  ) {}

  async validate(
    plan: StructuralPatchPlan,
    signal?: AbortSignal
  ): Promise<AstAnalysisResult> {
    throwIfAborted(signal);
    const candidates = plan.fileChanges
      .filter((change) => change.afterContent !== null)
      .map((change) =>
        RepositoryRetrievalCandidateSchema.parse({
          path: change.targetPath,
          language: inferLanguage(change.targetPath),
          bytes: Buffer.byteLength(change.afterContent ?? "", "utf-8"),
          content: change.afterContent ?? "",
          startLine: 1,
          endLine: Math.max(1, (change.afterContent ?? "").split("\n").length),
          score: 100,
          matchedTerms: ["structural-patch"],
          excerpts: [],
        })
      );

    if (candidates.length === 0) {
      return AstAnalysisResultSchema.parse({
        status: "complete",
        documents: [],
        diagnostics: [],
        summary: {
          documentCount: 0,
          parsedDocumentCount: 0,
          unsupportedDocumentCount: 0,
          parseErrorDocumentCount: 0,
          diagnosticCount: 0,
          symbolCount: 0,
          hasBlockingDiagnostics: false,
          languageCounts: {},
        },
        generatedAt: this.now().toISOString(),
      });
    }

    return this.analyzer.analyze({
      candidates,
      ...(signal ? { signal } : {}),
    });
  }

  async execute(context: CodingRuntimeStepContext): Promise<CodingRuntimeStepResult> {
    const planArtifact = context.artifacts
      .filter((artifact) => artifact.kind === "patch_plan")
      .at(-1);
    if (!planArtifact?.payload) {
      throw new Error("Coding task cannot validate AST without a patch plan artifact.");
    }

    const plan = StructuralPatchPlanSchema.parse(planArtifact.payload);
    if (plan.status !== "planned") {
      throw new Error(`AST patch validation requires a planned patch, got ${plan.status}.`);
    }

    const validation = await this.validate(plan, context.signal);
    const status = validation.summary.hasBlockingDiagnostics ? "failed" : "ready";
    return {
      message: `AST patch validation finished with status ${validation.status}.`,
      artifact: CodingRuntimeArtifactRefSchema.parse({
        id: this.idGenerator(),
        kind: "ast_validation",
        label: "AST patch validation",
        status,
        createdAt: this.now().toISOString(),
        summary: `${validation.summary.parsedDocumentCount}/${validation.summary.documentCount} patched AST document(s), ${validation.summary.diagnosticCount} diagnostic(s).`,
        payload: {
          planId: plan.id,
          analysis: AstAnalysisResultSchema.parse(validation),
        },
      }),
      metadata: {
        planId: plan.id,
        status: validation.status,
        documentCount: validation.summary.documentCount,
        parsedDocumentCount: validation.summary.parsedDocumentCount,
        diagnosticCount: validation.summary.diagnosticCount,
        hasBlockingDiagnostics: validation.summary.hasBlockingDiagnostics,
      },
    };
  }
}

function inferLanguage(path: string): RepositoryRetrievalCandidate["language"] {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".js")) return "javascript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".md")) return "markdown";
  return "text";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("AST patch validation cancelled.");
  error.name = "AbortError";
  throw error;
}
