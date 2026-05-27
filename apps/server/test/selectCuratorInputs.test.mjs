import assert from "node:assert/strict";
import test from "node:test";
import { selectCuratorInputs } from "../dist/infrastructure/langgraph/curatorInputs.js";

const base = {
  userStoryId: "11111111-1111-4111-8111-111111111111",
  executionTimeMs: 1,
};

const codeChangeSet = {
  id: "33333333-3333-4333-8333-333333333333",
  workflowThreadId: "22222222-2222-4222-8222-222222222222",
  userStoryId: base.userStoryId,
  sourceAgent: "front",
  status: "proposed",
  operations: [
    {
      targetPath: "generated/horus/11111111-1111-4111-8111-111111111111.html",
      changeType: "create",
      beforeContent: null,
      afterContent: "<html>new</html>",
      diff: "diff --git a/generated/horus/story.html b/generated/horus/story.html",
    },
  ],
  validation: [],
  createdAt: "2026-05-26T00:02:00.000Z",
};

test("selectCuratorInputs selects the latest front HTML and QA test cases", () => {
  const results = [
    {
      ...base,
      status: "success",
      agentName: "front",
      output: { html: "<html>old</html>" },
      completedAt: "2026-05-26T00:00:00.000Z",
    },
    {
      ...base,
      status: "success",
      agentName: "qa",
      output: { testCases: [{ id: "TC-01", criterion: "old", steps: [], expected: "old" }] },
      completedAt: "2026-05-26T00:01:00.000Z",
    },
    {
      ...base,
      status: "success",
      agentName: "front",
      output: { html: "<html>new</html>", codeChangeSet },
      completedAt: "2026-05-26T00:02:00.000Z",
    },
    {
      ...base,
      status: "success",
      agentName: "qa",
      output: {
        testCases: [{ id: "TC-02", criterion: "new", steps: [], expected: "new" }],
        previewSmoke: {
          status: "passed",
          reason: "preview_reachable",
          elapsedMs: 10,
          checkedAt: "2026-05-26T00:03:00.000Z",
        },
      },
      completedAt: "2026-05-26T00:03:00.000Z",
    },
  ];

  const inputs = selectCuratorInputs(results);

  assert.equal(inputs.html, "<html>new</html>");
  assert.deepEqual(inputs.qaOutput.testCases, [
    { id: "TC-02", criterion: "new", steps: [], expected: "new" },
  ]);
  assert.equal(inputs.qaOutput.previewSmoke?.status, "passed");
  assert.equal(inputs.qaOutput.previewSmoke?.reason, "preview_reachable");
  assert.equal(inputs.codeChangeSet?.id, codeChangeSet.id);
});

test("selectCuratorInputs defaults missing QA output to empty test cases", () => {
  const inputs = selectCuratorInputs([]);

  assert.equal(inputs.html, "");
  assert.deepEqual(inputs.qaOutput.testCases, []);
});
