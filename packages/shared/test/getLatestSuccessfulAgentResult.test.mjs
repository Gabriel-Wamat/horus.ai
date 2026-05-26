import assert from "node:assert/strict";
import test from "node:test";
import { getLatestSuccessfulAgentResult } from "../dist/entities/AgentResult.js";

const base = {
  userStoryId: "11111111-1111-4111-8111-111111111111",
  executionTimeMs: 1,
};

test("getLatestSuccessfulAgentResult returns the newest success for the requested agent", () => {
  const results = [
    {
      ...base,
      status: "success",
      agentName: "front",
      output: { html: "old" },
      completedAt: "2026-05-26T00:00:00.000Z",
    },
    {
      ...base,
      status: "error",
      agentName: "front",
      errorMessage: "failed",
      completedAt: "2026-05-26T00:01:00.000Z",
    },
    {
      ...base,
      status: "success",
      agentName: "qa",
      output: { testCases: ["first qa"] },
      completedAt: "2026-05-26T00:02:00.000Z",
    },
    {
      ...base,
      status: "success",
      agentName: "front",
      output: { html: "new" },
      completedAt: "2026-05-26T00:03:00.000Z",
    },
  ];

  assert.equal(
    getLatestSuccessfulAgentResult(results, "front")?.output.html,
    "new"
  );
});

test("getLatestSuccessfulAgentResult returns undefined when no success exists", () => {
  const results = [
    {
      ...base,
      status: "skipped",
      agentName: "curator",
      reason: "not needed",
      completedAt: "2026-05-26T00:00:00.000Z",
    },
  ];

  assert.equal(getLatestSuccessfulAgentResult(results, "curator"), undefined);
});
