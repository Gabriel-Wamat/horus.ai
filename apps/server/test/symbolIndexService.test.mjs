import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { SymbolIndexService } from "../dist/application/coding/SymbolIndexService.js";
import { TreeSitterAstAnalyzer } from "../dist/infrastructure/ast/TreeSitterAstAnalyzer.js";
import { TypeScriptLspClient } from "../dist/infrastructure/lsp/TypeScriptLspClient.js";

test("SymbolIndexService enriches AST symbols with definitions and reference counts", async () => {
  const projectRootPath = await createProjectRoot();
  const candidates = [
    candidate(
      "src/helpers.ts",
      'export function formatTitle(value: string) { return value.toUpperCase(); }\n'
    ),
    candidate(
      "src/App.ts",
      [
        'import { formatTitle } from "./helpers";',
        "export function App() {",
        '  return formatTitle("home");',
        "}",
        "",
      ].join("\n")
    ),
  ];
  const ast = await new TreeSitterAstAnalyzer().analyze({ candidates });
  const service = new SymbolIndexService(
    () => new TypeScriptLspClient(),
    {
      now: () => new Date("2026-05-28T23:00:00.000Z"),
      maxReferencesPerSymbol: 8,
    }
  );

  const result = await service.buildIndex({
    projectRootPath,
    candidates,
    ast,
  });

  const helperEntry = result.entries.find(
    (entry) => entry.symbol.path === "src/helpers.ts" && entry.symbol.name === "formatTitle"
  );

  assert.ok(helperEntry);
  assert.equal(result.status, "complete");
  assert.ok(helperEntry.referenceCount >= 2);
  assert.ok(
    helperEntry.definitionLocations.some(
      (location) => location.path === "src/helpers.ts"
    )
  );
  assert.equal(result.summary.diagnosticCount, 0);
});

test("SymbolIndexService returns partial index when TypeScript diagnostics exist", async () => {
  const projectRootPath = await createProjectRoot();
  const candidates = [
    candidate("src/Broken.ts", "export const count: string = 42;\n"),
  ];
  const ast = await new TreeSitterAstAnalyzer().analyze({ candidates });
  const service = new SymbolIndexService(() => new TypeScriptLspClient(), {
    now: () => new Date("2026-05-28T23:00:00.000Z"),
  });

  const result = await service.buildIndex({
    projectRootPath,
    candidates,
    ast,
  });

  assert.equal(result.status, "partial");
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.severity === "error"));
  assert.equal(result.diagnostics[0].path, "src/Broken.ts");
});

async function createProjectRoot() {
  const projectRootPath = await mkdtemp(join(tmpdir(), "horus-symbol-index-"));
  await mkdir(join(projectRootPath, "src"), { recursive: true });
  return projectRootPath;
}

function candidate(path, content) {
  return {
    path,
    language: "typescript",
    bytes: Buffer.byteLength(content, "utf-8"),
    content,
    startLine: 1,
    endLine: Math.max(1, content.split("\n").length),
    score: 100,
    matchedTerms: [],
    excerpts: [],
  };
}
