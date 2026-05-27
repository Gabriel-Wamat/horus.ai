import assert from "node:assert/strict";
import test from "node:test";
import {
  HorusRunEventSnapshotSchema,
  WorkflowEventSchema,
} from "../dist/index.js";

test("HorusRunEventSnapshot accepts normalized agentic loop fields", () => {
  const parsed = HorusRunEventSnapshotSchema.parse({
    id: "run-1:1:patch_proposed",
    threadId: "11111111-1111-4111-8111-111111111111",
    sequence: 1,
    type: "patch_proposed",
    phase: "patching",
    eventType: "patch_proposed",
    actorKind: "agent",
    actorName: "Front Agent",
    nodeId: "frontAgent",
    agentName: "front",
    agentProfileId: "front_agent",
    agentProfile: {
      id: "front_agent",
      agentName: "front",
      label: "Front Agent",
      purpose: "Produce auditable frontend CodeChangeSet proposals.",
      allowedTools: ["search_code_readonly"],
      forbiddenTools: ["arbitrary_shell"],
      inputContract: "UserStory + Spec + CodeContext",
      outputContract: "CodeChangeSet",
    },
    userStoryId: "22222222-2222-4222-8222-222222222222",
    title: "Patch proposto",
    metadata: { changeSetId: "33333333-3333-4333-8333-333333333333" },
    filePaths: ["src/App.tsx"],
    timestamp: "2026-05-26T10:00:00.000Z",
  });

  assert.equal(parsed.phase, "patching");
  assert.equal(parsed.eventType, "patch_proposed");
  assert.equal(parsed.agentProfileId, "front_agent");
  assert.equal(parsed.agentProfile?.outputContract, "CodeChangeSet");
  assert.deepEqual(parsed.filePaths, ["src/App.tsx"]);
});

test("WorkflowEventSchema accepts patch lifecycle events", () => {
  const event = WorkflowEventSchema.parse({
    type: "patch_applied",
    threadId: "11111111-1111-4111-8111-111111111111",
    userStoryId: "22222222-2222-4222-8222-222222222222",
    changeSetId: "33333333-3333-4333-8333-333333333333",
    filePaths: ["src/App.tsx"],
    timestamp: "2026-05-26T10:00:00.000Z",
  });

  assert.equal(event.type, "patch_applied");
  assert.equal(event.filePaths[0], "src/App.tsx");
});
