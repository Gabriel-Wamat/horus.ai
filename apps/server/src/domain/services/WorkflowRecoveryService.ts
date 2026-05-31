import type {
  HorusRunEventSnapshot,
  IStorageProvider,
  WorkflowEvent,
  WorkflowState,
  WorkflowStatus,
} from "@u-build/shared";
import { isTerminalWorkflowStatus } from "./WorkflowStatePersister.js";

export interface WorkflowRecoveryExecutionLedger {
  listRecoverableRuns?(): Promise<Array<{
    id: string;
    turnId?: string | null;
    threadId: string;
    workflowMode: string;
    status: WorkflowStatus;
    startedAt?: string | null;
    updatedAt?: string | null;
    lastError?: string | null;
  }>>;
  getRunByThreadId(threadId: string): Promise<{
    id: string;
    threadId: string;
    status?: WorkflowStatus;
    turnId?: string | null;
  } | null>;
  updateRunStatus(input: {
    runId: string;
    status: WorkflowStatus;
    completedAt?: string | null;
    lastError?: string | null;
    leaseOwner?: string | null;
  }): Promise<unknown>;
  updateTurnStatus(
    turnId: string,
    status: "pending" | "accepted" | "running" | "completed" | "blocked" | "failed" | "cancelled"
  ): Promise<unknown>;
}

export interface WorkflowRecoveryEventHistory {
  list(threadId: string): Promise<HorusRunEventSnapshot[]>;
}

export class WorkflowRecoveryService {
  constructor(
    private readonly storage: IStorageProvider,
    private readonly executionLedger: WorkflowRecoveryExecutionLedger | undefined,
    private readonly workflowEventHistory: WorkflowRecoveryEventHistory | undefined,
    private readonly emitWorkflowEvent: (event: WorkflowEvent) => void
  ) {}

  async markStaleRecoverableRuns(): Promise<void> {
    if (!this.executionLedger?.listRecoverableRuns) return;
    const runs = await this.executionLedger.listRecoverableRuns();
    const nowMs = Date.now();
    for (const run of runs) {
      const stored = await this.storage.load(run.threadId);
      if (stored && isTerminalWorkflowStatus(stored.status)) {
        await this.executionLedger.updateRunStatus({
          runId: run.id,
          status: stored.status,
          completedAt: stored.completedAt ?? new Date().toISOString(),
          lastError: stored.errorMessage ?? null,
          leaseOwner: null,
        });
        if (run.turnId) {
          await this.executionLedger.updateTurnStatus(
            run.turnId,
            stored.status === "error" ? "failed" : "completed"
          );
        }
        continue;
      }

      const events = await this.workflowEventHistory
        ?.list(run.threadId)
        .catch(() => []);
      const latestEvent = events?.at(-1);
      const lastActivityAt =
        latestEvent?.timestamp ?? run.updatedAt ?? run.startedAt ?? stored?.startedAt;
      if (!lastActivityAt) continue;
      const lastActivityMs = Date.parse(lastActivityAt);
      if (!Number.isFinite(lastActivityMs)) continue;
      if (nowMs - lastActivityMs < getStaleWorkflowThresholdMs()) continue;

      await this.markRunStalled({
        runId: run.id,
        turnId: run.turnId ?? null,
        threadId: run.threadId,
        stored,
        ...(latestEvent ? { latestEvent } : {}),
        lastActivityAt,
      });
    }
  }

  async markLegacyStaleWorkflowStates(): Promise<void> {
    const threadIds = await this.storage.list();
    const nowMs = Date.now();
    for (const threadId of threadIds) {
      const stored = await this.storage.load(threadId);
      if (!stored || stored.status !== "running") continue;
      const ledgerRun = await this.executionLedger
        ?.getRunByThreadId(threadId)
        .catch(() => null);
      if (ledgerRun) continue;

      const events = await this.workflowEventHistory
        ?.list(threadId)
        .catch(() => []);
      const latestEvent = events?.at(-1);
      const lastActivityAt = latestEvent?.timestamp ?? stored.startedAt;
      const lastActivityMs = Date.parse(lastActivityAt);
      if (!Number.isFinite(lastActivityMs)) continue;
      if (nowMs - lastActivityMs < getStaleWorkflowThresholdMs()) continue;

      await this.markRunStalled({
        threadId,
        stored,
        ...(latestEvent ? { latestEvent } : {}),
        lastActivityAt,
      });
    }
  }

  private async markRunStalled(input: {
    runId?: string;
    turnId?: string | null;
    threadId: string;
    stored?: WorkflowState | null;
    latestEvent?: HorusRunEventSnapshot;
    lastActivityAt: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const message = [
      "Workflow marked as stalled because it was running without recoverable progress.",
      `Last activity: ${input.lastActivityAt}.`,
      input.latestEvent
        ? `Last event: ${input.latestEvent.type}#${input.latestEvent.sequence}.`
        : "No workflow event was available.",
    ].join(" ");

    if (input.stored) {
      await this.storage.save({
        ...input.stored,
        status: "error",
        completedAt: now,
        errorMessage: message,
      });
    }

    if (input.runId) {
      await this.executionLedger?.updateRunStatus({
        runId: input.runId,
        status: "error",
        completedAt: now,
        lastError: message,
        leaseOwner: null,
      });
    }
    if (input.turnId) {
      await this.executionLedger?.updateTurnStatus(input.turnId, "failed");
    }

    this.emitWorkflowEvent({
      type: "error",
      threadId: input.threadId,
      message,
      timestamp: now,
    });
    this.emitWorkflowEvent({
      type: "status_changed",
      threadId: input.threadId,
      status: "error",
      timestamp: now,
    });
  }
}

function getStaleWorkflowThresholdMs(): number {
  const configured = Number(process.env.HORUS_WORKFLOW_STALE_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : 10 * 60 * 1000;
}
