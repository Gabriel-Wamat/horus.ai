import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { RepositoryScanner } from "../dist/application/coding/RepositoryScanner.js";

async function setupRepository() {
  const baseDir = await mkdtemp(join(tmpdir(), "horus-repo-scan-"));
  const repoRoot = join(baseDir, "repo");
  await mkdir(join(repoRoot, "src", "components"), { recursive: true });
  await mkdir(join(repoRoot, "node_modules", "hidden"), { recursive: true });
  await mkdir(join(repoRoot, "dist"), { recursive: true });
  await writeFile(
    join(repoRoot, "src", "App.tsx"),
    "export function App() { return <main>Horus chat</main>; }",
    "utf-8"
  );
  await writeFile(
    join(repoRoot, "src", "components", "PreviewChat.tsx"),
    "export const PreviewChat = () => 'real chat';",
    "utf-8"
  );
  await writeFile(join(repoRoot, ".env"), "OPENAI_API_KEY=secret", "utf-8");
  await writeFile(
    join(repoRoot, "node_modules", "hidden", "secret.ts"),
    "export const secret = 'do-not-read';",
    "utf-8"
  );
  await writeFile(join(repoRoot, "dist", "bundle.js"), "generated", "utf-8");
  await writeFile(join(repoRoot, "image.png"), Buffer.from([0, 1, 2, 3]));
  await symlink(join(baseDir, "outside"), join(repoRoot, "outside-link")).catch(
    () => null
  );

  return { repoRoot };
}

test("RepositoryScanner indexes readable files and blocks unsafe repository entries", async () => {
  const { repoRoot } = await setupRepository();
  const scanner = new RepositoryScanner(undefined, () => new Date("2026-05-28T19:00:00.000Z"));

  const snapshot = await scanner.scan({
    projectId: "11111111-1111-4111-8111-111111111111",
    projectRootPath: repoRoot,
  });

  assert.equal(snapshot.files.some((file) => file.path === "src/App.tsx"), true);
  assert.equal(
    snapshot.files.some((file) => file.path.includes("node_modules")),
    false
  );
  assert.equal(snapshot.files.some((file) => file.path.startsWith("dist/")), false);
  assert.equal(
    snapshot.files.some((file) => file.path === ".env" && file.safety === "readable"),
    false
  );
  assert.ok(snapshot.stats.blockedFiles >= 1);
  assert.ok(snapshot.stats.binaryFiles >= 1);
  assert.ok(snapshot.stats.ignoredEntries >= 2);
});

test("RepositoryScanner blocks selected paths outside the project root", async () => {
  const { repoRoot } = await setupRepository();
  const scanner = new RepositoryScanner(undefined, () => new Date("2026-05-28T19:00:00.000Z"));

  const snapshot = await scanner.scan({
    projectRootPath: repoRoot,
    selectedPaths: ["../outside.ts"],
  });

  assert.equal(snapshot.files.length, 0);
  assert.equal(snapshot.stats.blockedFiles, 1);
  assert.ok(snapshot.notes.some((note) => note.includes("bloqueado")));
});
