import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { RepositoryScanner } from "../dist/application/coding/RepositoryScanner.js";
import { TextRepositoryRetriever } from "../dist/application/coding/TextRepositoryRetriever.js";

async function setupRepository() {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-repo-retrieval-"));
  const repoRoot = join(baseDir, "repo");
  await mkdir(join(repoRoot, "src", "components"), { recursive: true });
  await writeFile(
    join(repoRoot, "package.json"),
    JSON.stringify({ name: "@u-build/web", scripts: { dev: "vite" } }),
    "utf-8"
  );
  await writeFile(
    join(repoRoot, "src", "App.tsx"),
    "export function App() { return <main>Preview chat</main>; }",
    "utf-8"
  );
  await writeFile(
    join(repoRoot, "src", "components", "PreviewChat.tsx"),
    "export const PreviewChat = () => 'Horus chat response';",
    "utf-8"
  );
  for (let index = 0; index < 10; index += 1) {
    await writeFile(
      join(repoRoot, "src", "components", `Noise${index}.tsx`),
      `export const Noise${index} = () => 'irrelevant ${index}';`,
      "utf-8"
    );
  }
  return { repoRoot };
}

test("TextRepositoryRetriever ranks explicit paths before lexical matches", async () => {
  const { repoRoot } = await setupRepository();
  const scanner = new RepositoryScanner();
  const retriever = new TextRepositoryRetriever();
  const scan = await scanner.scan({ projectRootPath: repoRoot });

  const result = await retriever.retrieve({
    scan,
    query: "Me mostre src/App.tsx que renderiza Preview chat",
  });

  assert.equal(result.status, "matched");
  assert.equal(result.candidates[0].path, "src/App.tsx");
  assert.equal(result.excerpts[0].filePath, "src/App.tsx");
  assert.equal(result.routingHints[0].surface, "frontend");
});

test("TextRepositoryRetriever preserves retrieval budgets and explicit grounding", async () => {
  const { repoRoot } = await setupRepository();
  const scanner = new RepositoryScanner();
  const retriever = new TextRepositoryRetriever();
  const scan = await scanner.scan({ projectRootPath: repoRoot });

  const result = await retriever.retrieve({
    scan,
    query:
      "Me mostre src/components/PreviewChat.tsx e o símbolo PreviewChat do chat.",
    budget: {
      maxFiles: 3,
      maxContentScanFiles: 3,
      maxBytesPerFile: 8000,
      maxTotalBytes: 32000,
      maxExcerpts: 2,
      concurrency: 2,
    },
  });

  assert.equal(result.status, "matched");
  assert.equal(result.candidates[0].path, "src/components/PreviewChat.tsx");
  assert.equal(result.stats.explicitPathCount, 1);
  assert.ok(result.stats.contentScannedFiles < result.stats.indexedFiles);
  assert.ok(result.notes.some((note) => note.includes("limitada")));
});

test("TextRepositoryRetriever blocks invalid explicit path requests", async () => {
  const { repoRoot } = await setupRepository();
  const scanner = new RepositoryScanner();
  const retriever = new TextRepositoryRetriever();
  const scan = await scanner.scan({ projectRootPath: repoRoot });

  const result = await retriever.retrieve({
    scan,
    query: "Leia ../outside.ts",
    requestedPaths: ["../outside.ts"],
    budget: {
      maxFiles: 1,
      maxContentScanFiles: 1,
      maxBytesPerFile: 8000,
      maxTotalBytes: 32000,
      maxExcerpts: 1,
      concurrency: 1,
    },
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.stats.blockedPathCount, 1);
  assert.ok(result.notes.some((note) => note.includes("bloquead")));
});
