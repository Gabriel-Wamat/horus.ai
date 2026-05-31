import assert from "node:assert/strict";
import test from "node:test";
import { AstAnalysisService } from "../dist/application/coding/AstAnalysisService.js";
import { AstAnalysisResultSchema } from "../../../packages/shared/dist/index.js";

test("AstAnalysisService analyzes retrieval candidates without reading files", async () => {
  let capturedCandidates = null;
  const service = new AstAnalysisService({
    async analyze(input) {
      capturedCandidates = input.candidates;
      return analysisResult({
        documentCount: input.candidates.length,
        parsedDocumentCount: input.candidates.length,
      });
    },
  });

  const result = await service.analyzeRetrieval({
    query: "ajuste App",
    status: "matched",
    candidates: [
      {
        path: "src/App.tsx",
        language: "typescript",
        bytes: 42,
        content: "export const App = () => <main />;",
        startLine: 1,
        endLine: 1,
        score: 100,
        matchedTerms: ["app"],
        excerpts: [],
      },
    ],
    excerpts: [],
    omittedFilesCount: 0,
    totalBytes: 42,
    stats: {
      totalFiles: 1,
      indexedFiles: 1,
      contentScannedFiles: 1,
      explicitPathCount: 0,
      blockedPathCount: 0,
    },
    notes: [],
    routingHints: [],
  });

  assert.equal(result.status, "complete");
  assert.equal(capturedCandidates[0].path, "src/App.tsx");
  assert.equal(capturedCandidates[0].content.includes("App"), true);
});

test("AstAnalysisService emits runtime artifact from retrieval artifact", async () => {
  const service = new AstAnalysisService(
    {
      async analyze(input) {
        return analysisResult({
          documentCount: input.candidates.length,
          parsedDocumentCount: input.candidates.length,
        });
      },
    },
    () => new Date("2026-05-28T20:00:00.000Z"),
    () => "11111111-1111-4111-8111-111111111111"
  );

  const result = await service.execute({
    task: { id: "task" },
    signal: new AbortController().signal,
    artifacts: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        kind: "retrieval",
        label: "Code retrieval",
        status: "ready",
        createdAt: "2026-05-28T20:00:00.000Z",
        payload: {
          query: "ajuste App",
          status: "matched",
          candidates: [
            {
              path: "src/App.tsx",
              language: "typescript",
              bytes: 42,
              content: "export const App = () => <main />;",
              startLine: 1,
              endLine: 1,
              score: 100,
              matchedTerms: ["app"],
              excerpts: [],
            },
          ],
          excerpts: [],
          omittedFilesCount: 0,
          totalBytes: 42,
          stats: {
            totalFiles: 1,
            indexedFiles: 1,
            contentScannedFiles: 1,
            explicitPathCount: 0,
            blockedPathCount: 0,
          },
          notes: [],
          routingHints: [],
        },
      },
    ],
  });

  assert.equal(result.artifact.kind, "ast_analysis");
  assert.equal(result.artifact.status, "ready");
  assert.equal(result.artifact.payload.status, "complete");
});

function analysisResult({ documentCount, parsedDocumentCount }) {
  return AstAnalysisResultSchema.parse({
    status: parsedDocumentCount === documentCount ? "complete" : "partial",
    documents: [],
    diagnostics: [],
    summary: {
      documentCount,
      parsedDocumentCount,
      unsupportedDocumentCount: 0,
      parseErrorDocumentCount: 0,
      diagnosticCount: 0,
      symbolCount: 0,
      hasBlockingDiagnostics: false,
      languageCounts: { typescript: documentCount },
    },
    generatedAt: "2026-05-28T20:00:00.000Z",
  });
}
