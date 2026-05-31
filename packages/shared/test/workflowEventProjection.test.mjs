import assert from "node:assert/strict";
import test from "node:test";
import {
  mapWorkflowEventToHorusRunEvent,
  mapWorkflowEventsToHorusRunEvents,
} from "../dist/index.js";

const threadId = "11111111-1111-4111-8111-111111111111";
const userStoryId = "22222222-2222-4222-8222-222222222222";
const changeSetId = "33333333-3333-4333-8333-333333333333";
const evidenceId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-05-28T14:19:19.000Z";

test("maps representative workflow events to canonical run snapshots", () => {
  const events = [
    {
      type: "status_changed",
      threadId,
      status: "running",
      timestamp,
    },
    {
      type: "node_completed",
      threadId,
      agentName: "front",
      userStoryId,
      status: "success",
      timestamp,
    },
    {
      type: "validation_evidence",
      threadId,
      userStoryId,
      evidence: {
        id: evidenceId,
        workflowThreadId: threadId,
        constructionRunId: null,
        userStoryId,
        projectId: null,
        status: "passed",
        skippedReason: null,
        commands: [
          {
            commandId: "build",
            command: "pnpm build",
            cwd: "/workspace",
            exitCode: 0,
            stdoutTail: "ok",
            stderrTail: "",
            durationMs: 120,
          },
        ],
        preview: {
          status: "passed",
          url: null,
          message: "Preview responded.",
          evidence: {
            title: null,
            bodySnippet: null,
            screenshotPath: null,
          },
        },
        createdAt: timestamp,
      },
      timestamp,
    },
    {
      type: "tool_call_finished",
      threadId,
      agentName: "front",
      agentProfileId: "front_agent",
      toolName: "edit_file",
      status: "succeeded",
      userStoryId,
      filePaths: ["src/App.tsx"],
      timestamp,
    },
    {
      type: "awaiting_retry_approval",
      threadId,
      userStoryId,
      retryCount: 3,
      score: 61,
      notes: "Needs human review.",
      missingItems: ["Preview did not match spec."],
      timestamp,
    },
    {
      type: "error",
      threadId,
      message: "Graph failed.",
      timestamp,
    },
    {
      type: "recovery_decision",
      threadId,
      userStoryId,
      candidateId: changeSetId,
      gateId: "path_safety",
      gateType: "path_safety",
      evidenceStatus: "blocked",
      decision: {
        errorCode: "path_safety_blocked",
        failureClass: "path_safety_gate",
        severity: "critical",
        retryable: false,
        fixTarget: "front",
        recoveryAction: "block_delivery",
        retryReason: "Path escaped root.",
        maxAttempts: 0,
        requiresHumanApproval: true,
        operatorMessage: "Delivery blocked.",
      },
      timestamp,
    },
  ];

  const snapshots = mapWorkflowEventsToHorusRunEvents(events);

  assert.equal(snapshots[0].nodeId, undefined);
  assert.equal(snapshots[0].phase, "received");
  assert.equal(snapshots[0].eventType, "received");
  assert.equal(snapshots[1].nodeId, "frontAgent");
  assert.equal(snapshots[1].eventType, "patch_proposed");
  assert.equal(snapshots[1].summary, "Status: success");
  assert.equal(snapshots[2].nodeId, "qaAgent");
  assert.equal(snapshots[2].eventType, "validation_passed");
  assert.deepEqual(snapshots[2].commandIds, ["build"]);
  assert.equal(snapshots[2].validationGateId, evidenceId);
  assert.equal(snapshots[3].nodeId, "frontAgent");
  assert.equal(snapshots[3].phase, "patching");
  assert.deepEqual(snapshots[3].filePaths, ["src/App.tsx"]);
  assert.equal(snapshots[4].nodeId, "retryCheckpoint");
  assert.equal(snapshots[4].attempt, 3);
  assert.equal(snapshots[4].eventType, "awaiting_approval");
  assert.equal(snapshots[5].nodeId, "fail");
  assert.equal(snapshots[5].errorMessage, "Graph failed.");
  assert.equal(snapshots[6].nodeId, "retryCheckpoint");
  assert.equal(snapshots[6].eventType, "recovery_decision");
  assert.equal(snapshots[6].summary, "Delivery blocked.");
});

test("adds optional server-side agent profile enrichment without making it mandatory", () => {
  const snapshot = mapWorkflowEventToHorusRunEvent(
    {
      type: "patch_proposed",
      threadId,
      userStoryId,
      changeSetId,
      filePaths: ["src/App.tsx"],
      timestamp,
    },
    1,
    {
      resolveAgentProfile: (agentName) => ({
        agentProfileId: `${agentName}_agent`,
        agentProfile: {
          id: `${agentName}_agent`,
          agentName,
          label: "Front Agent",
          purpose: "Test profile",
          allowedTools: [],
          forbiddenTools: [],
          inputContract: "Workflow event",
          outputContract: "Run event snapshot",
        },
      }),
    }
  );

  assert.equal(snapshot.agentProfileId, "front_agent");
  assert.equal(snapshot.agentProfile?.agentName, "front");
  assert.equal(snapshot.metadata?.changeSetId, changeSetId);
});
