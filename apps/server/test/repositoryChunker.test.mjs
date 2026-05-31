import assert from "node:assert/strict";
import test from "node:test";
import { RepositoryChunker } from "../dist/application/coding/RepositoryChunker.js";
import { TreeSitterAstAnalyzer } from "../dist/infrastructure/ast/TreeSitterAstAnalyzer.js";

test("RepositoryChunker creates symbol chunks from parsed AST documents", async () => {
  const source = [
    "export function DashboardCard() {",
    "  return <article>Revenue</article>;",
    "}",
    "",
  ].join("\n");
  const candidates = [candidate("src/DashboardCard.tsx", source)];
  const ast = await new TreeSitterAstAnalyzer().analyze({ candidates });

  const chunks = new RepositoryChunker().chunk({ candidates, ast });
  const symbolChunk = chunks.find((chunk) =>
    chunk.symbolNames.includes("DashboardCard")
  );

  assert.ok(symbolChunk);
  assert.equal(symbolChunk.kind, "symbol");
  assert.equal(symbolChunk.path, "src/DashboardCard.tsx");
  assert.match(symbolChunk.content, /DashboardCard/);
});

test("RepositoryChunker falls back to bounded text windows when AST is unavailable", () => {
  const source = Array.from({ length: 20 }, (_, index) =>
    `line ${index + 1}: generated project copy and details`
  ).join("\n");

  const chunks = new RepositoryChunker().chunk({
    candidates: [candidate("README.generated.txt", source, "text")],
    options: {
      maxChunkBytes: 120,
      maxChunksPerFile: 4,
      overlapLines: 1,
    },
  });

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.kind === "text_window"));
  assert.ok(chunks.every((chunk) => Buffer.byteLength(chunk.content, "utf-8") <= 160));
});

function candidate(path, content, language = "typescript") {
  return {
    path,
    language,
    bytes: Buffer.byteLength(content, "utf-8"),
    content,
    startLine: 1,
    endLine: Math.max(1, content.split("\n").length),
    score: 100,
    matchedTerms: [],
    excerpts: [],
  };
}
