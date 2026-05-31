import assert from "node:assert/strict";
import test from "node:test";
import { DiffBuilder, combineDiffStats } from "../dist/application/coding/DiffBuilder.js";

test("DiffBuilder generates deterministic replacement diffs", () => {
  const builder = new DiffBuilder();
  const built = builder.build({
    targetPath: "src/App.tsx",
    beforeContent: "export const value = 1;\n",
    afterContent: "export const value = 2;\n",
  });

  assert.match(built.diff, /^diff --git a\/src\/App.tsx b\/src\/App.tsx/m);
  assert.match(built.diff, /^--- a\/src\/App.tsx/m);
  assert.match(built.diff, /^\+\+\+ b\/src\/App.tsx/m);
  assert.match(built.diff, /^-export const value = 1;$/m);
  assert.match(built.diff, /^\+export const value = 2;$/m);
  assert.equal(built.stats.addedLines, 2);
  assert.equal(built.stats.removedLines, 2);
  assert.equal(built.stats.changedFiles, 1);
});

test("DiffBuilder generates delete diffs", () => {
  const builder = new DiffBuilder();
  const built = builder.build({
    targetPath: "src/unused.ts",
    beforeContent: "export const unused = true;\n",
    afterContent: null,
  });

  assert.match(built.diff, /^deleted file mode 100644$/m);
  assert.match(built.diff, /^\+\+\+ \/dev\/null$/m);
  assert.match(built.diff, /^-export const unused = true;$/m);
  assert.equal(built.stats.addedLines, 0);
  assert.equal(built.stats.removedLines, 2);
  assert.equal(built.stats.changedFiles, 1);
});

test("combineDiffStats sums patch totals", () => {
  assert.deepEqual(
    combineDiffStats([
      { addedLines: 2, removedLines: 1, changedFiles: 1 },
      { addedLines: 3, removedLines: 4, changedFiles: 1 },
    ]),
    { addedLines: 5, removedLines: 5, changedFiles: 2 }
  );
});
