import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const checkedRoots = ["docs", "spec"];
const windowsSeparator = "\\";
const execFileAsync = promisify(execFile);

const forbiddenFragments = [
  "local" + "host",
  ["127", "0", "0", "1"].join("."),
  "/" + "Users" + "/",
  "C:" + windowsSeparator + "Users",
  "C:" + windowsSeparator + windowsSeparator + "Users",
];

test("versioned docs and specs use portable paths and hosts", async () => {
  const checkedFiles = await listVersionedFiles(checkedRoots);
  for (const file of checkedFiles) {
    const content = await readFile(file, "utf8");
    for (const fragment of forbiddenFragments) {
      assert.equal(
        content.includes(fragment),
        false,
        `${file} contains non-portable fragment ${fragment}`
      );
    }
  }
  assert.ok(checkedFiles.length >= 1);
});

async function listVersionedFiles(roots) {
  const { stdout } = await execFileAsync("git", ["ls-files", ...roots], {
    encoding: "utf8",
  });
  return stdout.trim().split("\n").filter(Boolean).sort();
}
