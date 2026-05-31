import type {
  AgentValidationGateType,
  AgentValidationEvidenceStatus,
  HorusRecoveryAction,
  HorusRecoveryDecision,
  HorusErrorCode,
  HorusFailureClass,
  HorusErrorSeverity,
} from "@u-build/shared";
import { RecoveryPolicyEngine } from "./RecoveryPolicyEngine.js";

export type RecoveryFixTarget = "front" | "qa" | "both";

export interface RecoveryDecision extends HorusRecoveryDecision {
  fixTarget: RecoveryFixTarget;
  failureClass: HorusFailureClass;
  retryReason: string;
  errorCode: HorusErrorCode;
  severity: HorusErrorSeverity;
  retryable: boolean;
  recoveryAction: HorusRecoveryAction;
  maxAttempts: number;
  requiresHumanApproval: boolean;
  operatorMessage: string;
}

export interface ClassifyRecoveryInput {
  gateType: AgentValidationGateType;
  status: AgentValidationEvidenceStatus;
  summary: string;
  rawEvidence?: Record<string, unknown>;
}

export class SelfHealingRecoveryService {
  constructor(private readonly policyEngine = new RecoveryPolicyEngine()) {}

  classify(input: ClassifyRecoveryInput): RecoveryDecision {
    return this.policyEngine.decide(input);
  }
}
