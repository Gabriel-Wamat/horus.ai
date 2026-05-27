import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkflowArtifactFiles } from "../dist/infrastructure/http/artifacts.js";

const storyId = "11111111-1111-4111-8111-111111111111";

test("buildWorkflowArtifactFiles uses latest successful front and QA artifacts", () => {
  const state = {
    threadId: "22222222-2222-4222-8222-222222222222",
    userStories: [
      {
        id: storyId,
        title: "Landing Page!",
        description: "Build it",
        acceptanceCriteria: ["Works"],
        priority: "medium",
        labels: [],
        createdAt: "2026-05-26T00:00:00.000Z",
      },
    ],
    currentUSIndex: 1,
    specs: {},
    humanFeedback: {},
    agentResults: {
      [storyId]: [
        {
          status: "success",
          agentName: "front",
          userStoryId: storyId,
          output: { html: "old html" },
          executionTimeMs: 1,
          completedAt: "2026-05-26T00:01:00.000Z",
        },
        {
          status: "success",
          agentName: "qa",
          userStoryId: storyId,
          output: { testCases: [{ id: "TC-01", criterion: "old", steps: [], expected: "old" }] },
          executionTimeMs: 1,
          completedAt: "2026-05-26T00:02:00.000Z",
        },
        {
          status: "success",
          agentName: "front",
          userStoryId: storyId,
          output: { html: "new html" },
          executionTimeMs: 1,
          completedAt: "2026-05-26T00:03:00.000Z",
        },
        {
          status: "success",
          agentName: "qa",
          userStoryId: storyId,
          output: { testCases: [{ id: "TC-02", criterion: "new", steps: [], expected: "new" }] },
          executionTimeMs: 1,
          completedAt: "2026-05-26T00:04:00.000Z",
        },
      ],
    },
    status: "completed",
    startedAt: "2026-05-26T00:00:00.000Z",
    completedAt: "2026-05-26T00:05:00.000Z",
  };

  assert.deepEqual(buildWorkflowArtifactFiles(state), [
    { name: "landing-page/page.html", content: "new html" },
    {
      name: "landing-page/test-cases.json",
      content: JSON.stringify(
        [{ id: "TC-02", criterion: "new", steps: [], expected: "new" }],
        null,
        2
      ),
    },
  ]);
});
