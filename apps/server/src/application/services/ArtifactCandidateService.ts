import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import {
  AgentArtifactCandidateSchema,
  AgentTraceSpanSchema,
  AgentValidationEvidenceRecordSchema,
  type AgentArtifactCandidate,
  type AgentArtifactCandidateStatus,
  type AgentTraceSpan,
  type AgentTraceSpanStatus,
  type AgentTraceSpanType,
  type AgentValidationEvidenceRecord,
  type AgentValidationEvidenceStatus,
  type AgentValidationGateType,
  type CodeChangeSet,
  type RuntimeValidationEvidence,
  type WorkflowEvent,
} from "@u-build/shared";
import type { AgentArtifactRepository } from "../ports/RepositoryPorts.js";
import { SelfHealingRecoveryService } from "./SelfHealingRecoveryService.js";

export interface ExecutionIdentity {
  runId?: string | null;
  attemptId?: string | null;
}

export interface CodeCandidateRecord {
  candidate: AgentArtifactCandidate;
  changeSet: CodeChangeSet;
}

export class ArtifactCandidateService {
  private readonly recovery = new SelfHealingRecoveryService();

  constructor(
    private readonly repository: AgentArtifactRepository,
    private readonly workflowEvents?: { emit(event: WorkflowEvent): void }
  ) {}

  async recordCodeChangeCandidate(input: {
    changeSet: CodeChangeSet;
    execution?: ExecutionIdentity;
    sourceResultId?: string | null;
  }): Promise<CodeCandidateRecord> {
    const now = new Date().toISOString();
    const candidateId = input.changeSet.artifactCandidateId ?? input.changeSet.id;
    const existing = await this.repository.getCandidate(candidateId);
    const candidate = AgentArtifactCandidateSchema.parse({
      id: candidateId,
      runId: input.execution?.runId ?? input.changeSet.runId ?? null,
      attemptId: input.execution?.attemptId ?? input.changeSet.attemptId ?? null,
      workflowThreadId: input.changeSet.workflowThreadId,
      userStoryId: input.changeSet.userStoryId,
      sourceAgent: input.changeSet.sourceAgent,
      artifactType: "code_change_set",
      status: statusFromChangeSet(input.changeSet.status),
      sourceResultId: input.sourceResultId ?? null,
      contentHash: hashContent({
        operations: input.changeSet.operations,
        validation: input.changeSet.validation,
      }),
      createdAt: existing?.createdAt ?? input.changeSet.createdAt,
      updatedAt: now,
    });
    await this.repository.saveCandidate(candidate);
    return {
      candidate,
      changeSet: {
        ...input.changeSet,
        artifactCandidateId: candidate.id,
        ...(candidate.runId ? { runId: candidate.runId } : {}),
        ...(candidate.attemptId ? { attemptId: candidate.attemptId } : {}),
      },
    };
  }

  async markCandidateStatus(input: {
    candidateId: string;
    status: AgentArtifactCandidateStatus;
  }): Promise<AgentArtifactCandidate | null> {
    const candidate = await this.repository.getCandidate(input.candidateId);
    if (!candidate) return null;
    const updated = AgentArtifactCandidateSchema.parse({
      ...candidate,
      status: input.status,
      updatedAt: new Date().toISOString(),
    });
    return this.repository.saveCandidate(updated);
  }

  async recordRuntimeEvidence(input: {
    candidate: AgentArtifactCandidate;
    gateId: string;
    gateType: AgentValidationGateType;
    required: boolean;
    evidence: RuntimeValidationEvidence;
  }): Promise<AgentValidationEvidenceRecord> {
    return this.recordEvidence({
      candidate: input.candidate,
      gateId: input.gateId,
      gateType: input.gateType,
      required: input.required,
      status: statusFromRuntimeEvidence(input.evidence),
      summary: summarizeRuntimeEvidence(input.evidence),
      rawEvidenceRef: {
        evidenceId: input.evidence.id,
        runtimeStatus: input.evidence.status,
        previewStatus: input.evidence.preview.status,
        commandCount: input.evidence.commands.length,
      },
    });
  }

  async recordCuratorEvidence(input: {
    candidate: AgentArtifactCandidate;
    passed: boolean;
    notes?: string;
    missingItems?: string[];
    fixTarget?: string;
  }): Promise<AgentValidationEvidenceRecord> {
    return this.recordEvidence({
      candidate: input.candidate,
      gateId: "curator",
      gateType: "curator",
      required: true,
      status: input.passed ? "passed" : "failed",
      summary: input.notes ?? (input.passed ? "Curator approved." : "Curator rejected."),
      rawEvidenceRef: {
        missingItems: input.missingItems ?? [],
        ...(input.fixTarget ? { fixTarget: input.fixTarget } : {}),
      },
    });
  }

