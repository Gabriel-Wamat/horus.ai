import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentRunbookEntrySchema,
  HorusRunSnapshotSchema,
} from "../dist/index.js";

const threadId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const storyId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-05-28T22:00:00.000Z";

test("AgentRunbookEntry accepts deterministic progress evidence", () => {
  const entry = AgentRunbookEntrySchema.parse({
    id: "operation:1",
    workflowThreadId: threadId,
    sessionId,
    sourceEventIds: ["44444444-4444-4444-8444-444444444444"],
    sequence: 1,
    agentName: "front",
    agentProfileId: "front_agent",
    toolName: "edit_file",
    action: "change_file",
    status: "succeeded",
    title: "Editou src/App.tsx",
    target: "src/App.tsx",
    filePaths: ["src/App.tsx"],
    startedAt: timestamp,
    updatedAt: timestamp,
  });

  assert.equal(entry.status, "succeeded");
  assert.equal(entry.action, "change_file");
  assert.deepEqual(entry.filePaths, ["src/App.tsx"]);
});

test("HorusRunSnapshot carries replayable runbook entries", () => {
  const snapshot = HorusRunSnapshotSchema.parse({
    threadId,
    workflowMode: "standard",
    status: "running",
    currentNode: "frontAgent",
    currentUserStoryId: storyId,
    currentUserStoryTitle: "Criar dashboard",
    startedAt: timestamp,
    userStories: [
      {
        id: storyId,
        title: "Criar dashboard",
        index: 0,
        hasSpec: true,
      },
    ],
    steps: [],
    agentExecutions: [],
    events: [],
    runbookEntries: [
      {
        id: "operation:1",
        workflowThreadId: threadId,
        sessionId,
        sourceEventIds: ["44444444-4444-4444-8444-444444444444"],
        sequence: 1,
        agentName: "front",
        agentProfileId: "front_agent",
        action: "read_file",
        status: "succeeded",
        title: "Leu src/App.tsx",
        target: "src/App.tsx",
        filePaths: ["src/App.tsx"],
        startedAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    sourceState: {
      threadId,
      workflowMode: "standard",
      status: "running",
      userStories: [
        {
          id: storyId,
          title: "Criar dashboard",
          description: "Criar dashboard",
          priority: "medium",
          acceptanceCriteria: ["Renderizar dashboard"],
          createdAt: timestamp,
        },
      ],
      currentUSIndex: 0,
      specs: {},
      humanFeedback: {},
      agentResults: {},
      validationGates: [],
      startedAt: timestamp,
    },
  });

  assert.equal(snapshot.runbookEntries[0].title, "Leu src/App.tsx");
});
