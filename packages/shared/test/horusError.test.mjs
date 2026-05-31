import assert from "node:assert/strict";
import test from "node:test";
import {
  HorusErrorEnvelopeSchema,
  HorusRecoveryDecisionSchema,
} from "../dist/index.js";

test("Horus recovery decision contract keeps low-cardinality error metadata", () => {
  const decision = HorusRecoveryDecisionSchema.parse({
    errorCode: "path_safety_blocked",
    failureClass: "path_safety_gate",
    severity: "critical",
    retryable: false,
    fixTarget: "front",
    recoveryAction: "block_delivery",
    retryReason: "Path escaped project root.",
    maxAttempts: 0,
    requiresHumanApproval: true,
    operatorMessage: "Entrega bloqueada por política de segurança.",
  });

  assert.equal(decision.retryable, false);
  assert.deepEqual(decision.diagnostics, {});
});

test("Horus error envelope carries retryability and correlation metadata", () => {
  const envelope = HorusErrorEnvelopeSchema.parse({
    code: "model_output_invalid",
    failureClass: "model_output",
    severity: "high",
    message: "Structured output did not match the schema.",
    retryable: true,
    correlationId: "thread-1:attempt-2",
  });

  assert.equal(envelope.code, "model_output_invalid");
  assert.deepEqual(envelope.details, {});
});
