import {
  HorusRecoveryDecisionSchema,
  type AgentValidationEvidenceStatus,
  type AgentValidationGateType,
  type HorusErrorCode,
  type HorusFailureClass,
  type HorusRecoveryAction,
  type HorusRecoveryDecision,
  type HorusRecoveryFixTarget,
  type HorusErrorSeverity,
} from "@u-build/shared";

export interface RecoveryPolicyInput {
  gateType: AgentValidationGateType;
  status: AgentValidationEvidenceStatus;
  summary: string;
  rawEvidence?: Record<string, unknown>;
}

interface RecoveryPolicy {
  errorCode: HorusErrorCode;
  failureClass: HorusFailureClass;
  severity: HorusErrorSeverity;
  retryable: boolean;
  fixTarget: HorusRecoveryFixTarget;
  recoveryAction: HorusRecoveryAction;
  maxAttempts: number;
  requiresHumanApproval: boolean;
}

const POLICY_BY_GATE: Record<AgentValidationGateType, RecoveryPolicy> = {
  qa: {
    errorCode: "qa_validation_failed",
    failureClass: "qa_gate",
    severity: "high",
    retryable: true,
    fixTarget: "qa",
    recoveryAction: "retry_agent",
    maxAttempts: 3,
    requiresHumanApproval: false,
  },
  curator: {
    errorCode: "curator_rejected",
    failureClass: "curator_gate",
    severity: "high",
    retryable: true,
    fixTarget: "front",
    recoveryAction: "retry_agent",
    maxAttempts: 3,
    requiresHumanApproval: false,
  },
  visual: {
    errorCode: "visual_validation_failed",
    failureClass: "visual_gate",
    severity: "high",
    retryable: true,
    fixTarget: "front",
    recoveryAction: "retry_agent",
    maxAttempts: 3,
    requiresHumanApproval: false,
  },
  preview: {
    errorCode: "preview_validation_failed",
    failureClass: "preview_gate",
    severity: "high",
    retryable: true,
    fixTarget: "front",
    recoveryAction: "retry_agent",
    maxAttempts: 2,
    requiresHumanApproval: false,
  },
  command: {
    errorCode: "command_validation_failed",
    failureClass: "command_gate",
    severity: "high",
    retryable: true,
    fixTarget: "front",
    recoveryAction: "retry_agent",
    maxAttempts: 2,
    requiresHumanApproval: false,
  },
  apply: {
    errorCode: "apply_failed",
    failureClass: "apply_gate",
    severity: "critical",
    retryable: false,
    fixTarget: "front",
    recoveryAction: "request_human_approval",
    maxAttempts: 0,
    requiresHumanApproval: true,
  },
  path_safety: {
    errorCode: "path_safety_blocked",
    failureClass: "path_safety_gate",
    severity: "critical",
    retryable: false,
    fixTarget: "front",
    recoveryAction: "block_delivery",
    maxAttempts: 0,
    requiresHumanApproval: true,
  },
  schema: {
    errorCode: "schema_contract_failed",
    failureClass: "schema_gate",
    severity: "critical",
    retryable: false,
    fixTarget: "both",
    recoveryAction: "request_human_approval",
    maxAttempts: 0,
    requiresHumanApproval: true,
  },
};

