import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AgentArtifactCandidateSchema,
  AgentTraceSpanSchema,
  AgentValidationEvidenceRecordSchema,
} from "../dist/index.js";

const workflowThreadId = "11111111-1111-4111-8111-111111111111";
const userStoryId = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";
const now = "2026-05-27T12:00:00.000Z";

test("AgentArtifactCandidateSchema tracks explicit run candidate identity", () => {
  const parsed = AgentArtifactCandidateSchema.parse({
    id: candidateId,
    runId: null,
    attemptId: null,
    workflowThreadId,
    userStoryId,
    sourceAgent: "front",
    artifactType: "code_change_set",
    status: "proposed",
    sourceResultId: null,
    contentHash: "0123456789abcdef",
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(parsed.id, candidateId);
  assert.equal(parsed.artifactType, "code_change_set");
});

test("AgentValidationEvidenceRecordSchema requires evidence to point to a candidate", () => {
  const parsed = AgentValidationEvidenceRecordSchema.parse({
    id: "44444444-4444-4444-8444-444444444444",
    candidateId,
    workflowThreadId,
    userStoryId,
    gateId: "apply",
    gateType: "apply",
    status: "failed",
    required: true,
    summary: "Final validation failed.",
    rawEvidenceRef: { commandCount: 1 },
    createdAt: now,
  });

  assert.equal(parsed.candidateId, candidateId);
  assert.equal(parsed.required, true);
});

test("AgentTraceSpanSchema stores redacted observability spans", () => {
  const parsed = AgentTraceSpanSchema.parse({
    id: "55555555-5555-4555-8555-555555555555",
    workflowThreadId,
    candidateId,
    spanType: "apply",
    name: "apply_approved_candidate",
    status: "succeeded",
    redactedInput: { fileCount: 1 },
    redactedOutput: { changeSetId: candidateId },
    startedAt: now,
    endedAt: now,
    durationMs: 0,
  });

  assert.equal(parsed.spanType, "apply");
  assert.equal(parsed.candidateId, candidateId);
});
