import assert from "node:assert/strict";
import test from "node:test";
import { selectCuratorInputs } from "../dist/infrastructure/langgraph/curatorInputs.js";

const base = {
  userStoryId: "11111111-1111-4111-8111-111111111111",
  executionTimeMs: 1,
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
      output: { html: "<html>new</html>" },
      completedAt: "2026-05-26T00:02:00.000Z",
    },
    {
      ...base,
      status: "success",
      agentName: "qa",
      output: { testCases: [{ id: "TC-02", criterion: "new", steps: [], expected: "new" }] },
      completedAt: "2026-05-26T00:03:00.000Z",
    },
  ];

  const inputs = selectCuratorInputs(results);

  assert.equal(inputs.html, "<html>new</html>");
  assert.deepEqual(inputs.qaOutput.testCases, [
    { id: "TC-02", criterion: "new", steps: [], expected: "new" },
  ]);
});

test("selectCuratorInputs defaults missing QA output to empty test cases", () => {
  const inputs = selectCuratorInputs([]);

  assert.equal(inputs.html, "");
  assert.deepEqual(inputs.qaOutput.testCases, []);
});
