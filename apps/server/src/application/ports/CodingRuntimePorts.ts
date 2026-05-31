import type {
  CodingRuntimeArtifactRef,
  CodingRuntimeEvent,
  CodingRuntimeSnapshot,
  CodingTask,
} from "@u-build/shared";

export interface CreateCodingTaskRecordInput {
  readonly task: CodingTask;
  readonly event: Omit<CodingRuntimeEvent, "sequence" | "createdAt"> & {
    readonly createdAt?: string;
  };
}

export interface CodingTaskRepository {
  findByIdempotencyKey(
    idempotencyKey: string
  ): Promise<CodingRuntimeSnapshot | null>;
  getTask(taskId: string): Promise<CodingTask | null>;
  getSnapshot(taskId: string): Promise<CodingRuntimeSnapshot | null>;
  listEvents(
    taskId: string,
    filter?: { afterSequence?: number }
  ): Promise<CodingRuntimeEvent[]>;
  recordTransition(
    input: CreateCodingTaskRecordInput
  ): Promise<CodingRuntimeSnapshot>;
}

export interface CodingRuntimeStepContext {
  readonly task: CodingTask;
  readonly signal: AbortSignal;
  readonly artifacts: readonly CodingRuntimeArtifactRef[];
}

export interface CodingRuntimeStepResult {
  readonly message?: string;
  readonly artifact?: CodingRuntimeArtifactRef;
  readonly metadata?: Record<string, unknown>;
}

export interface CodingRuntimeStepPort {
  execute(context: CodingRuntimeStepContext): Promise<CodingRuntimeStepResult>;
}

export interface CodingRuntimeStepPorts {
  scanner?: CodingRuntimeStepPort;
  retriever?: CodingRuntimeStepPort;
  astAnalyzer?: CodingRuntimeStepPort;
  patchPlanner?: CodingRuntimeStepPort;
  astValidator?: CodingRuntimeStepPort;
  runtimeValidator?: CodingRuntimeStepPort;
  patchApplier?: CodingRuntimeStepPort;
}
