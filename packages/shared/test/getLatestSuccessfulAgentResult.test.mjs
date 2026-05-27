import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentResultSchema,
  getLatestSuccessfulAgentResult,
} from "../dist/entities/AgentResult.js";
import { CodeChangeSetSchema } from "../dist/entities/CodeChangeSet.js";

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

test("AgentResultSchema accepts consumed workspace artifact revision metadata", () => {
  const parsed = AgentResultSchema.parse({
    ...base,
    status: "success",
    agentName: "front",
    output: { html: "<main></main>" },
    completedAt: "2026-05-26T00:03:00.000Z",
    workspaceFolderId: "22222222-2222-4222-8222-222222222222",
    userStoryRevisionId: "user-story:2",
    specRevisionId: "spec:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:abc123",
    chatSessionId: "33333333-3333-4333-8333-333333333333",
    sourceMessageId: "44444444-4444-4444-8444-444444444444",
  });

  assert.equal(parsed.workspaceFolderId, "22222222-2222-4222-8222-222222222222");
  assert.equal(parsed.userStoryRevisionId, "user-story:2");
  assert.equal(parsed.specRevisionId, "spec:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:abc123");
  assert.equal(parsed.chatSessionId, "33333333-3333-4333-8333-333333333333");
  assert.equal(parsed.sourceMessageId, "44444444-4444-4444-8444-444444444444");
});

test("CodeChangeSetSchema requires auditable file operations", () => {
  const parsed = CodeChangeSetSchema.parse({
    id: "33333333-3333-4333-8333-333333333333",
    workflowThreadId: "22222222-2222-4222-8222-222222222222",
    workspaceFolderId: "11111111-1111-4111-8111-111111111111",
    userStoryId: "44444444-4444-4444-8444-444444444444",
    sourceAgent: "front",
    status: "proposed",
    operations: [
      {
        targetPath: "generated/horus/story.html",
        changeType: "create",
        beforeContent: null,
        afterContent: "<!DOCTYPE html>",
        diff: "diff --git a/generated/horus/story.html b/generated/horus/story.html",
      },
    ],
    validation: [],
    createdAt: "2026-05-26T00:00:00.000Z",
  });

  assert.equal(parsed.operations[0].changeType, "create");
});
