import assert from "node:assert/strict";
import test from "node:test";
import { decideRouting } from "../dist/infrastructure/agents/OdinAgentImpl.js";

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
