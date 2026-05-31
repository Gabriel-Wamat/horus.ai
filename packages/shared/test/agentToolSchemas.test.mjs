import assert from "node:assert/strict";
import test from "node:test";
import {
  IncrementalEditInputSchema,
  IncrementalEditResultSchema,
  WriteFileToolInputSchema,
} from "../dist/entities/AgentTool.js";

test("IncrementalEditInputSchema requires exact replacement intent", () => {
  const parsed = IncrementalEditInputSchema.parse({
    path: "src/App.tsx",
    oldString: "before",
    newString: "after",
    expectedContentHash: "a".repeat(64),
  });

  assert.equal(parsed.path, "src/App.tsx");
  assert.equal(parsed.oldString, "before");
  assert.equal(parsed.newString, "after");
  assert.equal(parsed.replaceAll, false);
});

test("IncrementalEditResultSchema carries diff and replacement evidence", () => {
  const parsed = IncrementalEditResultSchema.parse({
    path: "src/App.tsx",
    changed: true,
    newVersionHash: "b".repeat(64),
    replacementCount: 1,
    additions: 2,
    deletions: 1,
    diff: "diff --git a/src/App.tsx b/src/App.tsx",
  });

  assert.equal(parsed.changed, true);
  assert.equal(parsed.replacementCount, 1);
});

test("WriteFileToolInputSchema defaults to create-only behavior", () => {
  const parsed = WriteFileToolInputSchema.parse({
    path: "src/NewPanel.tsx",
    content: "export const NewPanel = () => null;\n",
  });

  assert.equal(parsed.overwrite, false);
});
