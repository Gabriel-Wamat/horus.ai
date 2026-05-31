import assert from "node:assert/strict";
import test from "node:test";
import { RecoveryPolicyEngine } from "../dist/application/services/RecoveryPolicyEngine.js";
import { SelfHealingRecoveryService } from "../dist/application/services/SelfHealingRecoveryService.js";

test("RecoveryPolicyEngine classifies QA failures as bounded QA retries", () => {
  const decision = new RecoveryPolicyEngine().decide({
    gateType: "qa",
    status: "failed",
    summary: "Unit tests failed.",
  });

  assert.equal(decision.errorCode, "qa_validation_failed");
  assert.equal(decision.failureClass, "qa_gate");
  assert.equal(decision.fixTarget, "qa");
  assert.equal(decision.retryable, true);
  assert.equal(decision.recoveryAction, "retry_agent");
  assert.equal(decision.maxAttempts, 3);
  assert.equal(decision.requiresHumanApproval, false);
});

test("RecoveryPolicyEngine blocks path safety failures without automatic retry", () => {
  const decision = new RecoveryPolicyEngine().decide({
    gateType: "path_safety",
    status: "blocked",
    summary: "Mutation escaped the project root.",
  });

  assert.equal(decision.errorCode, "path_safety_blocked");
  assert.equal(decision.failureClass, "path_safety_gate");
  assert.equal(decision.severity, "critical");
  assert.equal(decision.retryable, false);
  assert.equal(decision.recoveryAction, "block_delivery");
  assert.equal(decision.maxAttempts, 0);
  assert.equal(decision.requiresHumanApproval, true);
});

test("SelfHealingRecoveryService preserves explicit curator fixTarget without summary heuristics", () => {
  const decision = new SelfHealingRecoveryService().classify({
    gateType: "curator",
    status: "failed",
    summary: "Review failed.",
    rawEvidence: { fixTarget: "both" },
  });

  assert.equal(decision.errorCode, "curator_rejected");
  assert.equal(decision.failureClass, "curator_gate");
  assert.equal(decision.fixTarget, "both");
  assert.equal(decision.retryReason, "Review failed.");
});
