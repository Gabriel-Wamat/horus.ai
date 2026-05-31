import { randomUUID } from "node:crypto";
import {
  CodingRuntimeArtifactRefSchema,
  CodingRuntimeEventSchema,
  CodingRuntimeSnapshotSchema,
  CodingTaskSchema,
  type CodingRuntimeArtifactKind,
  type CodingRuntimeArtifactRef,
  type CodingRuntimeError,
  type CodingRuntimeEvent,
  type CodingRuntimeSignal,
  type CodingRuntimeSnapshot,
  type CodingRuntimeState,
  type CodingTask,
  type CreateCodingTaskRequest,
} from "@u-build/shared";
import { isTerminalCodingRuntimeState } from "@u-build/shared";
import type {
  CodingRuntimeStepPort,
  CodingRuntimeStepPorts,
  CodingTaskRepository,
} from "../ports/CodingRuntimePorts.js";
import { CodingTaskRouter } from "./CodingTaskRouter.js";
import { CodingWorkflowStateMachine } from "./CodingWorkflowStateMachine.js";

export class CodingTaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Coding task not found: ${taskId}`);
    this.name = "CodingTaskNotFoundError";
  }
}

export class MissingCodingRuntimeCapabilityError extends Error {
  constructor(readonly capability: string) {
    super(`Coding runtime capability is not configured: ${capability}`);
    this.name = "MissingCodingRuntimeCapabilityError";
  }
}

export class CodingRuntimeStepFailedError extends Error {
  constructor(
    readonly capability: keyof CodingRuntimeStepPorts,
    readonly artifact: CodingRuntimeArtifactRef
  ) {
    super(`${String(capability)} failed: ${artifact.summary ?? artifact.label}`);
    this.name = "CodingRuntimeStepFailedError";
  }
}

interface CodingRuntimeOrchestratorOptions {
  readonly taskRepository: CodingTaskRepository;
  readonly steps?: CodingRuntimeStepPorts;
  readonly stateMachine?: CodingWorkflowStateMachine;
  readonly taskRouter?: CodingTaskRouter;
  readonly idGenerator?: () => string;
  readonly now?: () => Date;
}

interface PipelineStep {
  readonly capability: keyof CodingRuntimeStepPorts;
  readonly startSignal: CodingRuntimeSignal;
  readonly completeSignal: CodingRuntimeSignal;
  readonly artifactKind: CodingRuntimeArtifactKind;
  readonly label: string;
}

const PIPELINE: readonly PipelineStep[] = [
  {
    capability: "scanner",
    startSignal: "scan_requested",
    completeSignal: "scan_completed",
    artifactKind: "scan",
    label: "Repository scan",
  },
  {
    capability: "retriever",
    startSignal: "retrieval_requested",
    completeSignal: "retrieval_completed",
    artifactKind: "retrieval",
    label: "Code retrieval",
  },
  {
    capability: "astAnalyzer",
    startSignal: "ast_analysis_requested",
    completeSignal: "ast_analysis_completed",
    artifactKind: "ast_analysis",
    label: "AST analysis",
  },
  {
    capability: "patchPlanner",
    startSignal: "patch_planning_requested",
    completeSignal: "patch_planning_completed",
    artifactKind: "patch_plan",
    label: "Patch planning",
  },
  {
    capability: "astValidator",
    startSignal: "ast_validation_requested",
    completeSignal: "ast_validation_completed",
    artifactKind: "ast_validation",
    label: "AST validation",
  },
  {
    capability: "runtimeValidator",
    startSignal: "runtime_validation_requested",
    completeSignal: "runtime_validation_completed",
    artifactKind: "runtime_validation",
    label: "Runtime validation",
  },
  {
    capability: "patchApplier",
    startSignal: "patch_apply_requested",
    completeSignal: "patch_apply_completed",
    artifactKind: "patch_apply",
    label: "Patch apply",
  },
];

export class CodingRuntimeOrchestrator {
  private readonly taskRepository: CodingTaskRepository;
  private readonly steps: CodingRuntimeStepPorts;
  private readonly stateMachine: CodingWorkflowStateMachine;
  private readonly taskRouter: CodingTaskRouter;
  private readonly idGenerator: () => string;
  private readonly now: () => Date;

  constructor(options: CodingRuntimeOrchestratorOptions) {
    this.taskRepository = options.taskRepository;
    this.steps = options.steps ?? {};
    this.stateMachine = options.stateMachine ?? new CodingWorkflowStateMachine();
    this.taskRouter = options.taskRouter ?? new CodingTaskRouter();
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async createTask(
    input: CreateCodingTaskRequest
  ): Promise<CodingRuntimeSnapshot> {
    if (input.idempotencyKey) {
      const existing = await this.taskRepository.findByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) return existing;
    }

    const now = this.isoNow();
    const route = this.taskRouter.route({
      prompt: input.prompt,
      selectedPaths: input.selectedPaths,
      ...(input.projectRootPath
        ? { projectRootPath: input.projectRootPath }
        : {}),
    });
    const task = CodingTaskSchema.parse({
      id: this.idGenerator(),
      idempotencyKey: input.idempotencyKey,
      prompt: input.prompt,
      projectId: input.projectId,
      projectRootPath: input.projectRootPath,
      selectedPaths: input.selectedPaths,
      surface: route.surface,
      routeReason: route.reason,
      state: "accepted",
      workflowThreadId: input.workflowThreadId,
      chatSessionId: input.chatSessionId,
      sourceMessageId: input.sourceMessageId,
      userStoryId: input.userStoryId,
      artifacts: [],
      error: null,
      metadata: input.metadata,
      version: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
    });
    return this.taskRepository.recordTransition({
      task,
      event: {
        id: this.idGenerator(),
        taskId: task.id,
        type: "task_accepted",
        fromState: null,
        toState: "accepted",
        message: "Coding task accepted.",
        artifactRefs: [],
        error: null,
        createdAt: now,
      },
    });
  }

  async getSnapshot(taskId: string): Promise<CodingRuntimeSnapshot> {
    const snapshot = await this.taskRepository.getSnapshot(taskId);
    if (!snapshot) throw new CodingTaskNotFoundError(taskId);
    return snapshot;
  }

  async listEvents(
    taskId: string,
    filter?: { afterSequence?: number }
  ): Promise<CodingRuntimeEvent[]> {
    const task = await this.taskRepository.getTask(taskId);
    if (!task) throw new CodingTaskNotFoundError(taskId);
    return this.taskRepository.listEvents(taskId, filter);
  }

  async cancelTask(input: {
    taskId: string;
    reason?: string;
  }): Promise<CodingRuntimeSnapshot> {
    const snapshot = await this.getSnapshot(input.taskId);
    if (isTerminalCodingRuntimeState(snapshot.task.state)) return snapshot;
    return this.transition(snapshot.task, "task_cancelled", {
      message: input.reason ?? "Coding task cancelled.",
      error: {
        code: "coding_task_cancelled",
        message: input.reason ?? "Coding task cancelled.",
        retryable: true,
      },
    });
  }

  async runTask(
    taskId: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<CodingRuntimeSnapshot> {
    let snapshot = await this.getSnapshot(taskId);
    if (isTerminalCodingRuntimeState(snapshot.task.state)) return snapshot;

    try {
      for (const step of PIPELINE) {
        this.throwIfAborted(options.signal);
        snapshot = await this.transition(snapshot.task, step.startSignal, {
          message: `${step.label} started.`,
        });
        const port = this.steps[step.capability];
        if (!port) throw new MissingCodingRuntimeCapabilityError(step.capability);
        const startedAt = Date.now();
        const result = await this.executeStep(port, snapshot.task, options.signal);
        const artifact =
          result.artifact ??
          this.defaultArtifact(step.artifactKind, step.label, result.metadata);
        snapshot = await this.transition(snapshot.task, step.completeSignal, {
          message: result.message ?? `${step.label} completed.`,
          artifactRefs: [artifact],
          durationMs: Date.now() - startedAt,
        });
        if (artifact.status === "failed") {
          throw new CodingRuntimeStepFailedError(step.capability, artifact);
        }
      }

      snapshot = await this.transition(snapshot.task, "task_completed", {
        message: "Coding task completed.",
      });
      return snapshot;
    } catch (err) {
      const latest = await this.taskRepository.getSnapshot(taskId);
      const task = latest?.task ?? snapshot.task;
      if (isTerminalCodingRuntimeState(task.state)) return latest ?? snapshot;
      if (isAbortError(err) || options.signal?.aborted) {
        return this.transition(task, "task_cancelled", {
          message: "Coding task cancelled.",
          error: {
            code: "coding_task_cancelled",
            message: "Coding task cancelled.",
            retryable: true,
          },
        });
      }
      return this.transition(task, "task_failed", {
        message: err instanceof Error ? err.message : "Coding task failed.",
        error: this.errorFromUnknown(err),
      });
    }
  }

  private async executeStep(
    port: CodingRuntimeStepPort,
    task: CodingTask,
    signal?: AbortSignal
  ) {
    const controller = signal ?? new AbortController().signal;
    return port.execute({
      task,
      signal: controller,
      artifacts: task.artifacts,
    });
  }

  private async transition(
    task: CodingTask,
    signal: CodingRuntimeSignal,
    options: {
      message: string;
      artifactRefs?: CodingRuntimeArtifactRef[];
      error?: CodingRuntimeError | null;
      durationMs?: number;
    }
  ): Promise<CodingRuntimeSnapshot> {
    const now = this.isoNow();
    const nextState = this.stateMachine.transition(task.state, signal);
    const terminalPatch = terminalTimestamps(nextState, now);
    const artifactRefs = options.artifactRefs ?? [];
    const nextTask = CodingTaskSchema.parse({
      ...task,
      state: nextState,
      artifacts: [...task.artifacts, ...artifactRefs],
      error: options.error ?? (nextState === "failed" ? task.error : null),
      version: task.version + 1,
      updatedAt: now,
      ...(task.startedAt
        ? {}
        : nextState === "accepted"
          ? {}
          : { startedAt: now }),
      ...terminalPatch,
    });
    const event = CodingRuntimeEventSchema.omit({
      sequence: true,
      createdAt: true,
    }).parse({
      id: this.idGenerator(),
      taskId: task.id,
      type: signal,
      fromState: task.state,
      toState: nextState,
      message: options.message,
      artifactRefs,
      error: options.error ?? null,
      durationMs: options.durationMs,
    });
    return this.taskRepository.recordTransition({
      task: nextTask,
      event: { ...event, createdAt: now },
    });
  }

  private defaultArtifact(
    kind: CodingRuntimeArtifactKind,
    label: string,
    payload?: Record<string, unknown>
  ): CodingRuntimeArtifactRef {
    return CodingRuntimeArtifactRefSchema.parse({
      id: this.idGenerator(),
      kind,
      label,
      status: "ready",
      createdAt: this.isoNow(),
      ...(payload ? { payload } : {}),
    });
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("coding_task_cancelled");
  }

  private errorFromUnknown(err: unknown): CodingRuntimeError {
    if (err instanceof MissingCodingRuntimeCapabilityError) {
      return {
        code: "missing_capability",
        message: err.message,
        retryable: true,
        details: { capability: err.capability },
      };
    }
    if (err instanceof CodingRuntimeStepFailedError) {
      return {
        code: "coding_step_failed",
        message: err.message,
        retryable: true,
        details: {
          capability: err.capability,
          artifactKind: err.artifact.kind,
          artifactId: err.artifact.id,
        },
      };
    }
    if (err instanceof Error) {
      return {
        code: "coding_task_failed",
        message: err.message,
        retryable: false,
      };
    }
    return {
      code: "coding_task_failed",
      message: "Coding task failed.",
      retryable: false,
    };
  }

  private isoNow(): string {
    return this.now().toISOString();
  }
}

function terminalTimestamps(
  state: CodingRuntimeState,
  timestamp: string
): Partial<Pick<CodingTask, "completedAt" | "cancelledAt">> {
  if (state === "completed" || state === "failed") {
    return { completedAt: timestamp };
  }
  if (state === "cancelled") return { cancelledAt: timestamp };
  return {};
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "AbortError" || err.message === "coding_task_cancelled";
}
