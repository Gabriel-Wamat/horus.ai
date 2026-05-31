import assert from "node:assert/strict";
import test from "node:test";
import { decideRouting } from "../dist/infrastructure/agents/OdinAgentImpl.js";
import { createOdinAgentNode } from "../dist/infrastructure/langgraph/nodes/odinAgentNode.js";

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: "11111111-1111-4111-8111-111111111111",
  version: 1,
  summary: "summary",
  technicalApproach: "approach",
  components: [{ name: "Hero", type: "ui", description: "Hero", dependencies: [] }],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: ["criterion"],
  generatedAt: "2026-05-26T00:00:00.000Z",
};

test("decideRouting routes QA-only curator feedback only to QA", () => {
  assert.deepEqual(
    decideRouting(spec, {
      passed: false,
      score: 60,
      notes: "Tests are incomplete",
      missingItems: ["Missing QA coverage"],
      fixTarget: "qa",
    }),
    ["qaAgent"]
  );
});

test("odinAgentNode always routes chat code changes through Front before validation", async () => {
  const story = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Edit title",
    description: "Edit title",
    acceptanceCriteria: ["Title is changed"],
    priority: "medium",
    labels: [],
    createdAt: "2026-05-26T00:00:00.000Z",
  };
  const apiHeavySpec = {
    ...spec,
    components: [
      {
        name: "TaskApiAdapter",
        type: "service",
        description: "Adapter with no UI type.",
        dependencies: [],
      },
    ],
    apiEndpoints: [
      {
        method: "GET",
        path: "/tasks",
        description: "List tasks",
      },
    ],
  };
  let fallbackRoutingCalled = false;
  const node = createOdinAgentNode({
    decideRouting: () => {
      fallbackRoutingCalled = true;
      return ["qaAgent"];
    },
  });

  const update = await node({
    userStories: [story],
    currentUSIndex: 0,
    specs: { [story.id]: apiHeavySpec },
    workspaceArtifactContext: {},
    humanFeedback: {},
    agentResults: {},
    status: "running",
    threadId: "22222222-2222-4222-8222-222222222222",
    workflowMode: "chat_code_change",
    sourceChatSessionId: "33333333-3333-4333-8333-333333333333",
    sourceChatMessageId: "44444444-4444-4444-8444-444444444444",
    executionBrief: "Troque o título grande.",
    routingDecision: [],
    curatorFeedback: {},
    retryCount: 0,
    pendingRetryApproval: null,
  });

  assert.equal(fallbackRoutingCalled, false);
  assert.deepEqual(update.routingDecision, ["frontAgent"]);
});
