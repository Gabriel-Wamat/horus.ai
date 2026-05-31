import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { TypeScriptLspClient } from "../dist/infrastructure/lsp/TypeScriptLspClient.js";

test("TypeScriptLspClient resolves definitions and references from indexed documents", async () => {
  const projectRootPath = await createProjectRoot();
  const helpers = 'export function formatTitle(value: string) { return value.toUpperCase(); }\n';
  const app = [
    'import { formatTitle } from "./helpers";',
    "export function App() {",
    '  return <main>{formatTitle("home")}</main>;',
    "}",
    "",
  ].join("\n");
  const client = new TypeScriptLspClient();
  await client.initialize({
    projectRootPath,
    candidates: [
      candidate("src/helpers.ts", helpers),
      candidate("src/App.tsx", app),
    ],
  });

  const usageLocation = locationForWord("src/App.tsx", app, "formatTitle", 1);
  const definitions = await client.definition({ location: usageLocation });
  const references = await client.references({
    location: locationForWord("src/helpers.ts", helpers, "formatTitle"),
    includeDeclaration: true,
  });
  const symbols = await client.documentSymbols({ path: "src/helpers.ts" });
  await client.shutdown();

  assert.ok(definitions.some((location) => location.path === "src/helpers.ts"));
  assert.ok(references.length >= 2);
  assert.ok(symbols.some((symbol) => symbol.name === "formatTitle"));
});

test("TypeScriptLspClient returns scoped TypeScript diagnostics", async () => {
  const projectRootPath = await createProjectRoot();
  const broken = "export const count: string = 42;\n";
  const client = new TypeScriptLspClient();
  await client.initialize({
    projectRootPath,
    candidates: [candidate("src/Broken.ts", broken)],
  });

  const diagnostics = await client.diagnostics({ path: "src/Broken.ts" });
  await client.shutdown();

  assert.ok(diagnostics.some((diagnostic) => diagnostic.severity === "error"));
  assert.ok(diagnostics.every((diagnostic) => diagnostic.path === "src/Broken.ts"));
});

async function createProjectRoot() {
  const projectRootPath = await mkdtemp(join(tmpdir(), "horus-ts-lsp-"));
  await mkdir(join(projectRootPath, "src"), { recursive: true });
  return projectRootPath;
}

function candidate(path, content) {
  return {
    path,
    language: path.endsWith(".tsx") ? "typescript" : "typescript",
    bytes: Buffer.byteLength(content, "utf-8"),
    content,
    startLine: 1,
    endLine: Math.max(1, content.split("\n").length),
    score: 100,
    matchedTerms: [],
    excerpts: [],
  };
}

function locationForWord(path, content, word, occurrence = 0) {
  let offset = -1;
  let cursor = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    offset = content.indexOf(word, cursor);
    cursor = offset + word.length;
  }
  assert.notEqual(offset, -1);
  return {
    path,
    range: {
      startByte: Buffer.byteLength(content.slice(0, offset), "utf-8"),
      endByte: Buffer.byteLength(content.slice(0, offset + word.length), "utf-8"),
      startPosition: positionAt(content, offset),
      endPosition: positionAt(content, offset + word.length),
    },
  };
}

function positionAt(content, offset) {
  const lines = content.slice(0, offset).split("\n");
  return {
    row: lines.length - 1,
    column: lines.at(-1)?.length ?? 0,
  };
}