export class RecoveryPolicyEngine {
  decide(input: RecoveryPolicyInput): HorusRecoveryDecision {
    const explicit = extractPolicyOverrides(input.rawEvidence);
    const policy = {
      ...POLICY_BY_GATE[input.gateType],
      ...explicit.policy,
    };
    const fixTarget = explicit.fixTarget ?? policy.fixTarget;
    const retryable =
      input.status === "blocked" || input.status === "inconclusive"
        ? false
        : policy.retryable;
    const recoveryAction =
      retryable && !policy.requiresHumanApproval
        ? policy.recoveryAction
        : policy.requiresHumanApproval
          ? policy.recoveryAction
          : "terminal_failure";

    return HorusRecoveryDecisionSchema.parse({
      errorCode: policy.errorCode,
      failureClass: policy.failureClass,
      severity: policy.severity,
      retryable,
      fixTarget,
      recoveryAction,
      retryReason: input.summary,
      maxAttempts: retryable ? policy.maxAttempts : 0,
      requiresHumanApproval: policy.requiresHumanApproval || !retryable,
      operatorMessage: buildOperatorMessage({
        gateType: input.gateType,
        status: input.status,
        recoveryAction,
        retryable,
      }),
      diagnostics: {
        gateType: input.gateType,
        evidenceStatus: input.status,
        explicitFixTarget: explicit.fixTarget ?? null,
      },
    });
  }
}

function buildOperatorMessage(input: {
  gateType: AgentValidationGateType;
  status: AgentValidationEvidenceStatus;
  recoveryAction: HorusRecoveryAction;
  retryable: boolean;
}): string {
  if (input.recoveryAction === "retry_agent") {
    return `Falha ${input.gateType}/${input.status}; o Horus tentará corrigir automaticamente.`;
  }
  if (input.recoveryAction === "block_delivery") {
    return `Falha ${input.gateType}/${input.status}; entrega bloqueada por política de segurança.`;
  }
  if (input.recoveryAction === "request_human_approval") {
    return `Falha ${input.gateType}/${input.status}; decisão humana necessária antes de continuar.`;
  }
  if (input.recoveryAction === "mark_unverified") {
    return `Falha ${input.gateType}/${input.status}; entrega só pode seguir como não verificada.`;
  }
  return `Falha ${input.gateType}/${input.status}; execução terminalizada sem retry automático.`;
}

function extractPolicyOverrides(rawEvidence: Record<string, unknown> | undefined): {
  fixTarget?: HorusRecoveryFixTarget;
  policy: Partial<RecoveryPolicy>;
} {
  const fixTarget = extractFixTarget(rawEvidence);
  const policy: Partial<RecoveryPolicy> = {};
  const errorCode = rawEvidence?.["errorCode"];
  if (isHorusErrorCode(errorCode)) policy.errorCode = errorCode;
  const failureClass = rawEvidence?.["failureClass"];
  if (isHorusFailureClass(failureClass)) policy.failureClass = failureClass;
  return {
    ...(fixTarget ? { fixTarget } : {}),
    policy,
  };
}

function extractFixTarget(
  rawEvidence: Record<string, unknown> | undefined
): HorusRecoveryFixTarget | undefined {
  const value = rawEvidence?.["fixTarget"];
  if (value === "front" || value === "qa" || value === "both") return value;
  return undefined;
}

function isHorusErrorCode(value: unknown): value is HorusErrorCode {
  return (
    value === "qa_validation_failed" ||
    value === "curator_rejected" ||
    value === "visual_validation_failed" ||
    value === "preview_validation_failed" ||
    value === "apply_failed" ||
    value === "command_validation_failed" ||
    value === "path_safety_blocked" ||
    value === "schema_contract_failed" ||
    value === "llm_request_failed" ||
    value === "model_output_invalid" ||
    value === "tool_execution_failed" ||
    value === "persistence_write_failed" ||
    value === "contract_mismatch" ||
    value === "safety_violation" ||
    value === "unknown_system_error"
  );
}

function isHorusFailureClass(value: unknown): value is HorusFailureClass {
  return (
    value === "qa_gate" ||
    value === "curator_gate" ||
    value === "visual_gate" ||
    value === "preview_gate" ||
    value === "apply_gate" ||
    value === "command_gate" ||
    value === "path_safety_gate" ||
    value === "schema_gate" ||
    value === "llm_failure" ||
    value === "model_output" ||
    value === "tool_failure" ||
    value === "persistence_failure" ||
    value === "contract_mismatch" ||
    value === "safety_violation" ||
    value === "unknown_system_error"
  );
}
