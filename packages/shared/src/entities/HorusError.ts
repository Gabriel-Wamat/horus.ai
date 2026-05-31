import { z } from "zod";
import {
  AgentValidationEvidenceStatusSchema,
  AgentValidationGateTypeSchema,
} from "./AgentArtifact.js";

export const HorusErrorSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const HorusFailureClassSchema = z.enum([
  "qa_gate",
  "curator_gate",
  "visual_gate",
  "preview_gate",
  "apply_gate",
  "command_gate",
  "path_safety_gate",
  "schema_gate",
  "llm_failure",
  "model_output",
  "tool_failure",
  "persistence_failure",
  "contract_mismatch",
  "safety_violation",
  "unknown_system_error",
]);

export const HorusErrorCodeSchema = z.enum([
  "qa_validation_failed",
  "curator_rejected",
  "visual_validation_failed",
  "preview_validation_failed",
  "apply_failed",
  "command_validation_failed",
  "path_safety_blocked",
  "schema_contract_failed",
  "llm_request_failed",
  "model_output_invalid",
  "tool_execution_failed",
  "persistence_write_failed",
  "contract_mismatch",
  "safety_violation",
  "unknown_system_error",
]);

export const HorusRecoveryActionSchema = z.enum([
  "retry_agent",
  "request_human_approval",
  "block_delivery",
  "mark_unverified",
  "terminal_failure",
]);

export const HorusRecoveryFixTargetSchema = z.enum(["front", "qa", "both"]);

export const HorusRecoveryDecisionSchema = z.object({
  errorCode: HorusErrorCodeSchema,
  failureClass: HorusFailureClassSchema,
  severity: HorusErrorSeveritySchema,
  retryable: z.boolean(),
  fixTarget: HorusRecoveryFixTargetSchema,
  recoveryAction: HorusRecoveryActionSchema,
  retryReason: z.string().trim().min(1),
  maxAttempts: z.number().int().nonnegative(),
  requiresHumanApproval: z.boolean(),
  operatorMessage: z.string().trim().min(1),
  diagnostics: z.record(z.string(), z.unknown()).default({}),
});

export const HorusErrorEnvelopeSchema = z.object({
  code: HorusErrorCodeSchema,
  failureClass: HorusFailureClassSchema,
  severity: HorusErrorSeveritySchema,
  message: z.string().trim().min(1),
  retryable: z.boolean(),
  correlationId: z.string().trim().min(1).optional(),
  details: z.record(z.string(), z.unknown()).default({}),
});

export const HorusRecoveryPolicyInputSchema = z.object({
  gateType: AgentValidationGateTypeSchema,
  status: AgentValidationEvidenceStatusSchema,
  summary: z.string().trim().min(1),
  rawEvidence: z.record(z.string(), z.unknown()).default({}),
});

export type HorusErrorSeverity = z.infer<typeof HorusErrorSeveritySchema>;
export type HorusFailureClass = z.infer<typeof HorusFailureClassSchema>;
export type HorusErrorCode = z.infer<typeof HorusErrorCodeSchema>;
export type HorusRecoveryAction = z.infer<typeof HorusRecoveryActionSchema>;
export type HorusRecoveryFixTarget = z.infer<
  typeof HorusRecoveryFixTargetSchema
>;
export type HorusRecoveryDecision = z.infer<typeof HorusRecoveryDecisionSchema>;
export type HorusErrorEnvelope = z.infer<typeof HorusErrorEnvelopeSchema>;
export type HorusRecoveryPolicyInput = z.infer<
  typeof HorusRecoveryPolicyInputSchema
>;
