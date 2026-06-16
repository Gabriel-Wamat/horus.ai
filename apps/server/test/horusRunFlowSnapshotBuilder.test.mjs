import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowEventSchema } from "@u-build/shared";
import { HorusRunFlowSnapshotBuilder } from "../dist/application/services/HorusRunFlowSnapshotBuilder.js";
import { mapWorkflowEvent } from "../dist/application/services/horusRunFlowMapping.js";

const userStory = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "PM-01 - Interface",
  description: "Como usuário, quero acompanhar a execução.",
  acceptanceCriteria: ["Mostra execução"],
  priority: "medium",
  labels: [],
  createdAt: "2026-05-30T10:00:00.000Z",
};

const spec = {
  id: "22222222-2222-4222-8222-222222222222",
  userStoryId: userStory.id,
  version: 1,
  summary: "Acompanhar execução",
  technicalApproach: "Exibir console operacional.",
  components: [
    {
      name: "ExecutionConsole",
      type: "ui",
      description: "Mostra a narrativa operacional da execução.",
      dependencies: [],
    },
  ],
  apiEndpoints: [],
  dataModels: [],
  acceptanceCriteria: userStory.acceptanceCriteria,
  generatedAt: "2026-05-30T10:01:00.000Z",
};

function state(input) {
  return {
    threadId: input.threadId,
    workspaceFolderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    frontendProjectId: input.projectId ?? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    workflowMode: "chat_code_change",
    executionBrief: input.title,
    userStories: [{ ...userStory, title: input.title }],
    currentUSIndex: 0,
    specs: { [userStory.id]: { ...spec, summary: input.title } },
    workspaceArtifactContext: {},
    humanFeedback: {},
    agentResults: {},
    pendingCheckpoints: [],
    validationGates: [],
    status: input.status,
    startedAt: input.startedAt,
    ...(input.completedAt ? { completedAt: input.completedAt } : {}),
  };
}

function storage(states) {
  const byId = new Map(states.map((item) => [item.threadId, item]));
  return {
    save: async () => undefined,
    load: async (threadId) => byId.get(threadId) ?? null,
    list: async () => [...byId.keys()],
    delete: async () => undefined,
  };
}

function events(entries) {
  return {
    append: async () => {
      throw new Error("append not implemented in test");
    },
    list: async (threadId) => entries.get(threadId) ?? [],
    listAfter: async (threadId, sequence) =>
      (entries.get(threadId) ?? []).filter((event) => event.sequence > sequence),
  };
}

function workflowEvent(event, sequence) {
  return mapWorkflowEvent(WorkflowEventSchema.parse(event), sequence);
}

test("workflow event projection preserves UI-facing run event contract fields", () => {
  const threadId = "44444444-4444-4444-8444-444444444444";
  const approval = workflowEvent(
    {
      type: "command_approval_requested",
      threadId,
      agentName: "qa",
      agentProfileId: "qa_agent",
      toolName: "run_validation_command",
      commandId: "build-root-build",
      taskId: "task-build",
      approvalReason: "Operator approval required.",
      policyReason: "Package manager install needs approval.",
      risk: "medium",
      userStoryId: userStory.id,
      timestamp: "2026-05-30T10:02:00.000Z",
    },
    1
  );
  const recovery = workflowEvent(
    {
      type: "recovery_decision",
      threadId,
      userStoryId: userStory.id,
      gateId: "qa-build",
      gateType: "type_check",
      evidenceStatus: "failed",
      decision: {
        errorCode: "qa_validation_failed",
        failureClass: "qa_gate",
        severity: "high",
        retryable: true,
        fixTarget: "front",
        recoveryAction: "retry_agent",
        retryReason: "Type check can be repaired by the front agent.",
        maxAttempts: 3,
        requiresHumanApproval: false,
        operatorMessage: "Retry front agent with type-check evidence.",
        diagnostics: {},
      },
      timestamp: "2026-05-30T10:03:00.000Z",
    },
    2
  );
  const status = workflowEvent(
    {
      type: "status_changed",
      threadId,
      status: "running",
      timestamp: "2026-05-30T10:04:00.000Z",
    },
    3
  );

  assert.equal(approval.toolName, "run_validation_command");
  assert.equal(approval.commandId, "build-root-build");
  assert.equal(approval.taskId, "task-build");
  assert.equal(approval.policyReason, "Package manager install needs approval.");
  assert.equal(approval.approvalReason, "Operator approval required.");
  assert.equal(approval.risk, "medium");
  assert.deepEqual(approval.commandIds, ["build-root-build"]);
  assert.equal(recovery.decision?.retryable, true);
  assert.equal(recovery.decision?.recoveryAction, "retry_agent");
  assert.equal(status.status, "running");
});

