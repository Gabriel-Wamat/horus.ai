import { v4 as uuidv4 } from "uuid";
import {
  CodeChangeSetSchema,
  RuntimeValidationEvidenceSchema,
} from "@u-build/shared";
import type {
  AgentArtifactCandidate,
  AgentValidationGateType,
  CodeChangeSet,
  RuntimeValidationEvidence,
  WorkflowEvent,
} from "@u-build/shared";

interface WorkflowCodeChangeSetSink {
  save(changeSet: CodeChangeSet): Promise<unknown>;
  listByWorkflow?(threadId: string): Promise<CodeChangeSet[]>;
}

interface WorkflowCodeChangeSetApplier {
  apply(input: {
    changeSet: CodeChangeSet;
    projectRootPath: string;
  }): Promise<CodeChangeSet>;
}

interface WorkflowArtifactControlPlaneSink {
  recordCodeChangeCandidate(input: {
    changeSet: CodeChangeSet;
    execution?: { runId?: string | null; attemptId?: string | null };
    sourceResultId?: string | null;
  }): Promise<{ candidate: AgentArtifactCandidate; changeSet: CodeChangeSet }>;
  markCandidateStatus(input: {
    candidateId: string;
    status: AgentArtifactCandidate["status"];
  }): Promise<AgentArtifactCandidate | null>;
  recordCuratorEvidence(input: {
    candidate: AgentArtifactCandidate;
    passed: boolean;
    notes?: string;
    missingItems?: string[];
    fixTarget?: string;
  }): Promise<unknown>;
  recordRuntimeEvidence(input: {
    candidate: AgentArtifactCandidate;
    gateId: string;
    gateType: AgentValidationGateType;
    required: boolean;
    evidence: RuntimeValidationEvidence;
  }): Promise<unknown>;
  recordTraceSpan(input: {
    workflowThreadId: string;
    runId?: string | null;
    attemptId?: string | null;
    candidateId?: string | null;
    spanType: "llm" | "tool" | "gate" | "handoff" | "retry" | "approval" | "apply";
    name: string;
    status: "started" | "succeeded" | "failed" | "blocked";
    redactedInput?: Record<string, unknown>;
    redactedOutput?: Record<string, unknown>;
    errorMessage?: string | null;
  }): Promise<unknown>;
}

interface CuratorVerdict {
  passed: boolean;
  score?: number;
  notes?: string;
  missingItems?: string[];
  fixTarget?: string;
  candidateId?: string;
}

type WorkflowExecutionIdentity = {
  runId: string;
  attemptId: string;
  turnId?: string | null;
};

type EmitWorkflowEvent = (event: WorkflowEvent) => void;

export class CodeChangeSetLifecycleService {
  constructor(
    private readonly emitWorkflowEvent: EmitWorkflowEvent,
    private readonly codeChangeSets?: WorkflowCodeChangeSetSink,
    private readonly codeChangeSetApplier?: WorkflowCodeChangeSetApplier,
    private readonly artifactControlPlane?: WorkflowArtifactControlPlaneSink
  ) {}

  async persistProposedCodeChangeSets(
    nodeUpdate: Record<string, unknown> | undefined,
    execution?: WorkflowExecutionIdentity
  ): Promise<void> {
    if (!nodeUpdate || !this.codeChangeSets) return;

    for (const proposedChangeSet of extractCodeChangeSets(nodeUpdate)) {
      const appliedByToolLoop = wasAppliedByGovernedToolLoop(
        nodeUpdate,
        proposedChangeSet.id
      );
      const sourceResultId = extractCodeChangeSetSourceResultId(
        nodeUpdate,
        proposedChangeSet.id
      );
      const prepared = CodeChangeSetSchema.parse({
        ...proposedChangeSet,
        status:
          appliedByToolLoop
            ? "applied"
            : proposedChangeSet.status === "failed"
              ? proposedChangeSet.status
              : "proposed",
      });
      const recorded = this.artifactControlPlane
        ? await this.artifactControlPlane.recordCodeChangeCandidate({
            changeSet: prepared,
            ...(execution ? { execution } : {}),
            ...(sourceResultId ? { sourceResultId } : {}),
          })
        : { changeSet: prepared, candidate: undefined };
      const saved = CodeChangeSetSchema.parse(recorded.changeSet);
      await this.codeChangeSets.save(saved);
      if (recorded.candidate) {
        await this.artifactControlPlane?.recordTraceSpan({
          workflowThreadId: saved.workflowThreadId,
          runId: saved.runId ?? execution?.runId ?? null,
          attemptId: saved.attemptId ?? execution?.attemptId ?? null,
          candidateId: recorded.candidate.id,
          spanType: "handoff",
          name: "front_candidate_proposed",
          status: "succeeded",
          redactedOutput: {
            candidateId: recorded.candidate.id,
            fileCount: saved.operations.length,
            contentHash: recorded.candidate.contentHash,
          },
        });
      }
      this.emitWorkflowEvent({
        type: appliedByToolLoop ? "patch_applied" : "patch_proposed",
        threadId: saved.workflowThreadId,
        userStoryId: saved.userStoryId,
        changeSetId: saved.id,
        filePaths: saved.operations.map((operation) => operation.targetPath),
        timestamp: new Date().toISOString(),
      });
    }
  }

