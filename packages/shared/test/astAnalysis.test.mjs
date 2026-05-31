import assert from "node:assert/strict";
import test from "node:test";
import {
  AstAnalysisResultSchema,
  AstDocumentSchema,
  AstSymbolSchema,
} from "../dist/entities/AstAnalysis.js";

const now = "2026-05-28T20:00:00.000Z";

test("AstDocumentSchema accepts structural symbols and diagnostics", () => {
  const symbol = AstSymbolSchema.parse({
    id: "src-App-component-0",
    path: "src/App.tsx",
    language: "typescript",
    name: "App",
    kind: "component",
    range: range(0, 42),
    nameRange: range(16, 19),
    exportKind: "named",
  });

  const document = AstDocumentSchema.parse({
    path: "src/App.tsx",
    language: "typescript",
    contentHash: "abc123",
    bytes: 42,
    lineCount: 1,
    parseStatus: "parsed",
    rootType: "program",
    symbols: [symbol],
    diagnostics: [],
  });

  assert.equal(document.symbols[0].kind, "component");
});

test("AstAnalysisResultSchema exposes blocking diagnostics and summary counts", () => {
  const parsed = AstAnalysisResultSchema.parse({
    status: "partial",
    documents: [
      {
        path: "src/Broken.tsx",
        language: "typescript",
        contentHash: "def456",
        bytes: 10,
        lineCount: 1,
        parseStatus: "parse_error",
        symbols: [],
        diagnostics: [
          {
            path: "src/Broken.tsx",
            code: "parse_error",
            message: "Syntax error near node: ERROR.",
            severity: "error",
            source: "tree-sitter",
            range: range(0, 10),
          },
        ],
      },
    ],
    diagnostics: [
      {
        path: "src/Broken.tsx",
        code: "parse_error",
        message: "Syntax error near node: ERROR.",
        severity: "error",
        source: "tree-sitter",
        range: range(0, 10),
      },
    ],
    summary: {
      documentCount: 1,
      parsedDocumentCount: 0,
      unsupportedDocumentCount: 0,
      parseErrorDocumentCount: 1,
      diagnosticCount: 1,
      symbolCount: 0,
      hasBlockingDiagnostics: true,
      languageCounts: { typescript: 1 },
    },
    generatedAt: now,
  });

  assert.equal(parsed.summary.hasBlockingDiagnostics, true);
});

function range(startByte, endByte) {
  return {
    startByte,
    endByte,
    startPosition: { row: 0, column: startByte },
    endPosition: { row: 0, column: endByte },
  };
}