test("HorusRunFlowSnapshotBuilder groups operation timeline by operational session", async () => {
  const threadId = "44444444-4444-4444-8444-444444444444";
  const operationalSessionId = "33333333-3333-4333-8333-333333333333";
  const snapshots = [
    workflowEvent(
      {
        type: "tool_call_started",
        threadId,
        agentName: "qa",
        agentProfileId: "qa_agent",
        toolName: "run_validation_command",
        operationalSessionId,
        taskId: "task-build",
        toolCallId: "tool-build",
        userStoryId: userStory.id,
        commandIds: ["build-root-build"],
        filePaths: ["src/App.tsx"],
        summary: "QA validating command build-root-build.",
        timestamp: "2026-05-30T10:02:00.000Z",
      },
      1
    ),
    workflowEvent(
      {
        type: "command_output",
        threadId,
        agentName: "qa",
        agentProfileId: "qa_agent",
        toolName: "run_validation_command",
        commandId: "build-root-build",
        taskId: "task-build",
        toolCallId: "tool-build",
        operationalSessionId,
        stream: "stdout",
        chunk: "building\n",
        chunkSequence: 0,
        userStoryId: userStory.id,
        timestamp: "2026-05-30T10:02:01.000Z",
      },
      2
    ),
    workflowEvent(
      {
        type: "tool_call_finished",
        threadId,
        agentName: "qa",
        agentProfileId: "qa_agent",
        toolName: "run_validation_command",
        status: "failed",
        operationalSessionId,
        taskId: "task-build",
        toolCallId: "tool-build",
        userStoryId: userStory.id,
        commandIds: ["build-root-build"],
        errorMessage: "command exited with code 1",
        timestamp: "2026-05-30T10:02:02.000Z",
      },
      3
    ),
  ];
  const builder = new HorusRunFlowSnapshotBuilder(
    storage([
      state({
        threadId,
        title: "PM-01 - Interface",
        status: "running",
        startedAt: "2026-05-30T10:00:00.000Z",
      }),
    ]),
    events(new Map([[threadId, snapshots]]))
  );

  const run = await builder.getRun(threadId);

  assert.ok(run);
  assert.equal(run.operationTimeline.length, 1);
  assert.equal(run.operationTimeline[0].operationalSessionId, operationalSessionId);
  assert.equal(run.operationTimeline[0].status, "failed");
  assert.equal(
    run.operationTimeline[0].items.filter((item) => item.kind === "command").length,
    3
  );
  assert.equal(
    run.operationTimeline[0].items.filter((item) => item.kind === "file").length,
    1
  );
  assert.equal(
    run.operationTimeline[0].items.find((item) => item.detail === "building\n")?.kind,
    "command"
  );
});

test("HorusRunFlowSnapshotBuilder lists active runs before old history and paginates", async () => {
  const completed = state({
    threadId: "55555555-5555-4555-8555-555555555555",
    title: "PM-01 - Completed",
    status: "completed",
    startedAt: "2026-05-30T10:00:00.000Z",
    completedAt: "2026-05-30T12:00:00.000Z",
  });
  const running = state({
    threadId: "66666666-6666-4666-8666-666666666666",
    title: "NX-01 - Running",
    status: "running",
    startedAt: "2026-05-30T09:00:00.000Z",
  });
  const awaiting = state({
    threadId: "77777777-7777-4777-8777-777777777777",
    title: "PM-02 - Awaiting",
    status: "awaiting_human",
    startedAt: "2026-05-30T08:00:00.000Z",
  });
  const builder = new HorusRunFlowSnapshotBuilder(
    storage([completed, running, awaiting]),
    events(new Map())
  );

  const firstPage = await builder.listRuns({ limit: 2 });
  const secondPage = await builder.listRuns({ offset: 2, limit: 2 });
  const queried = await builder.listRuns({ query: "PM-02", limit: 10 });

  assert.deepEqual(
    firstPage.map((run) => run.threadId),
    [running.threadId, awaiting.threadId]
  );
  assert.deepEqual(secondPage.map((run) => run.threadId), [completed.threadId]);
  assert.deepEqual(queried.map((run) => run.threadId), [awaiting.threadId]);
});