  async finalizeAfterCurator(input: {
    nodeUpdate: Record<string, unknown> | undefined;
    threadId: string;
    userStoryId: string;
    frontendProjectRootPath: string | undefined;
    execution?: WorkflowExecutionIdentity;
  }): Promise<string | undefined> {
    if (!input.nodeUpdate || !this.codeChangeSets) return;

    const verdict = extractCuratorVerdict(input.nodeUpdate, input.userStoryId);
    if (!verdict) return;

    const proposedChangeSet = verdict.candidateId
      ? await this.findProposedCodeChangeSetByCandidateId(
          input.threadId,
          input.userStoryId,
          verdict.candidateId
        )
      : await this.findLatestProposedCodeChangeSet(input.threadId, input.userStoryId);
    if (!proposedChangeSet) return;
    const candidateId = proposedChangeSet.artifactCandidateId ?? proposedChangeSet.id;
    const candidate =
      this.artifactControlPlane && candidateId
        ? (
            await this.artifactControlPlane.recordCodeChangeCandidate({
              changeSet: proposedChangeSet,
              ...(input.execution ? { execution: input.execution } : {}),
            })
          ).candidate
        : undefined;

    if (candidate) {
      await this.artifactControlPlane?.recordCuratorEvidence({
        candidate,
        passed: verdict.passed,
        ...(verdict.notes ? { notes: verdict.notes } : {}),
        ...(verdict.missingItems ? { missingItems: verdict.missingItems } : {}),
        ...(verdict.fixTarget ? { fixTarget: verdict.fixTarget } : {}),
      });
    }

    if (!verdict.passed) {
      await this.codeChangeSets.save(
        CodeChangeSetSchema.parse({
          ...proposedChangeSet,
          status: "curator_rejected",
          failedReason: buildCuratorRejectionReason(verdict),
        })
      );
      await this.artifactControlPlane?.markCandidateStatus({
        candidateId,
        status: "rejected",
      });
      return;
    }

    const approvedChangeSet = CodeChangeSetSchema.parse({
      ...proposedChangeSet,
      status: "curator_approved",
    });
    await this.codeChangeSets.save(approvedChangeSet);
    await this.artifactControlPlane?.markCandidateStatus({
      candidateId,
      status: "approved",
    });

    if (!input.frontendProjectRootPath || !this.codeChangeSetApplier) return;

    await this.artifactControlPlane?.recordTraceSpan({
      workflowThreadId: approvedChangeSet.workflowThreadId,
      runId: approvedChangeSet.runId ?? input.execution?.runId ?? null,
      attemptId: approvedChangeSet.attemptId ?? input.execution?.attemptId ?? null,
      candidateId,
      spanType: "apply",
      name: "apply_approved_candidate",
      status: "started",
      redactedInput: {
        candidateId,
        changeSetId: approvedChangeSet.id,
        fileCount: approvedChangeSet.operations.length,
      },
    });
    const appliedChangeSet = await this.codeChangeSetApplier.apply({
      changeSet: approvedChangeSet,
      projectRootPath: input.frontendProjectRootPath,
    });
    await this.codeChangeSets.save(appliedChangeSet);
    if (appliedChangeSet.status === "failed") {
      await this.artifactControlPlane?.markCandidateStatus({
        candidateId,
        status: "failed",
      });
      if (candidate) {
        await this.artifactControlPlane?.recordRuntimeEvidence({
          candidate,
          gateId: "apply",
          gateType: "apply",
          required: true,
          evidence: buildRuntimeEvidenceFromFailedChangeSet(appliedChangeSet),
        });
      }
      await this.artifactControlPlane?.recordTraceSpan({
        workflowThreadId: appliedChangeSet.workflowThreadId,
        runId: appliedChangeSet.runId ?? input.execution?.runId ?? null,
        attemptId: appliedChangeSet.attemptId ?? input.execution?.attemptId ?? null,
        candidateId,
        spanType: "apply",
        name: "apply_approved_candidate",
        status: "failed",
        redactedOutput: {
          candidateId,
          failedReason: appliedChangeSet.failedReason ?? null,
        },
        errorMessage:
          appliedChangeSet.failedReason ??
          "Approved candidate failed final validation.",
      });
      this.emitWorkflowEvent({
        type: "validation_evidence",
        threadId: appliedChangeSet.workflowThreadId,
        userStoryId: appliedChangeSet.userStoryId,
        evidence: buildRuntimeEvidenceFromFailedChangeSet(appliedChangeSet),
        timestamp: new Date().toISOString(),
      });
      this.emitWorkflowEvent({
        type: "error",
        threadId: appliedChangeSet.workflowThreadId,
        message:
          appliedChangeSet.failedReason ??
          "CodeChangeSet failed final validation and was not delivered.",
        timestamp: new Date().toISOString(),
      });
      return (
        appliedChangeSet.failedReason ??
        "CodeChangeSet failed final validation and was not delivered."
      );
    }
    await this.artifactControlPlane?.markCandidateStatus({
      candidateId,
      status: "applied",
    });
    await this.artifactControlPlane?.recordTraceSpan({
      workflowThreadId: appliedChangeSet.workflowThreadId,
      runId: appliedChangeSet.runId ?? input.execution?.runId ?? null,
      attemptId: appliedChangeSet.attemptId ?? input.execution?.attemptId ?? null,
      candidateId,
      spanType: "apply",
      name: "apply_approved_candidate",
      status: "succeeded",
      redactedOutput: {
        candidateId,
        changeSetId: appliedChangeSet.id,
        fileCount: appliedChangeSet.operations.length,
      },
    });
    this.emitWorkflowEvent({
      type: "patch_applied",
      threadId: appliedChangeSet.workflowThreadId,
      userStoryId: appliedChangeSet.userStoryId,
      changeSetId: appliedChangeSet.id,
      filePaths: appliedChangeSet.operations.map((operation) => operation.targetPath),
      timestamp: new Date().toISOString(),
    });
    return undefined;
  }

