import assert from "node:assert/strict";
import { test } from "node:test";
import { ArtifactCandidateService } from "../dist/application/services/ArtifactCandidateService.js";

const workflowThreadId = "11111111-1111-4111-8111-111111111111";
const userStoryId = "22222222-2222-4222-8222-222222222222";
const changeSetId = "33333333-3333-4333-8333-333333333333";

function createRepository() {
  const candidates = [];
  const evidence = [];
  const spans = [];
  return {
    candidates,
    evidence,
    spans,
    saveCandidate: async (candidate) => {
      const index = candidates.findIndex((entry) => entry.id === candidate.id);
      if (index >= 0) candidates[index] = candidate;
      else candidates.push(candidate);
      return candidate;
    },
    getCandidate: async (candidateId) =>
      candidates.find((candidate) => candidate.id === candidateId) ?? null,
    listCandidates: async () => candidates,
    saveEvidence: async (entry) => {
      evidence.push(entry);
      return entry;
    },
    listEvidence: async () => evidence,
    saveTraceSpan: async (span) => {
      spans.push(span);
      return span;
    },
    listTraceSpans: async () => spans,
  };
}

function changeSet() {
  return {
    id: changeSetId,
    workflowThreadId,
    userStoryId,
    sourceAgent: "front",
    status: "proposed",
    operations: [
      {
        targetPath: "src/App.tsx",
        changeType: "update",
        beforeContent: "old",
        afterContent: "new",
        diff: "--- src/App.tsx\n+++ src/App.tsx\n-new\n+old",
      },
    ],
    validation: [],
    createdAt: "2026-05-27T12:00:00.000Z",
  };
}

test("ArtifactCandidateService records CodeChangeSet candidate with attempt lineage", async () => {
  const repository = createRepository();
  const service = new ArtifactCandidateService(repository);

  const recorded = await service.recordCodeChangeCandidate({
    changeSet: changeSet(),
    execution: {
      runId: "44444444-4444-4444-8444-444444444444",
      attemptId: "55555555-5555-4555-8555-555555555555",
    },
  });

  assert.equal(recorded.candidate.id, changeSetId);
  assert.equal(recorded.changeSet.artifactCandidateId, changeSetId);
  assert.equal(recorded.candidate.runId, "44444444-4444-4444-8444-444444444444");
  assert.equal(recorded.candidate.status, "proposed");
});

test("ArtifactCandidateService links failed evidence to self-healing trace", async () => {
  const repository = createRepository();
  const workflowEvents = [];
  const service = new ArtifactCandidateService(repository, {
    emit: (event) => workflowEvents.push(event),
  });
  const { candidate } = await service.recordCodeChangeCandidate({
    changeSet: changeSet(),
  });

  await service.recordCuratorEvidence({
    candidate,
    passed: false,
    notes: "Visual review failed.",
    missingItems: ["Header is unreadable"],
    fixTarget: "front",
  });

  assert.equal(repository.evidence[0].candidateId, candidate.id);
  assert.equal(repository.evidence[0].status, "failed");
  assert.equal(repository.spans[0].spanType, "retry");
  assert.equal(repository.spans[0].redactedOutput.fixTarget, "front");
  assert.equal(repository.spans[0].redactedOutput.errorCode, "curator_rejected");
  assert.equal(repository.spans[0].redactedOutput.recoveryAction, "retry_agent");
  assert.equal(workflowEvents[0].type, "recovery_decision");
  assert.equal(workflowEvents[0].decision.failureClass, "curator_gate");
  assert.equal(
    workflowEvents.some((event) => event.type === "fallback_executed"),
    false
  );
});

test("ArtifactCandidateService emits fallback event for non-retryable safety evidence", async () => {
  const repository = createRepository();
  const workflowEvents = [];
  const service = new ArtifactCandidateService(repository, {
    emit: (event) => workflowEvents.push(event),
  });
  const { candidate } = await service.recordCodeChangeCandidate({
    changeSet: changeSet(),
  });

  await service.recordEvidence({
    candidate,
    gateId: "path_safety",
    gateType: "path_safety",
    required: true,
    status: "blocked",
    summary: "Mutation escaped the project root.",
  });

  const fallback = workflowEvents.find(
    (event) => event.type === "fallback_executed"
  );
  assert.equal(fallback.action, "block_delivery");
  assert.equal(fallback.status, "succeeded");
  assert.match(fallback.message, /bloqueada|seguran/i);
});
