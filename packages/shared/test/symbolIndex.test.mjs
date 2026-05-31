import assert from "node:assert/strict";
import test from "node:test";
import {
  SymbolIndexResultSchema,
  SymbolIndexEntrySchema,
  LspDiagnosticSchema,
} from "../dist/index.js";

const range = {
  startByte: 0,
  endByte: 3,
  startPosition: { row: 0, column: 0 },
  endPosition: { row: 0, column: 3 },
};

const symbol = {
  id: "src/App.tsx:component:App:0",
  path: "src/App.tsx",
  language: "typescript",
  name: "App",
  kind: "component",
  range,
  nameRange: range,
};

test("SymbolIndexEntrySchema tracks definition and reference evidence", () => {
  const entry = SymbolIndexEntrySchema.parse({
    symbol,
    location: { path: "src/App.tsx", range },
    definitionLocations: [{ path: "src/App.tsx", range }],
    referenceCount: 2,
    referenceLocations: [
      { path: "src/App.tsx", range },
      { path: "src/main.tsx", range },
    ],
    referenceResolution: "complete",
  });

  assert.equal(entry.symbol.name, "App");
  assert.equal(entry.referenceCount, 2);
  assert.equal(entry.referenceLocations.length, 2);
});

test("SymbolIndexResultSchema captures LSP diagnostics and summary", () => {
  const diagnostic = LspDiagnosticSchema.parse({
    path: "src/App.tsx",
    message: "Type mismatch.",
    severity: "error",
    source: "typescript",
    code: "2322",
    range,
  });

  const result = SymbolIndexResultSchema.parse({
    projectRootPath: "/tmp/project",
    status: "partial",
    entries: [
      {
        symbol,
        location: { path: "src/App.tsx", range },
        definitionLocations: [{ path: "src/App.tsx", range }],
        referenceCount: 1,
        referenceLocations: [{ path: "src/App.tsx", range }],
        referenceResolution: "complete",
      },
    ],
    diagnostics: [diagnostic],
    summary: {
      documentCount: 1,
      indexedSymbolCount: 1,
      diagnosticCount: 1,
      unresolvedSymbolCount: 0,
    },
    notes: [],
    generatedAt: "2026-05-28T23:00:00.000Z",
  });

  assert.equal(result.status, "partial");
  assert.equal(result.diagnostics[0].code, "2322");
});