  private async findProposedCodeChangeSetByCandidateId(
    threadId: string,
    userStoryId: string,
    candidateId: string
  ): Promise<CodeChangeSet | undefined> {
    if (!this.codeChangeSets?.listByWorkflow) return undefined;
    const changeSets = await this.codeChangeSets.listByWorkflow(threadId);
    return changeSets
      .filter(
        (changeSet) =>
          changeSet.userStoryId === userStoryId &&
          changeSet.sourceAgent === "front" &&
          changeSet.status === "proposed" &&
          (changeSet.artifactCandidateId ?? changeSet.id) === candidateId
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }

  private async findLatestProposedCodeChangeSet(
    threadId: string,
    userStoryId: string
  ): Promise<CodeChangeSet | undefined> {
    if (!this.codeChangeSets?.listByWorkflow) return undefined;
    const changeSets = await this.codeChangeSets.listByWorkflow(threadId);
    return changeSets
      .filter(
        (changeSet) =>
          changeSet.userStoryId === userStoryId &&
          changeSet.sourceAgent === "front" &&
          changeSet.status === "proposed"
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  }
}

function extractCodeChangeSets(
  nodeUpdate: Record<string, unknown> | undefined
): CodeChangeSet[] {
  if (!nodeUpdate) return [];
  const agentResults = nodeUpdate["agentResults"];
  if (!agentResults || typeof agentResults !== "object") return [];

  const changeSets: CodeChangeSet[] = [];
  for (const results of Object.values(agentResults as Record<string, unknown>)) {
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      if (!result || typeof result !== "object") continue;
      const output = (result as { output?: unknown }).output;
      if (!output || typeof output !== "object") continue;
      const rawChangeSet = (output as Record<string, unknown>)["codeChangeSet"];
      if (!rawChangeSet) continue;
      changeSets.push(CodeChangeSetSchema.parse(rawChangeSet));
    }
  }
  return changeSets;
}

function extractCodeChangeSetSourceResultId(
  nodeUpdate: Record<string, unknown> | undefined,
  changeSetId: string
): string | undefined {
  if (!nodeUpdate) return undefined;
  const agentResults = nodeUpdate["agentResults"];
  if (!agentResults || typeof agentResults !== "object") return undefined;

  for (const results of Object.values(agentResults as Record<string, unknown>)) {
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      if (!result || typeof result !== "object") continue;
      const output = (result as { output?: unknown }).output;
      if (!output || typeof output !== "object") continue;
      const rawChangeSet = (output as Record<string, unknown>)["codeChangeSet"];
      const parsed = CodeChangeSetSchema.safeParse(rawChangeSet);
      if (parsed.success && parsed.data.id === changeSetId) {
        const completedAt = (result as { completedAt?: unknown }).completedAt;
        return typeof completedAt === "string"
          ? `${parsed.data.sourceAgent}:${completedAt}`
          : parsed.data.sourceAgent;
      }
    }
  }