  async recordEvidence(input: {
    candidate: AgentArtifactCandidate;
    gateId: string;
    gateType: AgentValidationGateType;
    required: boolean;
    status: AgentValidationEvidenceStatus;
    summary: string;
    rawEvidenceRef?: Record<string, unknown>;
  }): Promise<AgentValidationEvidenceRecord> {
    const evidence = AgentValidationEvidenceRecordSchema.parse({
      id: uuidv4(),
      candidateId: input.candidate.id,
      runId: input.candidate.runId,
      attemptId: input.candidate.attemptId,
      workflowThreadId: input.candidate.workflowThreadId,
      userStoryId: input.candidate.userStoryId,
      gateId: input.gateId,
      gateType: input.gateType,
      status: input.status,
      required: input.required,
      summary: input.summary,
      rawEvidenceRef: input.rawEvidenceRef ?? {},
      createdAt: new Date().toISOString(),
    });
    await this.repository.saveEvidence(evidence);
    if (input.status !== "passed" && input.required) {
      const recovery = this.recovery.classify({
        gateType: input.gateType,
        status: input.status,
        summary: input.summary,
        ...(input.rawEvidenceRef ? { rawEvidence: input.rawEvidenceRef } : {}),
      });
      await this.recordTraceSpan({
        workflowThreadId: input.candidate.workflowThreadId,
        runId: input.candidate.runId,
        attemptId: input.candidate.attemptId,
        candidateId: input.candidate.id,
        spanType: "retry",
        name: "self_healing_classification",
        status: "blocked",
        redactedInput: {
          gateType: input.gateType,
          evidenceStatus: input.status,
        },
        redactedOutput: { ...recovery },
        errorMessage: recovery.retryReason,
      });
      this.workflowEvents?.emit({
        type: "recovery_decision",
        threadId: input.candidate.workflowThreadId,
        userStoryId: input.candidate.userStoryId,
        candidateId: input.candidate.id,
        gateId: input.gateId,
        gateType: input.gateType,
        evidenceStatus: input.status,
        decision: recovery,
        timestamp: new Date().toISOString(),
      });
      if (!recovery.retryable) {
        this.workflowEvents?.emit({
          type: "fallback_executed",
          threadId: input.candidate.workflowThreadId,
          userStoryId: input.candidate.userStoryId,
          action: recovery.recoveryAction,
          status: "succeeded",
          message: recovery.operatorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    }
    return evidence;
  }

  async recordTraceSpan(input: {
    workflowThreadId: string;
    runId?: string | null;
    attemptId?: string | null;
    candidateId?: string | null;
    spanType: AgentTraceSpanType;
    name: string;
    status: AgentTraceSpanStatus;
    redactedInput?: Record<string, unknown>;
    redactedOutput?: Record<string, unknown>;
    errorMessage?: string | null;
  }): Promise<AgentTraceSpan> {
    const now = new Date().toISOString();
    const span = AgentTraceSpanSchema.parse({
      id: uuidv4(),
      workflowThreadId: input.workflowThreadId,
      runId: input.runId ?? null,
      attemptId: input.attemptId ?? null,
      candidateId: input.candidateId ?? null,
      spanType: input.spanType,
      name: input.name,
      status: input.status,
      redactedInput: redactRecord(input.redactedInput ?? {}),
      redactedOutput: redactRecord(input.redactedOutput ?? {}),
      startedAt: now,
      endedAt: input.status === "started" ? null : now,
      durationMs: input.status === "started" ? null : 0,
      errorMessage: input.errorMessage ?? null,
    });
    return this.repository.saveTraceSpan(span);
  }
}

function statusFromChangeSet(
  status: CodeChangeSet["status"]
): AgentArtifactCandidateStatus {
  switch (status) {
    case "curator_rejected":
      return "rejected";
    case "curator_approved":
      return "approved";
    case "applied":
    case "validated":
      return "applied";
    case "failed":
      return "failed";
    case "proposed":
    default:
      return "proposed";
  }
}

function statusFromRuntimeEvidence(
  evidence: RuntimeValidationEvidence
): AgentValidationEvidenceStatus {
  if (evidence.status === "passed" && evidence.preview.status === "passed") {
    return "passed";
  }
  if (evidence.status === "skipped" || evidence.preview.status === "skipped") {
    return "skipped";
  }
  return "failed";
}

function summarizeRuntimeEvidence(evidence: RuntimeValidationEvidence): string {
  const failedCommands = evidence.commands.filter(
    (command) => command.exitCode !== 0
  ).length;
  if (evidence.status === "passed" && evidence.preview.status === "passed") {
    return "Runtime validation passed.";
  }
  if (evidence.status === "skipped" || evidence.preview.status === "skipped") {
    return evidence.skippedReason ?? evidence.preview.message ?? "Validation skipped.";
  }
  return (
    evidence.preview.message ??
    `${failedCommands} validation command(s) failed for candidate.`
  );
}

function hashContent(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function redactRecord(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("key") ||
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("password")
    ) {
      result[key] = "[redacted]";
    } else {
      result[key] = value;
    }
  }
  return result;
}
