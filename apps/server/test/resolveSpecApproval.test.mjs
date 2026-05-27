import assert from "node:assert/strict";
import test from "node:test";
import { resolveSpecApproval } from "../dist/infrastructure/langgraph/nodes/hitlCheckpointNode.js";

const userStoryId = "11111111-1111-4111-8111-111111111111";
const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId,
  version: 1,
  summary: "summary",
  technicalApproach: "approach",
  components: [{ name: "Hero", type: "ui", description: "Hero", dependencies: [] }],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: ["criterion"],
  generatedAt: "2026-05-26T00:00:00.000Z",
};

test("resolveSpecApproval cancels the workflow when a spec is rejected", () => {
  const feedback = {
    approved: false,
    reviewedAt: "2026-05-26T00:01:00.000Z",
  };

  assert.deepEqual(resolveSpecApproval(userStoryId, spec, feedback), {
    humanFeedback: { [userStoryId]: feedback },
    status: "cancelled",
  });
});

test("resolveSpecApproval stores edited spec when approved", () => {
  const editedSpec = { ...spec, summary: "edited" };
  const feedback = {
    approved: true,
    editedSpec,
    reviewedAt: "2026-05-26T00:02:00.000Z",
  };

  assert.deepEqual(resolveSpecApproval(userStoryId, spec, feedback), {
    humanFeedback: { [userStoryId]: feedback },
    specs: { [userStoryId]: editedSpec },
    status: "running",
  });
});