  return undefined;
}

function wasAppliedByGovernedToolLoop(
  nodeUpdate: Record<string, unknown> | undefined,
  changeSetId: string
): boolean {
  if (!nodeUpdate) return false;
  const agentResults = nodeUpdate["agentResults"];
  if (!agentResults || typeof agentResults !== "object") return false;

  for (const results of Object.values(agentResults as Record<string, unknown>)) {
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      if (!result || typeof result !== "object") continue;
      const output = (result as { output?: unknown }).output;
      if (!output || typeof output !== "object") continue;
      const record = output as Record<string, unknown>;
      const parsed = CodeChangeSetSchema.safeParse(record["codeChangeSet"]);
      if (!parsed.success || parsed.data.id !== changeSetId) continue;
      const toolLoop = record["toolLoop"];
      if (!toolLoop || typeof toolLoop !== "object") continue;
      const toolLoopRecord = toolLoop as Record<string, unknown>;
      return (
        toolLoopRecord["status"] === "succeeded" &&
        Array.isArray(toolLoopRecord["changedFiles"]) &&
        toolLoopRecord["changedFiles"].length > 0
      );
    }
  }
  return false;
}

function extractCuratorVerdict(
  nodeUpdate: Record<string, unknown> | undefined,
  userStoryId: string
): CuratorVerdict | undefined {
  if (!nodeUpdate) return undefined;
  const agentResults = nodeUpdate["agentResults"];
  if (!agentResults || typeof agentResults !== "object") return undefined;
  const results = (agentResults as Record<string, unknown>)[userStoryId];
  if (!Array.isArray(results)) return undefined;
  const latest = [...results].reverse().find((result) => {
    return (
      result &&
      typeof result === "object" &&
      (result as { agentName?: unknown }).agentName === "curator"
    );
  });
  const output =
    latest && typeof latest === "object"
      ? (latest as { output?: unknown }).output
      : undefined;
  if (!output || typeof output !== "object") return undefined;
  const passed = (output as Record<string, unknown>)["passed"];
  if (typeof passed !== "boolean") return undefined;
  const score = (output as Record<string, unknown>)["score"];
  const notes = (output as Record<string, unknown>)["notes"];
  const missingItems = (output as Record<string, unknown>)["missingItems"];
  const fixTarget = (output as Record<string, unknown>)["fixTarget"];
  const candidateId = (output as Record<string, unknown>)["candidateId"];
  return {
    passed,
    ...(typeof score === "number" ? { score } : {}),
    ...(typeof notes === "string" ? { notes } : {}),
    ...(Array.isArray(missingItems) ? { missingItems: missingItems as string[] } : {}),
    ...(typeof fixTarget === "string" ? { fixTarget } : {}),
    ...(typeof candidateId === "string" ? { candidateId } : {}),
  };
}

function buildRuntimeEvidenceFromFailedChangeSet(
  changeSet: CodeChangeSet
): RuntimeValidationEvidence {
  return RuntimeValidationEvidenceSchema.parse({
    id: uuidv4(),
    workflowThreadId: changeSet.workflowThreadId,
    constructionRunId: null,
    userStoryId: changeSet.userStoryId,
    projectId: null,
    status: "failed",
    skippedReason: null,
    commands: changeSet.validation.map((entry) => ({
      commandId: entry.command,
      command: entry.command,
      cwd: entry.cwd,
      exitCode: entry.exitCode,
      stdoutTail: entry.stdout ?? "",
      stderrTail: entry.stderr ?? "",
      durationMs: 0,
    })),
    preview: {
      status: "skipped",
      url: null,
      message:
        changeSet.failedReason ??
        "CodeChangeSet failed final validation and was not delivered.",
      evidence: {
        title: null,
        bodySnippet: null,
        screenshotPath: null,
      },
    },
    createdAt: new Date().toISOString(),
  });
}

function buildCuratorRejectionReason(verdict: CuratorVerdict): string {
  return [
    verdict.notes ?? "Curator rejected this CodeChangeSet.",
    ...(verdict.missingItems ?? []),
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
