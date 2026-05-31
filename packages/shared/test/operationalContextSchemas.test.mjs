import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentContextEnvelopeSchema,
  OperationalMemorySummarySchema,
  PromptContextBundleSchema,
  SpecTraceabilityReportSchema,
} from "../dist/index.js";

const THREAD_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const USER_STORY_ID = "33333333-3333-4333-8333-333333333333";
const SPEC_ID = "44444444-4444-4444-8444-444444444444";
const now = "2026-05-29T00:00:00.000Z";

test("operational memory captures files, commands, diffs, errors, curator decisions and next step", () => {
  const memory = OperationalMemorySummarySchema.parse({
    workflowThreadId: THREAD_ID,
    runId: RUN_ID,
    userStoryId: USER_STORY_ID,
    operationalSessionIds: ["55555555-5555-4555-8555-555555555555"],
    filesRead: [{ path: "src/App.tsx", versionHash: "0123456789abcdef", readAt: now }],
    filesChanged: [
      {
        path: "src/App.tsx",
        changeType: "update",
        patchStrategy: "edit_file",
        diffPreview: "+ Home",
        changedAt: now,
      },
    ],
    commandsRun: [{ commandId: "build", status: "failed", exitCode: 1, ranAt: now }],
    diffsApplied: [
      {
        path: "src/App.tsx",
        changeType: "update",
        patchStrategy: "edit_file",
        diffPreview: "+ Home",
        changedAt: now,
      },
    ],
    errorsSeen: [{ message: "Adjacent JSX elements", source: "runtime", occurredAt: now }],
    attempts: [{ attempt: 1, status: "failed", summary: "Build failed", eventCount: 9 }],
    curatorDecisions: [
      {
        passed: false,
        score: 40,
        fixTarget: "front",
        notes: "Fix JSX",
        missingItems: ["build must pass"],
        decidedAt: now,
      },
    ],
    nextStep: {
      reason: "Fix JSX",
      recommendedAgent: "front",
      recommendedAgentProfileId: "front_agent",
      blocked: false,
      source: "curator",
    },
    generatedAt: now,
  });

  assert.equal(memory.filesRead[0].path, "src/App.tsx");
  assert.equal(memory.curatorDecisions[0].fixTarget, "front");
  assert.equal(memory.nextStep.recommendedAgentProfileId, "front_agent");
});

test("traceability report and prompt bundle can carry role-specific context", () => {
  const traceability = SpecTraceabilityReportSchema.parse({
    specId: SPEC_ID,
    userStoryId: USER_STORY_ID,
    generatedAt: now,
    records: [
      {
        requirement: {
          id: "acceptance:1",
          kind: "acceptance_criterion",
          label: "AC 1",
          text: "Home button text must change to Inicio",
          index: 0,
        },
        status: "covered",
        confidence: "high",
        evidence: [
          {
            type: "code_file",
            label: "src/App.tsx",
            path: "src/App.tsx",
            agentName: "front",
            sourceId: "change-set-1",
            confidence: "high",
            rationale: "Matched the edited component.",
          },
        ],
        gaps: [],
      },
    ],
    uncoveredRequirements: [],
    summary: { totalRequirements: 1, covered: 1, partial: 0, uncovered: 0 },
  });

  const contextProfile = AgentContextEnvelopeSchema.parse({
    agentName: "curator",
    agentProfileId: "curator_agent",
    purpose: "Validate diff against spec.",
    includeSections: ["traceability"],
    excludeSections: ["code_context"],
    sections: [
      {
        kind: "traceability",
        title: "Spec Traceability",
        priority: "high",
        items: ["covered=1"],
        diagnostics: [],
      },
    ],
    traceability,
    generatedAt: now,
  });

  const bundle = PromptContextBundleSchema.parse({
    agentProfileId: "curator_agent",
    scope: {
      workspaceFolderId: null,
      userStoryId: USER_STORY_ID,
      projectId: null,
      chatSessionId: null,
      workflowThreadId: THREAD_ID,
      codingTaskId: null,
      agentProfileId: "curator_agent",
    },
    summaries: [],
    memories: [],
    runtimeSkills: [],
    contextProfile,
    budget: {
      maxBytes: 28000,
      usedBytes: 1000,
      clippedBytes: 0,
      sections: [],
      diagnostics: [],
    },
  });

  assert.equal(bundle.contextProfile.agentName, "curator");
  assert.equal(bundle.contextProfile.traceability.summary.covered, 1);
});
