import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const checkedRoots = [
  ".horus/artifacts/browser-smoke",
  "data/preview-sessions",
];

const forbiddenFragments = [
  "local" + "host",
  ["127", "0", "0", "1"].join("."),
  "/" + "Users" + "/",
];

test("versioned runtime snapshots do not carry local hosts or machine paths", async () => {
  const checkedFiles = [];
  for (const root of checkedRoots) {
    for (const file of await listJsonFiles(root)) {
      checkedFiles.push(file);
      const content = await readFile(file, "utf8");
      for (const fragment of forbiddenFragments) {
        assert.equal(
          content.includes(fragment),
          false,
          `${file} contains non-portable fragment ${fragment}`
        );
      }
    }
  }
  assert.ok(checkedFiles.length >= 1);
});

async function listJsonFiles(root) {
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) return [];

  const result = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listJsonFiles(path)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) result.push(path);
  }
  return result.sort();
}
